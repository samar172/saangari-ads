const router = require('express').Router();
const { requirePermission } = require('../middleware/auth');
const { listPrintingIssues, countPrintingIssues, printingSection, requestPrintCorrections } = require('../utils/printingRecon');

// Accounts → Reconciliation. Printing: campaigns whose partner cost / partner
// don't add up, fixed from a dialog (cost side only) — Manager/Super Admin
// directly, everyone else through a PRINT_CORRECTION approval.
router.get('/printing', requirePermission('accounts', 'view'), async (req, res) => {
  res.json(await listPrintingIssues({ companyId: req.query.companyId }));
});

router.get('/printing/count', requirePermission('accounts', 'view'), async (req, res) => {
  res.json(await countPrintingIssues({ companyId: req.query.companyId }));
});

router.get('/printing/:orderId', requirePermission('accounts', 'view'), async (req, res) => {
  const s = await printingSection(Number(req.params.orderId));
  if (!s) return res.status(404).json({ error: 'Campaign not found' });
  res.json(s);
});

// body: { items: [{ orderId, partnerId?, material?, printCost?, markOk? }], reason }
router.post('/printing/fix', requirePermission('accounts', 'view'), async (req, res) => {
  try {
    const r = await requestPrintCorrections({ items: req.body?.items, reason: req.body?.reason, user: req.user });
    res.status(r.pending ? 202 : 200).json(r);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Could not save the correction' });
  }
});

module.exports = router;
