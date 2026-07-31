const prisma = require('../db');
const { recomputeOrderTotals } = require('./pricing');

// Re-price an order in place, optionally patching a few order fields first
// (taxCategory / interState / companyId) so the recompute sees the new values.
async function reprice(tx, orderId, extra = {}) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  const t = recomputeOrderTotals({ ...order, ...extra }, order.items);
  await tx.order.update({
    where: { id: orderId },
    data: {
      ...extra,
      rentalSubtotal: t.rentalSubtotal, discountAmount: t.discountAmount, taxableAmount: t.taxableAmount,
      cgst: t.cgst, sgst: t.sgst, igst: t.igst, gstAmount: t.gstAmount, grandTotal: t.grandTotal,
    },
  });
}

// The Non-GST (GST-hidden) business that cash deals are booked under. There must
// be exactly one, otherwise we can't decide where the cash should land.
async function cashCompany(tx) {
  const hidden = await tx.company.findMany({ where: { gstHidden: true }, orderBy: { id: 'asc' } });
  if (hidden.length === 1) return hidden[0];
  if (!hidden.length) throw new Error('No Non-GST (GST-hidden) business is set up to settle cash into.');
  throw new Error('More than one Non-GST business exists — cannot decide which to settle cash into.');
}

// Settle a campaign in cash: strip GST and move the campaign — together with the
// money booked against it (payments + their ledger credits) — to the Non-GST
// business, so per-company revenue, GST totals and the ledger all reconcile.
// Refuses once the campaign has been invoiced: the issued bill is a hard record,
// so it must be voided first.
async function settleInCash(orderId) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { company: true, invoices: { select: { id: true } } },
    });
    if (!order) throw new Error('Order no longer exists');
    if (order.invoices.length) throw new Error(`${order.orderNo} has been invoiced — void the invoice before settling in cash.`);
    // Already Non-GST and already under a GST-hidden entity → nothing to do.
    if (order.taxCategory === 'NON_GST' && order.company?.gstHidden) return order;

    const extra = { taxCategory: 'NON_GST', interState: false };
    if (!order.company?.gstHidden) {
      const target = await cashCompany(tx);
      extra.companyId = target.id;
      // The collected money and its ledger credits follow the campaign so each
      // business's books stay right. (Ledger has no orderId, so match the payment
      // credits by the order number stamped in their narration — but as a whole
      // token, so settling SO-1 can't drag SO-10 / SO-100 credits along.)
      await tx.payment.updateMany({ where: { orderId }, data: { companyId: target.id } });
      const credits = await tx.ledgerEntry.findMany({
        where: { clientId: order.clientId, type: 'CREDIT', narration: { contains: order.orderNo } },
        select: { id: true, narration: true },
      });
      const esc = order.orderNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`·\\s${esc}(?:\\s|·|$)`); // "…· SO-00019 ·…" or trailing
      const ids = credits.filter((c) => re.test(c.narration)).map((c) => c.id);
      if (ids.length) await tx.ledgerEntry.updateMany({ where: { id: { in: ids } }, data: { companyId: target.id } });
    }
    await reprice(tx, orderId, extra);
    return tx.order.findUnique({ where: { id: orderId } });
  });
}

module.exports = { settleInCash, cashCompany, reprice };
