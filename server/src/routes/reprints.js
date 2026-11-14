const router = require('express').Router();
const prisma = require('../db');
const { requirePermission } = require('../middleware/auth');
const { reprintSetup, createReprint, setReprintStatus } = require('../utils/reprints');
const { createReprintInvoice } = require('../utils/invoicing');

// Reprints on a campaign. Client-paid ones go straight through (logged);
// free ones need Manager/Super Admin approval unless one of them raises it.
const send = (res, e, fallback) => res.status(e.status || 500).json({ error: e.message || fallback });

router.get('/order/:orderId', requirePermission('campaigns', 'view'), async (req, res) => {
  res.json(await prisma.reprint.findMany({ where: { orderId: Number(req.params.orderId) }, orderBy: { id: 'desc' }, include: { printingPartner: { select: { id: true, name: true } } } }));
});

router.get('/order/:orderId/setup', requirePermission('campaigns', 'edit'), async (req, res) => {
  const s = await reprintSetup(req.params.orderId);
  if (!s) return res.status(404).json({ error: 'Campaign not found' });
  res.json(s);
});

router.post('/order/:orderId', requirePermission('campaigns', 'edit'), async (req, res) => {
  try { res.status(201).json(await createReprint({ orderId: req.params.orderId, body: req.body || {}, user: req.user })); } catch (e) { send(res, e, 'Could not save the reprint'); }
});

// { status: PRINTED | MOUNTED | CANCELLED, note? }
router.post('/:id/status', requirePermission('campaigns', 'edit'), async (req, res) => {
  try { res.json(await setReprintStatus({ reprintId: req.params.id, status: String(req.body?.status || ''), note: req.body?.note, user: req.user })); } catch (e) { send(res, e, 'Could not update the reprint'); }
});

// Bill a client-paid reprint on its own now (e.g. after its bill was cancelled).
router.post('/:id/bill', requirePermission('invoices', 'add'), async (req, res) => {
  try { res.status(201).json(await createReprintInvoice({ reprintId: req.params.id, user: req.user, dueDate: req.body?.dueDate })); } catch (e) { send(res, e, 'Could not raise the bill'); }
});

module.exports = router;
