const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

// Default message templates. Placeholders are filled client-side when opening a
// wa.me link (manual) and server-side when auto-sending (API phase).
const DEFAULTS = {
  tplInvoice: 'Dear {{client}}, please find invoice {{invoiceNo}} for {{amount}} due by {{dueDate}}. — {{company}}',
  tplBooking: 'Dear {{client}}, your booking {{orderNo}} ({{sites}} site(s)) is confirmed. — {{company}}',
  tplPayment: 'Dear {{client}}, we have received your payment of {{amount}} against {{orderNo}}. Thank you. — {{company}}',
  tplExpiry: 'Dear {{client}}, your campaign {{orderNo}} ends on {{endDate}}. Reply to renew. — {{company}}',
  tplBillingDue: 'Dear {{client}}, a bill for {{orderNo}} is due. Kindly arrange payment. — {{company}}',
};

async function getOrCreate() {
  let s = await prisma.whatsAppSetting.findUnique({ where: { id: 1 } });
  if (!s) s = await prisma.whatsAppSetting.create({ data: { id: 1, ...DEFAULTS } });
  return s;
}

// Read config. Managers/Finance can read (the manual send buttons need templates).
router.get('/', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const s = await getOrCreate();
  // Never leak the raw API token to the browser — expose only whether it's set.
  res.json({ ...s, apiToken: undefined, hasApiToken: !!s.apiToken });
});

// Save config. Only Manager / Super-Admin.
router.put('/', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  const b = req.body || {};
  const provider = ['MANUAL', 'CLOUD_API', 'BSP'].includes(b.provider) ? b.provider : 'MANUAL';
  const data = {
    provider,
    fromNumber: b.fromNumber ?? null,
    phoneNumberId: b.phoneNumberId ?? null,
    bspBaseUrl: b.bspBaseUrl ?? null,
    onInvoice: !!b.onInvoice, onBooking: !!b.onBooking, onPayment: !!b.onPayment,
    onExpiry: !!b.onExpiry, onBillingDue: !!b.onBillingDue,
    tplInvoice: b.tplInvoice ?? null, tplBooking: b.tplBooking ?? null, tplPayment: b.tplPayment ?? null,
    tplExpiry: b.tplExpiry ?? null, tplBillingDue: b.tplBillingDue ?? null,
  };
  // Only overwrite the token when a new non-empty one is supplied (blank keeps existing).
  if (b.apiToken) data.apiToken = String(b.apiToken);
  await getOrCreate();
  const s = await prisma.whatsAppSetting.update({ where: { id: 1 }, data });
  res.json({ ...s, apiToken: undefined, hasApiToken: !!s.apiToken });
});

// Record a send (called after the client opens wa.me / mailto).
router.post('/log', requireRole('MANAGER', 'FINANCE', 'SALES'), async (req, res) => {
  const b = req.body || {};
  const entry = await prisma.whatsAppLog.create({
    data: {
      kind: b.kind || 'OTHER',
      entityType: b.entityType || null,
      entityId: b.entityId != null ? Number(b.entityId) : null,
      channel: b.channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP',
      toName: b.toName || null, toNumber: b.toNumber || null, label: b.label || null,
      sentById: req.user.id,
    },
  });
  res.status(201).json(entry);
});

// Recent send log.
router.get('/log', requireRole('MANAGER', 'FINANCE', 'SALES'), async (req, res) => {
  const rows = await prisma.whatsAppLog.findMany({
    orderBy: { sentAt: 'desc' }, take: 100,
    include: { sentBy: { select: { name: true } } },
  });
  res.json(rows);
});

// Outbox: action lists — Invoices (send bill), Campaigns (booking confirmation),
// Ending soon (expiry reminder, campaigns ending ≤30d), Invoice due (payment
// reminder, unpaid invoices) — each with its own sent/not-sent status by kind.
router.get('/outbox', requireRole('MANAGER', 'FINANCE', 'SALES'), async (req, res) => {
  const { companyId } = req.query;
  const cw = companyId ? { companyId: Number(companyId) } : {};
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 30 * 86400000);

  const [invoices, orders, dueInvoices, logs] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { not: 'CANCELLED' }, ...cw },
      orderBy: { issuedAt: 'desc' }, take: 300,
      select: { id: true, invoiceNo: true, total: true, issuedAt: true, client: { select: { name: true, company: true, phone: true } } },
    }),
    prisma.order.findMany({
      where: { status: { in: ['CONFIRMED', 'LIVE', 'COMPLETED'] }, ...cw },
      orderBy: { bookingDate: 'desc' }, take: 300,
      select: { id: true, orderNo: true, bookingDate: true, client: { select: { name: true, company: true, phone: true } }, items: { select: { id: true, endDate: true, status: true } } },
    }),
    prisma.invoice.findMany({
      where: { status: { notIn: ['PAID', 'CANCELLED'] }, ...cw },
      orderBy: { dueDate: 'asc' }, take: 300,
      select: { id: true, invoiceNo: true, total: true, dueDate: true, client: { select: { name: true, company: true, phone: true } } },
    }),
    prisma.whatsAppLog.findMany({ select: { kind: true, entityId: true, sentAt: true } }),
  ]);
  const lastSent = {};
  for (const l of logs) { const k = `${l.kind}:${l.entityId}`; if (!lastSent[k] || l.sentAt > lastSent[k]) lastSent[k] = l.sentAt; }
  const who = (c) => c?.company?.trim() || c?.name || '';
  const DAY = 86400000;

  // Campaigns ending within 30 days (by their latest active line's end date).
  const endingSoon = [];
  for (const o of orders) {
    const live = (o.items || []).filter((it) => it.status !== 'CANCELLED' && it.endDate);
    if (!live.length) continue;
    const end = new Date(Math.max(...live.map((it) => +new Date(it.endDate)))); end.setHours(0, 0, 0, 0);
    if (end >= today && end <= horizon) {
      endingSoon.push({ id: o.id, orderNo: o.orderNo, client: who(o.client), phone: o.client?.phone, endDate: end, daysLeft: Math.round((end - today) / DAY), sentAt: lastSent[`EXPIRY:${o.id}`] || null });
    }
  }
  endingSoon.sort((a, b) => a.daysLeft - b.daysLeft);

  res.json({
    invoices: invoices.map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, client: who(i.client), phone: i.client?.phone, total: i.total, issuedAt: i.issuedAt, sentAt: lastSent[`INVOICE:${i.id}`] || null })),
    bookings: orders.map((o) => ({ id: o.id, orderNo: o.orderNo, client: who(o.client), phone: o.client?.phone, sites: o.items.length, bookingDate: o.bookingDate, sentAt: lastSent[`BOOKING:${o.id}`] || null })),
    endingSoon,
    invoiceDue: dueInvoices.map((i) => {
      const due = i.dueDate ? new Date(i.dueDate) : null; if (due) due.setHours(0, 0, 0, 0);
      const overdueDays = due && due < today ? Math.round((today - due) / DAY) : 0;
      return { id: i.id, invoiceNo: i.invoiceNo, client: who(i.client), phone: i.client?.phone, total: i.total, dueDate: i.dueDate, overdueDays, sentAt: lastSent[`DUE:${i.id}`] || null };
    }),
  });
});

module.exports = router;
