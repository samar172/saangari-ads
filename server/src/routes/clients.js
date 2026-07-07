const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

router.get('/', async (req, res) => {
  const { q } = req.query;
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { company: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};
  const clients = await prisma.client.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { orders: true } } },
  });
  res.json(clients);
});

router.get('/:id', async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        include: { items: { include: { site: { select: { code: true, location: true, type: true } } } }, invoices: true, payments: true },
      },
      ledger: { orderBy: { date: 'desc' }, include: { invoice: { select: { invoiceNo: true } } } },
    },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const debit = client.ledger.filter((l) => l.type === 'DEBIT').reduce((s, l) => s + l.amount, 0);
  const credit = client.ledger.filter((l) => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0);
  res.json({ ...client, balance: debit - credit });
});

router.post('/', async (req, res) => {
  const { name, phone, email, company, gstNumber, taxCategory, address } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
  try {
    const client = await prisma.client.create({
      data: { name, phone: String(phone).trim(), email, company, gstNumber, taxCategory: taxCategory || 'NON_GST', address },
    });
    res.status(201).json(client);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A client with this phone number already exists' });
    throw e;
  }
});

router.patch('/:id', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { name, phone, email, company, gstNumber, taxCategory, address } = req.body || {};
  const data = { name, phone, email, company, gstNumber, taxCategory, address };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  const client = await prisma.client.update({ where: { id: Number(req.params.id) }, data });
  res.json(client);
});

// Record a payment (credit) against a client's ledger
router.post('/:id/payments', requireRole('FINANCE'), async (req, res) => {
  const { amount, narration } = req.body || {};
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Positive amount required' });
  const entry = await prisma.ledgerEntry.create({
    data: {
      clientId: Number(req.params.id),
      type: 'CREDIT',
      amount: Number(amount),
      narration: narration || 'Payment received',
    },
  });
  res.status(201).json(entry);
});

module.exports = router;
