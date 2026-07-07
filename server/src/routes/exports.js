const router = require('express').Router();
const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
const path = require('path');
const fs = require('fs');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');

// Excel export of inventory (optionally filtered by type)
router.get('/inventory/excel', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { type } = req.query;
  const sites = await prisma.site.findMany({
    where: { active: true, ...(type ? { type } : {}) },
    orderBy: { srNo: 'asc' },
    include: {
      bookings: { where: { status: { in: ['CONFIRMED', 'LIVE'] } }, include: { client: true }, orderBy: { startDate: 'desc' }, take: 1 },
    },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Inventory');
  ws.columns = [
    { header: 'Code', key: 'code', width: 10 },
    { header: 'Zone', key: 'zone', width: 10 },
    { header: 'City', key: 'city', width: 12 },
    { header: 'Location', key: 'location', width: 50 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Size', key: 'size', width: 12 },
    { header: 'Monthly Rate', key: 'rate', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Current Client', key: 'client', width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  for (const s of sites) {
    ws.addRow({
      code: s.code, zone: s.zone, city: s.city, location: s.location, type: s.type,
      size: `${s.width}x${s.height}`, rate: s.monthlyRate, status: s.status,
      client: s.bookings[0]?.client?.name || '',
    });
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// PPTX client deck: one slide per booking with site photos + details
router.get('/client/:clientId/pptx', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: Number(req.params.clientId) },
    include: {
      bookings: { include: { site: true, photos: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  const cover = pptx.addSlide();
  cover.background = { color: '1E3A8A' };
  cover.addText('SAANGRI ADVERTISING', { x: 0.5, y: 2.4, w: 12.3, h: 1, fontSize: 40, bold: true, color: 'FFFFFF', align: 'center' });
  cover.addText(`Campaign Proposal — ${client.name}`, { x: 0.5, y: 3.5, w: 12.3, h: 0.7, fontSize: 22, color: 'F59E0B', align: 'center' });
  cover.addText(`${client.bookings.length} site(s) · Bikaner`, { x: 0.5, y: 4.3, w: 12.3, h: 0.5, fontSize: 14, color: 'FFFFFF', align: 'center' });

  for (const bk of client.bookings) {
    const s = bk.site;
    const slide = pptx.addSlide();
    slide.addText(`${s.code} — ${s.type}`, { x: 0.4, y: 0.3, w: 12.5, h: 0.6, fontSize: 24, bold: true, color: '1E3A8A' });
    slide.addText(s.location, { x: 0.4, y: 0.95, w: 12.5, h: 0.5, fontSize: 13, color: '555555' });

    const details = [
      ['Zone', s.zone], ['Size', `${s.width} x ${s.height} ft (${s.sqft} sq.ft)`],
      ['Monthly Rate', `Rs ${s.monthlyRate.toLocaleString('en-IN')}`],
      ['Period', `${new Date(bk.startDate).toLocaleDateString('en-IN')} - ${new Date(bk.endDate).toLocaleDateString('en-IN')}`],
      ['Days', String(bk.days)], ['Total', `Rs ${bk.totalAmount.toLocaleString('en-IN')}`],
      ['Coordinates', s.latitude ? `${s.latitude}, ${s.longitude}` : 'N/A'],
    ];
    slide.addTable(
      details.map(([k, v]) => [
        { text: k, options: { bold: true, fill: 'EEF2FF', color: '1E3A8A' } },
        { text: v, options: {} },
      ]),
      { x: 0.4, y: 1.6, w: 5.5, colW: [2, 3.5], fontSize: 12, border: { pt: 0.5, color: 'DDDDDD' }, rowH: 0.45 }
    );

    // Attach up to 2 monitoring photos if the files exist
    const photos = bk.photos.slice(0, 2);
    photos.forEach((p, i) => {
      const abs = path.join(uploadDir, path.basename(p.filePath));
      if (fs.existsSync(abs)) {
        slide.addImage({ path: abs, x: 6.2 + (i % 1) * 0, y: 1.6 + i * 2.7, w: 6.5, h: 2.5 });
        slide.addText(`${p.phase} · ${new Date(p.takenAt).toLocaleDateString('en-IN')}`, { x: 6.2, y: 1.6 + i * 2.7 + 2.5, w: 6.5, h: 0.3, fontSize: 9, color: '888888' });
      } else {
        slide.addText('[ Site photo pending ]', { x: 6.2, y: 1.6 + i * 2.7, w: 6.5, h: 2.5, fill: 'F3F4F6', align: 'center', valign: 'middle', color: 'AAAAAA' });
      }
    });
    if (photos.length === 0) {
      slide.addText('[ Monitoring photos pending ]', { x: 6.2, y: 1.6, w: 6.5, h: 2.5, fill: 'F3F4F6', align: 'center', valign: 'middle', color: 'AAAAAA' });
    }
  }

  const buffer = await pptx.write('nodebuffer');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="${client.name.replace(/\s+/g, '_')}_proposal.pptx"`);
  res.end(buffer);
});

module.exports = router;
