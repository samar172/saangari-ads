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
const FLOAT = ['width', 'height', 'sqft', 'printingCost', 'mountingCost', 'monthlyRate', 'latitude', 'longitude'];
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

// Inventory dashboard: all sites with current/upcoming booking info
router.get('/', async (req, res) => {
  const { type, zone, status } = req.query;
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
