const router = require('express').Router();
const prisma = require('../db');

const DAY = 24 * 60 * 60 * 1000;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysBetween = (a, b) => Math.floor((a - b) / DAY);

// Monitoring reminder severity: already past due is critical, today needs doing,
// anything in the next week is just a heads-up.
function reminderSeverity(dueDate, today) {
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  if (due < today) return 'critical';
  if (due.getTime() === today.getTime()) return 'pending';
  return 'info';
}

// Payment severity is driven by how long the money has been outstanding —
// measured from the invoice date if we've billed, else from the booking date.
function paymentSeverity(ageDays) {
  if (ageDays > 30) return 'critical';
  if (ageDays > 7) return 'pending';
  return 'info';
}

// One feed combining monitoring reminders and outstanding balances, so the
// top-of-screen bar can show a single critical / pending / info count.
router.get('/', async (req, res) => {
  const today = startOfToday();
  const horizon = new Date(today.getTime() + 7 * DAY);
  horizon.setHours(23, 59, 59, 999);

  const [reminders, orders] = await Promise.all([
    prisma.reminder.findMany({
      where: { done: false, dueDate: { lte: horizon } },
      orderBy: { dueDate: 'asc' },
      include: {
        order: {
          select: {
            id: true, orderNo: true, status: true,
            client: { select: { name: true } },
            items: { select: { site: { select: { code: true } } } },
          },
        },
      },
    }),
    prisma.order.findMany({
      where: { status: { in: ['CONFIRMED', 'LIVE', 'COMPLETED'] } },
      select: {
        id: true, orderNo: true, grandTotal: true, bookingDate: true,
        client: { select: { name: true } },
        payments: { select: { amount: true } },
        invoices: { select: { invoiceNo: true, issuedAt: true, status: true } },
      },
    }),
  ]);

  const items = [];

  for (const r of reminders) {
    if (r.order.status === 'CANCELLED') continue;
    const severity = reminderSeverity(r.dueDate, today);
    const sites = r.order.items.map((i) => i.site.code).join(', ');
    items.push({
      id: `reminder-${r.id}`,
      reminderId: r.id,
      kind: 'MONITORING',
      severity,
      title: `${r.phase} monitoring photos — ${r.order.orderNo}`,
      detail: `${r.order.client.name} · ${sites}`,
      dueDate: r.dueDate,
      orderId: r.order.id,
      orderNo: r.order.orderNo,
    });
  }

  for (const o of orders) {
    const paid = o.payments.reduce((s, p) => s + p.amount, 0);
    const balance = Math.round(o.grandTotal - paid);
    if (balance <= 0) continue;

    const unpaidInvoice = o.invoices.find((i) => i.status !== 'PAID' && i.status !== 'CANCELLED');
    const since = unpaidInvoice ? new Date(unpaidInvoice.issuedAt) : new Date(o.bookingDate);
    const ageDays = Math.max(0, daysBetween(today, since));

    items.push({
      id: `payment-${o.id}`,
      kind: 'PAYMENT',
      severity: paymentSeverity(ageDays),
      title: `Payment due — ${o.orderNo}`,
      detail: `${o.client.name} · ₹${balance.toLocaleString('en-IN')} outstanding${unpaidInvoice ? ` · ${unpaidInvoice.invoiceNo}` : ' · not invoiced yet'}`,
      dueDate: since,
      ageDays,
      balance,
      orderId: o.id,
      orderNo: o.orderNo,
    });
  }

  const RANK = { critical: 0, pending: 1, info: 2 };
  items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || new Date(a.dueDate) - new Date(b.dueDate));

  const counts = { critical: 0, pending: 0, info: 0, total: items.length };
  for (const i of items) counts[i.severity]++;

  res.json({ counts, items });
});

module.exports = router;
