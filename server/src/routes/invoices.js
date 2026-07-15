const router = require('express').Router();
const PDFDocument = require('pdfkit');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const { nextInvoiceNo } = require('../utils/counters');
const { GST_RATE, recomputeOrderTotals } = require('../utils/pricing');
const { writeLineNotes } = require('../utils/pdf');

const INR = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN');

router.get('/', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
  const { companyId } = req.query;
  const where = {};
  if (companyId) where.companyId = Number(companyId);

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    include: {
      client: { select: { name: true, phone: true } },
      company: { select: { id: true, name: true, code: true } },
      order: { select: { orderNo: true, items: { select: { site: { select: { code: true } } } } } },
    },
  });
  res.json(invoices);
});

router.get('/:id', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      client: true,
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

router.patch('/:id/commercials', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
  const { id } = req.params;
  const { discountPct, discountRemarks, printingTotal, mountingCost, addOns } = req.body;

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
    printingTotal: Number(printingTotal) || 0,
    mountingCost: Number(mountingCost) || 0,
    discountPct: Number(discountPct) || 0
  };

  const newTotals = recomputeOrderTotals(testOrder, order.items);

  // 3. Update Order
  await prisma.order.update({
    where: { id: order.id },
    data: {
      printingTotal: testOrder.printingTotal,
      mountingCost: testOrder.mountingCost,
      discountPct: testOrder.discountPct,
      discountRemarks: discountRemarks || order.discountRemarks,
      addOnTotal,
      ...newTotals
    }
  });

  // 4. Update Invoice
  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      amount: newTotals.taxableAmount,
      cgst: newTotals.cgst,
      sgst: newTotals.sgst,
      igst: newTotals.igst,
      gstAmount: newTotals.gstAmount,
      total: newTotals.grandTotal
    }
  });

  // 5. Update Ledger Entry
  const ledger = await prisma.ledgerEntry.findFirst({
    where: { invoiceId: invoice.id, type: 'DEBIT' }
  });

  if (ledger) {
    await prisma.ledgerEntry.update({
      where: { id: ledger.id },
      data: { amount: newTotals.grandTotal }
    });
  }

  res.json(updatedInvoice);
});

// Generate a tax invoice for an order. Blocked until at least one monitoring
// photo exists on any line (proof-of-display gate) — but purely loose orders
// are 1–2 day displays with no monitoring cycle, so they invoice straight away.
router.post('/', requireRole('FINANCE'), async (req, res) => {
  const { orderId } = req.body || {};
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: { client: true, items: { include: { photos: true } } },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const hasRegularLine = order.items.some((it) => it.type === 'REGULAR');
  const photoCount = order.items.reduce((n, it) => n + it.photos.length, 0);
  if (hasRegularLine && photoCount === 0)
    return res.status(422).json({ error: 'Cannot invoice: no monitoring photo uploaded yet (proof-of-display required).' });

  const taxCategory = order.taxCategory;
  const amount = order.taxableAmount;
  const gstAmount = order.gstAmount;
  const invoiceNo = await nextInvoiceNo(taxCategory);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo, orderId: order.id, clientId: order.clientId, companyId: order.companyId, taxCategory,
      interState: order.interState, amount,
      gstRate: taxCategory === 'GST' ? GST_RATE : 0,
      cgst: order.cgst, sgst: order.sgst, igst: order.igst, gstAmount,
      total: order.grandTotal, status: 'SENT', generatedById: req.user.id,
    },
  });

  await prisma.ledgerEntry.create({
    data: { clientId: order.clientId, companyId: order.companyId, invoiceId: invoice.id, type: 'DEBIT', amount: order.grandTotal, narration: `Invoice ${invoiceNo}` },
  });

  res.status(201).json(invoice);
});

router.post('/:id/mark-paid', requireRole('FINANCE'), async (req, res) => {
  const invoice = await prisma.invoice.update({ where: { id: Number(req.params.id) }, data: { status: 'PAID' }, include: { order: true } });
  await prisma.ledgerEntry.create({
    data: { clientId: invoice.clientId, companyId: invoice.companyId, invoiceId: invoice.id, type: 'CREDIT', amount: invoice.total, narration: `Payment for ${invoice.invoiceNo}` },
  });
  res.json(invoice);
});

// Downloadable PDF tax invoice
router.get('/:id/pdf', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
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
    .text(`Date: ${new Date(invoice.issuedAt).toLocaleDateString('en-IN')}`, { align: 'right' })
    .text(`Order: ${order.orderNo}`, { align: 'right' });

  doc.moveDown(1.5);
  doc.fontSize(11).fillColor('#000').text('Bill To:', 45);
  doc.fontSize(10).fillColor('#333').text(invoice.client.name);
  if (invoice.client.company) doc.text(invoice.client.company);
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
