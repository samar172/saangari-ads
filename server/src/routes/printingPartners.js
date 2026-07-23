const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

router.get('/', async (req, res) => {
  const partners = await prisma.printingPartner.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { orders: true } } },
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
  const partner = await prisma.printingPartner.findUnique({ where: { id } });
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
  const summary = {
    totalOrders: jobs.length,
    countedOrders: counted.length,
    totalPrints: counted.reduce((s, j) => s + (j.noOfPrints || 0), 0),
    totalPrintingValue: Math.round(counted.reduce((s, j) => s + (j.printingTotal || 0), 0)),
    totalSqft: Math.round(counted.reduce((s, j) => s + j.totalSqft, 0) * 100) / 100,
    totalSites: counted.reduce((s, j) => s + j.sites.length, 0),
  };
  summary.avgRatePerPrint = summary.totalPrints
    ? Math.round(summary.totalPrintingValue / summary.totalPrints)
    : 0;

  res.json({ ...partner, summary, jobs });
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

module.exports = router;
