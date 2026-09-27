const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

// Parse ?from&to into a Prisma date filter (inclusive of the whole `to` day).
function dateRange(from, to) {
  const r = {};
  if (from) r.gte = new Date(from);
  if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); r.lte = d; }
  return Object.keys(r).length ? r : null;
}

const partyName = (c) => (c?.company?.trim() || c?.name || 'Unknown');

// Trial balance / receivables list: every party with a ledger entry, their total
// debit (billed) vs credit (paid/notes) and closing balance (debit − credit).
router.get('/parties', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { companyId } = req.query;
  const where = {};
  if (companyId) where.companyId = Number(companyId);

  const entries = await prisma.ledgerEntry.findMany({
    where,
    select: { clientId: true, type: true, amount: true, client: { select: { name: true, company: true } } },
  });

  const map = {};
  for (const e of entries) {
    const b = (map[e.clientId] = map[e.clientId] || { clientId: e.clientId, name: partyName(e.client), debit: 0, credit: 0, balance: 0 });
    if (e.type === 'DEBIT') b.debit += e.amount; else b.credit += e.amount;
  }
  const parties = Object.values(map).map((p) => ({
    ...p, debit: Math.round(p.debit), credit: Math.round(p.credit), balance: Math.round(p.debit - p.credit),
  })).sort((a, b) => b.balance - a.balance);

  const totals = parties.reduce(
    (t, p) => ({ debit: t.debit + p.debit, credit: t.credit + p.credit, balance: t.balance + p.balance }),
    { debit: 0, credit: 0, balance: 0 },
  );
  res.json({ parties, totals });
});

// One party's ledger statement with a running balance, date-ranged. `opening`
// carries the balance from before the window so the running balance is correct.
router.get('/party/:clientId', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId)) return res.status(400).json({ error: 'Invalid client id' });
  const { companyId, from, to } = req.query;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, company: true, phone: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const baseWhere = { clientId };
  if (companyId) baseWhere.companyId = Number(companyId);

  // Opening balance = everything strictly before `from`.
  let opening = 0;
  if (from) {
    const before = await prisma.ledgerEntry.findMany({
      where: { ...baseWhere, date: { lt: new Date(from) } },
      select: { type: true, amount: true },
    });
    opening = before.reduce((s, e) => s + (e.type === 'DEBIT' ? e.amount : -e.amount), 0);
  }

  const range = dateRange(from, to);
  const rows = await prisma.ledgerEntry.findMany({
    where: { ...baseWhere, ...(range ? { date: range } : {}) },
    orderBy: { date: 'asc' },
    select: { id: true, date: true, type: true, narration: true, amount: true, kind: true, invoice: { select: { invoiceNo: true } } },
  });

  let balance = opening;
  const entries = rows.map((e) => {
    const debit = e.type === 'DEBIT' ? e.amount : 0;
    const credit = e.type === 'CREDIT' ? e.amount : 0;
    balance += debit - credit;
    return {
      id: e.id, date: e.date, type: e.type, narration: e.narration, kind: e.kind,
      invoiceNo: e.invoice?.invoiceNo || null,
      debit: Math.round(debit), credit: Math.round(credit), balance: Math.round(balance),
    };
  });

  res.json({ client, opening: Math.round(opening), entries, closing: Math.round(balance) });
});

// Day book: every ledger entry in the range (default last 30 days), newest first.
router.get('/daybook', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { companyId, from, to } = req.query;
  const where = {};
  if (companyId) where.companyId = Number(companyId);
  const range = dateRange(from, to)
    || { gte: new Date(Date.now() - 30 * 86400000) }; // default: last 30 days
  where.date = range;

  const rows = await prisma.ledgerEntry.findMany({
    where,
    orderBy: { date: 'desc' },
    select: { id: true, date: true, type: true, narration: true, amount: true, client: { select: { name: true, company: true } } },
  });

  let totalDebit = 0, totalCredit = 0;
  const entries = rows.map((e) => {
    const debit = e.type === 'DEBIT' ? e.amount : 0;
    const credit = e.type === 'CREDIT' ? e.amount : 0;
    totalDebit += debit; totalCredit += credit;
    return {
      id: e.id, date: e.date, clientName: partyName(e.client), type: e.type,
      narration: e.narration, debit: Math.round(debit), credit: Math.round(credit),
    };
  });
  res.json({ entries, totalDebit: Math.round(totalDebit), totalCredit: Math.round(totalCredit) });
});

// Post a manual journal entry to a client's ledger: credit/debit note, adjustment
// or opening balance. This is the only path for non-invoice, non-payment entries.
const JOURNAL_KINDS = ['CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT', 'OPENING'];
router.post('/journal', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { clientId, type, amount, narration, kind, companyId, date } = req.body || {};
  const cid = Number(clientId);
  if (!Number.isInteger(cid)) return res.status(400).json({ error: 'A client is required' });
  if (!['DEBIT', 'CREDIT'].includes(type)) return res.status(400).json({ error: 'type must be DEBIT or CREDIT' });
  const amt = Math.round(Number(amount));
  if (!(amt > 0)) return res.status(400).json({ error: 'Amount must be greater than zero' });
  if (!JOURNAL_KINDS.includes(kind)) return res.status(400).json({ error: 'Unknown journal kind' });

  const client = await prisma.client.findUnique({ where: { id: cid }, select: { id: true } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const entry = await prisma.ledgerEntry.create({
    data: {
      clientId: cid,
      companyId: companyId ? Number(companyId) : 1,
      type,
      amount: amt,
      narration: narration || kind.replace(/_/g, ' ').toLowerCase(),
      kind,
      ...(date ? { date: new Date(date) } : {}),
    },
  });
  res.status(201).json(entry);
});

module.exports = router;
