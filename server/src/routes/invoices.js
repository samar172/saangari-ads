const router = require('express').Router();
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const prisma = require('../db');
const { requireRole, requirePermission } = require('../middleware/auth');
const { nextInvoiceNo } = require('../utils/counters');
const { GST_RATE, recomputeOrderTotals } = require('../utils/pricing');
const { writeLineNotes } = require('../utils/pdf');
const { logActivity } = require('../utils/activity');
const { createInvoiceForOrder, lastWorkingDayOfMonth, gstSplit } = require('../utils/invoicing');

const INR = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN');

router.get('/', requirePermission('invoices', 'view'), async (req, res) => {
  const { companyId } = req.query;
  const where = {};
  if (companyId) where.companyId = Number(companyId);

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    include: {
      client: { select: { name: true, phone: true, company: true } },
      company: { select: { id: true, name: true, code: true } },
      order: { select: { orderNo: true, items: { select: { site: { select: { code: true } } } } } },
    },
  });
  res.json(invoices);
});

router.get('/:id', requirePermission('invoices', 'view'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      // Pull the client's named contacts too, so the "Send bill" action can route
      // to whoever is flagged billsTo (falling back to the client's own phone/email).
      client: { include: { contacts: { orderBy: [{ billsTo: 'desc' }, { createdAt: 'asc' }] } } },
      company: true,
      order: {
        include: {
          items: { include: { site: true } },
          addOns: true
        }
      },
    },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
});

// Log that a bill was shared with the client over WhatsApp / email. The message
// is opened client-side (wa.me / mailto) and the person presses send; this only
// records that it happened, into the Activity feed. We never claim delivery.
router.post('/:id/share', requirePermission('invoices', 'edit'), async (req, res) => {
  const id = Number(req.params.id);
  const { channel, toName, toContact } = req.body || {};
  const ch = channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP';
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: { select: { name: true, company: true } } },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const who = invoice.client?.company?.trim() || invoice.client?.name || '';
  logActivity({
    type: 'INVOICE_SENT', user: req.user, orderId: invoice.orderId, invoiceId: invoice.id,
    summary: `Bill sent (${ch === 'EMAIL' ? 'Email' : 'WhatsApp'}) · ${invoice.invoiceNo}`,
    detail: [who, toName, toContact].filter(Boolean).join(' · '),
  });
  res.json({ ok: true });
});

router.patch('/:id/commercials', requirePermission('invoices', 'edit'), async (req, res) => {
  const { id } = req.params;
  const { discountPct, discountRemarks, printingTotal, mountingCost, addOns, dueDate, issuedAt } = req.body;

  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(id) },
    include: { order: { include: { items: true } } }
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const order = invoice.order;

  // 1. Update Order's add-ons
  await prisma.orderAddOn.deleteMany({ where: { orderId: order.id } });
  if (addOns && addOns.length > 0) {
    await prisma.orderAddOn.createMany({
      data: addOns.map(a => ({ orderId: order.id, label: a.label, amount: Number(a.amount) || 0 }))
    });
  }

  const addOnTotal = (addOns || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);

  // 2. Recompute Order Totals
  const testOrder = {
    ...order,
    addOnTotal,
    // Fall back to the order's existing values when a field is omitted, so a
    // partial PATCH (e.g. only discountPct) doesn't zero out real production charges.
    printingTotal: printingTotal !== undefined ? Number(printingTotal) || 0 : order.printingTotal,
    mountingCost: mountingCost !== undefined ? Number(mountingCost) || 0 : order.mountingCost,
    discountPct: discountPct !== undefined ? Math.min(100, Math.max(0, Number(discountPct) || 0)) : order.discountPct,
  };

  const newTotals = recomputeOrderTotals(testOrder, order.items);

  // 3. Update Order. Persist explicit columns only — recomputeOrderTotals returns
  // `mountingTotal`/`gstRate`, which are NOT columns on Order (it has mountingCost,
  // and no gstRate), so spreading the whole result would make Prisma throw.
  await prisma.order.update({
    where: { id: order.id },
    data: {
      printingTotal: testOrder.printingTotal,
      mountingCost: testOrder.mountingCost,
      discountPct: testOrder.discountPct,
      discountRemarks: discountRemarks || order.discountRemarks,
      addOnTotal,
      rentalSubtotal: newTotals.rentalSubtotal,
      discountAmount: newTotals.discountAmount,
      taxableAmount: newTotals.taxableAmount,
      cgst: newTotals.cgst, sgst: newTotals.sgst, igst: newTotals.igst,
      gstAmount: newTotals.gstAmount, grandTotal: newTotals.grandTotal,
    }
  });

  // 4. Update Invoice — honour the invoice's own tax category (which may have
  // been overridden at billing time), and allow editing the due date.
  const split = gstSplit(invoice.taxCategory, invoice.interState, newTotals.taxableAmount);
  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      amount: newTotals.taxableAmount,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
      gstAmount: split.gstAmount,
      total: split.total,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(issuedAt && !Number.isNaN(new Date(issuedAt).getTime()) ? { issuedAt: new Date(issuedAt) } : {}),
    }
  });

  // 5. Update Ledger Entry
  const ledger = await prisma.ledgerEntry.findFirst({
    where: { invoiceId: invoice.id, type: 'DEBIT' }
  });

  if (ledger) {
    await prisma.ledgerEntry.update({
      where: { id: ledger.id },
      data: { amount: split.total }
    });
  }

  res.json(updatedInvoice);
});

// Generate a tax invoice for an order. Blocked until at least one monitoring
// photo exists on any line (proof-of-display gate) — but purely loose orders
// are 1–2 day displays with no monitoring cycle, so they invoice straight away.
router.post('/', requirePermission('invoices', 'add'), async (req, res) => {
  const { orderId, force, dueDate } = req.body || {};
  try {
    const invoice = await createInvoiceForOrder({ orderId, force: !!force, dueDate, user: req.user });
    res.status(201).json(invoice);
  } catch (e) {
    const body = { error: e.message || 'Could not generate invoice' };
    if (e.canForce) body.canForce = true;
    return res.status(e.status || 500).json(body);
  }
});

router.post('/:id/mark-paid', requireRole('FINANCE'), async (req, res) => {
  const id = Number(req.params.id);
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'PAID') return res.json(invoice); // idempotent — no replayed credit

  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.update({ where: { id }, data: { status: 'PAID' } });
    // Settle the order's OUTSTANDING balance (not blindly the full invoice total)
    // so this can't double-count money already recorded via the payments route.
    // Mirrors that route: one Payment row (clears order balance) + one ledger
    // CREDIT (clears the client ledger).
    const order = await tx.order.findUnique({ where: { id: invoice.orderId }, include: { payments: { select: { amount: true } } } });
    const paid = (order?.payments || []).reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, Math.round((order?.grandTotal || 0) - paid));
    if (remaining > 0) {
      const payment = await tx.payment.create({
        data: {
          orderId: invoice.orderId, clientId: invoice.clientId, companyId: invoice.companyId,
          amount: remaining, netReceived: remaining, mode: 'BANK',
          reference: `Invoice ${invoice.invoiceNo}`, recordedById: req.user.id,
        },
      });
      await tx.ledgerEntry.create({
        data: { clientId: invoice.clientId, companyId: invoice.companyId, invoiceId: invoice.id, paymentId: payment.id, type: 'CREDIT', amount: remaining, narration: `Payment for ${invoice.invoiceNo}` },
      });
    }
    return inv;
  });
  res.json(updated);
});

// Downloadable PDF tax invoice
router.get('/:id/pdf', requirePermission('invoices', 'view'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(req.params.id) },
    include: { client: true, company: true, order: { include: { items: { include: { site: true } } } } },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const order = invoice.order;

  const doc = new PDFDocument({ margin: 45, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNo.replace(/\//g, '-')}.pdf"`);
  doc.pipe(res);

  const companyName = invoice.company?.legalName || invoice.company?.name || 'SAANGRI ADVERTISING';
  const logoPath = require('path').join(__dirname, '../assets/logo.png');
  try {
    doc.image(logoPath, 45, 45, { height: 35 });
    doc.fontSize(9).fillColor('#555').text('Outdoor Media — Bikaner, Rajasthan', 45, 85);
  } catch (e) {
    doc.fontSize(20).fillColor('#ef4444').text(companyName.toUpperCase(), 45, 45);
    doc.fontSize(9).fillColor('#555').text('Outdoor Media — Bikaner, Rajasthan');
  }
  if (invoice.company?.gstin) doc.fontSize(8).fillColor('#555').text(`GSTIN: ${invoice.company.gstin}`, 45, doc.y);
  doc.fontSize(16).fillColor('#000').text('TAX INVOICE', 0, 48, { align: 'right' });
  doc.fontSize(10).fillColor('#333')
    .text(`Invoice No: ${invoice.invoiceNo}`, { align: 'right' })
    .text(`Date: ${new Date(invoice.issuedAt).toLocaleDateString('en-IN')}`, { align: 'right' });
  if (invoice.dueDate) doc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString('en-IN')}`, { align: 'right' });
  doc.text(`Order: ${order.orderNo}`, { align: 'right' });

  doc.moveDown(1.5);
  doc.fontSize(11).fillColor('#000').text('Bill To:', 45);
  // Company name leads on the bill; the contact person follows in smaller weight.
  if (invoice.client.company) {
    doc.fontSize(10).fillColor('#333').text(invoice.client.company);
    doc.text(invoice.client.name);
  } else {
    doc.fontSize(10).fillColor('#333').text(invoice.client.name);
  }
  doc.text(`Phone: ${invoice.client.phone}`);
  if (invoice.client.gstNumber) doc.text(`GSTIN: ${invoice.client.gstNumber}`);
  doc.text(`Place of Supply: ${order.placeOfSupply || 'Rajasthan'}`);

  doc.moveDown();
  const x = { code: 45, loc: 110, period: 300, days: 420, amt: 470 };
  let y = doc.y + 4;
  doc.rect(45, y - 2, 505, 18).fill('#ef4444');
  doc.fillColor('#fff').fontSize(9)
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

  y += 8;
  const totalRow = (k, v, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor('#000')
      .text(k, 330, y, { width: 140, align: 'right' })
      .text(INR(v), x.amt, y, { width: 80, align: 'right' });
    y += bold ? 20 : 15;
  };
  if (order.printingTotal) totalRow('Printing', order.printingTotal);
  if (order.mountingCost) totalRow('Mounting', order.mountingCost);
  if (order.addOnTotal) totalRow('Add-ons', order.addOnTotal);
  if (order.discountAmount) totalRow(`Discount (${order.discountPct}%)`, -order.discountAmount);
  totalRow('Taxable Value', invoice.amount);
  if (invoice.taxCategory === 'GST') {
    if (invoice.interState) totalRow('IGST 18%', invoice.igst);
    else { totalRow('CGST 9%', invoice.cgst); totalRow('SGST 9%', invoice.sgst); }
  }
  totalRow('Grand Total', invoice.total, true);

  doc.font('Helvetica').fontSize(8).fillColor('#888').text('This is a computer-generated invoice.', 45, 790, { align: 'center', width: 505 });
  doc.end();
});

module.exports = router;
