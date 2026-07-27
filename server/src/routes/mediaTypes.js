const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

// Site media types the admin maintains (unipole, gantry, kiosk…). The Inventory
// tabs only show active ones; the admin page asks for all. Each carries a live
// site count so the UI can warn before deactivating a type still in use.
router.get('/', async (req, res) => {
  const where = req.query.all === 'true' ? {} : { active: true };
  const types = await prisma.mediaType.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
  // Site.type is a plain string keyed by code, so count per code separately.
  const counts = await prisma.site.groupBy({ by: ['type'], _count: { _all: true } });
  const countByCode = Object.fromEntries(counts.map((c) => [c.type, c._count._all]));
  res.json(types.map((t) => ({ ...t, siteCount: countByCode[t.code] || 0 })));
});

router.post('/', requireRole('MANAGER'), async (req, res) => {
  const { code, label, sortOrder } = req.body || {};
  const cleanLabel = String(label || '').trim();
  // The code is what sites store; default it from the label when not supplied.
  const cleanCode = String(code || cleanLabel).trim().toUpperCase().replace(/\s+/g, '_');
  if (!cleanCode || !cleanLabel) return res.status(400).json({ error: 'A label is required' });
  try {
    const type = await prisma.mediaType.create({
      data: { code: cleanCode, label: cleanLabel, sortOrder: Number(sortOrder) || 0 },
    });
    res.status(201).json(type);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'That media type already exists' });
    throw e;
  }
});

// Only the label / order / active flag are editable — the code is what Site.type
// stores, so renaming it would orphan existing sites.
router.patch('/:id', requireRole('MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid media type id' });
  const { label, sortOrder, active } = req.body || {};
  const data = {};
  if (label !== undefined) data.label = String(label).trim();
  if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;
  if (active !== undefined) data.active = !!active;
  const type = await prisma.mediaType.update({ where: { id }, data });
  res.json(type);
});

// Hard-delete only if no site uses the code; otherwise deactivate so existing
// sites keep a valid type.
router.delete('/:id', requireRole('MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid media type id' });
  const type = await prisma.mediaType.findUnique({ where: { id } });
  if (!type) return res.status(404).json({ error: 'Media type not found' });
  const used = await prisma.site.count({ where: { type: type.code } });
  if (used > 0) {
    const updated = await prisma.mediaType.update({ where: { id }, data: { active: false } });
    return res.json({ ...updated, deactivated: true, usedBy: used });
  }
  await prisma.mediaType.delete({ where: { id } });
  res.json({ ok: true, deleted: true });
});

module.exports = router;
