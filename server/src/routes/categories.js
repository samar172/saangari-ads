const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

// Booking categories the client maintains themselves (institute, hospital, …).
// The booking form only ever shows active ones; the admin page asks for all.
router.get('/', async (req, res) => {
  const where = req.query.all === 'true' ? {} : { active: true };
  const categories = await prisma.category.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { orders: true, clients: true } } },
  });
  res.json(categories);
});

router.post('/', requireRole('MANAGER'), async (req, res) => {
  const { name, sortOrder } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' });
  try {
    const category = await prisma.category.create({
      data: { name: name.trim(), sortOrder: Number(sortOrder) || 0 },
    });
    res.status(201).json(category);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'That category already exists' });
    throw e;
  }
});

router.patch('/:id', requireRole('MANAGER'), async (req, res) => {
  const { name, sortOrder, active } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;
  if (active !== undefined) data.active = !!active;
  try {
    const category = await prisma.category.update({ where: { id: Number(req.params.id) }, data });
    res.json(category);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'That category already exists' });
    throw e;
  }
});

// Hard-delete only if nothing references it; otherwise deactivate so historical
// orders — and the clients filed under it — keep their category.
router.delete('/:id', requireRole('MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  const [orders, clients] = await Promise.all([
    prisma.order.count({ where: { categoryId: id } }),
    prisma.client.count({ where: { categoryId: id } }),
  ]);
  const used = orders + clients;
  if (used > 0) {
    const category = await prisma.category.update({ where: { id }, data: { active: false } });
    return res.json({ ...category, deactivated: true, usedBy: used, orders, clients });
  }
  await prisma.category.delete({ where: { id } });
  res.json({ ok: true, deleted: true });
});

module.exports = router;
