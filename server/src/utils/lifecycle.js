const dayjs = require('dayjs');
const prisma = require('../db');

// Statuses that still occupy a site while a campaign is running.
const HOLDING = ['TENTATIVE', 'CONFIRMED', 'LIVE'];
// Line statuses that are finished or otherwise excluded from auto-advancement.
const LINE_TERMINAL = ['CANCELLED', 'STOPPED', 'WAITLIST', 'COMPLETED'];

// Free a site back to AVAILABLE unless another still-holding booking wants it.
async function releaseSite(tx, siteId) {
  const held = await tx.booking.findFirst({ where: { siteId, status: { in: HOLDING } } });
  if (!held) await tx.site.update({ where: { id: siteId }, data: { status: 'AVAILABLE' } });
}

// Advance campaign + booking statuses to match the calendar:
//   • a confirmed line whose start date has arrived → LIVE (site BOOKED)
//   • any line past its (inclusive) end date        → COMPLETED (site freed)
// The order status then rolls up from its lines: all lines done → COMPLETED,
// any line live → LIVE, otherwise it stays CONFIRMED (not started yet).
// Quotations never auto-advance; cancelled/completed orders are terminal.
async function advanceCampaignLifecycle(now = new Date()) {
  const today = dayjs(now).startOf('day');
  const started = (l) => !today.isBefore(dayjs(l.startDate).startOf('day')); // today >= start
  const over = (l) => today.isAfter(dayjs(l.endDate).startOf('day'));        // today > end (end is inclusive)

  const orders = await prisma.order.findMany({
    where: { status: { in: ['CONFIRMED', 'LIVE'] } },
    include: { items: true },
  });

  let ordersChanged = 0;
  for (const o of orders) {
    const lines = o.items.filter((l) => !LINE_TERMINAL.includes(l.status));
    if (!lines.length) continue;

    // Work out what this order needs before touching the DB.
    const toComplete = lines.filter((l) => over(l));
    const toLive = lines.filter((l) => !over(l) && started(l) && l.status === 'CONFIRMED');
    const allDone = toComplete.length === lines.length;
    const anyLive = lines.some((l) => l.status === 'LIVE') || toLive.length > 0 || (!allDone && lines.some((l) => started(l) && !over(l)));
    const target = allDone ? 'COMPLETED' : anyLive ? 'LIVE' : o.status;

    if (!toComplete.length && !toLive.length && target === o.status) continue; // nothing to do

    await prisma.$transaction(async (tx) => {
      for (const l of toComplete) {
        if (l.status !== 'COMPLETED') {
          await tx.booking.update({ where: { id: l.id }, data: { status: 'COMPLETED' } });
          await releaseSite(tx, l.siteId);
        }
      }
      for (const l of toLive) {
        await tx.booking.update({ where: { id: l.id }, data: { status: 'LIVE' } });
        await tx.site.update({ where: { id: l.siteId }, data: { status: 'BOOKED' } });
      }
      if (target !== o.status) await tx.order.update({ where: { id: o.id }, data: { status: target } });
    });
    ordersChanged++;
  }
  return ordersChanged;
}

module.exports = { advanceCampaignLifecycle };
