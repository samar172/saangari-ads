const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');

// Login with EITHER email+password OR phone+4-digit PIN. The PIN path is a
// convenience for field staff; the Super-Admin sets/edits PINs from Users.
router.post('/login', async (req, res) => {
  const { email, password, phone, pin } = req.body || {};
  let user;

  if (phone && pin) {
    const digits = String(phone).replace(/\D/g, '');
    // Match on the phone as stored, tolerating a leading +91/0.
    user = await prisma.user.findFirst({
      where: { OR: [{ phone: String(phone).trim() }, { phone: digits }, { phone: digits.slice(-10) }] },
    });
    if (!user || !user.active || !user.pin) return res.status(401).json({ error: 'Invalid phone or PIN' });
    const ok = await bcrypt.compare(String(pin), user.pin);
    if (!ok) return res.status(401).json({ error: 'Invalid phone or PIN' });
  } else if (email && password) {
    user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  } else {
    return res.status(400).json({ error: 'Provide email + password, or phone + PIN' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
