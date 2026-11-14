const router = require('express').Router();
const prisma = require('../db');
const multer = require('multer');
const { requireRole, requirePermission } = require('../middleware/auth');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const { imageInfo } = require('../utils/billHeader');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// List active companies (for the sidebar dropdown)
router.get('/', async (req, res) => {
  const companies = await prisma.company.findMany({
    where: { active: true },
    orderBy: { id: 'asc' },
  });
  res.json(companies);
});

const { sanitizeSettings } = require('../utils/companySettings');

function cleanCompanyData(body) {
  const data = {};
  const strFields = ['name', 'legalName', 'gstin', 'pan', 'address', 'phone', 'email', 'termsAndConditions', 'brandColor', 'bankName', 'bankAccountNo', 'bankBranchIfsc'];
  const boolFields = ['gstMandatory', 'gstHidden', 'active'];
  
  for (const f of strFields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  for (const f of boolFields) {
    if (body[f] !== undefined) data[f] = !!body[f];
  }
  // Bank accounts a bill can show; each keeps a stable id so a client's
  // "last used" account still resolves after edits.
  if (Array.isArray(body.bankAccounts)) {
    data.bankAccounts = body.bankAccounts
      .map((a, i) => ({
        id: String(a.id || `b${Date.now().toString(36)}${i}`),
        label: String(a.label || a.bankName || '').trim(),
        bankName: String(a.bankName || '').trim(),
        accountNo: String(a.accountNo || '').trim(),
        branchIfsc: String(a.branchIfsc || '').trim(),
      }))
      .filter((a) => a.bankName && a.accountNo);
  }
  // Rates & defaults (printing/mounting per media type, saved charges, booking
  // and quotation defaults) — cleaned to a fixed shape.
  if (body.settings && typeof body.settings === 'object') data.settings = sanitizeSettings(body.settings);
  return data;
}

// Create new company
router.post('/', requirePermission('settings', 'add'), async (req, res) => {
  const { code, ...rest } = req.body;
  if (!code || !rest.name) return res.status(400).json({ error: 'Code and Name are required' });
  
  try {
    const data = cleanCompanyData(rest);
    data.code = code;
    const company = await prisma.company.create({ data });
    res.status(201).json(company);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Company code must be unique' });
    throw e;
  }
});

// Update company
router.patch('/:id', requirePermission('settings', 'edit'), async (req, res) => {
  const data = cleanCompanyData(req.body);
  const company = await prisma.company.update({
    where: { id: Number(req.params.id) },
    data,
  });
  res.json(company);
});

// Bill header image for this business (printed at the top of its bills).
router.post('/:id/bill-header', requirePermission('settings', 'edit'), upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image' });
  if (!imageInfo(req.file.buffer)) return res.status(400).json({ error: 'Use a PNG or JPG image' });
  const company = await prisma.company.findUnique({ where: { id: Number(req.params.id) } });
  if (!company) return res.status(404).json({ error: 'Business not found' });
  let url;
  try { url = await uploadToCloudinary(req.file.buffer, 'saangri/bill-headers'); }
  catch (e) { console.error('Cloudinary upload error:', e); return res.status(500).json({ error: 'Failed to upload the image' }); }
  const updated = await prisma.company.update({ where: { id: company.id }, data: { billHeaderUrl: url } });
  if (company.billHeaderUrl) deleteFromCloudinary(company.billHeaderUrl).catch(() => {});
  res.json(updated);
});

// Remove the uploaded header (the GST business falls back to the letterhead).
router.delete('/:id/bill-header', requirePermission('settings', 'edit'), async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: Number(req.params.id) } });
  if (!company) return res.status(404).json({ error: 'Business not found' });
  const updated = await prisma.company.update({ where: { id: company.id }, data: { billHeaderUrl: null } });
  if (company.billHeaderUrl) deleteFromCloudinary(company.billHeaderUrl).catch(() => {});
  res.json(updated);
});

module.exports = router;
