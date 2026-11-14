const dayjs = require('dayjs');
const prisma = require('../db');
const { applyOrderCharges } = require('./pricing');
const { logActivity } = require('./activity');

// Override waitlisted lines: a loose line that was waitlisted (its site was
// held on those dates) is turned into a normal loose booking — the client is
// charged for it and it bills like any other line. Loose bookings never occupy
// the inventory tile, so site status is untouched. The line takes its status
// from the campaign and the calendar (finished dates → COMPLETED), and the
// campaign total is updated (see totalsAfterOverride) so bills match it.

function overrideStatus(orderStatus, line, today) {
  if (orderStatus === 'QUOTATION') return 'TENTATIVE';
  const start = dayjs(line.startDate).startOf('day');
  const end = dayjs(line.endDate).startOf('day');
  if (today.isAfter(end)) return 'COMPLETED';
  if (!today.isBefore(start)) return 'LIVE';
  return 'CONFIRMED';
}

const BILLABLE = ['TENTATIVE', 'CONFIRMED', 'LIVE', 'COMPLETED', 'STOPPED'];

// The campaign's totals after overriding `lines`. Many campaigns already carry
// their waitlisted rent in the stored total; only the part of the overridden
// rent that wasn't already in it is added, and waitlisted sites NOT overridden
// keep whatever share they had — so a partial override never moves the total
// for sites nobody touched.
function totalsAfterOverride(order, lines) {
  const billableBefore = order.items.filter((l) => BILLABLE.includes(l.status)).reduce((s, l) => s + l.subtotal, 0);
  const waitlistIncluded = Math.max(0, Math.round(order.rentalSubtotal - billableBefore));
  const overridden = lines.reduce((s, l) => s + l.subtotal, 0);
  const rentalSubtotal = billableBefore + overridden + Math.max(0, waitlistIncluded - overridden);
  return applyOrderCharges({
    rentalSubtotal, addOnTotal: order.addOnTotal || 0, printingTotal: order.printingTotal || 0, mountingTotal: order.mountingCost || 0,
    discountPct: order.discountPct || 0, discountFlat: order.discountFlat || 0, taxCategory: order.taxCategory, interState: order.interState,
    reprintTotal: order.reprintTotal || 0,
  });
}

// Returns { order, lines, before, after } for the waitlisted lines picked (all
// of the order's waitlisted lines when lineIds is empty). Throws with .status.
async function previewWaitlistOverride(orderId, lineIds) {
  const order = await prisma.order.findUnique({ where: { id: Number(orderId) }, include: { items: { include: { site: { select: { code: true, location: true } } } } } });
  if (!order) { const e = new Error('Campaign not found'); e.status = 404; throw e; }
  if (order.status === 'CANCELLED') { const e = new Error(`${order.orderNo} is cancelled.`); e.status = 400; throw e; }
  const ids = (lineIds || []).map(Number).filter(Boolean);
  const lines = order.items.filter((l) => l.status === 'WAITLIST' && (!ids.length || ids.includes(l.id)));
  if (!lines.length) { const e = new Error(`${order.orderNo} has no waitlisted sites to override.`); e.status = 400; throw e; }
  const after = totalsAfterOverride(order, lines);
  return { order, lines, before: { rentalSubtotal: order.rentalSubtotal, grandTotal: order.grandTotal }, after: { rentalSubtotal: after.rentalSubtotal, grandTotal: after.grandTotal } };
}

async function applyWaitlistOverride({ orderId, lineIds, reason, user }) {
  const { order, lines, before } = await previewWaitlistOverride(orderId, lineIds);
  const today = dayjs().startOf('day');
  const updated = await prisma.$transaction(async (tx) => {
    for (const l of lines) {
      await tx.booking.update({ where: { id: l.id }, data: { status: overrideStatus(order.status, l, today) } });
    }
    const t = totalsAfterOverride(order, lines);
    return tx.order.update({
      where: { id: order.id },
      data: {
        rentalSubtotal: t.rentalSubtotal, discountAmount: t.discountAmount, taxableAmount: t.taxableAmount,
        cgst: t.cgst, sgst: t.sgst, igst: t.igst, gstAmount: t.gstAmount, grandTotal: t.grandTotal,
      },
    });
  });
  const sites = lines.map((l) => `${l.bookingNo} ${l.site.code}`).join(', ');
  const fmt = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  logActivity({
    type: 'CAMPAIGN_EDIT', user, orderId: order.id, orderNo: order.orderNo,
    summary: `Waitlist overridden · ${lines.length} site${lines.length > 1 ? 's' : ''} · ${order.orderNo}`,
    detail: `${sites} → loose booking · total ${fmt(before.grandTotal)} → ${fmt(updated.grandTotal)}${reason ? ` · ${reason}` : ''}`,
  });
  return { order: updated, lines: lines.length };
}

module.exports = { previewWaitlistOverride, applyWaitlistOverride };
