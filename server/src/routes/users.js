const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

router.get('/', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, phone: true, role: true, active: true, createdAt: true },
    orderBy: { id: 'asc' },
  });
  res.json(users);
});

router.post('/', requireRole(), async (req, res) => {
  const { name, email, phone, password, role } = req.body || {};
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'name, email, password, role required' });
  try {
    const user = await prisma.user.create({
      data: { name, email: email.toLowerCase().trim(), phone, role, password: await bcrypt.hash(password, 10) },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    res.status(201).json(user);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

router.patch('/:id', requireRole(), async (req, res) => {
  const { name, phone, role, active, password } = req.body || {};
  const data = { name, phone, role, active };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  if (password) data.password = await bcrypt.hash(password, 10);
  const user = await prisma.user.update({
    where: { id: Number(req.params.id) },
    data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  res.json(user);
});

module.exports = router;
