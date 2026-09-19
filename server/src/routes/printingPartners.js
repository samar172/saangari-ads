const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

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

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const partner = await prisma.printingPartner.findUnique({
    where: { id },
    include: { materials: { orderBy: { name: 'asc' } } },
  });
  if (!partner) return res.status(404).json({ error: 'Printing partner not found' });

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

  const jobs = orders.map((o) => {
    // Cancelled line-items were never printed, so they don't add to the area.
    const live = o.items.filter((it) => it.status !== 'CANCELLED');
    const totalSqft = live.reduce((s, it) => s + (it.site?.sqft || 0), 0);
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
      printCost: o.printCost || 0,
      // Margin on this job = what we charged the client − what we pay the partner.
      printMargin: Math.round((o.printingTotal || 0) - (o.printCost || 0)),
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

  res.json({ ...partner, summary, jobs, payments });
});

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
  const { name, contact, phone, email, address, ratePerSqft, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const partner = await prisma.printingPartner.create({
    data: { name, contact, phone, email, address, ratePerSqft: Number(ratePerSqft) || 0, notes },
  });
  res.status(201).json(partner);
});

router.patch('/:id', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { name, contact, phone, email, address, ratePerSqft, notes, active } = req.body || {};
  const data = {};
  for (const [k, v] of Object.entries({ name, contact, phone, email, address, notes })) if (v !== undefined) data[k] = v;
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
  const { name, rate } = req.body || {};
  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Material name is required' });
  try {
    const material = await prisma.printingMaterial.create({
      data: { partnerId, name: cleanName, rate: Number(rate) || 0 },
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
  const { name, rate, active } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (rate !== undefined) data.rate = Number(rate) || 0;
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
