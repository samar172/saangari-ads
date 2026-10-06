const router = require('express').Router();
const prisma = require('../db');
const { requireRole, requirePermission } = require('../middleware/auth');
const { computePrintCost } = require('../utils/printingCost');
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
      discountAmount: true, mountingCost: true, bookingDate: true, printMaterial: true,
      category: { select: { name: true } },
      printingPartner: { select: { ratePerSqft: true, materials: { select: { name: true, costPerSqft: true } } } },
      items: { select: { status: true, site: { select: { sqft: true } } } },
    },
  });

  let revenueExGst = 0, grossBooked = 0, printingCharged = 0, printingCost = 0, discounts = 0, mountingCharged = 0;
  const byCat = {}; // { cat: { revenue, printingMargin } }
  const byMonth = {}; // { 'YYYY-MM': { revenue, printingMargin } }
  for (const o of orders) {
    const totalSqft = (o.items || []).filter((i) => i.status !== 'CANCELLED').reduce((s, i) => s + (i.site?.sqft || 0), 0);
    const { cost } = computePrintCost({ printCost: o.printCost, printMaterial: o.printMaterial, totalSqft }, o.printingPartner);
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
    prisma.booking.findMany({ where: bookingWhere, select: { siteId: true, subtotal: true, days: true } }),
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
    filters: { zones, types },
  });
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
