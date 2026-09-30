// Loads per-role permission overrides from the DB and resolves them against the
// code DEFAULTS. Overrides are cached in-process (they change rarely, only when
// the super admin saves the matrix) with a short TTL as a safety net and an
// explicit invalidate() on write.
const prisma = require('../db');
const { effectiveForRole, DEFAULTS } = require('./permissions');

const TTL_MS = 15 * 1000;
let cache = null; // { [role]: overrideJson }
let cachedAt = 0;

async function loadOverrides() {
  const now = Date.now();
  if (cache && now - cachedAt < TTL_MS) return cache;
  const rows = await prisma.rolePermission.findMany({ select: { role: true, permissions: true } });
  const map = {};
  for (const r of rows) map[r.role] = r.permissions || {};
  cache = map;
  cachedAt = now;
  return cache;
}

function invalidate() { cache = null; cachedAt = 0; }

// Full resolved matrix for one role ({ module: { action: bool } }). SUPER_ADMIN
// gets an all-true matrix so the frontend can treat everyone uniformly.
async function matrixFor(role) {
  if (role === 'SUPER_ADMIN') {
    const all = {};
    for (const m of Object.keys(DEFAULTS.SALES || {})) {
      all[m] = {};
      for (const a of Object.keys(DEFAULTS.SALES[m])) all[m][a] = true;
    }
    return all;
  }
  const overrides = await loadOverrides();
  return effectiveForRole(role, overrides[role]);
}

module.exports = { loadOverrides, invalidate, matrixFor };
