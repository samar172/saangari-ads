const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

// List active companies (for the sidebar dropdown)
router.get('/', async (req, res) => {
  const companies = await prisma.company.findMany({
    where: { active: true },
    orderBy: { id: 'asc' },
  });
  res.json(companies);
});

function cleanCompanyData(body) {
  const data = {};
  const strFields = ['name', 'legalName', 'gstin', 'pan', 'address', 'phone', 'email', 'termsAndConditions'];
  const boolFields = ['gstMandatory', 'gstHidden', 'active'];
  
  for (const f of strFields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  for (const f of boolFields) {
    if (body[f] !== undefined) data[f] = !!body[f];
  }
  return data;
}

// Create new company
router.post('/', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
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
router.patch('/:id', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  const data = cleanCompanyData(req.body);
  const company = await prisma.company.update({
    where: { id: Number(req.params.id) },
    data,
  });
  res.json(company);
});

module.exports = router;
