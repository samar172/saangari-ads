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
