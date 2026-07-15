const router = require('express').Router();
const dayjs = require('dayjs');
const PDFDocument = require('pdfkit');
const { Prisma } = require('@prisma/client');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const { computeOrder, computeLine, recomputeOrderTotals } = require('../utils/pricing');
const { nextOrderNo, nextBookingNo } = require('../utils/counters');
const { writeLineNotes } = require('../utils/pdf');

const INR = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN');
const ACTIVE = ['TENTATIVE', 'CONFIRMED', 'LIVE'];

// Detect an overlapping active booking on a site.
// `db` is the prisma client or an active transaction — pass the tx so the check
// and the insert that follows it are atomic under a site-row lock (see
// lockSites), which is what actually stops two concurrent bookings racing.
// When shifting, exclude only the line being moved — a sibling line of the same
// order sitting on the target is still a real clash.
//
// endDate is the *exclusive* take-down day: a booking [Aug 9, Oct 9) occupies
// Aug 9…Oct 8, so a new booking starting Oct 9 does NOT overlap. Hence strict
// inequalities — two bookings truly clash iff existing.start < new.end AND
// existing.end > new.start. Using lte/gte here would wrongly reject legitimate
// back-to-back bookings that share the take-down day.
async function findConflict(db, siteId, startDate, endDate, { excludeOrderId, excludeBookingId } = {}) {
  return db.booking.findFirst({
    where: {
      siteId,
      ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      status: { in: ACTIVE },
      startDate: { lt: new Date(endDate) },
      endDate: { gt: new Date(startDate) },
    },
    include: { order: { include: { client: { select: { name: true } } } } },
  });
}

// Two date ranges overlap on the same site, exclusive end (mirrors findConflict).
function rangesOverlap(startA, endA, startB, endB) {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

// Serialize concurrent bookings on the same physical sites: take a row lock on
// the Site rows up front so a second transaction touching any of the same sites
// blocks until this one commits. Without it, two overlapping bookings can both
// pass findConflict (time-of-check) before either inserts (time-of-use).
async function lockSites(tx, siteIds) {
  const ids = [...new Set(siteIds.map(Number))].filter(Number.isInteger);
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "Site" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
}

// Thrown inside a booking transaction when a REGULAR line clashes; mapped to 409.
class BookingConflict extends Error {
  constructor(message) { super(message); this.status = 409; }
}

const orderInclude = {
  client: true,
  category: true,
  company: true,
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
      shifts: {
        orderBy: { shiftedAt: 'desc' },
        include: {
          fromSite: { select: { code: true, location: true } },
          toSite: { select: { code: true, location: true } },
          by: { select: { name: true } },
        },
      },
    },
  },
};

// Release a site back to AVAILABLE unless another live booking still holds it.
async function releaseSite(tx, siteId, exceptBookingId) {
  const stillHeld = await tx.booking.findFirst({
    where: { siteId, status: { in: ACTIVE }, id: exceptBookingId ? { not: exceptBookingId } : undefined },
  });
  if (!stillHeld) await tx.site.update({ where: { id: siteId }, data: { status: 'AVAILABLE' } });
}

// Re-price the order from its saved lines (dates change when a line is stopped
// or shifted, so the stored order totals go stale).
async function repriceOrder(tx, orderId) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  const t = recomputeOrderTotals(order, order.items);
  await tx.order.update({
    where: { id: orderId },
    data: {
      rentalSubtotal: t.rentalSubtotal, discountAmount: t.discountAmount, taxableAmount: t.taxableAmount,
      cgst: t.cgst, sgst: t.sgst, igst: t.igst, gstAmount: t.gstAmount, grandTotal: t.grandTotal,
    },
  });
}

function withDerived(order) {
  const paid = (order.payments || []).reduce((s, p) => s + p.amount, 0);
  return { ...order, amountPaid: paid, balanceDue: Math.max(0, (order.grandTotal || 0) - paid) };
}

// List orders (Sales sees only their own)
router.get('/', async (req, res) => {
  const { status, clientId, mine, companyId } = req.query;
  const where = {};
  if (status) where.status = status;
  if (clientId) where.clientId = Number(clientId);
  if (companyId) where.companyId = Number(companyId);
  if (mine === 'true' || req.user.role === 'SALES') where.createdById = req.user.id;

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { id: true, name: true, phone: true, taxCategory: true } },
      category: { select: { id: true, name: true } },
      company: { select: { id: true, name: true, code: true } },
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
    clientId, categoryId, companyId, items = [], type = 'REGULAR', bookingDate, description,
    printingPartnerId, noOfPrints = 0, printRate = 0, mountingCost = 0,
    monitoring = false, monitorStart = false, monitorMid = false, monitorEnd = false,
    taxCategory: rawTaxCategory = 'NON_GST', interState = false, placeOfSupply,
    discountPct = 0, discountRemarks, addOns = [], notes, status = 'QUOTATION',
  } = body;

  // Look up the company and enforce GST rules
  if (!companyId) return res.status(400).json({ error: 'Company is required' });
  const company = await prisma.company.findUnique({ where: { id: Number(companyId) } });
  if (!company) return res.status(400).json({ error: 'Invalid company' });

  // Saangari Ads: gstHidden=true  → force NON_GST
  // Saangari Company: gstMandatory=true → force GST
  let taxCategory = rawTaxCategory;
  if (company.gstHidden) taxCategory = 'NON_GST';
  if (company.gstMandatory) taxCategory = 'GST';

  if (!clientId) return res.status(400).json({ error: 'Client is required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Add at least one site' });
  for (const it of items) {
    if (!it.siteId || !it.startDate || !it.endDate) return res.status(400).json({ error: 'Each site needs a start and end date' });
  }

  // Price it
  let priced;
  try { priced = await priceFromBody({ items, addOns, noOfPrints, printRate, mountingCost, discountPct, taxCategory, interState }); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  // Reject a request that double-books the same site against itself: two lines
  // on one site with overlapping dates would each pass the DB conflict check
  // (neither is persisted yet), so guard it here before we touch the database.
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (Number(items[a].siteId) !== Number(items[b].siteId)) continue;
      if (rangesOverlap(items[a].startDate, items[a].endDate, items[b].startDate, items[b].endDate)) {
        const code = priced.sites[Number(items[a].siteId)]?.code || 'A site';
        return res.status(409).json({ error: `${code} appears twice with overlapping dates in this order.` });
      }
    }
  }

  const r = priced.result;

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

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
    // Lock the involved sites, then re-check conflicts inside the transaction so
    // a concurrent booking on the same site can't slip between check and insert.
    await lockSites(tx, items.map((i) => i.siteId));
    const lineStatus = {};
    for (const it of items) {
      const conflict = await findConflict(tx, Number(it.siteId), it.startDate, it.endDate);
      if (conflict && type === 'REGULAR')
        throw new BookingConflict(`${priced.sites[Number(it.siteId)]?.code || 'Site'} is already booked for these dates by ${conflict.order.client.name}. Use a Loose booking to waitlist.`);
      lineStatus[it.siteId] = conflict && type === 'LOOSE' ? 'WAITLIST' : (status === 'CONFIRMED' ? 'CONFIRMED' : 'TENTATIVE');
    }

    // Allocate the order number only after the checks pass, so a rejected
    // booking doesn't burn a number and leave a gap in the SO- sequence.
    const orderNo = await nextOrderNo();
    const created = await tx.order.create({
      data: {
        orderNo, clientId: Number(clientId), createdById: req.user.id,
        companyId: Number(companyId),
        categoryId: categoryId ? Number(categoryId) : null,
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
      const src = items.find((i) => Number(i.siteId) === line.siteId);
      await tx.booking.create({
        data: {
          bookingNo, orderId: created.id, siteId: line.siteId, type,
          status: st,
          startDate: new Date(src.startDate),
          endDate: new Date(src.endDate),
          days: line.days, dayRate: line.dayRate, subtotal: line.subtotal,
          displayNotes: src.displayNotes || null,
        },
      });
      // Reflect hold on the tile
      if (st === 'TENTATIVE') await tx.site.update({ where: { id: line.siteId }, data: { status: 'TENTATIVE' } });
      if (st === 'CONFIRMED') await tx.site.update({ where: { id: line.siteId }, data: { status: 'BOOKED' } });
    }

    return tx.order.findUnique({ where: { id: created.id }, include: orderInclude });
    });
  } catch (e) {
    if (e instanceof BookingConflict) return res.status(409).json({ error: e.message });
    throw e;
  }

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
        // A stopped line is finished — never drag it back into the order's status
        if (line.status === 'STOPPED') continue;
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
// `amount` is the gross settled against the order. Where the client deducts TDS
// at source they remit it to the government on our behalf, so the order is
// still credited the full gross; `netReceived` is what reached the bank.
router.post('/:id/payments', requireRole('FINANCE', 'MANAGER', 'SALES'), async (req, res) => {
  const id = Number(req.params.id);
  const { amount, mode = 'CASH', reference, notes, tdsApplicable = false, tdsPct = 0 } = req.body || {};
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const gross = Number(amount);
  if (!gross || gross <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });

  const pct = tdsApplicable ? Number(tdsPct) || 0 : 0;
  if (pct < 0 || pct > 100) return res.status(400).json({ error: 'TDS rate must be between 0 and 100' });
  const tdsAmount = Math.round(gross * pct / 100);
  const netReceived = gross - tdsAmount;

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        orderId: id, clientId: order.clientId, companyId: order.companyId, amount: gross, mode,
        tdsApplicable: !!tdsApplicable && pct > 0, tdsPct: pct, tdsAmount, netReceived,
        reference, notes, recordedById: req.user.id,
      },
    });
    const tdsNote = tdsAmount ? ` · TDS ${pct}% ₹${tdsAmount.toLocaleString('en-IN')} deducted` : '';
    await tx.ledgerEntry.create({
      data: {
        clientId: order.clientId, companyId: order.companyId, type: 'CREDIT', amount: gross,
        narration: `Payment received · ${order.orderNo}${reference ? ' · ' + reference : ''}${tdsNote}`,
      },
    });
  });

  const full = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  res.status(201).json(withDerived(full));
});

// ── Line-item operations ────────────────────────────────────────────────────

// Edit a line's display notes (they print on the quotation + invoice).
router.patch('/:id/items/:lineId', requireRole('MANAGER', 'FINANCE', 'SALES'), async (req, res) => {
  const { displayNotes } = req.body || {};
  const line = await prisma.booking.findUnique({ where: { id: Number(req.params.lineId) } });
  if (!line || line.orderId !== Number(req.params.id)) return res.status(404).json({ error: 'Line not found on this order' });

  await prisma.booking.update({
    where: { id: line.id },
    data: { displayNotes: displayNotes === '' ? null : displayNotes },
  });
  const full = await prisma.order.findUnique({ where: { id: line.orderId }, include: orderInclude });
  res.json(withDerived(full));
});

// Shift a live line onto a different site, keeping the same dates and price.
router.post('/:id/items/:lineId/shift', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { toSiteId, reason } = req.body || {};
  const orderId = Number(req.params.id);
  const line = await prisma.booking.findUnique({ where: { id: Number(req.params.lineId) } });
  if (!line || line.orderId !== orderId) return res.status(404).json({ error: 'Line not found on this order' });
  if (['COMPLETED', 'CANCELLED', 'STOPPED'].includes(line.status))
    return res.status(422).json({ error: `A ${line.status.toLowerCase()} line cannot be shifted` });

  const target = Number(toSiteId);
  if (!target) return res.status(400).json({ error: 'Target site is required' });
  if (target === line.siteId) return res.status(400).json({ error: 'The line is already on that site' });

  const site = await prisma.site.findUnique({ where: { id: target } });
  if (!site) return res.status(404).json({ error: 'Target site not found' });

  // Moving a waitlisted line onto a free site is how a waitlist gets resolved,
  // so promote it rather than leaving the site BOOKED under a WAITLIST line.
  const status = line.status === 'WAITLIST' ? 'CONFIRMED' : line.status;

  try {
    await prisma.$transaction(async (tx) => {
      // Lock the target site and re-check the clash inside the transaction, so a
      // concurrent booking on that site can't land between check and move.
      await lockSites(tx, [target]);
      const conflict = await findConflict(tx, target, line.startDate, line.endDate, { excludeBookingId: line.id });
      if (conflict)
        throw new BookingConflict(`${site.code} is already booked for these dates by ${conflict.order.client.name}`);

      const fromSiteId = line.siteId;
      await tx.booking.update({ where: { id: line.id }, data: { siteId: target, status } });
      await tx.siteShift.create({
        data: { bookingId: line.id, fromSiteId, toSiteId: target, reason: reason || null, byId: req.user.id },
      });
      await releaseSite(tx, fromSiteId, line.id);
      await tx.site.update({
        where: { id: target },
        data: { status: status === 'TENTATIVE' ? 'TENTATIVE' : 'BOOKED' },
      });
    });
  } catch (e) {
    if (e instanceof BookingConflict) return res.status(409).json({ error: e.message });
    throw e;
  }

  const full = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  res.json(withDerived(full));
});

// Stop a display immediately: bill only the days it actually ran, free the site.
router.post('/:id/items/:lineId/stop', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { reason } = req.body || {};
  const orderId = Number(req.params.id);
  const line = await prisma.booking.findUnique({ where: { id: Number(req.params.lineId) }, include: { site: true } });
  if (!line || line.orderId !== orderId) return res.status(404).json({ error: 'Line not found on this order' });
  if (['COMPLETED', 'CANCELLED', 'STOPPED'].includes(line.status))
    return res.status(422).json({ error: `This line is already ${line.status.toLowerCase()}` });

  // End today, but never before it started — a same-day stop still bills 1 day.
  const today = dayjs().startOf('day');
  const start = dayjs(line.startDate).startOf('day');
  const endDate = today.isBefore(start) ? start : today;
  const priced = computeLine({
    monthlyRate: line.site.monthlyRate,
    startDate: line.startDate,
    endDate: endDate.toDate(),
    dayRateOverride: line.dayRate,
  });

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: line.id },
      data: {
        status: 'STOPPED', stoppedAt: new Date(), stopReason: reason || null,
        endDate: endDate.toDate(), days: priced.days, subtotal: priced.subtotal,
      },
    });
    await releaseSite(tx, line.siteId, line.id);
    await repriceOrder(tx, orderId);
  });

  const full = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  res.json(withDerived(full));
});

// Quotation PDF for the client
router.get('/:id/quotation.pdf', async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: Number(req.params.id) }, include: orderInclude });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const doc = new PDFDocument({ margin: 45, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Quotation-${order.orderNo}.pdf"`);
  doc.pipe(res);

  const companyName = order.company?.legalName || order.company?.name || 'SAANGRI ADVERTISING';
  const logoPath = require('path').join(__dirname, '../assets/logo.png');
  try {
    doc.image(logoPath, 45, 45, { height: 35 });
    doc.fontSize(9).fillColor('#555').text('Outdoor Media — Bikaner, Rajasthan', 45, 85);
  } catch (e) {
    doc.fontSize(20).fillColor('#ef4444').text(companyName.toUpperCase(), 45, 45);
    doc.fontSize(9).fillColor('#555').text('Outdoor Media — Bikaner, Rajasthan');
  }
  if (order.company?.gstin) doc.fontSize(8).fillColor('#555').text(`GSTIN: ${order.company.gstin}`, 45, doc.y);
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
  if (order.category) { doc.moveDown(0.5); doc.fillColor('#000').text('Category: ', { continued: true }).fillColor('#333').text(order.category.name); }
  if (order.description) { doc.moveDown(0.5); doc.fillColor('#000').text('Description: ', { continued: true }).fillColor('#333').text(order.description); }

  doc.moveDown();
  // Line-item table
  const x = { code: 45, loc: 110, period: 300, days: 420, amt: 470 };
  let y = doc.y + 4;
  doc.fontSize(9).fillColor('#fff');
  doc.rect(45, y - 2, 505, 18).fill('#ef4444');
  doc.fillColor('#fff')
    .text('Site', x.code, y).text('Location', x.loc, y).text('Period', x.period, y)
    .text('Days', x.days, y).text('Amount', x.amt, y, { width: 80, align: 'right' });
  y += 20;
  doc.fillColor('#333').font('Helvetica');
  for (const it of order.items) {
    const period = `${new Date(it.startDate).toLocaleDateString('en-IN')}–${new Date(it.endDate).toLocaleDateString('en-IN')}`;
    doc.font('Helvetica').fillColor('#333').fontSize(8)
      .text(it.site.code, x.code, y, { width: 60 })
      .text(it.site.location, x.loc, y, { width: 185 })
      .text(period, x.period, y, { width: 115 })
      .text(String(it.days), x.days, y, { width: 40 })
      .text(INR(it.subtotal), x.amt, y, { width: 80, align: 'right' });
    y += Math.max(16, doc.heightOfString(it.site.location, { width: 185, fontSize: 8 }));
    y = writeLineNotes(doc, it, x.loc, y);
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

  if (order.company?.termsAndConditions) {
    // PDFKit automatically wraps and page-breaks long text
    doc.moveDown(3);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('Terms & Conditions:');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor('#333').text(order.company.termsAndConditions, {
      align: 'left',
      width: 505
    });
  }

  doc.font('Helvetica').fontSize(8).fillColor('#888').text('This quotation is valid for 15 days. Prices exclusive of printing/mounting unless stated.', 45, 780, { align: 'center', width: 505 });
  doc.end();
});

module.exports = router;
