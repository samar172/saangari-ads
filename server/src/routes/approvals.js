const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const { recomputeOrderTotals } = require('../utils/pricing');

const ACTIONS = ['DELETE_ORDER', 'DELETE_INVOICE', 'SETTLE_CASH', 'DISABLE_USER', 'OTHER'];
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
      // Switch a GST campaign to Non-GST (cash) at billing time and re-price it.
      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
        if (!order) throw new Error('Order no longer exists');
        const patched = { ...order, taxCategory: 'NON_GST', interState: false };
        const totals = recomputeOrderTotals(patched, order.items);
        await tx.order.update({ where: { id }, data: { taxCategory: 'NON_GST', interState: false, ...totals } });
      });
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

router.post('/:id/approve', requireRole('MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'This request has already been reviewed' });

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
