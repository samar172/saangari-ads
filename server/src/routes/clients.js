const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

router.get('/', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
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
    include: { category: true, _count: { select: { orders: true } } },
  });
  res.json(clients);
});

router.get('/:id', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      category: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        include: { items: { include: { site: { select: { code: true, location: true, type: true } } } }, invoices: true, payments: true },
      },
      ledger: { orderBy: { date: 'desc' }, include: { invoice: { select: { invoiceNo: true } } } },
      contacts: { orderBy: [{ billsTo: 'desc' }, { createdAt: 'asc' }] },
    },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const debit = client.ledger.filter((l) => l.type === 'DEBIT').reduce((s, l) => s + l.amount, 0);
  const credit = client.ledger.filter((l) => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0);
  res.json({ ...client, balance: debit - credit });
});

router.post('/', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const { name, phone, email, company, gstNumber, taxCategory, address, state, categoryId } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
  try {
    const client = await prisma.client.create({
      data: {
        name, phone: String(phone).trim(), email, company, gstNumber,
        taxCategory: taxCategory || 'NON_GST', address,
        ...(state ? { state } : {}),
        categoryId: categoryId ? Number(categoryId) : null,
      },
      include: { category: true },
    });
    res.status(201).json(client);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A client with this phone number already exists' });
    throw e;
  }
});

router.patch('/:id', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { name, phone, email, company, gstNumber, taxCategory, address, state, categoryId } = req.body || {};
  const data = { name, phone, email, company, gstNumber, taxCategory, address, state };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  const clientId = Number(req.params.id);
  // An empty string means "clear the category", which Prisma wants as null.
  const categoryChanged = categoryId !== undefined;
  const nextCategoryId = categoryChanged ? (categoryId ? Number(categoryId) : null) : undefined;
  if (categoryChanged) data.categoryId = nextCategoryId;
  try {
    const client = await prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({
        where: { id: clientId },
        data,
        include: { category: true },
      });
      // Orders snapshot the client's category at booking time, and the reports
      // group spend on that per-order snapshot. So recategorising a client must
      // cascade to their existing orders, otherwise the change never shows up in
      // reports (this is the "Bhoj advertising still uncategorised" bug).
      if (categoryChanged) {
        await tx.order.updateMany({ where: { clientId }, data: { categoryId: nextCategoryId } });
      }
      return updated;
    });
    res.json(client);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A client with this phone number already exists' });
    throw e;
  }
});

// ── Client contacts (owner / accounts / coordinator) ──────────────────────────
// The one flagged `billsTo` is the default recipient for WhatsApp/email bills.
// Only one contact per client can hold that flag at a time.
router.post('/:id/contacts', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const clientId = Number(req.params.id);
  if (!Number.isInteger(clientId)) return res.status(400).json({ error: 'Invalid client id' });
  const { name, role, phone, email, billsTo } = req.body || {};
  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Contact name is required' });
  if (!String(phone || '').trim() && !String(email || '').trim())
    return res.status(400).json({ error: 'Add a phone or an email for this contact' });

  const contact = await prisma.$transaction(async (tx) => {
    if (billsTo) await tx.clientContact.updateMany({ where: { clientId, billsTo: true }, data: { billsTo: false } });
    return tx.clientContact.create({
      data: { clientId, name: cleanName, role: role || null, phone: phone || null, email: email || null, billsTo: !!billsTo },
    });
  });
  res.status(201).json(contact);
});

router.patch('/contacts/:cid', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const cid = Number(req.params.cid);
  if (!Number.isInteger(cid)) return res.status(400).json({ error: 'Invalid contact id' });
  const existing = await prisma.clientContact.findUnique({ where: { id: cid } });
  if (!existing) return res.status(404).json({ error: 'Contact not found' });
  const { name, role, phone, email, billsTo } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (role !== undefined) data.role = role || null;
  if (phone !== undefined) data.phone = phone || null;
  if (email !== undefined) data.email = email || null;

  const contact = await prisma.$transaction(async (tx) => {
    if (billsTo === true) await tx.clientContact.updateMany({ where: { clientId: existing.clientId, billsTo: true, NOT: { id: cid } }, data: { billsTo: false } });
    if (billsTo !== undefined) data.billsTo = !!billsTo;
    return tx.clientContact.update({ where: { id: cid }, data });
  });
  res.json(contact);
});

router.delete('/contacts/:cid', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const cid = Number(req.params.cid);
  if (!Number.isInteger(cid)) return res.status(400).json({ error: 'Invalid contact id' });
  await prisma.clientContact.delete({ where: { id: cid } });
  res.json({ ok: true });
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
