const prisma = require('../db');

// Record one activity-feed entry. Best-effort by design: a failure to log must
// never fail (or roll back) the mutation it describes, so call it AFTER the main
// work has committed and swallow any error. `user` is the req.user of the actor.
async function logActivity({ type, summary, detail, orderId, orderNo, invoiceId, user } = {}) {
  try {
    await prisma.activityLog.create({
      data: {
        type,
        summary,
        detail: detail || null,
        orderId: orderId || null,
        orderNo: orderNo || null,
        invoiceId: invoiceId || null,
        userId: user?.id || null,
        userName: user?.name || null,
      },
    });
  } catch (e) {
    // Never let telemetry break the request.
    console.error('logActivity failed:', e.message);
  }
}

module.exports = { logActivity };
