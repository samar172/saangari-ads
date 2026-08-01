const prisma = require('../db');

// Apply an edit to a recorded payment: re-derive TDS/net, update the Payment row
// (so the order balance re-derives) and adjust the matching client-ledger credit
// (so the client balance stays right). Used by the direct manager edit and by the
// approved EDIT_PAYMENT request, so both paths behave identically.
async function applyPaymentEdit(paymentId, body = {}) {
  const gross = Math.round(Number(body.amount));
  if (!(gross > 0)) throw new Error('Amount must be greater than zero');
  const pct = body.tdsApplicable ? Math.min(100, Math.max(0, Number(body.tdsPct) || 0)) : 0;
  const tdsAmount = Math.round(gross * pct / 100);
  const netReceived = gross - tdsAmount;
  const mode = body.mode || undefined;

  return prisma.$transaction(async (tx) => {
    const pay = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!pay) throw new Error('Payment no longer exists');

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        amount: gross,
        ...(mode ? { mode } : {}),
        reference: body.reference !== undefined ? (body.reference || null) : pay.reference,
        tdsApplicable: pct > 0, tdsPct: pct, tdsAmount, netReceived,
      },
    });

    // The order is credited the full gross. Adjust the linked ledger credit; for
    // payments recorded before the paymentId link existed, best-effort match the
    // old credit (same client + amount) and adopt it so future edits are exact.
    let led = await tx.ledgerEntry.findFirst({ where: { paymentId, type: 'CREDIT' } });
    if (!led) {
      const order = pay.orderId ? await tx.order.findUnique({ where: { id: pay.orderId }, select: { orderNo: true } }) : null;
      led = await tx.ledgerEntry.findFirst({
        where: {
          clientId: pay.clientId, type: 'CREDIT', paymentId: null, amount: pay.amount,
          ...(order ? { narration: { contains: order.orderNo } } : {}),
        },
        orderBy: { date: 'desc' },
      });
    }
    if (led) await tx.ledgerEntry.update({ where: { id: led.id }, data: { amount: gross, paymentId } });

    return tx.payment.findUnique({ where: { id: paymentId } });
  });
}

module.exports = { applyPaymentEdit };
