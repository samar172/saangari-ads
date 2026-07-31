const router = require('express').Router();
const dayjs = require('dayjs');
const prisma = require('../db');

const DAY = 24 * 60 * 60 * 1000;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysBetween = (a, b) => Math.floor((a - b) / DAY);

// How many (flat 30-day) months the campaign runs, from its earliest start to
// its latest end. Used to turn a grand total into a per-month installment so a
// payment reminder shows "₹22,000/month", not the whole contract value.
function campaignMonths(items) {
  const live = (items || []).filter((i) => !['CANCELLED', 'WAITLIST'].includes(i.status));
  if (!live.length) return 1;
  const start = dayjs(Math.min(...live.map((i) => +new Date(i.startDate)))).startOf('day');
  const end = dayjs(Math.max(...live.map((i) => +new Date(i.endDate)))).startOf('day');
  const takeDown = end.add(1, 'day'); // exclusive take-down day
  const months = takeDown.diff(start, 'month');
  const remDays = takeDown.diff(start.add(months, 'month'), 'day');
  const totalDays = Math.max(1, months * 30 + remDays);
  return Math.max(1, Math.round(totalDays / 30));
}

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
        id: true, orderNo: true, grandTotal: true, bookingDate: true, paymentTerms: true,
        rentalSubtotal: true, printingTotal: true, mountingCost: true, addOnTotal: true,
        client: { select: { name: true } },
        payments: { select: { amount: true } },
        invoices: { select: { invoiceNo: true, issuedAt: true, status: true } },
        items: { select: { status: true, startDate: true, endDate: true } },
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

    // Lead with the monthly installment, not the whole contract value. Only the
    // RENTAL recurs — it is split evenly across the months. Printing, mounting
    // and add-ons are one-time production charges, so they belong to the first
    // month, never smeared across every month. (Discount + GST scale the
    // pre-discount total uniformly, so each component keeps its share of the
    // grand total.)
    const months = campaignMonths(o.items);
    const preDiscount = o.rentalSubtotal + o.printingTotal + o.mountingCost + o.addOnTotal;
    let monthly, oneTime, firstMonth;
    if (months > 1 && preDiscount > 0) {
      const recurringGross = Math.round(o.grandTotal * (o.rentalSubtotal / preDiscount));
      oneTime = o.grandTotal - recurringGross;        // print + mounting + add-ons, incl. tax
      monthly = Math.round(recurringGross / months);  // rental only, per month
      firstMonth = monthly + oneTime;                 // month 1 carries the one-time charges
    } else {
      monthly = balance; oneTime = 0; firstMonth = balance;
    }
    const amountLabel = months > 1
      ? `₹${monthly.toLocaleString('en-IN')}/month${oneTime > 0 ? ` · first month +₹${oneTime.toLocaleString('en-IN')} (print/mount)` : ''} · ₹${balance.toLocaleString('en-IN')} outstanding`
      : `₹${balance.toLocaleString('en-IN')} outstanding`;

    items.push({
      id: `payment-${o.id}`,
      kind: 'PAYMENT',
      severity: paymentSeverity(ageDays),
      title: `Payment due — ${o.orderNo}`,
      detail: `${o.client.name} · ${amountLabel}${unpaidInvoice ? ` · ${unpaidInvoice.invoiceNo}` : ' · not invoiced yet'}`,
      dueDate: since,
      ageDays,
      balance,
      monthly,
      firstMonth,
      oneTime,
      months,
      paymentTerms: o.paymentTerms,
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
