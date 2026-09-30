const jwt = require('jsonwebtoken');
const prisma = require('../db');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Re-load the user every request so a disabled account is locked out and a
  // role change takes effect immediately, rather than living in a stale 12h token.
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    if (!user || !user.active) return res.status(401).json({ error: 'Account is inactive or no longer exists' });
    req.user = user;
    next();
  } catch {
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

// requireRole('MANAGER', 'SUPER_ADMIN') — SUPER_ADMIN always passes
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'SUPER_ADMIN' || roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

// requirePermission('campaigns', 'add') — RBAC gate. SUPER_ADMIN always passes;
// every other role is checked against the resolved (defaults + overrides) matrix.
// This is the editable successor to requireRole for resource routes.
const { matrixFor } = require('../utils/permCache');
function requirePermission(module, action) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'SUPER_ADMIN') return next();
    try {
      const matrix = await matrixFor(req.user.role);
      if (matrix?.[module]?.[action]) return next();
      return res.status(403).json({ error: 'Insufficient permissions' });
    } catch (e) {
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

module.exports = { authenticate, requireRole, requirePermission };
