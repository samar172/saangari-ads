const router = require('express').Router();
const PDFDocument = require('pdfkit');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const { nextInvoiceNo } = require('../utils/counters');
const { GST_RATE } = require('../utils/pricing');

const INR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

router.get('/', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
  const invoices = await prisma.invoice.findMany({
    orderBy: { issuedAt: 'desc' },
    include: {
      client: { select: { name: true, phone: true } },
      booking: { select: { bookingNo: true, site: { select: { code: true, location: true } } } },
    },
  });
  res.json(invoices);
});

// Generate an invoice for a booking. Blocked until an Ops photo exists (proof-of-display gate).
router.post('/', requireRole('FINANCE'), async (req, res) => {
  const { bookingId } = req.body || {};
  const booking = await prisma.booking.findUnique({
    where: { id: Number(bookingId) },
    include: { client: true, photos: true, site: true },
  });
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.photos.length === 0)
    return res.status(422).json({ error: 'Cannot invoice: no monitoring photo uploaded yet (proof-of-display required).' });

  const taxCategory = booking.gstApplicable ? 'GST' : booking.client.taxCategory;
  const amount = booking.subtotal - Math.round(booking.subtotal * booking.discountPct / 100);
  const gstAmount = taxCategory === 'GST' ? Math.round(amount * GST_RATE / 100) : 0;
  const total = amount + gstAmount;
  const invoiceNo = await nextInvoiceNo(taxCategory);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo, bookingId: booking.id, clientId: booking.clientId, taxCategory,
      amount, gstRate: taxCategory === 'GST' ? GST_RATE : 0, gstAmount, total,
      status: 'SENT', generatedById: req.user.id,
    },
  });

  // Debit the client's ledger by the invoice total
  await prisma.ledgerEntry.create({
    data: { clientId: booking.clientId, invoiceId: invoice.id, type: 'DEBIT', amount: total, narration: `Invoice ${invoiceNo}` },
  });

  res.status(201).json(invoice);
});

router.post('/:id/mark-paid', requireRole('FINANCE'), async (req, res) => {
  const invoice = await prisma.invoice.update({ where: { id: Number(req.params.id) }, data: { status: 'PAID' } });
  await prisma.ledgerEntry.create({
    data: { clientId: invoice.clientId, invoiceId: invoice.id, type: 'CREDIT', amount: invoice.total, narration: `Payment for ${invoice.invoiceNo}` },
  });
  res.json(invoice);
});

// Downloadable PDF invoice
router.get('/:id/pdf', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(req.params.id) },
    include: { client: true, booking: { include: { site: true } } },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNo.replace(/\//g, '-')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).fillColor('#1e3a8a').text('SAANGRI ADVERTISING', { align: 'left' });
  doc.fontSize(9).fillColor('#555').text('Outdoor Media — Bikaner, Rajasthan');
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor('#000').text('TAX INVOICE', { align: 'right' });
  doc.fontSize(10).fillColor('#333')
    .text(`Invoice No: ${invoice.invoiceNo}`, { align: 'right' })
    .text(`Date: ${new Date(invoice.issuedAt).toLocaleDateString('en-IN')}`, { align: 'right' })
    .text(`Type: ${invoice.taxCategory}`, { align: 'right' });

  doc.moveDown();
  doc.fontSize(11).fillColor('#000').text('Bill To:');
  doc.fontSize(10).fillColor('#333')
    .text(invoice.client.name)
    .text(invoice.client.company || '')
    .text(`Phone: ${invoice.client.phone}`);
  if (invoice.client.gstNumber) doc.text(`GSTIN: ${invoice.client.gstNumber}`);

  doc.moveDown();
  const b = invoice.booking;
  doc.fontSize(10).fillColor('#000')
    .text(`Site: ${b.site.code} — ${b.site.location}`)
    .text(`Type: ${b.site.type} (${b.site.width}x${b.site.height} ft)`)
    .text(`Period: ${new Date(b.startDate).toLocaleDateString('en-IN')} to ${new Date(b.endDate).toLocaleDateString('en-IN')} (${b.days} days)`)
    .text(`Day Rate: ${INR(b.dayRate)}`);

  doc.moveDown();
  const y = doc.y;
  doc.fontSize(10).fillColor('#000');
  const rows = [
    ['Subtotal', INR(invoice.amount)],
    ...(invoice.gstAmount ? [[`GST @ ${invoice.gstRate}%`, INR(invoice.gstAmount)]] : []),
    ['Total', INR(invoice.total)],
  ];
  let ry = y;
  rows.forEach(([k, v], i) => {
    const bold = i === rows.length - 1;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(k, 350, ry).text(v, 460, ry, { align: 'right', width: 90 });
    ry += 18;
  });
  doc.font('Helvetica').fontSize(8).fillColor('#888').text('This is a computer-generated invoice.', 50, 760, { align: 'center' });
  doc.end();
});

module.exports = router;
