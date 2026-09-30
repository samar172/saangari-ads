const dayjs = require('dayjs');
const prisma = require('../db');

// FY Booking Analysis — mirrors the client's workbook. Unit of analysis = one
// site line (Booking) on a confirmed campaign. Site-Months = days/30. Billing
// ex-GST = the line's rental (subtotal); GST 18% on GST orders. Order payments
// are allocated to lines pro-rata by the line's share of the order grand total
// (so a fully-paid order settles each line exactly; printing/mounting collection
// isn't attributed to rental lines). Payment status is taken from the order.
const RECEIVABLE = ['CONFIRMED', 'LIVE', 'COMPLETED'];
const monthKey = (d) => dayjs(d).format('YYYY-MM');
const monthLabel = (k) => dayjs(k + '-01').format('MMM YYYY');
const pct = (num, den) => (den > 0 ? num / den : 0);

function lineStatus(orderReceived, grandTotal) {
  if (orderReceived <= 0) return 'Pending';
  if (orderReceived >= Math.round(grandTotal)) return 'Received';
  return 'Partial';
}

async function computeBookingAnalysis(params = {}) {
  const { companyId, from, to, category, customer, zone, mediaType, paymentStatus, paymentTerms } = params;

  const where = { status: { in: RECEIVABLE } };
  if (companyId) where.companyId = Number(companyId);

  // Media-type code → label, so the item-wise filter reads "Gantry" not "GANTRY".
  const mediaTypeRows = await prisma.mediaType.findMany({ select: { code: true, label: true } });
  const mediaLabel = Object.fromEntries(mediaTypeRows.map((m) => [m.code, m.label]));

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true, orderNo: true, taxCategory: true, paymentTerms: true, grandTotal: true, bookingDate: true,
      category: { select: { name: true } },
      client: { select: { id: true, name: true, company: true, phone: true } },
      payments: { select: { amount: true } },
      items: {
        where: { status: { notIn: ['CANCELLED'] } },
        select: { id: true, startDate: true, endDate: true, days: true, subtotal: true, site: { select: { zone: true, code: true, type: true } } },
      },
    },
  });

  // Flatten to lines with allocated receipts. Collect filter option sets too.
  const catSet = new Set(), custSet = new Set(), zoneSet = new Set(), mediaSet = new Set();
  let lines = [];
  for (const o of orders) {
    const orderReceived = o.payments.reduce((s, p) => s + p.amount, 0);
    const status = lineStatus(orderReceived, o.grandTotal || 0);
    const custName = o.client.company?.trim() || o.client.name;
    const catName = o.category?.name || 'Uncategorised';
    catSet.add(catName); custSet.add(custName);
    for (const it of o.items) {
      const billingExGst = Math.round(it.subtotal || 0);
      const gst = o.taxCategory === 'GST' ? Math.round(billingExGst * 0.18) : 0;
      const total = billingExGst + gst;
      // Allocate order receipts by this line's share of the order grand total.
      const received = o.grandTotal > 0 ? Math.round(orderReceived * (total / o.grandTotal)) : 0;
      const zoneName = it.site?.zone || '—';
      zoneSet.add(zoneName);
      const mediaCode = it.site?.type || '—';
      const mediaName = mediaLabel[mediaCode] || mediaCode;
      mediaSet.add(mediaName);
      lines.push({
        orderId: o.id, orderNo: o.orderNo, month: monthKey(it.startDate),
        category: catName, customer: custName, clientId: o.client.id,
        contact: o.client.name, phone: o.client.phone, zone: zoneName, mediaType: mediaName,
        siteMonths: Math.round(((it.days || 0) / 30) * 100) / 100,
        billingExGst, gst, total,
        received: Math.min(total, received),
        outstanding: Math.max(0, total - Math.min(total, received)),
        paymentStatus: status,
        paymentTerms: o.paymentTerms || 'ADVANCE',
      });
    }
  }

  // Apply filters.
  const inRange = (m) => (!from || m >= monthKey(from)) && (!to || m <= monthKey(to));
  lines = lines.filter((l) =>
    (!category || l.category === category) &&
    (!customer || l.customer === customer) &&
    (!zone || l.zone === zone) &&
    (!mediaType || l.mediaType === mediaType) &&
    (!paymentStatus || l.paymentStatus === paymentStatus) &&
    (!paymentTerms || l.paymentTerms === paymentTerms) &&
    inRange(l.month)
  );

  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const distinct = (arr, f) => new Set(arr.map(f)).size;

  // ---- Dashboard ----
  const bookings = lines.length;
  const billingExGst = sum(lines, (l) => l.billingExGst);
  const gst = sum(lines, (l) => l.gst);
  const totalBilling = sum(lines, (l) => l.total);
  const received = sum(lines, (l) => l.received);
  const outstanding = sum(lines, (l) => l.outstanding);
  const siteMonths = Math.round(sum(lines, (l) => l.siteMonths) * 100) / 100;
  const advanceBookings = lines.filter((l) => l.paymentTerms === 'ADVANCE').length;

  // First booking month per customer (for New Customers by month).
  const firstMonthOf = {};
  for (const l of lines) if (!firstMonthOf[l.customer] || l.month < firstMonthOf[l.customer]) firstMonthOf[l.customer] = l.month;

  // ---- Month-wise ----
  const mMap = {};
  for (const l of lines) {
    const m = (mMap[l.month] = mMap[l.month] || { month: l.month, label: monthLabel(l.month), bookings: 0, siteMonths: 0, _custs: new Set(), _new: new Set(), billingExGst: 0, gst: 0, total: 0, received: 0, outstanding: 0 });
    m.bookings++; m.siteMonths += l.siteMonths; m._custs.add(l.customer);
    if (firstMonthOf[l.customer] === l.month) m._new.add(l.customer);
    m.billingExGst += l.billingExGst; m.gst += l.gst; m.total += l.total; m.received += l.received; m.outstanding += l.outstanding;
  }
  const monthwise = Object.values(mMap).sort((a, b) => a.month.localeCompare(b.month)).map((m, i, arr) => {
    const prevBilling = i > 0 ? arr[i - 1].billingExGst : 0;
    return {
      month: m.month, label: m.label, bookings: m.bookings, siteMonths: Math.round(m.siteMonths * 100) / 100,
      customersBilled: m._custs.size, newCustomers: m._new.size,
      billingExGst: Math.round(m.billingExGst), gst: Math.round(m.gst), total: Math.round(m.total),
      received: Math.round(m.received), outstanding: Math.round(m.outstanding),
      collectionPct: pct(m.received, m.total),
      momGrowth: prevBilling > 0 ? (m.billingExGst - prevBilling) / prevBilling : null,
      shareOfYear: pct(m.billingExGst, billingExGst),
    };
  });

  // ---- Category-wise ----
  const cMap = {};
  for (const l of lines) {
    const c = (cMap[l.category] = cMap[l.category] || { category: l.category, bookings: 0, _custs: new Set(), siteMonths: 0, billingExGst: 0, gst: 0, total: 0, received: 0, outstanding: 0 });
    c.bookings++; c._custs.add(l.customer); c.siteMonths += l.siteMonths;
    c.billingExGst += l.billingExGst; c.gst += l.gst; c.total += l.total; c.received += l.received; c.outstanding += l.outstanding;
  }
  const categorywise = Object.values(cMap).sort((a, b) => b.billingExGst - a.billingExGst).map((c) => ({
    category: c.category, bookings: c.bookings, customers: c._custs.size, siteMonths: Math.round(c.siteMonths * 100) / 100,
    billingExGst: Math.round(c.billingExGst), shareOfBilling: pct(c.billingExGst, billingExGst),
    gst: Math.round(c.gst), total: Math.round(c.total), received: Math.round(c.received), outstanding: Math.round(c.outstanding),
    collectionPct: pct(c.received, c.total),
    avgRatePerSiteMonth: c.siteMonths > 0 ? Math.round(c.billingExGst / c.siteMonths) : 0,
    avgBillingPerBooking: c.bookings > 0 ? Math.round(c.billingExGst / c.bookings) : 0,
  }));

  // ---- Customer-wise ----
  const uMap = {};
  for (const l of lines) {
    const u = (uMap[l.customer] = uMap[l.customer] || { customer: l.customer, category: l.category, contact: l.contact, phone: l.phone, bookings: 0, months: [], siteMonths: 0, billingExGst: 0, gst: 0, total: 0, received: 0, outstanding: 0, statuses: new Set() });
    u.bookings++; u.months.push(l.month); u.siteMonths += l.siteMonths;
    u.billingExGst += l.billingExGst; u.gst += l.gst; u.total += l.total; u.received += l.received; u.outstanding += l.outstanding;
    u.statuses.add(l.paymentStatus);
  }
  const customerwise = Object.values(uMap).sort((a, b) => b.billingExGst - a.billingExGst).map((u, i) => ({
    rank: i + 1, customer: u.customer, category: u.category, contact: u.contact, phone: u.phone,
    bookings: u.bookings, firstMonth: u.months.slice().sort()[0] || '', lastMonth: u.months.slice().sort().slice(-1)[0] || '',
    siteMonths: Math.round(u.siteMonths * 100) / 100,
    billingExGst: Math.round(u.billingExGst), gst: Math.round(u.gst), total: Math.round(u.total),
    received: Math.round(u.received), outstanding: Math.round(u.outstanding), collectionPct: pct(u.received, u.total),
    paymentStatus: u.outstanding <= 0 ? 'Received' : (u.received > 0 ? 'Partial' : 'Pending'),
  }));

  // ---- Payment Status ----
  const sMap = {};
  for (const l of lines) {
    const s = (sMap[l.paymentStatus] = sMap[l.paymentStatus] || { status: l.paymentStatus, bookings: 0, totalBilling: 0, received: 0, outstanding: 0, _custs: new Set() });
    s.bookings++; s.totalBilling += l.total; s.received += l.received; s.outstanding += l.outstanding; s._custs.add(l.customer);
  }
  const statusOrder = { Received: 0, Partial: 1, Pending: 2 };
  const paymentStatusRows = Object.values(sMap).sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)).map((s) => ({
    status: s.status, bookings: s.bookings, totalBilling: Math.round(s.totalBilling), received: Math.round(s.received),
    outstanding: Math.round(s.outstanding), shareOfBilling: pct(s.totalBilling, totalBilling), customers: s._custs.size,
  }));

  // ---- Pending Follow-up ----
  const pendingFollowup = customerwise.filter((u) => u.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).map((u, i) => {
    const outLines = lines.filter((l) => l.customer === u.customer && l.outstanding > 0);
    const oldest = outLines.map((l) => l.month).sort()[0] || '';
    return { rank: i + 1, customer: u.customer, category: u.category, contact: u.contact, phone: u.phone, outstanding: u.outstanding, oldestDueMonth: oldest, bookingsDue: outLines.length };
  });

  const dashboard = {
    bookings, customers: distinct(lines, (l) => l.customer), siteMonths,
    billingExGst, gst, totalBilling, received, outstanding,
    collectionPct: pct(received, totalBilling),
    avgBillingPerBooking: bookings > 0 ? Math.round(billingExGst / bookings) : 0,
    avgRatePerSiteMonth: siteMonths > 0 ? Math.round(billingExGst / siteMonths) : 0,
    advancePct: pct(advanceBookings, bookings),
    topCategory: categorywise[0]?.category || '—',
    bestMonth: monthwise.slice().sort((a, b) => b.billingExGst - a.billingExGst)[0]?.label || '—',
  };

  return {
    dashboard, monthwise, categorywise, customerwise,
    paymentStatus: paymentStatusRows, pendingFollowup,
    filters: {
      categories: [...catSet].sort(), customers: [...custSet].sort(), zones: [...zoneSet].sort(),
      mediaTypes: [...mediaSet].sort(),
    },
    lines, // raw (used by the Excel "Data" sheet)
  };
}

module.exports = { computeBookingAnalysis, monthLabel };
