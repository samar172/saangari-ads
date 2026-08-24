const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const { settleInCash } = require('../utils/settle');
const { applyPaymentEdit } = require('../utils/payments');
const { logActivity } = require('../utils/activity');

const ACTIONS = ['DELETE_ORDER', 'CANCEL_ORDER', 'DELETE_INVOICE', 'SETTLE_CASH', 'DISABLE_USER', 'EDIT_PAYMENT', 'OTHER'];
const ACTIVE = ['TENTATIVE', 'CONFIRMED', 'LIVE'];

// Release a site back to AVAILABLE unless another live booking still holds it.
async function releaseSite(tx, siteId) {
  const stillHeld = await tx.booking.findFirst({ where: { siteId, status: { in: ACTIVE } } });
  if (!stillHeld) await tx.site.update({ where: { id: siteId }, data: { status: 'AVAILABLE' } });
}

const requestInclude = {
  requestedBy: { select: { id: true, name: true, role: true } },
  reviewedBy: { select: { id: true, name: true } },
};

function isReviewer(user) {
  return user.role === 'MANAGER' || user.role === 'SUPER_ADMIN';
}

// A staff member files a request for a sensitive action. Anyone signed in may
// file one; only a manager/admin can approve it below.
router.post('/', async (req, res) => {
  const { action, entityType, entityId, label, reason, payload } = req.body || {};
  if (!ACTIONS.includes(action)) return res.status(400).json({ error: 'Unknown approval action' });
  const request = await prisma.approvalRequest.create({
    data: {
      action,
      entityType: String(entityType || ''),
      entityId: entityId != null ? Number(entityId) : null,
      label: label || null,
      reason: reason || null,
      payload: payload || undefined,
      requestedById: req.user.id,
    },
    include: requestInclude,
  });
  res.status(201).json(request);
});

// Reviewers see everything; a staff member sees only their own requests.
router.get('/', async (req, res) => {
  const { status } = req.query;
  const where = {};
  if (status) where.status = status;
  if (!isReviewer(req.user)) where.requestedById = req.user.id;
  const requests = await prisma.approvalRequest.findMany({
    where, orderBy: { createdAt: 'desc' }, include: requestInclude,
  });
  res.json(requests);
});

// Badge count of pending requests awaiting a reviewer.
router.get('/count', async (req, res) => {
  if (!isReviewer(req.user)) return res.json({ pending: 0 });
  const pending = await prisma.approvalRequest.count({ where: { status: 'PENDING' } });
  res.json({ pending });
});

// Carry out the requested action inside a transaction.
async function execute(request) {
  const id = request.entityId;
  switch (request.action) {
    case 'DELETE_ORDER': {
      const order = await prisma.order.findUnique({
        where: { id },
        include: { items: { select: { siteId: true } }, payments: { select: { id: true } }, invoices: { select: { id: true } } },
      });
      if (!order) throw new Error('Order no longer exists');
      if (order.payments.length) throw new Error('Order has recorded payments — reverse them first');
      if (order.invoices.length) throw new Error('Order has been invoiced — void the invoice first');
      const siteIds = [...new Set(order.items.map((i) => i.siteId))];
      await prisma.$transaction(async (tx) => {
        await tx.order.delete({ where: { id } });
        for (const siteId of siteIds) await releaseSite(tx, siteId);
      });
      return;
    }
    case 'CANCEL_ORDER': {
      // Cancel the campaign, cancel its still-active lines and free those sites.
      // Mirrors the direct cancel path in orders.js /:id/status.
      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
        if (!order) throw new Error('Order no longer exists');
        if (order.status === 'CANCELLED') throw new Error('Order is already cancelled');
        await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
        for (const line of order.items) {
          if (line.status === 'STOPPED') continue;
          await tx.booking.update({ where: { id: line.id }, data: { status: 'CANCELLED' } });
          await releaseSite(tx, line.siteId);
        }
      });
      return;
    }
    case 'DELETE_INVOICE': {
      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) throw new Error('Invoice no longer exists');
      await prisma.$transaction(async (tx) => {
        await tx.ledgerEntry.deleteMany({ where: { invoiceId: id } });
        await tx.invoice.delete({ where: { id } });
      });
      return;
    }
    case 'SETTLE_CASH': {
      // Strip GST and move the campaign (and its money) to the Non-GST business.
      // Refuses if already invoiced. Shared with the direct /orders/:id/tax path.
      await settleInCash(id);
      return;
    }
    case 'EDIT_PAYMENT': {
      // Apply the requested payment edit (amount/mode/reference/TDS) from the
      // payload. Same helper the direct manager edit uses.
      const payload = request.payload || {};
      await applyPaymentEdit(request.entityId, payload);
      return;
    }
    case 'DISABLE_USER': {
      await prisma.user.update({ where: { id }, data: { active: false } });
      return;
    }
    default:
      return; // OTHER — nothing to execute, just an audited sign-off
  }
}

// The most destructive actions need a Super-Admin to approve, not just any
// manager — these delete hard financial records or lock people out.
const SUPER_ADMIN_ONLY_ACTIONS = ['DISABLE_USER', 'DELETE_INVOICE'];

router.post('/:id/approve', requireRole('MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'This request has already been reviewed' });

  // Segregation of duties: the person who filed a request can't sign it off.
  if (request.requestedById === req.user.id)
    return res.status(403).json({ error: 'You cannot approve your own request — a different reviewer must sign off.' });
  // The most sensitive actions require a Super-Admin approver.
  if (SUPER_ADMIN_ONLY_ACTIONS.includes(request.action) && req.user.role !== 'SUPER_ADMIN')
    return res.status(403).json({ error: 'Only a Super-Admin can approve this action.' });
  // Never disable a Super-Admin through the queue (would allow locking out admins).
  if (request.action === 'DISABLE_USER') {
    const target = await prisma.user.findUnique({ where: { id: request.entityId }, select: { role: true } });
    if (target?.role === 'SUPER_ADMIN')
      return res.status(403).json({ error: 'A Super-Admin account cannot be disabled from the approval queue.' });
  }

  try {
    await execute(request);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Could not carry out the action' });
  }

  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: { status: 'APPROVED', reviewedById: req.user.id, reviewedAt: new Date(), reviewNote: req.body?.reviewNote || null },
    include: requestInclude,
  });

  // Record the approved action in the activity feed (a cancellation, a payment
  // edit, a cash settlement, …). orderId only when the request was about an order.
  const ACTIVITY_TYPE = { CANCEL_ORDER: 'CANCEL', EDIT_PAYMENT: 'PAYMENT_EDIT', DELETE_ORDER: 'CANCEL' };
  logActivity({
    type: ACTIVITY_TYPE[request.action] || 'CAMPAIGN_EDIT', user: req.user,
    orderId: request.entityType === 'order' ? request.entityId : undefined,
    summary: request.label || `${request.action.replace(/_/g, ' ').toLowerCase()} approved`,
    detail: 'Approved from the queue',
  });
  res.json(updated);
});

router.post('/:id/reject', requireRole('MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'This request has already been reviewed' });
  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: { status: 'REJECTED', reviewedById: req.user.id, reviewedAt: new Date(), reviewNote: req.body?.reviewNote || null },
    include: requestInclude,
  });
  res.json(updated);
});

module.exports = router;
