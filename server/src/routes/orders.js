const router = require('express').Router();
const dayjs = require('dayjs');
const PDFDocument = require('pdfkit');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const { computeOrder } = require('../utils/pricing');
const { nextOrderNo, nextBookingNo } = require('../utils/counters');

const INR = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN');
const ACTIVE = ['TENTATIVE', 'CONFIRMED', 'LIVE'];

// Detect an overlapping active booking on a site (ignoring a given order's own lines).
async function findConflict(siteId, startDate, endDate, excludeOrderId) {
  return prisma.booking.findFirst({
    where: {
      siteId,
      orderId: excludeOrderId ? { not: excludeOrderId } : undefined,
      status: { in: ACTIVE },
      startDate: { lte: new Date(endDate) },
      endDate: { gte: new Date(startDate) },
    },
    include: { order: { include: { client: { select: { name: true } } } } },
  });
}

const orderInclude = {
  client: true,
  createdBy: { select: { id: true, name: true } },
  printingPartner: true,
  addOns: true,
  payments: { include: { recordedBy: { select: { name: true } } }, orderBy: { receivedAt: 'desc' } },
  reminders: { orderBy: { dueDate: 'asc' } },
  invoices: true,
  items: {
    include: {
      site: true,
      photos: { include: { uploadedBy: { select: { name: true } } }, orderBy: { takenAt: 'asc' } },
    },
  },
};

function withDerived(order) {
  const paid = (order.payments || []).reduce((s, p) => s + p.amount, 0);
  return { ...order, amountPaid: paid, balanceDue: Math.max(0, (order.grandTotal || 0) - paid) };
}

// List orders (Sales sees only their own)
router.get('/', async (req, res) => {
  const { status, clientId, mine } = req.query;
  const where = {};
  if (status) where.status = status;
  if (clientId) where.clientId = Number(clientId);
  if (mine === 'true' || req.user.role === 'SALES') where.createdById = req.user.id;

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { id: true, name: true, phone: true, taxCategory: true } },
      createdBy: { select: { id: true, name: true } },
      items: { select: { id: true, siteId: true, status: true, site: { select: { code: true } }, photos: { select: { id: true } } } },
      payments: { select: { amount: true } },
      invoices: { select: { id: true, invoiceNo: true, status: true } },
    },
  });
  res.json(orders.map(withDerived));
});

router.get('/:id', async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: Number(req.params.id) }, include: orderInclude });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(withDerived(order));
});

// Live quote (no persistence) for the order form
router.post('/quote', async (req, res) => {
  try {
    const priced = await priceFromBody(req.body || {});
    res.json(priced.result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Shared: load sites for the requested lines and price the whole order.
async function priceFromBody(body) {
  const {
    items = [], addOns = [], noOfPrints = 0, printRate = 0, mountingCost = 0,
    discountPct = 0, taxCategory = 'NON_GST', interState = false,
  } = body;
  if (!Array.isArray(items) || items.length === 0) throw new Error('Add at least one site');

  const siteIds = items.map((i) => Number(i.siteId));
  const sites = await prisma.site.findMany({ where: { id: { in: siteIds } } });
  const byId = Object.fromEntries(sites.map((s) => [s.id, s]));

  const pricedItems = items.map((i) => {
    const site = byId[Number(i.siteId)];
    if (!site) throw new Error(`Site ${i.siteId} not found`);
    return { siteId: site.id, monthlyRate: site.monthlyRate, startDate: i.startDate, endDate: i.endDate, dayRateOverride: i.dayRateOverride };
  });

  const result = computeOrder({
    items: pricedItems, addOns, noOfPrints, printRate, mountingCost,
    discountPct, taxCategory, interState,
  });
  return { result, sites: byId };
}

// Create an order (quotation) with its site line-items, add-ons and reminders.
router.post('/', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const body = req.body || {};
  const {
    clientId, items = [], type = 'REGULAR', bookingDate, description,
    printingPartnerId, noOfPrints = 0, printRate = 0, mountingCost = 0,
    monitoring = false, monitorStart = false, monitorMid = false, monitorEnd = false,
    taxCategory = 'NON_GST', interState = false, placeOfSupply,
    discountPct = 0, discountRemarks, addOns = [], notes, status = 'QUOTATION',
  } = body;

  if (!clientId) return res.status(400).json({ error: 'Client is required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Add at least one site' });
  for (const it of items) {
    if (!it.siteId || !it.startDate || !it.endDate) return res.status(400).json({ error: 'Each site needs a start and end date' });
  }

  // Price it
  let priced;
  try { priced = await priceFromBody({ items, addOns, noOfPrints, printRate, mountingCost, discountPct, taxCategory, interState }); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  // Conflict check per line
  const lineStatus = {};
  for (const it of items) {
    const conflict = await findConflict(Number(it.siteId), it.startDate, it.endDate);
    if (conflict && type === 'REGULAR')
      return res.status(409).json({ error: `${priced.sites[Number(it.siteId)]?.code || 'Site'} is already booked for these dates by ${conflict.order.client.name}. Use a Loose booking to waitlist.` });
    lineStatus[it.siteId] = conflict && type === 'LOOSE' ? 'WAITLIST' : (status === 'CONFIRMED' ? 'CONFIRMED' : 'TENTATIVE');
  }

  const r = priced.result;
  const orderNo = await nextOrderNo();

  // Reminder due dates from the campaign envelope
  const starts = items.map((i) => dayjs(i.startDate));
  const ends = items.map((i) => dayjs(i.endDate));
  const minStart = starts.reduce((a, b) => (b.isBefore(a) ? b : a));
  const maxEnd = ends.reduce((a, b) => (b.isAfter(a) ? b : a));
  const midDate = minStart.add(Math.round(maxEnd.diff(minStart, 'day') / 2), 'day');
  const reminders = [];
  if (monitoring) {
    if (monitorStart) reminders.push({ phase: 'START', dueDate: minStart.toDate() });
    if (monitorMid) reminders.push({ phase: 'MID', dueDate: midDate.toDate() });
    if (monitorEnd) reminders.push({ phase: 'END', dueDate: maxEnd.toDate() });
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNo, clientId: Number(clientId), createdById: req.user.id,
        status: status === 'CONFIRMED' ? 'CONFIRMED' : 'QUOTATION',
        bookingDate: bookingDate ? new Date(bookingDate) : new Date(),
        description,
        printingPartnerId: printingPartnerId ? Number(printingPartnerId) : null,
        noOfPrints: Number(noOfPrints) || 0, printRate: Number(printRate) || 0, printingTotal: r.printingTotal,
        mountingCost: r.mountingTotal,
        monitoring: !!monitoring, monitorStart: !!monitorStart, monitorMid: !!monitorMid, monitorEnd: !!monitorEnd,
        taxCategory, interState: !!interState, placeOfSupply: placeOfSupply || 'Rajasthan',
        discountPct: Number(discountPct) || 0, discountRemarks,
        rentalSubtotal: r.rentalSubtotal, addOnTotal: r.addOnTotal, discountAmount: r.discountAmount,
        taxableAmount: r.taxableAmount, cgst: r.cgst, sgst: r.sgst, igst: r.igst,
        gstAmount: r.gstAmount, grandTotal: r.grandTotal, notes,
        addOns: { create: (addOns || []).filter((a) => a.label).map((a) => ({ label: a.label, amount: Number(a.amount) || 0 })) },
        reminders: { create: reminders },
      },
    });

    for (const line of r.lines) {
      const bookingNo = await nextBookingNo();
      const st = lineStatus[line.siteId];
      await tx.booking.create({
        data: {
          bookingNo, orderId: created.id, siteId: line.siteId, type,
          status: st,
          startDate: new Date(items.find((i) => Number(i.siteId) === line.siteId).startDate),
          endDate: new Date(items.find((i) => Number(i.siteId) === line.siteId).endDate),
          days: line.days, dayRate: line.dayRate, subtotal: line.subtotal,
        },
      });
      // Reflect hold on the tile
      if (st === 'TENTATIVE') await tx.site.update({ where: { id: line.siteId }, data: { status: 'TENTATIVE' } });
      if (st === 'CONFIRMED') await tx.site.update({ where: { id: line.siteId }, data: { status: 'BOOKED' } });
    }

    return tx.order.findUnique({ where: { id: created.id }, include: orderInclude });
  });

  res.status(201).json(withDerived(order));
});

// Order status transitions with cascade to line + site status.
router.post('/:id/status', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const { status } = req.body || {};
  const id = Number(req.params.id);
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const lineFor = { CONFIRMED: 'CONFIRMED', LIVE: 'LIVE', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' };
  const siteFor = { CONFIRMED: 'BOOKED', LIVE: 'BOOKED', COMPLETED: 'AVAILABLE', CANCELLED: 'AVAILABLE' };

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { status } });
    if (lineFor[status]) {
      for (const line of order.items) {
        // Leave waitlisted lines alone unless we're cancelling/completing the order
        if (line.status === 'WAITLIST' && !['CANCELLED', 'COMPLETED'].includes(status)) continue;
        await tx.booking.update({ where: { id: line.id }, data: { status: lineFor[status] } });
        if (siteFor[status]) await tx.site.update({ where: { id: line.siteId }, data: { status: siteFor[status] } });
      }
    }
  });

  const full = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  res.json(withDerived(full));
});

// Record a payment received against the order (credits the client ledger).
router.post('/:id/payments', requireRole('FINANCE', 'MANAGER', 'SALES'), async (req, res) => {
  const id = Number(req.params.id);
  const { amount, mode = 'CASH', reference, notes } = req.body || {};
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });

  const payment = await prisma.payment.create({
    data: {
      orderId: id, clientId: order.clientId, amount: Number(amount), mode,
      reference, notes, recordedById: req.user.id,
    },
  });
  await prisma.ledgerEntry.create({
    data: { clientId: order.clientId, type: 'CREDIT', amount: Number(amount), narration: `Payment received · ${order.orderNo}${reference ? ' · ' + reference : ''}` },
  });

  const full = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  res.status(201).json(withDerived(full));
});

// Quotation PDF for the client
router.get('/:id/quotation.pdf', async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: Number(req.params.id) }, include: orderInclude });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const doc = new PDFDocument({ margin: 45, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Quotation-${order.orderNo}.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).fillColor('#1e3a8a').text('SAANGRI ADVERTISING', 45, 45);
  doc.fontSize(9).fillColor('#555').text('Outdoor Media — Bikaner, Rajasthan');
  doc.fontSize(16).fillColor('#000').text('QUOTATION', 0, 48, { align: 'right' });
  doc.fontSize(10).fillColor('#333')
    .text(`Quote No: ${order.orderNo}`, { align: 'right' })
    .text(`Date: ${new Date(order.bookingDate).toLocaleDateString('en-IN')}`, { align: 'right' });

  doc.moveDown(1.5);
  doc.fontSize(11).fillColor('#000').text('To:', 45);
  doc.fontSize(10).fillColor('#333').text(order.client.name);
  if (order.client.company) doc.text(order.client.company);
  doc.text(`Phone: ${order.client.phone}`);
  if (order.client.gstNumber) doc.text(`GSTIN: ${order.client.gstNumber}`);
  if (order.description) { doc.moveDown(0.5); doc.fillColor('#000').text('Description: ', { continued: true }).fillColor('#333').text(order.description); }

  doc.moveDown();
  // Line-item table
  const x = { code: 45, loc: 110, period: 300, days: 420, amt: 470 };
  let y = doc.y + 4;
  doc.fontSize(9).fillColor('#fff');
  doc.rect(45, y - 2, 505, 18).fill('#1e3a8a');
  doc.fillColor('#fff')
    .text('Site', x.code, y).text('Location', x.loc, y).text('Period', x.period, y)
    .text('Days', x.days, y).text('Amount', x.amt, y, { width: 80, align: 'right' });
  y += 20;
  doc.fillColor('#333').font('Helvetica');
  for (const it of order.items) {
    const period = `${new Date(it.startDate).toLocaleDateString('en-IN')}–${new Date(it.endDate).toLocaleDateString('en-IN')}`;
    doc.fontSize(8)
      .text(it.site.code, x.code, y, { width: 60 })
      .text(it.site.location, x.loc, y, { width: 185 })
      .text(period, x.period, y, { width: 115 })
      .text(String(it.days), x.days, y, { width: 40 })
      .text(INR(it.subtotal), x.amt, y, { width: 80, align: 'right' });
    y += Math.max(16, doc.heightOfString(it.site.location, { width: 185, fontSize: 8 }));
    if (y > 720) { doc.addPage(); y = 60; }
  }

  // Totals
  y += 8;
  const totalRow = (k, v, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor('#000')
      .text(k, 330, y, { width: 140, align: 'right' })
      .text(INR(v), x.amt, y, { width: 80, align: 'right' });
    y += bold ? 20 : 15;
  };
  totalRow('Rental Subtotal', order.rentalSubtotal);
  if (order.printingTotal) totalRow(`Printing (${order.noOfPrints} @ ${INR(order.printRate)})`, order.printingTotal);
  if (order.mountingCost) totalRow('Mounting', order.mountingCost);
  if (order.addOnTotal) totalRow('Add-ons', order.addOnTotal);
  if (order.discountAmount) totalRow(`Discount (${order.discountPct}%)`, -order.discountAmount);
  totalRow('Taxable Value', order.taxableAmount);
  if (order.interState && order.igst) totalRow('IGST 18%', order.igst);
  if (!order.interState && order.gstAmount) { totalRow('CGST 9%', order.cgst); totalRow('SGST 9%', order.sgst); }
  totalRow('Grand Total', order.grandTotal, true);

  doc.font('Helvetica').fontSize(8).fillColor('#888').text('This quotation is valid for 15 days. Prices exclusive of printing/mounting unless stated.', 45, 780, { align: 'center', width: 505 });
  doc.end();
});

module.exports = router;
