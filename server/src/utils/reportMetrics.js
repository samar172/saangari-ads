const prisma = require('../db');
const { orderPrintCost } = require('./printingCost');

// Shared calculations behind the Reports tiles. Each report endpoint and its
// card drill-down call the same function, so a dialog's headline can never
// drift from the tile it explains.

const NON_CANCELLED = { notIn: ['CANCELLED'] };
const RECEIVABLE = ['CONFIRMED', 'LIVE', 'COMPLETED'];
const DAY = 86400000;

// Parse ?from&to into a Prisma date filter (inclusive of the whole `to` day).
function dateRange(from, to) {
  const r = {};
  if (from) r.gte = new Date(from);
  if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); r.lte = d; }
  return Object.keys(r).length ? r : null;
}

const monthKey = (d) => `${new Date(d).getFullYear()}-${String(new Date(d).getMonth() + 1).padStart(2, '0')}`;
const clientName = (c) => c?.company?.trim() || c?.name || 'Unknown';
const r2 = (n) => Math.round((n || 0) * 100) / 100;

// Add `amount` to a keyed bucket, counting rows too; bucketRows returns them
// sorted by value (or by key, for months). Used by the card drill-downs.
function bucketAdd(map, key, label, amount) {
  const b = (map[key] = map[key] || { key, label, value: 0, count: 0 });
  b.value += amount || 0;
  b.count += 1;
}
const bucketRows = (map, byKey) => Object.values(map)
  .map((b) => ({ ...b, value: Math.round(b.value) }))
  .sort(byKey ? (a, b) => a.key.localeCompare(b.key) : (a, b) => b.value - a.value);

// ── Profitability ─────────────────────────────────────────────────────────────
// Revenue (ex-GST) vs the costs we track (printing paid to partners) and the
// discounts given. Confirmed/live/completed campaigns by booking date.
async function computeProfitability({ companyId, from, to }) {
  const where = { status: { in: RECEIVABLE } };
  if (companyId) where.companyId = Number(companyId);
  const range = dateRange(from, to);
  if (range) where.bookingDate = range;

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true, orderNo: true, status: true,
      grandTotal: true, taxableAmount: true, printingTotal: true, printCost: true, rentalSubtotal: true, addOnTotal: true,
      discountAmount: true, discountPct: true, discountFlat: true, discountRemarks: true,
      mountingCost: true, bookingDate: true, printMaterial: true, noOfPrints: true, printRate: true, chargesPerSite: true,
      category: { select: { name: true } },
      company: { select: { name: true } },
      client: { select: { id: true, name: true, company: true } },
      printingPartner: { select: { id: true, name: true, ratePerSqft: true, materials: { select: { name: true, costPerSqft: true } } } },
      items: { select: { status: true, site: { select: { sqft: true } } } },
    },
    orderBy: { bookingDate: 'desc' },
  });

  let revenueExGst = 0, grossBooked = 0, printingCharged = 0, printingCost = 0, discounts = 0, mountingCharged = 0;
  const byCat = {}; // { cat: { revenue, printingMargin } }
  const byMonth = {}; // { 'YYYY-MM': { revenue, printingMargin } }
  const rows = [];
  for (const o of orders) {
    const pc = orderPrintCost(o, o.printingPartner);
    const { cost } = pc;
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
    const mk = monthKey(o.bookingDate);
    byMonth[mk] = byMonth[mk] || { period: mk, revenue: 0, printingMargin: 0 };
    byMonth[mk].revenue += o.taxableAmount || 0;
    byMonth[mk].printingMargin += pMargin;
    rows.push({
      id: o.id, orderNo: o.orderNo, status: o.status, bookingDate: o.bookingDate,
      client: clientName(o.client), clientId: o.client?.id, company: o.company?.name || '—', category: cat,
      rent: r2(o.rentalSubtotal), printing: r2(o.printingTotal), mounting: r2(o.mountingCost), extras: r2(o.addOnTotal),
      discount: r2(o.discountAmount), discountPct: o.discountFlat > 0 ? null : o.discountPct || 0, discountRemarks: o.discountRemarks || '',
      taxable: r2(o.taxableAmount), total: r2(o.grandTotal),
      adjustment: r2((o.taxableAmount || 0) - ((o.rentalSubtotal || 0) + (o.printingTotal || 0) + (o.mountingCost || 0) + (o.addOnTotal || 0) - (o.discountAmount || 0))),
      partner: o.printingPartner?.name || '—', partnerId: o.printingPartner?.id || null,
      material: o.printMaterial || '—', prints: pc.area.prints, sites: pc.area.sites, avgSqft: pc.area.avgSqft, sqft: pc.area.sqft,
      printRate: o.printRate || 0, perSite: !!o.chargesPerSite,
      printCost: cost, costSource: pc.source, costRate: pc.rate || null, margin: r2((o.printingTotal || 0) - cost),
    });
  }

  return {
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
    rows,
  };
}

// ── Receivables aging ─────────────────────────────────────────────────────────
// Always "as of now": each receivable campaign (invoiced more than paid) is aged
// by its earliest live invoice's due date (fallback: issue date).
const BUCKETS = [
  { key: 'current', label: 'Not due' },
  { key: 'd1_30', label: '1–30 d' },
  { key: 'd31_60', label: '31–60 d' },
  { key: 'd61_90', label: '61–90 d' },
  { key: 'd90plus', label: '90+ d' },
];
const bucketFor = (daysPast) => (daysPast <= 0 ? 'current' : daysPast <= 30 ? 'd1_30' : daysPast <= 60 ? 'd31_60' : daysPast <= 90 ? 'd61_90' : 'd90plus');

async function computeReceivables({ companyId }) {
  const where = { status: { in: RECEIVABLE } };
  if (companyId) where.companyId = Number(companyId);

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true, orderNo: true, status: true, grandTotal: true,
      company: { select: { name: true } },
      client: { select: { id: true, name: true, company: true } },
      payments: { select: { amount: true, receivedAt: true } },
      invoices: { select: { id: true, invoiceNo: true, total: true, status: true, issuedAt: true, dueDate: true, periodLabel: true } },
    },
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  let totalOutstanding = 0;
  const overdue = [];
  const rows = [];
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
    const dates = live.map((i) => new Date(i.dueDate || i.issuedAt)).filter((d) => !Number.isNaN(d.getTime()));
    const ageDate = dates.length ? new Date(Math.min(...dates.map((d) => +d))) : today;
    const daysPast = Math.floor((today - ageDate) / DAY);
    const bucket = bucketFor(daysPast);
    buckets[bucket] += outstanding;
    totalOutstanding += outstanding;
    if (daysPast > 0) overdue.push({ orderId: o.id, orderNo: o.orderNo, client: clientName(o.client), outstanding, daysPast });
    const lastPaid = o.payments.reduce((m, p) => (!m || p.receivedAt > m ? p.receivedAt : m), null);
    rows.push({
      id: o.id, orderNo: o.orderNo, status: o.status, client: clientName(o.client), clientId: o.client?.id,
      company: o.company?.name || '—', campaignTotal: r2(o.grandTotal),
      invoiced: r2(invoiced), paid: r2(paid), outstanding, ageDate, daysPast: Math.max(0, daysPast), bucket,
      bucketLabel: BUCKETS.find((b) => b.key === bucket).label, lastPaid,
      invoiceNos: live.map((i) => i.invoiceNo).join(', '),
      invoices: live.map((i) => ({
        id: i.id, invoiceNo: i.invoiceNo, status: i.status, issuedAt: i.issuedAt, dueDate: i.dueDate, total: r2(i.total),
        periodLabel: i.periodLabel || '',
        daysPast: Math.max(0, Math.floor((today - new Date(i.dueDate || i.issuedAt)) / DAY)),
      })),
    });
  }

  const dso = invoicedLast365 > 0 ? Math.round(totalOutstanding / (invoicedLast365 / 365)) : 0;
  overdue.sort((a, b) => b.outstanding - a.outstanding);
  rows.sort((a, b) => b.outstanding - a.outstanding);
  return {
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Math.round(v)])),
    totalOutstanding: Math.round(totalOutstanding),
    dso, invoicedLast365: Math.round(invoicedLast365),
    overdue, overdueCount: overdue.length,
    rows,
  };
}

// ── Site-wise report ──────────────────────────────────────────────────────────
// Per-site revenue (ex-GST rental), booking count and days booked, filterable by
// company, date (booking date), zone, media type and free text. Returns every
// active site (so unbooked inventory is visible too) plus rollups. `bookings`
// carries the raw lines (with campaign/client) for the card drill-downs.
async function computeSiteWise({ companyId, from, to, zone, type, q, bookedOnly }) {
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
    prisma.booking.findMany({
      where: bookingWhere,
      select: {
        id: true, siteId: true, subtotal: true, days: true, startDate: true, endDate: true, status: true,
        order: { select: { id: true, orderNo: true, status: true, bookingDate: true, company: { select: { name: true } }, client: { select: { id: true, name: true, company: true } } } },
      },
    }),
    prisma.mediaType.findMany({ select: { code: true, label: true } }),
  ]);

  const mediaLabel = Object.fromEntries(mediaTypes.map((m) => [m.code, m.label]));

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
  if (bookedOnly === true || bookedOnly === 'true' || bookedOnly === '1') rows = rows.filter((r) => r.bookings > 0);

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
    const key = monthKey(b.startDate);
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

  return {
    sites: rows,
    summary,
    byZone: Object.values(zoneMap).sort((a, b) => b.revenue - a.revenue),
    byType: Object.values(typeMap).sort((a, b) => b.revenue - a.revenue),
    byMonth,
    filters: { zones, types },
    bookings, mediaLabel,
  };
}

module.exports = {
  NON_CANCELLED, RECEIVABLE, BUCKETS, dateRange, monthKey, clientName, r2, bucketAdd, bucketRows,
  computeProfitability, computeReceivables, computeSiteWise,
};
