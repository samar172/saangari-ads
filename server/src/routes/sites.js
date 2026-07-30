const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// Whitelist + type-coerce editable site fields (prevents bad writes / string->Float errors)
const NUM = ['srNo', 'qty'];
const FLOAT = ['width', 'height', 'sqft', 'printingCost', 'mountingCost', 'monthlyRate', 'dayRate', 'latitude', 'longitude'];
const STR = ['zone', 'city', 'location', 'light', 'type', 'status', 'code', 'imageUrl'];
const BOOL = ['gstOnRate', 'active'];
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
function cleanSiteData(body = {}) {
  const data = {};
  for (const k of NUM) if (body[k] !== undefined && body[k] !== '') data[k] = parseInt(body[k], 10);
  for (const k of FLOAT) if (body[k] !== undefined && body[k] !== '') data[k] = Number(body[k]);
  for (const k of STR) if (body[k] !== undefined) data[k] = body[k];
  for (const k of BOOL) if (body[k] !== undefined) data[k] = !!body[k];
  // keep sqft in sync when width/height provided but sqft omitted
  if ((body.width !== undefined || body.height !== undefined) && body.sqft === undefined && data.width != null && data.height != null) {
    data.sqft = Math.round(data.width * data.height);
  }
  return data;
}

// Statuses that actually hold a site's calendar (WAITLIST does not).
const HOLDING = ['TENTATIVE', 'CONFIRMED', 'LIVE'];

// Inventory dashboard: all sites with current/upcoming booking info.
//
// The `status` column is a single denormalized snapshot and is date-blind — a
// site whose live campaign ends next week still reads "BOOKED" today, and a
// future campaign flips it "BOOKED" now. So when the caller passes a start/end
// range we compute availability against the actual booking calendar and return
// `availableForRange` + the overlapping `rangeConflict`. Callers booking for a
// date range must trust those, not the raw `status`.
router.get('/', async (req, res) => {
  const { type, zone, status, start, end } = req.query;
  const where = { active: true };
  if (type) where.type = type;
  if (zone) where.zone = zone;
  if (status) where.status = status;

  const sites = await prisma.site.findMany({
    where,
    orderBy: { srNo: 'asc' },
    include: {
      bookings: {
        where: { status: { in: ['TENTATIVE', 'CONFIRMED', 'LIVE', 'WAITLIST'] } },
        orderBy: { startDate: 'asc' },
        include: { order: { select: { id: true, orderNo: true, client: { select: { id: true, name: true, phone: true } } } } },
      },
    },
  });

  if (start && end) {
    const s = new Date(start);
    const e = new Date(end);
    for (const site of sites) {
      // Inclusive overlap: existing.start <= new.end AND existing.end >= new.start
      const conflict = site.bookings.find(
        (b) => HOLDING.includes(b.status) && new Date(b.startDate) <= e && new Date(b.endDate) >= s,
      );
      site.availableForRange = !conflict;
      site.rangeConflict = conflict
        ? {
            status: conflict.status,
            orderNo: conflict.order?.orderNo,
            client: conflict.order?.client?.name,
            startDate: conflict.startDate,
            endDate: conflict.endDate,
          }
        : null;
    }
  }

  res.json(sites);
});

// Summary counts per category for dashboard tabs
router.get('/summary', async (req, res) => {
  const grouped = await prisma.site.groupBy({
    by: ['type', 'status'],
    where: { active: true },
    _count: { _all: true },
  });
  const summary = {};
  for (const g of grouped) {
    summary[g.type] = summary[g.type] || { total: 0 };
    summary[g.type][g.status] = g._count._all;
    summary[g.type].total += g._count._all;
  }
  res.json(summary);
});

router.get('/:id', async (req, res) => {
  const site = await prisma.site.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      bookings: {
        orderBy: { startDate: 'desc' },
        include: {
          order: { select: { id: true, orderNo: true, status: true, client: { select: { id: true, name: true, phone: true } } } },
          photos: true,
        },
      },
    },
  });
  if (!site) return res.status(404).json({ error: 'Site not found' });
  res.json(site);
});

// Create a new site (Manager / Super Admin)
router.post('/', requireRole('MANAGER'), async (req, res) => {
  const data = cleanSiteData(req.body);
  if (!data.code || !data.zone || !data.city || !data.location || !data.type)
    return res.status(400).json({ error: 'code, zone, city, location and type are required' });
  try {
    const site = await prisma.site.create({ data });
    res.status(201).json(site);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A site with this code already exists' });
    throw e;
  }
});

// Edit site data (Manager / Super Admin)
router.patch('/:id', requireRole('MANAGER'), async (req, res) => {
  const data = cleanSiteData(req.body);
  const site = await prisma.site.update({ where: { id: Number(req.params.id) }, data });
  res.json(site);
});

// Put a lightweight manual hold on a site — no quotation, no booking, just keep
// it off the market for now (e.g. a client is deciding). Only a free site can be
// held; a booked one must go through the normal booking/waitlist flow.
router.post('/:id/hold', requireRole('SALES', 'MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  const { note, until } = req.body || {};
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) return res.status(404).json({ error: 'Site not found' });
  if (['BOOKED', 'TENTATIVE'].includes(site.status))
    return res.status(400).json({ error: `${site.code} is already booked — it cannot be put on hold.` });

  const updated = await prisma.site.update({
    where: { id },
    data: { status: 'HOLD', holdNote: note ? String(note) : null, holdUntil: until ? new Date(until) : null },
  });
  res.json(updated);
});

// Release a manual hold back to AVAILABLE.
router.post('/:id/release', requireRole('SALES', 'MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) return res.status(404).json({ error: 'Site not found' });
  if (site.status !== 'HOLD') return res.status(400).json({ error: `${site.code} is not on hold.` });
  const updated = await prisma.site.update({
    where: { id },
    data: { status: 'AVAILABLE', holdNote: null, holdUntil: null },
  });
  res.json(updated);
});

// Upload / replace the site's display image (Manager / Super Admin)
router.post('/:id/image', requireRole('MANAGER'), upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image file is required' });
  
  let secureUrl;
  try {
    secureUrl = await uploadToCloudinary(req.file.buffer, 'saangri');
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    return res.status(500).json({ error: 'Failed to upload image to Cloudinary' });
  }

  const site = await prisma.site.findUnique({ where: { id: Number(req.params.id) } });
  if (site && site.imageUrl && site.imageUrl.startsWith('http')) {
    await deleteFromCloudinary(site.imageUrl).catch(() => {});
  }

  const updatedSite = await prisma.site.update({
    where: { id: Number(req.params.id) },
    data: { imageUrl: secureUrl },
  });
  res.json(updatedSite);
});

module.exports = router;
