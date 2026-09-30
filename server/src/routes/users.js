const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

router.get('/', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, phone: true, role: true, active: true, createdAt: true, pin: true },
    orderBy: { id: 'asc' },
  });
  // Expose only whether a login PIN is set, never the hash.
  res.json(users.map(({ pin, ...u }) => ({ ...u, hasPin: !!pin })));
});

router.post('/', requireRole(), async (req, res) => {
  const { name, email, phone, password, role, pin } = req.body || {};
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'name, email, password, role required' });
  // A login PIN must be exactly 4 digits, and needs a phone to log in with.
  if (pin && !/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be 4 digits' });
  if (pin && !phone) return res.status(400).json({ error: 'A phone number is required to set a login PIN' });
  try {
    const user = await prisma.user.create({
      data: {
        name, email: email.toLowerCase().trim(), phone, role,
        password: await bcrypt.hash(password, 10),
        ...(pin ? { pin: await bcrypt.hash(String(pin), 10) } : {}),
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    res.status(201).json(user);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

router.patch('/:id', requireRole(), async (req, res) => {
  const { name, phone, role, active, password, confirmPassword, pin } = req.body || {};
  // pin: a 4-digit string sets/changes it; empty string '' clears it; undefined leaves it.
  if (pin !== undefined && pin !== '' && !/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be 4 digits' });
  // Enabling/disabling a user's access requires the acting admin to re-enter
  // their own password — a deliberate second step for a sensitive change.
  if (active !== undefined) {
    if (!confirmPassword) return res.status(400).json({ error: 'Enter your password to change this user\'s access.' });
    const me = await prisma.user.findUnique({ where: { id: req.user.id } });
    const ok = me && await bcrypt.compare(confirmPassword, me.password);
    if (!ok) return res.status(403).json({ error: 'Incorrect password.' });
  }
  const data = { name, phone, role, active };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  if (password) data.password = await bcrypt.hash(password, 10);
  if (pin !== undefined) data.pin = pin === '' ? null : await bcrypt.hash(String(pin), 10);
  const user = await prisma.user.update({
    where: { id: Number(req.params.id) },
    data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  res.json(user);
});

module.exports = router;
