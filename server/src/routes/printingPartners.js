const router = require('express').Router();
const PDFDocument = require('pdfkit');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const INR = (n) => 'Rs ' + Math.round(Number(n || 0)).toLocaleString('en-IN');

router.get('/', async (req, res) => {
  const partners = await prisma.printingPartner.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { orders: true } },
      materials: { orderBy: { name: 'asc' } },
    },
  });
  res.json(partners);
});

// Print job history for one partner: every order routed to them, with the print
// count, rate and the sqft of the sites that were printed for.
// Quotations and cancelled orders are returned but kept out of the totals —
// nothing was actually printed for those.
const COUNTED = ['CONFIRMED', 'LIVE', 'COMPLETED'];

// Load a partner and compute their whole account: print jobs (with cost derived
// from the locked material rates), payments, the P&L summary and the running
// ledger. Shared by the JSON detail, the PDF statement and the share route.
async function loadPartnerAccount(id) {
  const partner = await prisma.printingPartner.findUnique({
    where: { id },
    include: { materials: { orderBy: { name: 'asc' } } },
  });
  if (!partner) return null;

  const orders = await prisma.order.findMany({
    where: { printingPartnerId: id },
    orderBy: { bookingDate: 'desc' },
    include: {
      client: { select: { id: true, name: true } },
      company: { select: { name: true } },
      items: {
        select: {
          id: true, status: true, startDate: true, endDate: true,
          site: { select: { code: true, location: true, sqft: true, width: true, height: true } },
        },
      },
    },
  });

  // Payments we've made to this partner (settling what we owe for their jobs).
  const payments = await prisma.partnerPayment.findMany({
    where: { partnerId: id },
    orderBy: { paidAt: 'desc' },
    include: { recordedBy: { select: { name: true } } },
  });

  // Each material carries its own cost-per-sqft (what the partner charges US for
  // that material): White Base ₹5.5/sqft, Black Base ₹7.5/sqft. `rate` on the
  // material is the CUSTOMER charge and is not a cost.
  const materialByName = Object.fromEntries(partner.materials.map((m) => [m.name, m]));

  const jobs = orders.map((o) => {
    // Cancelled line-items were never printed, so they don't add to the area.
    const live = o.items.filter((it) => it.status !== 'CANCELLED');
    const totalSqft = Math.round(live.reduce((s, it) => s + (it.site?.sqft || 0), 0) * 100) / 100;
    const mat = o.printMaterial ? materialByName[o.printMaterial] : null;
    const materialRate = mat?.rate || 0;            // customer charge (for reference)
    const materialCostPerSqft = mat?.costPerSqft || 0; // partner cost per sqft

    // Partner cost basis, in priority order:
    //  1. explicit printCost entered on the order (a manual override wins);
    //  2. area × THIS MATERIAL's ₹/sqft — the normal basis (Black 7.5, White 5.5);
    //  3. area × the partner-wide ₹/sqft, when the material has no per-sqft cost;
    //  4. otherwise unknown (0) until a cost is set.
    const bySqftMaterial = Math.round(totalSqft * materialCostPerSqft);
    const bySqftPartner = Math.round(totalSqft * (partner.ratePerSqft || 0));
    let effectiveCost, costSource, costNote;
    if (o.printCost > 0) { effectiveCost = Math.round(o.printCost); costSource = 'entered'; costNote = 'entered'; }
    else if (bySqftMaterial > 0) { effectiveCost = bySqftMaterial; costSource = 'material_sqft'; costNote = `${totalSqft} sqft × ₹${materialCostPerSqft}${mat ? ` (${mat.name})` : ''}`; }
    else if (bySqftPartner > 0) { effectiveCost = bySqftPartner; costSource = 'sqft'; costNote = `${totalSqft} sqft × ₹${partner.ratePerSqft}`; }
    else { effectiveCost = 0; costSource = 'none'; costNote = ''; }

    return {
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      bookingDate: o.bookingDate,
      client: o.client,
      company: o.company?.name || null,
      description: o.description,
      noOfPrints: o.noOfPrints,
      printRate: o.printRate,
      printingTotal: o.printingTotal,
      printMaterial: o.printMaterial || null,
      materialRate,
      materialCostPerSqft,
      printCost: effectiveCost,
      costEntered: o.printCost || 0,
      costSource,
      costNote,
      // Margin on this job = what we charged the client − what we pay the partner.
      printMargin: Math.round((o.printingTotal || 0) - effectiveCost),
      mountingCost: o.mountingCost,
      totalSqft: Math.round(totalSqft * 100) / 100,
      sites: live.map((it) => ({
        code: it.site?.code,
        location: it.site?.location,
        sqft: it.site?.sqft || 0,
        size: it.site?.width && it.site?.height ? `${it.site.width}×${it.site.height}` : null,
        startDate: it.startDate,
        endDate: it.endDate,
      })),
    };
  });

  const counted = jobs.filter((j) => COUNTED.includes(j.status));
  const totalPrintingValue = Math.round(counted.reduce((s, j) => s + (j.printingTotal || 0), 0));
  const totalPrintCost = Math.round(counted.reduce((s, j) => s + (j.printCost || 0), 0));
  const totalPaid = Math.round(payments.reduce((s, p) => s + (p.amount || 0), 0));
  const summary = {
    totalOrders: jobs.length,
    countedOrders: counted.length,
    totalPrints: counted.reduce((s, j) => s + (j.noOfPrints || 0), 0),
    // Revenue we billed the client for printing.
    totalPrintingValue,
    // Cost owed to the partner for those same jobs, and the resulting margin.
    totalPrintCost,
    printingMargin: totalPrintingValue - totalPrintCost,
    // Partner payable: what we owe (job cost) minus what we've already paid them.
    totalPaid,
    balanceOwed: totalPrintCost - totalPaid,
    totalSqft: Math.round(counted.reduce((s, j) => s + j.totalSqft, 0) * 100) / 100,
    totalSites: counted.reduce((s, j) => s + j.sites.length, 0),
  };
  summary.avgRatePerPrint = summary.totalPrints
    ? Math.round(summary.totalPrintingValue / summary.totalPrints)
    : 0;

  return { ...partner, summary, jobs, payments, ledger: buildLedger(counted, payments) };
}

router.get('/:id', async (req, res) => {
  const acc = await loadPartnerAccount(Number(req.params.id));
  if (!acc) return res.status(404).json({ error: 'Printing partner not found' });
  res.json(acc);
});

// Statement of account PDF for the partner — the ledger (jobs as debits, payments
// as credits, running balance) they can be sent to reconcile what we owe.
router.get('/:id/statement/pdf', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
  const acc = await loadPartnerAccount(Number(req.params.id));
  if (!acc) return res.status(404).json({ error: 'Printing partner not found' });

  const doc = new PDFDocument({ margin: 45, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Statement-${acc.name.replace(/[^A-Za-z0-9]+/g, '_')}.pdf"`);
  doc.pipe(res);

  const logoPath = require('path').join(__dirname, '../assets/logo.png');
  try { doc.image(logoPath, 45, 45, { height: 35 }); doc.fontSize(9).fillColor('#555').text('Outdoor Media — Bikaner, Rajasthan', 45, 85); }
  catch (e) { doc.fontSize(20).fillColor('#ef4444').text('SAANGRI ADVERTISING', 45, 45); }

  doc.fontSize(16).fillColor('#000').text('STATEMENT OF ACCOUNT', 0, 48, { align: 'right' });
  doc.fontSize(10).fillColor('#333').text(`As on ${new Date().toLocaleDateString('en-IN')}`, { align: 'right' });

  doc.moveDown(1.8);
  doc.fontSize(11).fillColor('#000').text('Printing Partner:', 45);
  doc.fontSize(10).fillColor('#333').text(acc.name);
  if (acc.contact) doc.text(acc.contact);
  if (acc.phone) doc.text(`Phone: ${acc.phone}`);
  if (acc.email) doc.text(`Email: ${acc.email}`);

  // Ledger table header
  doc.moveDown();
  const x = { date: 45, part: 120, debit: 340, credit: 420, bal: 490 };
  let y = doc.y + 4;
  doc.rect(45, y - 2, 505, 18).fill('#ef4444');
  doc.fillColor('#fff').fontSize(9)
    .text('Date', x.date, y).text('Particulars', x.part, y)
    .text('Debit', x.debit, y, { width: 70, align: 'right' })
    .text('Credit', x.credit, y, { width: 60, align: 'right' })
    .text('Balance', x.bal, y, { width: 60, align: 'right' });
  y += 20;
  doc.font('Helvetica').fillColor('#333');
  for (const r of acc.ledger) {
    doc.fontSize(8).fillColor('#333')
      .text(new Date(r.date).toLocaleDateString('en-IN'), x.date, y, { width: 70 })
      .text(r.particulars, x.part, y, { width: 215 })
      .text(r.debit ? INR(r.debit) : '', x.debit, y, { width: 70, align: 'right' })
      .text(r.credit ? INR(r.credit) : '', x.credit, y, { width: 60, align: 'right' })
      .text(INR(r.balance), x.bal, y, { width: 60, align: 'right' });
    y += Math.max(15, doc.heightOfString(r.particulars, { width: 215, fontSize: 8 }));
    if (y > 730) { doc.addPage(); y = 60; }
  }

  y += 6;
  doc.moveTo(45, y).lineTo(550, y).strokeColor('#ddd').stroke();
  y += 8;
  const s = acc.summary;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
    .text(`Total billed: ${INR(s.totalPrintCost)}   Paid: ${INR(s.totalPaid)}`, 45, y);
  doc.fontSize(12).fillColor(s.balanceOwed > 0 ? '#b91c1c' : '#15803d')
    .text(`Balance payable: ${INR(s.balanceOwed)}`, 45, y + 16);

  doc.font('Helvetica').fontSize(8).fillColor('#888')
    .text('This is a computer-generated statement of amounts payable by Saangri Advertising to the printing partner.', 45, 770, { width: 505, align: 'center' });
  doc.end();
});

// Log that a statement was shared with the partner over WhatsApp / email. The
// message is opened client-side; this only records that it happened.
router.post('/:id/statement/share', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  const { channel, toContact } = req.body || {};
  const ch = channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP';
  const partner = await prisma.printingPartner.findUnique({ where: { id }, select: { name: true } });
  if (!partner) return res.status(404).json({ error: 'Printing partner not found' });
  logActivity({
    type: 'PARTNER_STATEMENT_SENT', user: req.user,
    summary: `Statement sent (${ch === 'EMAIL' ? 'Email' : 'WhatsApp'}) · ${partner.name}`,
    detail: toContact || '',
  });
  res.json({ ok: true });
});

// Account-based statement: each printed job is a DEBIT (cost we owe the partner),
// each payment a CREDIT, in date order, with a running balance. The closing
// balance is what's still outstanding. Shared by the JSON detail and the PDF.
function buildLedger(countedJobs, payments) {
  const rows = [];
  for (const j of countedJobs) {
    if (!(j.printCost > 0)) continue;
    rows.push({
      date: j.bookingDate,
      type: 'DEBIT',
      ref: j.orderNo,
      particulars: `Printing — ${j.orderNo}${j.costNote && j.costSource !== 'entered' ? ` (${j.costNote})` : ''}`,
      debit: j.printCost,
      credit: 0,
    });
  }
  for (const p of payments) {
    rows.push({
      date: p.paidAt,
      type: 'CREDIT',
      ref: p.reference || '',
      particulars: `Payment received — ${p.mode}${p.reference ? ` · ${p.reference}` : ''}`,
      debit: 0,
      credit: Math.round(p.amount || 0),
    });
  }
  rows.sort((a, b) => new Date(a.date) - new Date(b.date) || (a.type === 'DEBIT' ? -1 : 1));
  let balance = 0;
  return rows.map((r) => { balance += r.debit - r.credit; return { ...r, balance }; });
}

// Record a payment WE make to this partner (settles part of the payable). Manager
// / Finance only, mirroring who can record client payments.
router.post('/:id/payments', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const partnerId = Number(req.params.id);
  if (!Number.isInteger(partnerId)) return res.status(400).json({ error: 'Invalid partner id' });
  const { amount, mode = 'BANK', reference, notes, paidAt } = req.body || {};
  const amt = Math.round(Number(amount) || 0);
  if (!(amt > 0)) return res.status(400).json({ error: 'Amount must be greater than zero' });

  const partner = await prisma.printingPartner.findUnique({ where: { id: partnerId } });
  if (!partner) return res.status(404).json({ error: 'Printing partner not found' });

  let when;
  if (paidAt) { const d = new Date(paidAt); if (!Number.isNaN(d.getTime())) when = d; }

  const payment = await prisma.partnerPayment.create({
    data: {
      partnerId, amount: amt, mode, reference: reference || null, notes: notes || null,
      recordedById: req.user.id, ...(when ? { paidAt: when } : {}),
    },
  });
  logActivity({
    type: 'PARTNER_PAYMENT', user: req.user,
    summary: `Paid printing partner · ${partner.name}`,
    detail: `₹${amt.toLocaleString('en-IN')} via ${mode}`,
  });
  res.status(201).json(payment);
});

// Edit / delete a partner payment (Manager / Finance) — a mistyped amount or a
// payment logged against the wrong partner.
router.patch('/payments/:pid', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const pid = Number(req.params.pid);
  if (!Number.isInteger(pid)) return res.status(400).json({ error: 'Invalid payment id' });
  const { amount, mode, reference, notes, paidAt } = req.body || {};
  const data = {};
  if (amount !== undefined) { const a = Math.round(Number(amount) || 0); if (!(a > 0)) return res.status(400).json({ error: 'Amount must be greater than zero' }); data.amount = a; }
  if (mode !== undefined) data.mode = mode;
  if (reference !== undefined) data.reference = reference || null;
  if (notes !== undefined) data.notes = notes || null;
  if (paidAt !== undefined) { const d = new Date(paidAt); if (!Number.isNaN(d.getTime())) data.paidAt = d; }
  const payment = await prisma.partnerPayment.update({ where: { id: pid }, data });
  res.json(payment);
});

router.delete('/payments/:pid', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const pid = Number(req.params.pid);
  if (!Number.isInteger(pid)) return res.status(400).json({ error: 'Invalid payment id' });
  await prisma.partnerPayment.delete({ where: { id: pid } });
  res.json({ ok: true });
});

router.post('/', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { name, contact, phone, email, address, gstin, machines, ratePerSqft, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const partner = await prisma.printingPartner.create({
    data: { name, contact, phone, email, address, gstin, machines, ratePerSqft: Number(ratePerSqft) || 0, notes },
  });
  res.status(201).json(partner);
});

router.patch('/:id', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { name, contact, phone, email, address, gstin, machines, ratePerSqft, notes, active } = req.body || {};
  const data = {};
  for (const [k, v] of Object.entries({ name, contact, phone, email, address, gstin, machines, notes })) if (v !== undefined) data[k] = v;
  if (ratePerSqft !== undefined) data.ratePerSqft = Number(ratePerSqft) || 0;
  if (active !== undefined) data.active = !!active;
  const partner = await prisma.printingPartner.update({ where: { id: Number(req.params.id) }, data });
  res.json(partner);
});

// ── Materials offered by a partner (flex, pamphlet, brochure, white back…) ──
// Each carries its own rate; the booking form's material dropdown pulls it.
router.post('/:id/materials', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const partnerId = Number(req.params.id);
  if (!Number.isInteger(partnerId)) return res.status(400).json({ error: 'Invalid partner id' });
  const { name, rate, costPerSqft } = req.body || {};
  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Material name is required' });
  try {
    const material = await prisma.printingMaterial.create({
      data: { partnerId, name: cleanName, rate: Number(rate) || 0, costPerSqft: Number(costPerSqft) || 0 },
    });
    res.status(201).json(material);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'That material already exists for this partner' });
    throw e;
  }
});

router.patch('/materials/:mid', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const mid = Number(req.params.mid);
  if (!Number.isInteger(mid)) return res.status(400).json({ error: 'Invalid material id' });
  const { name, rate, costPerSqft, active } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (rate !== undefined) data.rate = Number(rate) || 0;
  if (costPerSqft !== undefined) data.costPerSqft = Number(costPerSqft) || 0;
  if (active !== undefined) data.active = !!active;
  const material = await prisma.printingMaterial.update({ where: { id: mid }, data });
  res.json(material);
});

router.delete('/materials/:mid', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const mid = Number(req.params.mid);
  if (!Number.isInteger(mid)) return res.status(400).json({ error: 'Invalid material id' });
  await prisma.printingMaterial.delete({ where: { id: mid } });
  res.json({ ok: true });
});

module.exports = router;
