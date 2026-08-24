const router = require('express').Router();
const dayjs = require('dayjs');
const prisma = require('../db');

const DAY = 24 * 60 * 60 * 1000;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysBetween = (a, b) => Math.floor((a - b) / DAY);

const CATEGORIES = ['CAMPAIGN', 'INVOICE', 'PAYMENT', 'MONITORING', 'ACTIVITY'];

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

// One feed combining campaign activity, invoices, outstanding balances and
// monitoring reminders, split into four categories so the panel can tab between
// them. Each item carries a `category` (CAMPAIGN / INVOICE / PAYMENT / MONITORING).
router.get('/', async (req, res) => {
  const today = startOfToday();
  const horizon = new Date(today.getTime() + 7 * DAY);
  horizon.setHours(23, 59, 59, 999);
  // Don't surface stale monitoring reminders. Back-dated campaigns can generate
  // reminders whose due date is months in the past; anything older than 30 days
  // is dropped so the bar isn't flooded with ancient "critical" alerts.
  const floor = new Date(today.getTime() - 30 * DAY);
  // Recent-activity window for new bookings, shifts and freshly-issued invoices.
  const recent = new Date(today.getTime() - 14 * DAY);

  const [reminders, orders, recentOrders, shifts, invoices, activity] = await Promise.all([
    prisma.reminder.findMany({
      where: { done: false, dueDate: { gte: floor, lte: horizon } },
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
    prisma.order.findMany({
      where: { createdAt: { gte: recent }, status: { notIn: ['CANCELLED', 'QUOTATION'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, orderNo: true, status: true, createdAt: true,
        client: { select: { name: true, company: true } },
        items: { select: { id: true } },
      },
    }),
    prisma.siteShift.findMany({
      where: { shiftedAt: { gte: recent } },
      orderBy: { shiftedAt: 'desc' },
      include: {
        fromSite: { select: { code: true } },
        toSite: { select: { code: true } },
        booking: { select: { order: { select: { id: true, orderNo: true, client: { select: { name: true } } } } } },
      },
    }),
    prisma.invoice.findMany({
      where: {
        OR: [
          { issuedAt: { gte: recent } },
          { status: { notIn: ['PAID', 'CANCELLED'] } },
        ],
      },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true, invoiceNo: true, issuedAt: true, dueDate: true, status: true, total: true, orderId: true,
        client: { select: { name: true, company: true } },
      },
    }),
    // Recent activity feed — the last ~40 logged actions in the recency window.
    prisma.activityLog.findMany({
      where: { createdAt: { gte: recent } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
  ]);

  const items = [];

  // ---- MONITORING: photo reminders ----
  for (const r of reminders) {
    if (r.order.status === 'CANCELLED') continue;
    const severity = reminderSeverity(r.dueDate, today);
    const sites = r.order.items.map((i) => i.site.code).join(', ');
    items.push({
      id: `reminder-${r.id}`,
      reminderId: r.id,
      category: 'MONITORING',
      kind: 'MONITORING',
      severity,
      title: `${r.phase} monitoring photos — ${r.order.orderNo}`,
      detail: `${r.order.client.name} · ${sites}`,
      dueDate: r.dueDate,
      orderId: r.order.id,
      orderNo: r.order.orderNo,
    });
  }

  // ---- PAYMENT: outstanding balances ----
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
    // month, never smeared across every month.
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
      category: 'PAYMENT',
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

  // ---- CAMPAIGN: new bookings + site shifts ----
  for (const o of recentOrders) {
    const ageDays = Math.max(0, daysBetween(today, new Date(o.createdAt)));
    const who = o.client.company?.trim() || o.client.name;
    items.push({
      id: `neworder-${o.id}`,
      category: 'CAMPAIGN',
      kind: 'NEW_BOOKING',
      severity: 'info',
      title: `New booking — ${o.orderNo}`,
      detail: `${who} · ${o.items.length} site${o.items.length !== 1 ? 's' : ''}`,
      dueDate: o.createdAt,
      ageDays,
      orderId: o.id,
      orderNo: o.orderNo,
    });
  }
  for (const s of shifts) {
    const ord = s.booking?.order;
    if (!ord) continue;
    const ageDays = Math.max(0, daysBetween(today, new Date(s.shiftedAt)));
    items.push({
      id: `shift-${s.id}`,
      category: 'CAMPAIGN',
      kind: 'SITE_SHIFT',
      severity: 'info',
      title: `Site shifted — ${ord.orderNo}`,
      detail: `${ord.client.name} · ${s.fromSite.code} → ${s.toSite.code}`,
      dueDate: s.shiftedAt,
      ageDays,
      orderId: ord.id,
      orderNo: ord.orderNo,
    });
  }

  // ---- INVOICE: unpaid (always) + recently-raised (info) ----
  for (const inv of invoices) {
    const unpaid = inv.status !== 'PAID' && inv.status !== 'CANCELLED';
    const who = inv.client.company?.trim() || inv.client.name;
    const amt = `₹${(inv.total || 0).toLocaleString('en-IN')}`;
    const recentlyIssued = inv.issuedAt && new Date(inv.issuedAt) >= recent;

    let severity, title, detail;
    if (unpaid) {
      // An unpaid invoice is always worth surfacing, however old. If it has a due
      // date that has passed it's overdue (severity by how late); otherwise nudge
      // by how long it's been unpaid since it was issued.
      if (inv.dueDate && new Date(inv.dueDate) < today) {
        const overdueDays = daysBetween(today, new Date(inv.dueDate));
        severity = overdueDays > 15 ? 'critical' : 'pending';
        title = `Invoice overdue — ${inv.invoiceNo}`;
        detail = `${who} · ${amt} · ${overdueDays}d overdue`;
      } else {
        const ageDays = inv.issuedAt ? Math.max(0, daysBetween(today, new Date(inv.issuedAt))) : 0;
        severity = ageDays > 15 ? 'pending' : 'info';
        title = `Invoice unpaid — ${inv.invoiceNo}`;
        detail = `${who} · ${amt}${ageDays > 0 ? ` · unpaid ${ageDays}d` : ''}`;
      }
    } else if (recentlyIssued) {
      // Paid & freshly raised — just a heads-up it went out.
      severity = 'info';
      title = `Invoice raised — ${inv.invoiceNo}`;
      detail = `${who} · ${amt}`;
    } else {
      continue; // paid & old — nothing to say
    }

    items.push({
      id: `invoice-${inv.id}`,
      category: 'INVOICE',
      kind: 'INVOICE',
      severity,
      title,
      detail,
      dueDate: inv.dueDate || inv.issuedAt,
      invoiceId: inv.id,
      orderId: inv.orderId,
    });
  }

  // ---- ACTIVITY: recent logged actions (entries, edits, payments) ----
  for (const a of activity) {
    items.push({
      id: `activity-${a.id}`,
      category: 'ACTIVITY',
      kind: a.type,
      severity: 'info',
      title: a.summary,
      detail: [a.detail, a.userName].filter(Boolean).join(' · '),
      dueDate: a.createdAt,
      orderId: a.orderId || undefined,
      orderNo: a.orderNo || undefined,
      invoiceId: a.invoiceId || undefined,
    });
  }

  const RANK = { critical: 0, pending: 1, info: 2 };
  items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || new Date(b.dueDate) - new Date(a.dueDate));

  // Overall counts (for the bell badge) plus per-category counts (for the tabs).
  const counts = { critical: 0, pending: 0, info: 0, total: items.length };
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, { critical: 0, pending: 0, info: 0, total: 0 }]));
  for (const i of items) {
    counts[i.severity]++;
    const b = byCategory[i.category];
    if (b) { b[i.severity]++; b.total++; }
  }

  res.json({ counts, byCategory, items });
});

module.exports = router;
