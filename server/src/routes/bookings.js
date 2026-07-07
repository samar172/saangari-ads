const router = require('express').Router();
const dayjs = require('dayjs');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { computePrice } = require('../utils/pricing');
const { nextBookingNo } = require('../utils/counters');

const ACTIVE = ['TENTATIVE', 'CONFIRMED', 'LIVE'];

// Detect an overlapping active (non-loose) booking on the same site.
async function findConflict(siteId, startDate, endDate, excludeId) {
  return prisma.booking.findFirst({
    where: {
      siteId,
      id: excludeId ? { not: excludeId } : undefined,
      status: { in: ACTIVE },
      startDate: { lte: new Date(endDate) },
      endDate: { gte: new Date(startDate) },
    },
    include: { client: { select: { name: true } } },
  });
}

router.get('/', async (req, res) => {
  const { status, clientId, siteId, mine } = req.query;
  const where = {};
  if (status) where.status = status;
  if (clientId) where.clientId = Number(clientId);
  if (siteId) where.siteId = Number(siteId);
  // Sales sees only their own bookings unless elevated
  if (mine === 'true' || req.user.role === 'SALES') where.createdById = req.user.id;

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      site: { select: { id: true, code: true, location: true, type: true, zone: true } },
      client: { select: { id: true, name: true, phone: true, taxCategory: true } },
      createdBy: { select: { id: true, name: true } },
      photos: true,
      invoices: { select: { id: true, invoiceNo: true, status: true } },
    },
  });
  res.json(bookings);
});

router.get('/:id', async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      site: true,
      client: true,
      createdBy: { select: { id: true, name: true } },
      photos: { include: { uploadedBy: { select: { name: true } } }, orderBy: { takenAt: 'asc' } },
      invoices: true,
    },
  });
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json(booking);
});

// Live price quote (no persistence) for the booking form
router.post('/quote', async (req, res) => {
  const { siteId, startDate, endDate, discountPct, gstApplicable, dayRateOverride } = req.body || {};
  const site = await prisma.site.findUnique({ where: { id: Number(siteId) } });
  if (!site) return res.status(404).json({ error: 'Site not found' });
  try {
    const price = computePrice({
      monthlyRate: site.monthlyRate, startDate, endDate,
      discountPct, gstApplicable, dayRateOverride,
    });
    res.json({ ...price, monthlyRate: site.monthlyRate });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const {
    siteId, clientId, type = 'REGULAR', startDate, endDate,
    discountPct = 0, discountRemarks, gstApplicable = false, dayRateOverride, notes,
  } = req.body || {};

  if (!siteId || !clientId || !startDate || !endDate)
    return res.status(400).json({ error: 'siteId, clientId, startDate, endDate are required' });

  const site = await prisma.site.findUnique({ where: { id: Number(siteId) } });
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const conflict = await findConflict(Number(siteId), startDate, endDate);
  // Regular bookings are blocked by conflicts; loose bookings are allowed but parked as WAITLIST.
  if (conflict && type === 'REGULAR')
    return res.status(409).json({ error: `Site already booked for these dates by ${conflict.client.name}. Use a Loose booking to waitlist.` });

  let price;
  try {
    price = computePrice({ monthlyRate: site.monthlyRate, startDate, endDate, discountPct, gstApplicable, dayRateOverride });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const status = conflict && type === 'LOOSE' ? 'WAITLIST' : 'TENTATIVE';
  const bookingNo = await nextBookingNo();

  const booking = await prisma.booking.create({
    data: {
      bookingNo, siteId: Number(siteId), clientId: Number(clientId), createdById: req.user.id,
      type, status, startDate: new Date(startDate), endDate: new Date(endDate),
      days: price.days, dayRate: price.dayRate, subtotal: price.subtotal,
      discountPct: Number(discountPct) || 0, discountRemarks,
      gstApplicable: !!gstApplicable, gstAmount: price.gstAmount, totalAmount: price.totalAmount, notes,
    },
    include: { site: true, client: true },
  });

  // Reflect the tentative hold on the site tile
  if (status === 'TENTATIVE') {
    await prisma.site.update({ where: { id: Number(siteId) }, data: { status: 'TENTATIVE' } });
  }

  res.status(201).json(booking);
});

// Status transitions: confirm / hold / cancel / release-waitlist / complete
router.post('/:id/status', requireRole('SALES', 'MANAGER'), async (req, res) => {
  const { status } = req.body || {};
  const id = Number(req.params.id);
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const siteStatusFor = {
    CONFIRMED: 'BOOKED', LIVE: 'BOOKED', TENTATIVE: 'TENTATIVE',
    CANCELLED: 'AVAILABLE', COMPLETED: 'AVAILABLE',
  };

  const updated = await prisma.booking.update({ where: { id }, data: { status } });

  if (siteStatusFor[status]) {
    await prisma.site.update({ where: { id: booking.siteId }, data: { status: siteStatusFor[status] } });
  }
  // Promote a waitlisted (loose) booking into the active slot
  if (status === 'CONFIRMED' && booking.status === 'WAITLIST') {
    await prisma.booking.update({ where: { id }, data: { status: 'CONFIRMED' } });
  }
  res.json(updated);
});

module.exports = router;
