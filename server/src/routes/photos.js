const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `photo-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// Ops uploads monitoring photo for a phase (START / MID / END), with geo-tag
router.post('/', requireRole('OPS'), upload.single('photo'), async (req, res) => {
  const { bookingId, phase, latitude, longitude, remarks } = req.body || {};
  if (!req.file) return res.status(400).json({ error: 'Photo file is required' });
  if (!bookingId || !phase) return res.status(400).json({ error: 'bookingId and phase are required' });

  const booking = await prisma.booking.findUnique({ where: { id: Number(bookingId) } });
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const photo = await prisma.monitoringPhoto.create({
    data: {
      bookingId: Number(bookingId),
      phase,
      filePath: `/uploads/${req.file.filename}`,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      remarks,
      uploadedById: req.user.id,
    },
  });

  // First photo moves a confirmed booking to LIVE (proof-of-display gate satisfied)
  if (booking.status === 'CONFIRMED') {
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'LIVE' } });
    await prisma.site.update({ where: { id: booking.siteId }, data: { status: 'BOOKED' } });
  }

  res.status(201).json(photo);
});

router.delete('/:id', requireRole('OPS'), async (req, res) => {
  const photo = await prisma.monitoringPhoto.findUnique({ where: { id: Number(req.params.id) } });
  if (photo) {
    const abs = path.join(uploadDir, path.basename(photo.filePath));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    await prisma.monitoringPhoto.delete({ where: { id: photo.id } });
  }
  res.json({ ok: true });
});

module.exports = router;
