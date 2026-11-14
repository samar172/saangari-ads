const router = require('express').Router();
const prisma = require('../db');
const { requirePermission } = require('../middleware/auth');
const { nextQuoteNo } = require('../utils/counters');
const { docxToPdf } = require('../utils/docxToPdf');
const { buildQuotationDocx } = require('../utils/quotationDocx');
const { logActivity } = require('../utils/activity');

// Price quotations: the Word letter on the Saangari letterhead, saved so the
// team can find, re-download and convert them. A quotation holds no sites —
// inventory is untouched until it is converted into a booking.

const STATUSES = ['OPEN', 'CONVERTED', 'LOST'];
const include = {
  client: { select: { id: true, name: true, company: true, phone: true } },
  company: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
};

// Lines as sent by the form → a clean list. rate = per site per month,
// pm = printing + mounting per site.
function cleanLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((l) => ({
      siteId: Number(l.siteId) || null,
      code: l.code ? String(l.code) : null,
      name: String(l.name || '').trim(),
      type: l.type ? String(l.type) : null,
      months: Math.max(1, Math.round(Number(l.months) || 1)),
      rate: Math.max(0, Math.round(Number(l.rate) || 0)),
      pm: Math.max(0, Math.round(Number(l.pm) || 0)),
    }))
    .filter((l) => l.name);
}

// Value of a quotation: rent for the quoted months + printing & mounting.
const valueOf = (lines) => (lines || []).reduce((s, l) => s + l.rate * l.months + (l.pm || 0), 0);
const withValue = (q) => ({ ...q, value: valueOf(q.lines) });

function cleanBody(body) {
  const data = {};
  for (const f of ['clientName', 'clientCompany', 'address', 'contact', 'notes']) {
    if (body[f] !== undefined) data[f] = body[f] ? String(body[f]).trim() : null;
  }
  if (body.clientId !== undefined) data.clientId = Number(body.clientId) || null;
  if (body.quoteDate) data.quoteDate = new Date(body.quoteDate);
  if (body.paymentTerms !== undefined) data.paymentTerms = body.paymentTerms === 'POSTPAID' ? 'POSTPAID' : 'ADVANCE';
  if (body.lines !== undefined) data.lines = cleanLines(body.lines);
  return data;
}

router.get('/', requirePermission('campaigns', 'view'), async (req, res) => {
  const { companyId, status } = req.query;
  const where = {};
  if (companyId) where.companyId = Number(companyId);
  if (status && STATUSES.includes(status)) where.status = status;
  const list = await prisma.quotation.findMany({ where, include, orderBy: { id: 'desc' } });
  res.json(list.map(withValue));
});

router.get('/:id', requirePermission('campaigns', 'view'), async (req, res) => {
  const q = await prisma.quotation.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!q) return res.status(404).json({ error: 'Quotation not found' });
  res.json(withValue(q));
});

router.post('/', requirePermission('campaigns', 'add'), async (req, res) => {
  const body = req.body || {};
  const data = cleanBody(body);
  if (!body.companyId) return res.status(400).json({ error: 'Business is required' });
  if (!data.clientName) return res.status(400).json({ error: 'Addressee name is required' });
  if (!data.lines?.length) return res.status(400).json({ error: 'Add at least one site or line' });
  const q = await prisma.quotation.create({
    data: { ...data, companyId: Number(body.companyId), quoteNo: await nextQuoteNo(data.quoteDate || new Date()), createdById: req.user.id },
    include,
  });
  logActivity({ type: 'QUOTATION', user: req.user, summary: `Quotation ${q.quoteNo}`, detail: `${q.clientCompany || q.clientName} · ${q.lines.length} line(s) · ₹${valueOf(q.lines).toLocaleString('en-IN')}` });
  res.status(201).json(withValue(q));
});

router.put('/:id', requirePermission('campaigns', 'edit'), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.quotation.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Quotation not found' });
  if (existing.status === 'CONVERTED') return res.status(409).json({ error: `${existing.quoteNo} is already converted into a booking.` });
  const data = cleanBody(req.body || {});
  if (data.lines && !data.lines.length) return res.status(400).json({ error: 'Add at least one site or line' });
  const q = await prisma.quotation.update({ where: { id }, data, include });
  res.json(withValue(q));
});

// Mark lost / reopen, or record the booking it was converted into.
router.post('/:id/status', requirePermission('campaigns', 'edit'), async (req, res) => {
  const id = Number(req.params.id);
  const { status, orderId } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const existing = await prisma.quotation.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Quotation not found' });
  if (status === 'CONVERTED' && !orderId) return res.status(400).json({ error: 'orderId is required' });
  const q = await prisma.quotation.update({
    where: { id },
    data: { status, orderId: status === 'CONVERTED' ? Number(orderId) : existing.orderId },
    include,
  });
  res.json(withValue(q));
});

// The Word letter. Lines become quotation rows priced per month for their
// months; printing & mounting per site feeds the Terms.
async function letterFor(id) {
  const q = await prisma.quotation.findUnique({ where: { id }, include: { company: true } });
  if (!q) return null;
  const sites = await prisma.site.findMany({ where: { id: { in: q.lines.map((l) => l.siteId).filter(Boolean) } }, select: { id: true, type: true } });
  const typeOf = Object.fromEntries(sites.map((s) => [s.id, s.type]));
  const order = {
    orderNo: q.quoteNo,
    bookingDate: q.quoteDate,
    client: { name: q.clientName, company: q.clientCompany, address: q.address },
    taxCategory: q.company.gstHidden ? 'NON_GST' : 'GST',
    paymentTerms: q.paymentTerms,
    company: q.company,
    chargesPerSite: true,
    items: q.lines.map((l) => ({
      status: 'CONFIRMED', type: 'REGULAR', days: l.months * 30, subtotal: l.rate * l.months,
      printCharge: l.pm || 0, mountCharge: 0,
      site: { location: l.name, billName: l.name, code: l.code, type: typeOf[l.siteId] || l.type || 'SITE' },
    })),
  };
  const mediaLabels = Object.fromEntries((await prisma.mediaType.findMany()).map((m) => [m.code, m.label]));
  const { buffer } = await buildQuotationDocx(order, { mediaLabels, ref: q.quoteNo });
  const safe = `${q.quoteNo}-${q.clientCompany || q.clientName}`.replace(/[^\w.-]+/g, '_');
  return { buffer, safe };
}

router.get('/:id/docx', requirePermission('campaigns', 'view'), async (req, res) => {
  const l = await letterFor(Number(req.params.id));
  if (!l) return res.status(404).json({ error: 'Quotation not found' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="Quotation-${l.safe}.docx"`);
  res.end(l.buffer);
});

// The same letter as a PDF (converted from the Word file, so it looks identical).
router.get('/:id/pdf', requirePermission('campaigns', 'view'), async (req, res) => {
  const l = await letterFor(Number(req.params.id));
  if (!l) return res.status(404).json({ error: 'Quotation not found' });
  let pdf;
  try { pdf = await docxToPdf(l.buffer); } catch (e) {
    console.error('[quotation pdf]', e.message);
    return res.status(503).json({ error: 'PDF conversion is unavailable right now — download the Word file instead.' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Quotation-${l.safe}.pdf"`);
  res.end(pdf);
});

module.exports = router;
