const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

const PHASES = ['START', 'MID', 'END'];
const KINDS = ['GPS', 'NORMAL', 'NEWSPAPER'];
// Lines that still owe monitoring photos. Cancelled/waitlisted lines never will,
// and a stopped line's remaining phases are moot.
const MONITORED = ['TENTATIVE', 'CONFIRMED', 'LIVE', 'COMPLETED'];

const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');

async function removeFile(filePath) {
  if (!filePath) return;
  if (filePath.startsWith('http')) {
    await deleteFromCloudinary(filePath).catch(() => {});
  } else {
    const uploadDir = path.join(__dirname, '..', '..', 'uploads');
    const abs = path.join(uploadDir, path.basename(filePath));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
}

// A phase is only complete once every monitored line of the order carries all
// three proofs (GPS, normal, newspaper) for that phase.
async function phaseIsComplete(orderId, phase) {
  const lines = await prisma.booking.findMany({
    where: { orderId, status: { in: MONITORED } },
    include: { photos: { where: { phase }, select: { kind: true } } },
  });
  if (lines.length === 0) return false;
  return lines.every((l) => KINDS.every((k) => l.photos.some((p) => p.kind === k)));
}

// Ops uploads one of the three monitoring proofs for a phase, with geo-tag.
// Re-uploading the same (line, phase, kind) replaces the previous file.
router.post('/', requireRole('OPS'), upload.single('photo'), async (req, res) => {
  const { bookingId, phase, kind = 'NORMAL', latitude, longitude, remarks } = req.body || {};
  if (!req.file) return res.status(400).json({ error: 'Photo file is required' });
  if (!bookingId || !phase) return res.status(400).json({ error: 'bookingId and phase are required' });
  if (!PHASES.includes(phase)) return res.status(400).json({ error: `phase must be one of ${PHASES.join(', ')}` });
  if (!KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of ${KINDS.join(', ')}` });

  const booking = await prisma.booking.findUnique({ where: { id: Number(bookingId) } });
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const existing = await prisma.monitoringPhoto.findUnique({
    where: { bookingId_phase_kind: { bookingId: booking.id, phase, kind } },
  });

  let secureUrl;
  try {
    secureUrl = await uploadToCloudinary(req.file.buffer, 'saangri');
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    return res.status(500).json({ error: 'Failed to upload photo to Cloudinary' });
  }

  const data = {
    bookingId: booking.id, phase, kind,
    filePath: secureUrl,
    latitude: latitude ? Number(latitude) : null,
    longitude: longitude ? Number(longitude) : null,
    remarks,
    uploadedById: req.user.id,
    takenAt: new Date(),
  };

  let photo;
  if (existing) {
    photo = await prisma.monitoringPhoto.update({ where: { id: existing.id }, data });
    await removeFile(existing.filePath); // drop the superseded file once the row points elsewhere
  } else {
    photo = await prisma.monitoringPhoto.create({ data });
  }

  // First photo moves a confirmed booking to LIVE (proof-of-display gate satisfied)
  if (booking.status === 'CONFIRMED') {
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'LIVE' } });
    await prisma.site.update({ where: { id: booking.siteId }, data: { status: 'BOOKED' } });
  }

  // Only close the phase reminder once the whole order has all nine proofs
  if (await phaseIsComplete(booking.orderId, phase)) {
    await prisma.reminder.updateMany({
      where: { orderId: booking.orderId, phase, done: false },
      data: { done: true },
    });
  }

  res.status(201).json(photo);
});

router.delete('/:id', requireRole('OPS'), async (req, res) => {
  const photo = await prisma.monitoringPhoto.findUnique({ where: { id: Number(req.params.id) } });
  if (photo) {
    await removeFile(photo.filePath);
    await prisma.monitoringPhoto.delete({ where: { id: photo.id } });
  }
  res.json({ ok: true });
});

module.exports = router;
