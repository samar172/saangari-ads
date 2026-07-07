const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

// Inventory dashboard: all sites with current/upcoming booking info
router.get('/', async (req, res) => {
  const { type, zone, status } = req.query;
  const where = { active: true };
  if (type) where.type = type;
  if (zone) where.zone = zone;
  if (status) where.status = status;

  const sites = await prisma.site.findMany({
    where,
    orderBy: { srNo: 'asc' },
    include: {
      bookings: {
        where: { status: { in: ['TENTATIVE', 'CONFIRMED', 'LIVE', 'WAITLIST'] } },
        orderBy: { startDate: 'asc' },
        include: { client: { select: { id: true, name: true, phone: true } } },
      },
    },
  });
  res.json(sites);
});

// Summary counts per category for dashboard tabs
router.get('/summary', async (req, res) => {
  const grouped = await prisma.site.groupBy({
    by: ['type', 'status'],
    where: { active: true },
    _count: { _all: true },
  });
  const summary = {};
  for (const g of grouped) {
    summary[g.type] = summary[g.type] || { total: 0 };
    summary[g.type][g.status] = g._count._all;
    summary[g.type].total += g._count._all;
  }
  res.json(summary);
});

router.get('/:id', async (req, res) => {
  const site = await prisma.site.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      bookings: {
        orderBy: { startDate: 'desc' },
        include: {
          client: { select: { id: true, name: true, phone: true } },
          photos: true,
        },
      },
    },
  });
  if (!site) return res.status(404).json({ error: 'Site not found' });
  res.json(site);
});

router.post('/', requireRole(), async (req, res) => {
  const site = await prisma.site.create({ data: req.body });
  res.status(201).json(site);
});

router.patch('/:id', requireRole('MANAGER'), async (req, res) => {
  const site = await prisma.site.update({ where: { id: Number(req.params.id) }, data: req.body });
  res.json(site);
});

module.exports = router;
