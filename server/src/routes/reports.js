const router = require('express').Router();
const prisma = require('../db');
const { requireRole, requirePermission } = require('../middleware/auth');
const { orderPrintCost } = require('../utils/printingCost');
const { computeBookingAnalysis } = require('../utils/bookingAnalysis');

const NON_CANCELLED = { notIn: ['CANCELLED'] };

// Parse ?from&to into a Prisma date filter (inclusive of the whole `to` day).
function dateRange(from, to) {
  const r = {};
  if (from) r.gte = new Date(from);
  if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); r.lte = d; }
  return Object.keys(r).length ? r : null;
}

// Super Admin analytics: occupancy, revenue, category profitability, GST, repeat clients
router.get('/overview', requirePermission('reports', 'view'), async (req, res) => {
  const { companyId, from, to } = req.query;
  const range = dateRange(from, to);
  const orderWhere = { status: NON_CANCELLED };
  const bookingWhere = { status: NON_CANCELLED };
  const paymentWhere = {};
  if (companyId) {
    orderWhere.companyId = Number(companyId);
    paymentWhere.companyId = Number(companyId);
  }
  // Scope the money figures to the selected window: orders by booking date,
  // payments by receipt date. Occupancy/site counts stay "as of now".
  if (range) { orderWhere.bookingDate = range; paymentWhere.receivedAt = range; }

  const [siteCount, byStatus, byType, orders, lines, payments, clients] = await Promise.all([
    prisma.site.count({ where: { active: true } }),
    prisma.site.groupBy({ by: ['status'], where: { active: true }, _count: { _all: true } }),
    prisma.site.groupBy({ by: ['type'], where: { active: true }, _count: { _all: true } }),
    prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true, clientId: true, grandTotal: true, taxableAmount: true,
        rentalSubtotal: true, printingTotal: true, mountingCost: true, addOnTotal: true,
        cgst: true, sgst: true, igst: true, gstAmount: true, status: true,
        category: { select: { name: true } },
        client: { select: { id: true, name: true, company: true } },
      },
    }),
    prisma.booking.findMany({
      where: { ...bookingWhere, ...(companyId ? { order: { companyId: Number(companyId) } } : {}) },
      select: { subtotal: true, site: { select: { type: true, zone: true } } },
    }),
    prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true, tdsAmount: true, netReceived: true } }),
    prisma.client.count(),
  ]);

  const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
  const booked = statusMap.BOOKED || 0;
  const occupancy = siteCount ? Math.round((booked / siteCount) * 100) : 0;

  // A quotation is pipeline, not revenue — counting it as booked value would
  // inflate the dashboard and make outstanding look like money owed when the
  // client has not committed to anything. Report it separately instead.
  const confirmed = orders.filter((o) => o.status !== 'QUOTATION');
  const quotations = orders.filter((o) => o.status === 'QUOTATION');

  const bookedValue = confirmed.reduce((s, o) => s + o.grandTotal, 0);
  // Component breakdown of the booked value, so the dashboard can show what the
  // gross is made of: net-of-GST (taxable), and the rental / print / mounting
  // splits (gross of discount — these are the raw line components).
  const bookedExclGst = confirmed.reduce((s, o) => s + o.taxableAmount, 0);
  const rentalValue = confirmed.reduce((s, o) => s + (o.rentalSubtotal || 0), 0);
  const printingValue = confirmed.reduce((s, o) => s + (o.printingTotal || 0), 0);
  const mountingValue = confirmed.reduce((s, o) => s + (o.mountingCost || 0), 0);
  const addOnValue = confirmed.reduce((s, o) => s + (o.addOnTotal || 0), 0);
  const quotationValue = quotations.reduce((s, o) => s + o.grandTotal, 0);
  // Payments credit the gross; TDS is the slice the client remitted to the government.
  const paidRevenue = payments._sum.amount || 0;
  const tdsDeducted = payments._sum.tdsAmount || 0;
  const netReceived = payments._sum.netReceived || 0;
  const outstanding = Math.max(0, bookedValue - paidRevenue);
  const gstCollected = confirmed.reduce((s, o) => s + o.gstAmount, 0);
  const cgst = confirmed.reduce((s, o) => s + o.cgst, 0);
  const sgst = confirmed.reduce((s, o) => s + o.sgst, 0);
  const igst = confirmed.reduce((s, o) => s + o.igst, 0);

  // Revenue + booking count by site category (from line items)
  const revByType = {}, cntByType = {};
  for (const l of lines) {
    revByType[l.site.type] = (revByType[l.site.type] || 0) + l.subtotal;
    cntByType[l.site.type] = (cntByType[l.site.type] || 0) + 1;
  }
  const topCategory = Object.entries(revByType).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Revenue by the client's booking category (institute, hospital, …). Also keep
  // a per-category client breakdown so a category row can expand to reveal which
  // clients make it up, each with their share of the category's revenue.
  const revByCategory = {};
  const catClients = {}; // { [category]: { [clientId]: { name, revenue, orders } } }
  for (const o of confirmed) {
    const name = o.category?.name || 'Uncategorised';
    revByCategory[name] = (revByCategory[name] || 0) + o.grandTotal;
    const bucket = (catClients[name] = catClients[name] || {});
    const cid = o.client?.id || o.clientId;
    const display = o.client?.company?.trim() || o.client?.name || 'Unknown';
    bucket[cid] = bucket[cid] || { name: display, revenue: 0, orders: 0 };
    bucket[cid].revenue += o.grandTotal;
    bucket[cid].orders += 1;
  }
  const revByCategoryClients = Object.fromEntries(
    Object.entries(catClients).map(([cat, clients]) => [
      cat, Object.values(clients).sort((a, b) => b.revenue - a.revenue),
    ]),
  );

  // Repeat clients (2+ orders)
  const perClient = {};
  for (const o of orders) perClient[o.clientId] = (perClient[o.clientId] || 0) + 1;
  const repeatClients = Object.values(perClient).filter((n) => n >= 2).length;

  // Period-over-period: compare against the equal-length window immediately
  // before `from`, so KPI cards can show growth arrows. Only when a range is set.
  let prev = null;
  if (range && from && to) {
    const start = new Date(from); const end = new Date(to);
    const len = end - start;
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - len);
    const pWhere = { ...orderWhere, bookingDate: { gte: prevStart, lte: prevEnd } };
    const payWhere = { ...paymentWhere, receivedAt: { gte: prevStart, lte: prevEnd } };
    const [pOrders, pPay] = await Promise.all([
      prisma.order.findMany({ where: pWhere, select: { grandTotal: true, status: true } }),
      prisma.payment.aggregate({ where: payWhere, _sum: { amount: true } }),
    ]);
    const pConfirmed = pOrders.filter((o) => o.status !== 'QUOTATION');
    prev = {
      bookedValue: pConfirmed.reduce((s, o) => s + o.grandTotal, 0),
      paidRevenue: pPay._sum.amount || 0,
      totalOrders: pOrders.length,
    };
  }

  res.json({
    prev,
    siteCount, occupancy, siteStatus: statusMap,
    siteByType: Object.fromEntries(byType.map((t) => [t.type, t._count._all])),
    bookedValue, bookedExclGst, rentalValue, printingValue, mountingValue, addOnValue,
    quotationValue, quotationCount: quotations.length,
    paidRevenue, outstanding,
    tdsDeducted, netReceived,
    gstCollected, cgst, sgst, igst,
    totalOrders: orders.length, totalBookings: lines.length, totalClients: clients, repeatClients,
    revenueByType: revByType, bookingsByType: cntByType, topCategory,
    revenueByCategory: revByCategory,
    revenueByCategoryClients: revByCategoryClients,
  });
});

// Time-series booked value & orders, grouped by week/month/year (by booking date)
router.get('/timeseries', requirePermission('reports', 'view'), async (req, res) => {
  const { period: periodParam, companyId, from, to } = req.query;
  const period = periodParam || 'month';
  const where = { status: NON_CANCELLED };
  if (companyId) where.companyId = Number(companyId);
  const range = dateRange(from, to);
  if (range) where.bookingDate = range;

  const orders = await prisma.order.findMany({
    where,
    select: { bookingDate: true, grandTotal: true },
  });

  const keyFor = (d) => {
    const dt = new Date(d);
    if (period === 'year') return String(dt.getFullYear());
    if (period === 'week') {
      const onejan = new Date(dt.getFullYear(), 0, 1);
      const week = Math.ceil((((dt - onejan) / 86400000) + onejan.getDay() + 1) / 7);
      return `${dt.getFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  };

  const buckets = {};
  for (const o of orders) {
    const k = keyFor(o.bookingDate);
    buckets[k] = buckets[k] || { period: k, revenue: 0, bookings: 0 };
    buckets[k].revenue += o.grandTotal;
    buckets[k].bookings += 1;
  }
  res.json(Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period)));
});

// Top clients by booked value
router.get('/top-clients', requirePermission('reports', 'view'), async (req, res) => {
  const { companyId, from, to } = req.query;
  const where = { status: NON_CANCELLED };
  if (companyId) where.companyId = Number(companyId);
  const range = dateRange(from, to);
  if (range) where.bookingDate = range;

  const orders = await prisma.order.findMany({
    where,
    select: { grandTotal: true, client: { select: { id: true, name: true, company: true } } },
  });
  const map = {};
  for (const o of orders) {
    const id = o.client.id;
    // Prefer the organisation name; fall back to the contact person only when
    // the client has no company recorded.
    const displayName = o.client.company?.trim() || o.client.name;
    map[id] = map[id] || { id, name: displayName, revenue: 0, orders: 0 };
    map[id].revenue += o.grandTotal;
    map[id].orders += 1;
  }
  res.json(Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
});

// Profitability: revenue (ex-GST) vs the costs we actually track (printing paid
// to partners) and discounts given. Rental/mounting have no vendor cost recorded,
// so we surface printing margin + discount leakage + a contribution proxy, broken
// down by category and month. Booking-date scoped.
router.get('/profitability', requirePermission('reports', 'view'), async (req, res) => {
  const { companyId, from, to } = req.query;
  const where = { status: { in: ['CONFIRMED', 'LIVE', 'COMPLETED'] } };
  if (companyId) where.companyId = Number(companyId);
  const range = dateRange(from, to);
  if (range) where.bookingDate = range;

  const orders = await prisma.order.findMany({
    where,
    select: {
      grandTotal: true, taxableAmount: true, printingTotal: true, printCost: true,
      discountAmount: true, mountingCost: true, bookingDate: true, printMaterial: true, noOfPrints: true, chargesPerSite: true,
      category: { select: { name: true } },
      printingPartner: { select: { ratePerSqft: true, materials: { select: { name: true, costPerSqft: true } } } },
      items: { select: { status: true, site: { select: { sqft: true } } } },
    },
  });

  let revenueExGst = 0, grossBooked = 0, printingCharged = 0, printingCost = 0, discounts = 0, mountingCharged = 0;
  const byCat = {}; // { cat: { revenue, printingMargin } }
  const byMonth = {}; // { 'YYYY-MM': { revenue, printingMargin } }
  for (const o of orders) {
    const { cost } = orderPrintCost(o, o.printingPartner);
    const pMargin = Math.round((o.printingTotal || 0) - cost);
    revenueExGst += o.taxableAmount || 0;
    grossBooked += o.grandTotal || 0;
    printingCharged += o.printingTotal || 0;
    printingCost += cost;
    discounts += o.discountAmount || 0;
    mountingCharged += o.mountingCost || 0;
    const cat = o.category?.name || 'Uncategorised';
    byCat[cat] = byCat[cat] || { category: cat, revenue: 0, printingMargin: 0 };
    byCat[cat].revenue += o.taxableAmount || 0;
    byCat[cat].printingMargin += pMargin;
    const mk = `${new Date(o.bookingDate).getFullYear()}-${String(new Date(o.bookingDate).getMonth() + 1).padStart(2, '0')}`;
    byMonth[mk] = byMonth[mk] || { period: mk, revenue: 0, printingMargin: 0 };
    byMonth[mk].revenue += o.taxableAmount || 0;
    byMonth[mk].printingMargin += pMargin;
  }

  res.json({
    revenueExGst: Math.round(revenueExGst),
    grossBooked: Math.round(grossBooked),
    printingCharged: Math.round(printingCharged),
    printingCost: Math.round(printingCost),
    printingMargin: Math.round(printingCharged - printingCost),
    discounts: Math.round(discounts),
    mountingCharged: Math.round(mountingCharged),
    // Contribution after the costs we can see (printing paid out). Rental &
    // mounting vendor costs are not tracked, so this is an upper bound, not net profit.
    contribution: Math.round(revenueExGst - printingCost),
    orders: orders.length,
    byCategory: Object.values(byCat).map((c) => ({ ...c, revenue: Math.round(c.revenue), printingMargin: Math.round(c.printingMargin) })).sort((a, b) => b.revenue - a.revenue),
    byMonth: Object.values(byMonth).map((m) => ({ ...m, revenue: Math.round(m.revenue), printingMargin: Math.round(m.printingMargin) })).sort((a, b) => a.period.localeCompare(b.period)),
  });
});

// Accounts-receivable aging + DSO. Aging is always "as of now": each receivable
// order (invoiced more than paid) is aged by its earliest live invoice's due date.
router.get('/receivables', requirePermission('reports', 'view'), async (req, res) => {
  const { companyId } = req.query;
  const where = { status: { in: ['CONFIRMED', 'LIVE', 'COMPLETED'] } };
  if (companyId) where.companyId = Number(companyId);

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true, orderNo: true,
      client: { select: { name: true, company: true } },
      payments: { select: { amount: true } },
      invoices: { select: { total: true, status: true, issuedAt: true, dueDate: true } },
    },
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const DAY = 86400000;
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  let totalOutstanding = 0;
  const overdue = [];
  // For DSO: total invoiced in the last 365 days (credit sales denominator).
  let invoicedLast365 = 0;
  const yearAgo = new Date(today.getTime() - 365 * DAY);

  for (const o of orders) {
    const live = o.invoices.filter((i) => i.status !== 'CANCELLED');
    const invoiced = live.reduce((s, i) => s + (i.total || 0), 0);
    for (const i of live) if (i.issuedAt && new Date(i.issuedAt) >= yearAgo) invoicedLast365 += i.total || 0;
    const paid = o.payments.reduce((s, p) => s + p.amount, 0);
    const outstanding = Math.round(invoiced - paid);
    if (outstanding <= 0) continue;
    // Age by the oldest live invoice's due date (fallback to issue date).
    const dates = live.map((i) => new Date(i.dueDate || i.issuedAt)).filter((d) => !Number.isNaN(d.getTime()));
    const ageDate = dates.length ? new Date(Math.min(...dates.map((d) => +d))) : today;
    const daysPast = Math.floor((today - ageDate) / DAY);
    if (daysPast <= 0) buckets.current += outstanding;
    else if (daysPast <= 30) buckets.d1_30 += outstanding;
    else if (daysPast <= 60) buckets.d31_60 += outstanding;
    else if (daysPast <= 90) buckets.d61_90 += outstanding;
    else buckets.d90plus += outstanding;
    totalOutstanding += outstanding;
    if (daysPast > 0) overdue.push({ orderId: o.id, orderNo: o.orderNo, client: o.client.company?.trim() || o.client.name, outstanding, daysPast });
  }

  const dso = invoicedLast365 > 0 ? Math.round(totalOutstanding / (invoicedLast365 / 365)) : 0;
  overdue.sort((a, b) => b.outstanding - a.outstanding);
  res.json({
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Math.round(v)])),
    totalOutstanding: Math.round(totalOutstanding),
    dso,
    overdue: overdue.slice(0, 25),
    overdueCount: overdue.length,
  });
});

// Site-wise / inventory report: per-site revenue (ex-GST rental), booking count
// and days booked, filterable by company, date (booking date), zone, media type
// and free text. Returns every active site (so unbooked inventory is visible too)
// plus zone/type rollups and filter option lists for the UI.
router.get('/site-wise', requirePermission('reports', 'view'), async (req, res) => {
  const { companyId, from, to, zone, type, q, bookedOnly } = req.query;
  const range = dateRange(from, to);

  const siteWhere = { active: true };
  if (zone) siteWhere.zone = zone;
  if (type) siteWhere.type = type;
  if (q && q.trim()) {
    const term = q.trim();
    siteWhere.OR = [
      { code: { contains: term, mode: 'insensitive' } },
      { location: { contains: term, mode: 'insensitive' } },
      { city: { contains: term, mode: 'insensitive' } },
    ];
  }

  const bookingWhere = {
    status: NON_CANCELLED,
    order: {
      status: NON_CANCELLED,
      ...(companyId ? { companyId: Number(companyId) } : {}),
      ...(range ? { bookingDate: range } : {}),
    },
  };

  const [sites, bookings, mediaTypes] = await Promise.all([
    prisma.site.findMany({
      where: siteWhere,
      select: { id: true, code: true, location: true, city: true, zone: true, type: true, imageUrl: true, monthlyRate: true, status: true },
      orderBy: { code: 'asc' },
    }),
    prisma.booking.findMany({ where: bookingWhere, select: { siteId: true, subtotal: true, days: true, startDate: true } }),
    prisma.mediaType.findMany({ select: { code: true, label: true } }),
  ]);

  const mediaLabel = Object.fromEntries(mediaTypes.map((m) => [m.code, m.label]));

  // Aggregate bookings by site.
  const agg = {};
  for (const b of bookings) {
    const a = (agg[b.siteId] = agg[b.siteId] || { revenue: 0, bookings: 0, days: 0 });
    a.revenue += b.subtotal || 0;
    a.bookings += 1;
    a.days += b.days || 0;
  }

  let rows = sites.map((s) => ({
    siteId: s.id, code: s.code, location: s.location, city: s.city, zone: s.zone,
    type: s.type, typeLabel: mediaLabel[s.type] || s.type, imageUrl: s.imageUrl,
    monthlyRate: s.monthlyRate, status: s.status,
    revenue: Math.round(agg[s.id]?.revenue || 0),
    bookings: agg[s.id]?.bookings || 0,
    days: agg[s.id]?.days || 0,
  }));
  if (bookedOnly === 'true' || bookedOnly === '1') rows = rows.filter((r) => r.bookings > 0);

  // Zone / type rollups for the charts.
  const zoneMap = {}, typeMap = {};
  for (const r of rows) {
    const z = (zoneMap[r.zone || '—'] = zoneMap[r.zone || '—'] || { zone: r.zone || '—', revenue: 0, bookings: 0 });
    z.revenue += r.revenue; z.bookings += r.bookings;
    const t = (typeMap[r.type] = typeMap[r.type] || { type: r.type, label: r.typeLabel, revenue: 0, bookings: 0 });
    t.revenue += r.revenue; t.bookings += r.bookings;
  }

  // Month-wise comparison: revenue / bookings / days per calendar month (by the
  // booking's display start), scoped to the sites matching the current filters.
  const siteIds = new Set(sites.map((s) => s.id));
  const monthMap = {};
  for (const b of bookings) {
    if (!siteIds.has(b.siteId) || !b.startDate) continue;
    const d = new Date(b.startDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = (monthMap[key] = monthMap[key] || { month: key, revenue: 0, bookings: 0, days: 0 });
    m.revenue += b.subtotal || 0;
    m.bookings += 1;
    m.days += b.days || 0;
  }
  const byMonth = Object.values(monthMap)
    .map((m) => ({ ...m, revenue: Math.round(m.revenue) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const summary = {
    siteCount: rows.length,
    bookedSites: rows.filter((r) => r.bookings > 0).length,
    totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
    totalBookings: rows.reduce((s, r) => s + r.bookings, 0),
    totalDays: rows.reduce((s, r) => s + r.days, 0),
  };

  // Filter option lists (from all active sites, unaffected by current filters).
  const allSites = await prisma.site.findMany({ where: { active: true }, select: { zone: true, type: true } });
  const zones = [...new Set(allSites.map((s) => s.zone).filter(Boolean))].sort();
  const types = [...new Set(allSites.map((s) => s.type))].sort().map((code) => ({ code, label: mediaLabel[code] || code }));

  res.json({
    sites: rows,
    summary,
    byZone: Object.values(zoneMap).sort((a, b) => b.revenue - a.revenue),
    byType: Object.values(typeMap).sort((a, b) => b.revenue - a.revenue),
    byMonth,
    filters: { zones, types },
  });
});

// Dashboard card drill-down: the records behind one /overview card, scoped by the
// same companyId/from/to and the same definitions (orders by booking date and
// non-cancelled, quotations kept apart; payments by receipt date; occupancy as
// of now), so the dialog's headline always equals the card. Long lists are capped.
const DETAIL_CAP = 300;
const BILLABLE_LINES = ['TENTATIVE', 'CONFIRMED', 'LIVE', 'COMPLETED', 'STOPPED'];
const monthKey = (d) => `${new Date(d).getFullYear()}-${String(new Date(d).getMonth() + 1).padStart(2, '0')}`;
const clientName = (c) => c?.company?.trim() || c?.name || 'Unknown';

// Add `amount` to a keyed bucket, counting rows too; returns sorted rows.
function bucketAdd(map, key, label, amount) {
  const b = (map[key] = map[key] || { key, label, value: 0, count: 0 });
  b.value += amount || 0;
  b.count += 1;
}
const bucketRows = (map, byKey) => Object.values(map)
  .map((b) => ({ ...b, value: Math.round(b.value) }))
  .sort(byKey ? (a, b) => a.key.localeCompare(b.key) : (a, b) => b.value - a.value);

router.get('/card-detail', requirePermission('reports', 'view'), async (req, res) => {
  const { card, companyId, from, to } = req.query;
  const range = dateRange(from, to);
  const orderWhere = { status: NON_CANCELLED };
  const paymentWhere = {};
  if (companyId) { orderWhere.companyId = Number(companyId); paymentWhere.companyId = Number(companyId); }
  if (range) { orderWhere.bookingDate = range; paymentWhere.receivedAt = range; }
  const confirmedWhere = { ...orderWhere, status: { notIn: ['CANCELLED', 'QUOTATION'] } };

  if (card === 'booked') {
    const orders = await prisma.order.findMany({
      where: confirmedWhere,
      select: {
        id: true, orderNo: true, status: true, bookingDate: true,
        rentalSubtotal: true, printingTotal: true, mountingCost: true, addOnTotal: true,
        discountAmount: true, taxableAmount: true, gstAmount: true, grandTotal: true,
        company: { select: { name: true } },
        category: { select: { name: true } },
        client: { select: { id: true, name: true, company: true } },
        items: { where: { status: { in: BILLABLE_LINES } }, select: { subtotal: true, site: { select: { type: true } } } },
      },
      orderBy: { bookingDate: 'desc' },
    });
    const mediaTypes = await prisma.mediaType.findMany({ select: { code: true, label: true } });
    const mediaLabel = Object.fromEntries(mediaTypes.map((m) => [m.code, m.label]));

    const sum = (f) => Math.round(orders.reduce((s, o) => s + (o[f] || 0), 0));
    const bridge = {
      rent: sum('rentalSubtotal'), printing: sum('printingTotal'), mounting: sum('mountingCost'),
      extras: sum('addOnTotal'), discount: sum('discountAmount'),
      taxable: sum('taxableAmount'), gst: sum('gstAmount'), total: sum('grandTotal'),
    };
    // Anything the components don't explain (manual edits, rounding) shows as its own row.
    bridge.adjustment = bridge.taxable - (bridge.rent + bridge.printing + bridge.mounting + bridge.extras - bridge.discount);

    const byCompany = {}, byCategory = {}, byMonth = {}, byClient = {}, byMedia = {};
    for (const o of orders) {
      bucketAdd(byCompany, o.company?.name || '—', o.company?.name || '—', o.grandTotal);
      bucketAdd(byCategory, o.category?.name || 'Uncategorised', o.category?.name || 'Uncategorised', o.grandTotal);
      bucketAdd(byMonth, monthKey(o.bookingDate), monthKey(o.bookingDate), o.grandTotal);
      bucketAdd(byClient, String(o.client?.id), clientName(o.client), o.grandTotal);
      // Media type can only be read off the site lines, so this split is rent only (ex-GST).
      for (const l of o.items) bucketAdd(byMedia, l.site.type, mediaLabel[l.site.type] || l.site.type, l.subtotal);
    }

    return res.json({
      card, headline: orders.reduce((s, o) => s + o.grandTotal, 0), count: orders.length, bridge,
      byCompany: bucketRows(byCompany), byCategory: bucketRows(byCategory),
      byMonth: bucketRows(byMonth, true), byMedia: bucketRows(byMedia),
      topClients: bucketRows(byClient).slice(0, 10),
      rows: orders.slice(0, DETAIL_CAP).map((o) => ({
        id: o.id, orderNo: o.orderNo, client: clientName(o.client), company: o.company?.name,
        bookingDate: o.bookingDate, status: o.status,
        rent: Math.round(o.rentalSubtotal || 0), printMount: Math.round((o.printingTotal || 0) + (o.mountingCost || 0)),
        extras: Math.round(o.addOnTotal || 0), discount: Math.round(o.discountAmount || 0),
        gst: Math.round(o.gstAmount || 0), total: Math.round(o.grandTotal || 0),
      })),
    });
  }

  if (card === 'collected') {
    const payments = await prisma.payment.findMany({
      where: paymentWhere,
      select: {
        id: true, amount: true, tdsAmount: true, netReceived: true, mode: true, reference: true, receivedAt: true,
        company: { select: { name: true } },
        client: { select: { name: true, company: true } },
        order: { select: { id: true, orderNo: true } },
      },
      orderBy: { receivedAt: 'desc' },
    });
    const byMode = {}, byMonth = {}, byCompany = {};
    for (const p of payments) {
      bucketAdd(byMode, p.mode, p.mode, p.amount);
      bucketAdd(byMonth, monthKey(p.receivedAt), monthKey(p.receivedAt), p.amount);
      bucketAdd(byCompany, p.company?.name || '—', p.company?.name || '—', p.amount);
    }
    const total = payments.reduce((s, p) => s + p.amount, 0);
    return res.json({
      card, headline: total, count: payments.length,
      totals: {
        amount: total,
        tds: payments.reduce((s, p) => s + (p.tdsAmount || 0), 0),
        net: payments.reduce((s, p) => s + (p.netReceived || 0), 0),
      },
      byMode: bucketRows(byMode), byMonth: bucketRows(byMonth, true), byCompany: bucketRows(byCompany),
      rows: payments.slice(0, DETAIL_CAP).map((p) => ({
        id: p.id, receivedAt: p.receivedAt, orderId: p.order?.id, orderNo: p.order?.orderNo,
        client: clientName(p.client), company: p.company?.name, mode: p.mode,
        amount: p.amount, tds: p.tdsAmount || 0, reference: p.reference,
      })),
    });
  }

  if (card === 'outstanding') {
    const [orders, collected, receivables] = await Promise.all([
      prisma.order.findMany({
        where: confirmedWhere,
        select: {
          id: true, orderNo: true, status: true, bookingDate: true, grandTotal: true,
          company: { select: { name: true } },
          client: { select: { name: true, company: true } },
          payments: { select: { amount: true, receivedAt: true } },
          invoices: { select: { total: true, status: true } },
        },
      }),
      prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      // The Receivables report's total (invoiced − paid, all receivable campaigns, any date).
      prisma.order.findMany({
        where: { status: { in: ['CONFIRMED', 'LIVE', 'COMPLETED'] }, ...(companyId ? { companyId: Number(companyId) } : {}) },
        select: { payments: { select: { amount: true } }, invoices: { select: { total: true, status: true } } },
      }),
    ]);
    const today = new Date();
    const rows = orders.map((o) => {
      const paid = o.payments.reduce((s, p) => s + p.amount, 0);
      const invoiced = o.invoices.filter((i) => i.status !== 'CANCELLED').reduce((s, i) => s + (i.total || 0), 0);
      const last = o.payments.reduce((m, p) => (!m || p.receivedAt > m ? p.receivedAt : m), null);
      return {
        id: o.id, orderNo: o.orderNo, client: clientName(o.client), company: o.company?.name, status: o.status,
        bookingDate: o.bookingDate, total: Math.round(o.grandTotal || 0), paid: Math.round(paid),
        balance: Math.round((o.grandTotal || 0) - paid),
        invoiced: Math.round(invoiced), invoiceDue: Math.max(0, Math.round(invoiced - paid)),
        lastPayment: last, ageDays: Math.floor((today - new Date(o.bookingDate)) / 86400000),
      };
    });
    const booked = orders.reduce((s, o) => s + o.grandTotal, 0);
    const paidInPeriod = collected._sum.amount || 0;
    const owing = rows.filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance);
    const overpaid = rows.filter((r) => r.balance < 0).sort((a, b) => a.balance - b.balance);
    let receivablesTotal = 0;
    for (const o of receivables) {
      const inv = o.invoices.filter((i) => i.status !== 'CANCELLED').reduce((s, i) => s + (i.total || 0), 0);
      receivablesTotal += Math.max(0, Math.round(inv - o.payments.reduce((s, p) => s + p.amount, 0)));
    }
    return res.json({
      card,
      // Same formula as the card: period booked value − period collections.
      headline: Math.max(0, booked - paidInPeriod),
      booked, collected: paidInPeriod,
      campaignBalance: owing.reduce((s, r) => s + r.balance, 0),
      invoiced: rows.reduce((s, r) => s + r.invoiced, 0),
      invoicedUnpaid: rows.reduce((s, r) => s + r.invoiceDue, 0),
      invoicedCount: rows.filter((r) => r.invoiced > 0).length,
      receivablesTotal,
      count: rows.length, owingCount: owing.length,
      overpaid: overpaid.slice(0, DETAIL_CAP), overpaidTotal: -overpaid.reduce((s, r) => s + r.balance, 0),
      rows: owing.slice(0, DETAIL_CAP),
    });
  }

  if (card === 'occupancy') {
    const now = new Date();
    const [sites, mediaTypes] = await Promise.all([
      prisma.site.findMany({
        where: { active: true },
        select: {
          id: true, code: true, location: true, city: true, zone: true, type: true, status: true, monthlyRate: true,
          // The booking running today (or else the latest one) explains why the site shows booked.
          bookings: {
            where: { status: { notIn: ['CANCELLED', 'WAITLIST'] }, order: { status: NON_CANCELLED } },
            orderBy: { endDate: 'desc' }, take: 5,
            select: {
              startDate: true, endDate: true,
              order: { select: { id: true, orderNo: true, status: true, client: { select: { name: true, company: true } } } },
            },
          },
        },
        orderBy: { code: 'asc' },
      }),
      prisma.mediaType.findMany({ select: { code: true, label: true } }),
    ]);
    const mediaLabel = Object.fromEntries(mediaTypes.map((m) => [m.code, m.label]));
    const byZone = {}, byType = {}, byStatus = {};
    const booked = [], free = [];
    for (const s of sites) {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      const z = (byZone[s.zone || '—'] = byZone[s.zone || '—'] || { label: s.zone || '—', total: 0, booked: 0 });
      const t = (byType[s.type] = byType[s.type] || { label: mediaLabel[s.type] || s.type, total: 0, booked: 0 });
      z.total += 1; t.total += 1;
      const base = { id: s.id, code: s.code, location: s.location, city: s.city, zone: s.zone, type: mediaLabel[s.type] || s.type, monthlyRate: s.monthlyRate };
      if (s.status === 'BOOKED') {
        z.booked += 1; t.booked += 1;
        const cur = s.bookings.find((b) => b.startDate <= now && b.endDate >= now) || s.bookings[0];
        booked.push({
          ...base, orderId: cur?.order.id, orderNo: cur?.order.orderNo, orderStatus: cur?.order.status,
          client: cur ? clientName(cur.order.client) : null, startDate: cur?.startDate, endDate: cur?.endDate,
          running: !!cur && cur.startDate <= now && cur.endDate >= now,
        });
      } else if (s.status === 'AVAILABLE') {
        free.push(base);
      }
    }
    const pct = (r) => ({ ...r, pct: r.total ? Math.round((r.booked / r.total) * 100) : 0 });
    booked.sort((a, b) => new Date(a.endDate || 0) - new Date(b.endDate || 0));
    return res.json({
      card,
      headline: sites.length ? Math.round(((byStatus.BOOKED || 0) / sites.length) * 100) : 0,
      siteCount: sites.length, byStatus,
      byZone: Object.values(byZone).map(pct).sort((a, b) => b.total - a.total),
      byType: Object.values(byType).map(pct).sort((a, b) => b.total - a.total),
      booked: booked.slice(0, DETAIL_CAP), bookedCount: booked.length,
      free: free.slice(0, DETAIL_CAP), freeCount: free.length,
    });
  }

  if (card === 'quotations' || card === 'orders') {
    const where = card === 'quotations' ? { ...orderWhere, status: 'QUOTATION' } : orderWhere;
    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true, orderNo: true, status: true, bookingDate: true, grandTotal: true,
        company: { select: { name: true } },
        client: { select: { name: true, company: true } },
        _count: { select: { items: { where: { status: { not: 'CANCELLED' } } } } },
      },
      orderBy: { bookingDate: 'desc' },
    });
    const byStatus = {}, byCompany = {}, byMonth = {};
    for (const o of orders) {
      bucketAdd(byStatus, o.status, o.status, o.grandTotal);
      bucketAdd(byCompany, o.company?.name || '—', o.company?.name || '—', o.grandTotal);
      bucketAdd(byMonth, monthKey(o.bookingDate), monthKey(o.bookingDate), o.grandTotal);
    }
    const value = orders.reduce((s, o) => s + o.grandTotal, 0);
    return res.json({
      card,
      // Quotations card shows value; Orders card shows the count (quotations included, like /overview).
      headline: card === 'quotations' ? value : orders.length,
      count: orders.length, value,
      byStatus: bucketRows(byStatus), byCompany: bucketRows(byCompany), byMonth: bucketRows(byMonth, true),
      rows: orders.slice(0, DETAIL_CAP).map((o) => ({
        id: o.id, orderNo: o.orderNo, status: o.status, bookingDate: o.bookingDate,
        client: clientName(o.client), company: o.company?.name, sites: o._count.items, value: Math.round(o.grandTotal || 0),
      })),
    });
  }

  res.status(400).json({ error: 'Unknown card' });
});

// FY Booking Analysis — mirrors the client's workbook (Dashboard, Month-wise,
// Category-wise, Customer-wise, Payment Status, Pending Follow-up).
router.get('/booking-analysis', requirePermission('bookingAnalysis', 'view'), async (req, res) => {
  const { companyId, from, to, category, customer, zone, mediaType, paymentStatus, paymentTerms } = req.query;
  const data = await computeBookingAnalysis({ companyId, from, to, category, customer, zone, mediaType, paymentStatus, paymentTerms });
  delete data.lines; // raw lines are for the Excel export only
  res.json(data);
});

module.exports = router;
