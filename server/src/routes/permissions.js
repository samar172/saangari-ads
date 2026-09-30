const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const { ROLES, ACTIONS, MODULES, effectiveForRole } = require('../utils/permissions');
const { loadOverrides, invalidate, matrixFor } = require('../utils/permCache');

// The whole matrix editor — super admin only.
router.get('/', requireRole(), async (req, res) => {
  const overrides = await loadOverrides();
  const matrices = {};
  for (const role of ROLES) matrices[role] = effectiveForRole(role, overrides[role]);
  res.json({ modules: MODULES, roles: ROLES, actions: ACTIONS, matrices });
});

// The caller's own resolved matrix — any authenticated user, used by the client
// to gate nav/buttons. (Also surfaced on /auth/me.)
router.get('/me', async (req, res) => {
  res.json({ role: req.user.role, matrix: await matrixFor(req.user.role) });
});

// Save one role's matrix. Body: { permissions: { module: { action: bool } } }.
// Unknown modules/actions are dropped so a bad payload can't widen access, and
// values are coerced to booleans before storing.
router.put('/:role', requireRole(), async (req, res) => {
  const role = String(req.params.role || '').toUpperCase();
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Unknown or non-editable role' });
  const incoming = req.body?.permissions || {};
  const clean = {};
  for (const m of MODULES) {
    const src = incoming[m.key];
    if (!src || typeof src !== 'object') continue;
    for (const action of m.actions) {
      if (typeof src[action] === 'boolean') {
        clean[m.key] = clean[m.key] || {};
        clean[m.key][action] = src[action];
      }
    }
  }
  await prisma.rolePermission.upsert({
    where: { role },
    create: { role, permissions: clean },
    update: { permissions: clean },
  });
  invalidate();
  const overrides = await loadOverrides();
  res.json({ role, matrix: effectiveForRole(role, overrides[role]) });
});

module.exports = router;
