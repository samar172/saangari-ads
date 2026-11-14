const prisma = require('../db');
const {
  NON_CANCELLED, BUCKETS, dateRange, monthKey, clientName, r2, bucketAdd, bucketRows,
  computeProfitability, computeReceivables, computeSiteWise,
} = require('./reportMetrics');
const { computeBookingAnalysis } = require('./bookingAnalysis');

// Drill-downs for the Reports, Site-wise and Booking Analysis stat tiles. Each
// card reuses the exact query / helper behind its tile, so the dialog headline
// equals the tile for the same filters. Long lists are capped (with a count).
const CAP = 300;
const BILLABLE_LINES = ['TENTATIVE', 'CONFIRMED', 'LIVE', 'COMPLETED', 'STOPPED'];
const sumBy = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

async function mediaLabels() {
  const rows = await prisma.mediaType.findMany({ select: { code: true, label: true } });
  return Object.fromEntries(rows.map((m) => [m.code, m.label]));
}

// Group rows by a key, summing several numeric fields.
function groupSum(rows, keyFn, labelFn, fields) {
  const map = {};
  for (const r of rows) {
    const k = keyFn(r);
    const g = (map[k] = map[k] || { key: k, label: labelFn(r), count: 0, ...Object.fromEntries(fields.map((f) => [f, 0])) });
    g.count += 1;
    for (const f of fields) g[f] += r[f] || 0;
  }
  return Object.values(map).map((g) => ({ ...g, ...Object.fromEntries(fields.map((f) => [f, r2(g[f])])) }));
}

// ── Reports page ──────────────────────────────────────────────────────────────
const COMPONENT = { bookedExGst: 'taxableAmount', rental: 'rentalSubtotal', printing: 'printingTotal', mounting: 'mountingCost' };
const PROFIT = { profitRevenue: 'revenueExGst', printCharged: 'printingCharged', printCost: 'printingCost', printMargin: 'printingMargin', discounts: 'discounts' };
const RECV = { recvTotal: null, recvCurrent: 'current', recv1_30: 'd1_30', recv31_60: 'd31_60', recv61_90: 'd61_90', recv90plus: 'd90plus' };
const GST_CARDS = ['gst', 'cgstSgst', 'igst'];

async function componentCard(card, { confirmedWhere }) {
  const f = COMPONENT[card];
  const [orders, mediaLabel] = await Promise.all([
    prisma.order.findMany({
      where: confirmedWhere,
      select: {
        id: true, orderNo: true, status: true, bookingDate: true,
        rentalSubtotal: true, printingTotal: true, mountingCost: true, addOnTotal: true,
        discountAmount: true, taxableAmount: true, gstAmount: true, grandTotal: true,
        printMaterial: true, noOfPrints: true, printRate: true, chargesPerSite: true,
        printingPartner: { select: { name: true } },
        company: { select: { name: true } },
        category: { select: { name: true } },
        client: { select: { id: true, name: true, company: true } },
        items: { where: { status: { in: BILLABLE_LINES } }, select: { subtotal: true, mountCharge: true, printCharge: true, site: { select: { type: true } } } },
      },
      orderBy: { bookingDate: 'desc' },
    }),
    mediaLabels(),
  ]);
  // Same reduction as /overview (rentalValue, printingValue, …).
  const headline = orders.reduce((s, o) => s + (o[f] || 0), 0);
  const sum = (k) => Math.round(sumBy(orders, (o) => o[k]));
  const bridge = {
    rent: sum('rentalSubtotal'), printing: sum('printingTotal'), mounting: sum('mountingCost'),
    extras: sum('addOnTotal'), discount: sum('discountAmount'),
    taxable: sum('taxableAmount'), gst: sum('gstAmount'), total: sum('grandTotal'),
  };
  bridge.adjustment = bridge.taxable - (bridge.rent + bridge.printing + bridge.mounting + bridge.extras - bridge.discount);

  const byCompany = {}, byCategory = {}, byMonth = {}, byClient = {}, byMedia = {}, byPartner = {}, byMaterial = {};
  for (const o of orders) {
    const v = o[f] || 0;
    if (!v) continue;
    bucketAdd(byCompany, o.company?.name || '—', o.company?.name || '—', v);
    bucketAdd(byCategory, o.category?.name || 'Uncategorised', o.category?.name || 'Uncategorised', v);
    bucketAdd(byMonth, monthKey(o.bookingDate), monthKey(o.bookingDate), v);
    bucketAdd(byClient, String(o.client?.id), clientName(o.client), v);
    if (card === 'rental') for (const l of o.items) bucketAdd(byMedia, l.site.type, mediaLabel[l.site.type] || l.site.type, l.subtotal);
    if (card === 'printing') {
      bucketAdd(byPartner, o.printingPartner?.name || 'No partner', o.printingPartner?.name || 'No partner', v);
      bucketAdd(byMaterial, o.printMaterial || '—', o.printMaterial || 'No material', v);
    }
  }
  const rows = orders.filter((o) => card === 'bookedExGst' || (o[f] || 0) !== 0);
  return {
    card, headline, field: f, count: orders.length, rowCount: rows.length, bridge,
    byCompany: bucketRows(byCompany), byCategory: bucketRows(byCategory), byMonth: bucketRows(byMonth, true),
    topClients: bucketRows(byClient).slice(0, 10), byMedia: bucketRows(byMedia),
    byPartner: bucketRows(byPartner), byMaterial: bucketRows(byMaterial),
    rows: rows.slice(0, CAP).map((o) => ({
      id: o.id, orderNo: o.orderNo, client: clientName(o.client), clientId: o.client?.id, company: o.company?.name || '—',
      category: o.category?.name || 'Uncategorised', bookingDate: o.bookingDate, status: o.status,
      rent: r2(o.rentalSubtotal), printing: r2(o.printingTotal), mounting: r2(o.mountingCost), extras: r2(o.addOnTotal),
      discount: r2(o.discountAmount), taxable: r2(o.taxableAmount), gst: r2(o.gstAmount), total: r2(o.grandTotal),
      value: r2(o[f]), sites: o.items.length,
      partner: o.printingPartner?.name || '—', material: o.printMaterial || '—',
      prints: o.chargesPerSite ? o.items.length : o.noOfPrints || 0, printRate: o.printRate || 0,
      basis: o.chargesPerSite ? 'Per site' : 'Per print',
    })),
  };
}

async function profitCard(card, { companyId, from, to }) {
  const p = await computeProfitability({ companyId, from, to });
  const all = p.rows;
  const rows = card === 'profitRevenue' ? all
    : card === 'discounts' ? all.filter((r) => r.discount > 0)
      : all.filter((r) => r.printing > 0 || r.printCost > 0);
  const sum = (k) => Math.round(sumBy(all, (r) => r[k]));
  const bridge = {
    rent: sum('rent'), printing: sum('printing'), mounting: sum('mounting'), extras: sum('extras'),
    discount: sum('discount'), taxable: sum('taxable'), total: sum('total'),
  };
  bridge.adjustment = bridge.taxable - (bridge.rent + bridge.printing + bridge.mounting + bridge.extras - bridge.discount);
  const printRows = all.filter((r) => r.printing > 0 || r.printCost > 0);
  const SOURCE = { entered: 'Entered on campaign', material_sqft: 'Material ₹/sqft × area', sqft: 'Partner ₹/sqft × area', none: 'No cost basis (₹0)' };
  const byPartner = groupSum(printRows, (r) => r.partner, (r) => r.partner, ['printing', 'printCost', 'margin']).sort((a, b) => b.printing - a.printing);
  const bySource = groupSum(printRows, (r) => r.costSource, (r) => SOURCE[r.costSource] || r.costSource, ['printing', 'printCost']).sort((a, b) => b.printCost - a.printCost);
  const discRows = all.filter((r) => r.discount > 0);
  const byClient = groupSum(discRows, (r) => String(r.clientId), (r) => r.client, ['discount', 'taxable']).sort((a, b) => b.discount - a.discount);
  const zeroCost = printRows.filter((r) => r.printing > 0 && r.printCost === 0);
  const monthly = groupSum(all, (r) => monthKey(r.bookingDate), (r) => monthKey(r.bookingDate), ['taxable', 'printing', 'printCost', 'margin', 'discount'])
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    card, headline: p[PROFIT[card]],
    summary: {
      revenueExGst: p.revenueExGst, grossBooked: p.grossBooked, printingCharged: p.printingCharged, printingCost: p.printingCost,
      printingMargin: p.printingMargin, discounts: p.discounts, mountingCharged: p.mountingCharged, contribution: p.contribution, orders: p.orders,
    },
    bridge, byCategory: p.byCategory, byMonth: p.byMonth, monthly, byPartner, bySource, byClient,
    zeroCostCount: zeroCost.length, zeroCostCharged: Math.round(sumBy(zeroCost, (r) => r.printing)),
    count: all.length, rowCount: rows.length,
    rows: rows.slice(0, CAP).map((r) => ({
      ...r,
      grossBeforeDiscount: r2(r.taxable + r.discount),
      marginPct: r.printing > 0 ? Math.round((r.margin / r.printing) * 100) : null,
    })),
  };
}

async function receivablesCard(card, { companyId }) {
  const r = await computeReceivables({ companyId });
  const bucket = RECV[card];
  const rows = bucket ? r.rows.filter((o) => o.bucket === bucket) : r.rows;
  const byBucket = BUCKETS.map((b) => ({ key: b.key, label: b.label, value: r.buckets[b.key], count: r.rows.filter((o) => o.bucket === b.key).length }));
  const byClient = groupSum(rows, (o) => String(o.clientId), (o) => o.client, ['outstanding']).map((g) => ({ ...g, value: g.outstanding })).sort((a, b) => b.value - a.value);
  const byCompany = groupSum(rows, (o) => o.company, (o) => o.company, ['outstanding']).map((g) => ({ ...g, value: g.outstanding })).sort((a, b) => b.value - a.value);
  const invoices = rows.flatMap((o) => o.invoices.map((i) => ({ ...i, orderId: o.id, orderNo: o.orderNo, client: o.client, clientId: o.clientId })));
  return {
    card, headline: bucket ? r.buckets[bucket] : r.totalOutstanding, bucket,
    bucketLabel: bucket ? BUCKETS.find((b) => b.key === bucket).label : 'All',
    totalOutstanding: r.totalOutstanding, dso: r.dso, invoicedLast365: r.invoicedLast365, overdueCount: r.overdueCount,
    totals: { invoiced: r2(sumBy(rows, (o) => o.invoiced)), paid: r2(sumBy(rows, (o) => o.paid)), outstanding: sumBy(rows, (o) => o.outstanding) },
    byBucket, byClient: byClient.slice(0, 15), byCompany,
    count: rows.length,
    rows: rows.slice(0, CAP).map(({ invoices: _i, ...o }) => o),
    invoices: invoices.slice(0, CAP), invoiceCount: invoices.length,
  };
}

async function gstCard(card, { companyId, from, confirmedWhere, to }) {
  const range = dateRange(from, to);
  const [orders, invAgg, invCount] = await Promise.all([
    prisma.order.findMany({
      where: confirmedWhere,
      select: {
        id: true, orderNo: true, status: true, bookingDate: true, taxCategory: true, interState: true, placeOfSupply: true,
        taxableAmount: true, cgst: true, sgst: true, igst: true, gstAmount: true, grandTotal: true,
        company: { select: { name: true } },
        client: { select: { id: true, name: true, company: true, gstNumber: true } },
      },
      orderBy: { bookingDate: 'desc' },
    }),
    // For reference: GST actually billed on invoices issued in the same window.
    prisma.invoice.aggregate({
      where: { status: { not: 'CANCELLED' }, ...(companyId ? { companyId: Number(companyId) } : {}), ...(range ? { issuedAt: range } : {}) },
      _sum: { amount: true, cgst: true, sgst: true, igst: true, gstAmount: true, total: true },
    }),
    prisma.invoice.count({ where: { status: { not: 'CANCELLED' }, ...(companyId ? { companyId: Number(companyId) } : {}), ...(range ? { issuedAt: range } : {}) } }),
  ]);
  // Same reductions as /overview: gstCollected, cgst + sgst (summed separately), igst.
  const cgst = orders.reduce((s, o) => s + o.cgst, 0);
  const sgst = orders.reduce((s, o) => s + o.sgst, 0);
  const igst = orders.reduce((s, o) => s + o.igst, 0);
  const gstAmount = orders.reduce((s, o) => s + o.gstAmount, 0);
  const headline = card === 'gst' ? gstAmount : card === 'igst' ? igst : cgst + sgst;
  const val = (o) => (card === 'gst' ? o.gstAmount : card === 'igst' ? o.igst : o.cgst + o.sgst);
  const rel = orders.filter((o) => val(o) !== 0);
  const byMonth = {}, byCompany = {}, byPlace = {}, byClient = {};
  for (const o of rel) {
    bucketAdd(byMonth, monthKey(o.bookingDate), monthKey(o.bookingDate), val(o));
    bucketAdd(byCompany, o.company?.name || '—', o.company?.name || '—', val(o));
    bucketAdd(byPlace, o.placeOfSupply || '—', o.placeOfSupply || '—', val(o));
    bucketAdd(byClient, String(o.client?.id), clientName(o.client), val(o));
  }
  const gstOrders = orders.filter((o) => o.taxCategory === 'GST');
  return {
    card, headline,
    split: {
      cgst: r2(cgst), sgst: r2(sgst), igst: r2(igst), gstAmount: r2(gstAmount),
      mismatch: r2(gstAmount - (cgst + sgst + igst)),
      gstCampaigns: gstOrders.length, nonGstCampaigns: orders.length - gstOrders.length,
      intra: orders.filter((o) => o.cgst + o.sgst !== 0).length, inter: orders.filter((o) => o.igst !== 0).length,
      taxableGst: r2(sumBy(gstOrders, (o) => o.taxableAmount)), taxableNonGst: r2(sumBy(orders.filter((o) => o.taxCategory !== 'GST'), (o) => o.taxableAmount)),
    },
    invoiced: {
      count: invCount, amount: r2(invAgg._sum.amount), cgst: r2(invAgg._sum.cgst), sgst: r2(invAgg._sum.sgst),
      igst: r2(invAgg._sum.igst), gstAmount: r2(invAgg._sum.gstAmount), total: r2(invAgg._sum.total),
    },
    byMonth: bucketRows(byMonth, true), byCompany: bucketRows(byCompany), byPlace: bucketRows(byPlace), topClients: bucketRows(byClient).slice(0, 10),
    count: rel.length,
    rows: rel.slice(0, CAP).map((o) => ({
      id: o.id, orderNo: o.orderNo, status: o.status, bookingDate: o.bookingDate, client: clientName(o.client), clientId: o.client?.id,
      gstin: o.client?.gstNumber || '—', company: o.company?.name || '—', place: o.placeOfSupply || '—',
      supply: o.igst ? 'Inter-state' : 'Intra-state',
      taxable: r2(o.taxableAmount), cgst: r2(o.cgst), sgst: r2(o.sgst), igst: r2(o.igst), gst: r2(o.gstAmount),
      cgstSgst: r2(o.cgst + o.sgst), total: r2(o.grandTotal),
    })),
  };
}

async function tdsCard(card, { paymentWhere }) {
  const [agg, payments] = await Promise.all([
    // Same aggregate as /overview, so the headline matches the tile exactly.
    prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true, tdsAmount: true, netReceived: true }, _count: { _all: true } }),
    prisma.payment.findMany({
      where: { ...paymentWhere, tdsAmount: { gt: 0 } },
      select: {
        id: true, amount: true, tdsPct: true, tdsAmount: true, netReceived: true, mode: true, reference: true, receivedAt: true,
        company: { select: { name: true } },
        client: { select: { id: true, name: true, company: true } },
        order: { select: { id: true, orderNo: true } },
      },
      orderBy: { receivedAt: 'desc' },
    }),
  ]);
  const byClient = {}, byMonth = {}, byRate = {};
  for (const p of payments) {
    bucketAdd(byClient, String(p.client?.id), clientName(p.client), p.tdsAmount);
    bucketAdd(byMonth, monthKey(p.receivedAt), monthKey(p.receivedAt), p.tdsAmount);
    bucketAdd(byRate, String(p.tdsPct || 0), `${p.tdsPct || 0}%`, p.tdsAmount);
  }
  return {
    card, headline: agg._sum.tdsAmount || 0,
    totals: { amount: agg._sum.amount || 0, tds: agg._sum.tdsAmount || 0, net: agg._sum.netReceived || 0, payments: agg._count._all },
    byClient: bucketRows(byClient).slice(0, 15), byMonth: bucketRows(byMonth, true), byRate: bucketRows(byRate),
    count: payments.length,
    rows: payments.slice(0, CAP).map((p) => ({
      id: p.id, receivedAt: p.receivedAt, orderId: p.order?.id, orderNo: p.order?.orderNo, client: clientName(p.client), clientId: p.client?.id,
      company: p.company?.name || '—', mode: p.mode, reference: p.reference || '',
      amount: r2(p.amount), tdsPct: p.tdsPct || 0, tds: r2(p.tdsAmount), net: r2(p.netReceived),
    })),
  };
}

async function clientsCard(card, { orderWhere, from, to }) {
  const range = dateRange(from, to);
  const [total, clients, orders] = await Promise.all([
    prisma.client.count(), // the tile: every client on record
    prisma.client.findMany({ select: { id: true, name: true, company: true, phone: true, createdAt: true, category: { select: { name: true } } } }),
    prisma.order.findMany({
      where: orderWhere,
      select: { clientId: true, status: true, grandTotal: true, bookingDate: true, payments: { select: { amount: true } } },
    }),
  ]);
  const per = {};
  for (const o of orders) {
    const c = (per[o.clientId] = per[o.clientId] || { orders: 0, campaigns: 0, quotes: 0, booked: 0, paid: 0, last: null });
    c.orders += 1; // like /overview's repeat count: quotations included
    if (o.status === 'QUOTATION') { c.quotes += 1; continue; }
    c.campaigns += 1;
    c.booked += o.grandTotal || 0;
    c.paid += sumBy(o.payments, (p) => p.amount);
    if (!c.last || o.bookingDate > c.last) c.last = o.bookingDate;
  }
  const rows = clients.map((cl) => {
    const c = per[cl.id] || { orders: 0, campaigns: 0, quotes: 0, booked: 0, paid: 0, last: null };
    const isNew = range ? cl.createdAt >= range.gte && (!range.lte || cl.createdAt <= range.lte) : false;
    return {
      id: cl.id, client: clientName(cl), contact: cl.name, phone: cl.phone, category: cl.category?.name || 'Uncategorised',
      createdAt: cl.createdAt, orders: c.orders, campaigns: c.campaigns, quotes: c.quotes,
      booked: r2(c.booked), paid: r2(c.paid), outstanding: r2(c.booked - c.paid), lastBooking: c.last,
      repeat: c.orders >= 2 ? 'Repeat' : c.orders === 1 ? 'One-off' : 'No orders', isNew: isNew ? 'New' : '',
    };
  });
  const active = rows.filter((r) => r.orders > 0);
  const byCategory = groupSum(active, (r) => r.category, (r) => r.category, ['booked']).map((g) => ({ ...g, value: g.booked })).sort((a, b) => b.value - a.value);
  const byType = [
    { key: 'repeat', label: 'Repeat (2+ orders)', value: active.filter((r) => r.orders >= 2).length },
    { key: 'one', label: 'One order', value: active.filter((r) => r.orders === 1).length },
    { key: 'none', label: 'No orders in period', value: rows.length - active.length },
  ];
  rows.sort((a, b) => b.booked - a.booked || b.orders - a.orders);
  return {
    card, headline: total,
    figures: {
      total, active: active.length, repeat: active.filter((r) => r.orders >= 2).length,
      newInPeriod: range ? rows.filter((r) => r.isNew).length : null, dormant: rows.length - active.length,
      booked: r2(sumBy(active, (r) => r.booked)), paid: r2(sumBy(active, (r) => r.paid)),
    },
    byCategory, byType, count: rows.length, rows: rows.slice(0, CAP),
  };
}

async function topMediaCard(card, { companyId, from, to }) {
  const range = dateRange(from, to);
  const [lines, mediaLabel, sites] = await Promise.all([
    // Exactly /overview's `lines` query: not limited by the date range.
    prisma.booking.findMany({
      where: { status: NON_CANCELLED, ...(companyId ? { order: { companyId: Number(companyId) } } : {}) },
      select: {
        subtotal: true, siteId: true,
        site: { select: { type: true, code: true, zone: true, location: true } },
        order: { select: { bookingDate: true, status: true } },
      },
    }),
    mediaLabels(),
    prisma.site.groupBy({ by: ['type'], where: { active: true }, _count: { _all: true } }),
  ]);
  const inventory = Object.fromEntries(sites.map((s) => [s.type, s._count._all]));
  const revByType = {};
  for (const l of lines) revByType[l.site.type] = (revByType[l.site.type] || 0) + l.subtotal;
  const top = Object.entries(revByType).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // The selected period, for comparison (order booking date, non-cancelled orders).
  const inPeriod = (l) => l.order.status !== 'CANCELLED' && (!range
    || ((!range.gte || l.order.bookingDate >= range.gte) && (!range.lte || l.order.bookingDate <= range.lte)));
  const types = {};
  for (const l of lines) {
    const t = (types[l.site.type] = types[l.site.type] || { key: l.site.type, code: l.site.type, label: mediaLabel[l.site.type] || l.site.type, revenue: 0, bookings: 0, _sites: new Set(), periodRevenue: 0, periodBookings: 0 });
    t.revenue += l.subtotal; t.bookings += 1; t._sites.add(l.siteId);
    if (inPeriod(l)) { t.periodRevenue += l.subtotal; t.periodBookings += 1; }
  }
  const totalRev = sumBy(Object.values(types), (t) => t.revenue);
  const byType = Object.values(types).map(({ _sites, ...t }) => ({
    ...t, revenue: r2(t.revenue), periodRevenue: r2(t.periodRevenue), sitesUsed: _sites.size, inventory: inventory[t.code] || 0,
    share: totalRev ? Math.round((t.revenue / totalRev) * 1000) / 10 : 0,
    avgPerBooking: t.bookings ? Math.round(t.revenue / t.bookings) : 0,
  })).sort((a, b) => b.revenue - a.revenue);

  const bySite = {};
  for (const l of lines) {
    const s = (bySite[l.siteId] = bySite[l.siteId] || { id: l.siteId, code: l.site.code, location: l.site.location, zone: l.site.zone, type: mediaLabel[l.site.type] || l.site.type, typeCode: l.site.type, bookings: 0, revenue: 0 });
    s.bookings += 1; s.revenue += l.subtotal;
  }
  const siteRows = Object.values(bySite).map((s) => ({ ...s, revenue: r2(s.revenue) })).sort((a, b) => b.revenue - a.revenue);
  return {
    card, headline: top, topLabel: top ? mediaLabel[top] || top : null,
    totalRevenue: r2(totalRev), totalBookings: lines.length,
    byType, count: siteRows.length, rows: siteRows.slice(0, CAP),
  };
}

async function reportCardDetail(card, ctx) {
  if (COMPONENT[card]) return componentCard(card, ctx);
  if (PROFIT[card]) return profitCard(card, ctx);
  if (card in RECV) return receivablesCard(card, ctx);
  if (GST_CARDS.includes(card)) return gstCard(card, ctx);
  if (card === 'tds') return tdsCard(card, ctx);
  if (card === 'clients') return clientsCard(card, ctx);
  if (card === 'topMedia') return topMediaCard(card, ctx);
  return null;
}

// ── Site-wise report (/reports/sites) ─────────────────────────────────────────
const SITE_CARDS = ['sitesCount', 'siteRevenue', 'siteBookings', 'siteDays', 'siteAvg'];

async function siteCardDetail(card, query) {
  if (!SITE_CARDS.includes(card)) return null;
  const d = await computeSiteWise(query);
  const s = d.summary;
  const avg = s.bookedSites ? Math.round(s.totalRevenue / s.bookedSites) : 0;
  const headline = {
    sitesCount: `${s.bookedSites}/${s.siteCount}`, siteRevenue: s.totalRevenue, siteBookings: s.totalBookings,
    siteDays: s.totalDays, siteAvg: avg,
  }[card];

  const shown = new Map(d.sites.map((r) => [r.siteId, r]));
  // Only bookings on the sites the page is showing count toward its tiles.
  const bookings = d.bookings.filter((b) => shown.has(b.siteId)).map((b) => {
    const site = shown.get(b.siteId);
    return {
      id: b.id, siteId: b.siteId, code: site.code, type: site.typeLabel, zone: site.zone || '—',
      orderId: b.order.id, orderNo: b.order.orderNo, orderStatus: b.order.status, bookingDate: b.order.bookingDate,
      client: clientName(b.order.client), clientId: b.order.client?.id, company: b.order.company?.name || '—',
      status: b.status, startDate: b.startDate, endDate: b.endDate, days: b.days || 0, subtotal: r2(b.subtotal),
      siteMonths: Math.round(((b.days || 0) / 30) * 100) / 100,
    };
  }).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  const roll = (keyFn) => {
    const m = {};
    for (const r of d.sites) {
      const k = keyFn(r);
      const g = (m[k] = m[k] || { key: k, label: k, sites: 0, booked: 0, revenue: 0, bookings: 0, days: 0 });
      g.sites += 1; if (r.bookings > 0) g.booked += 1;
      g.revenue += r.revenue; g.bookings += r.bookings; g.days += r.days;
    }
    return Object.values(m).map((g) => ({ ...g, pct: g.sites ? Math.round((g.booked / g.sites) * 100) : 0, avg: g.booked ? Math.round(g.revenue / g.booked) : 0 }))
      .sort((a, b) => b.revenue - a.revenue || b.sites - a.sites);
  };
  const byClient = groupSum(bookings, (b) => String(b.clientId), (b) => b.client, ['subtotal', 'days'])
    .map((g) => ({ ...g, value: Math.round(g.subtotal) })).sort((a, b) => b.value - a.value);
  const byStatus = groupSum(bookings, (b) => b.status, (b) => b.status, ['subtotal']).map((g) => ({ ...g, value: g.count }));

  return {
    card, headline, summary: { ...s, avg, rawRevenue: r2(sumBy(bookings, (b) => b.subtotal)) },
    byZone: roll((r) => r.zone || '—'), byType: roll((r) => r.typeLabel), byMonth: d.byMonth,
    byClient: byClient.slice(0, 15), byStatus,
    sites: d.sites.map((r) => ({
      id: r.siteId, code: r.code, location: r.location || r.city || '', zone: r.zone || '—', type: r.typeLabel, status: r.status,
      monthlyRate: r.monthlyRate, revenue: r.revenue, bookings: r.bookings, days: r.days,
      siteMonths: Math.round((r.days / 30) * 100) / 100, booked: r.bookings > 0 ? 'Booked' : 'Not booked',
      vsAvg: r.bookings > 0 ? r.revenue - avg : null,
    })),
    bookingCount: bookings.length, bookings: bookings.slice(0, 1000),
  };
}

// ── Booking Analysis (/booking-analysis) ──────────────────────────────────────
const BA_FIELD = {
  baBookings: 'bookings', baCustomers: 'customers', baSiteMonths: 'siteMonths', baBilling: 'billingExGst', baGst: 'gst',
  baTotal: 'totalBilling', baReceived: 'received', baOutstanding: 'outstanding', baCollection: 'collectionPct',
  baAvgBooking: 'avgBillingPerBooking', baAvgRate: 'avgRatePerSiteMonth', baAdvance: 'advancePct',
  baTopCategory: 'topCategory', baBestMonth: 'bestMonth',
};

async function bookingAnalysisCardDetail(card, query) {
  if (!BA_FIELD[card]) return null;
  const { companyId, from, to, category, customer, zone, mediaType, paymentStatus, paymentTerms } = query;
  const d = await computeBookingAnalysis({ companyId, from, to, category, customer, zone, mediaType, paymentStatus, paymentTerms });
  const lines = d.lines;
  const fields = ['billingExGst', 'gst', 'total', 'received', 'outstanding', 'siteMonths', 'days'];
  const byTerms = groupSum(lines, (l) => l.paymentTerms, (l) => (l.paymentTerms === 'ADVANCE' ? 'Advance' : 'Postpaid'), fields)
    .map((g) => ({ ...g, customers: new Set(lines.filter((l) => l.paymentTerms === g.key).map((l) => l.customer)).size }));
  const bySite = groupSum(lines, (l) => String(l.siteId), (l) => l.siteCode, fields)
    .map((g) => {
      const l = lines.find((x) => String(x.siteId) === g.key);
      return { ...g, id: l?.siteId, code: g.label, location: l?.siteLocation || '', zone: l?.zone, mediaType: l?.mediaType };
    }).sort((a, b) => b.siteMonths - a.siteMonths);
  const byZone = groupSum(lines, (l) => l.zone, (l) => l.zone, fields).sort((a, b) => b.billingExGst - a.billingExGst);
  const byMedia = groupSum(lines, (l) => l.mediaType, (l) => l.mediaType, fields).sort((a, b) => b.billingExGst - a.billingExGst);
  const out = lines.map((l, i) => ({
    id: l.bookingId || i, bookingId: l.bookingId, orderId: l.orderId, orderNo: l.orderNo, siteId: l.siteId, siteCode: l.siteCode,
    month: l.month, startDate: l.startDate, endDate: l.endDate, days: l.days, siteMonths: l.siteMonths,
    customer: l.customer, clientId: l.clientId, category: l.category, zone: l.zone, mediaType: l.mediaType,
    billingExGst: l.billingExGst, gst: l.gst, total: l.total, received: l.received, outstanding: l.outstanding,
    paymentStatus: l.paymentStatus, paymentTerms: l.paymentTerms === 'ADVANCE' ? 'Advance' : 'Postpaid', bookingDate: l.bookingDate,
  })).sort((a, b) => b.month.localeCompare(a.month) || b.billingExGst - a.billingExGst);
  const gstLines = lines.filter((l) => l.gst > 0);
  const split = {
    gstLines: gstLines.length, gstLinesBilling: sumBy(gstLines, (l) => l.billingExGst),
    nonGstLines: lines.length - gstLines.length, nonGstBilling: sumBy(lines.filter((l) => !(l.gst > 0)), (l) => l.billingExGst),
    advance: lines.filter((l) => l.paymentTerms === 'ADVANCE').length,
    rawSiteMonths: r2(sumBy(lines, (l) => l.siteMonths)), days: sumBy(lines, (l) => l.days),
  };
  const clientIds = {};
  for (const l of lines) clientIds[l.customer] = l.clientId;
  return {
    card, headline: d.dashboard[BA_FIELD[card]], dashboard: d.dashboard, split,
    monthwise: d.monthwise, categorywise: d.categorywise,
    customerwise: d.customerwise.map((c) => ({ ...c, id: c.rank, clientId: clientIds[c.customer] })),
    paymentStatus: d.paymentStatus, byTerms, bySite: bySite.slice(0, 500), siteCount: bySite.length, byZone, byMedia,
    lineCount: out.length, lines: out.slice(0, 1000),
  };
}

module.exports = { reportCardDetail, siteCardDetail, bookingAnalysisCardDetail };
