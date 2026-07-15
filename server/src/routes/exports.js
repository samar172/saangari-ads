const router = require('express').Router();
const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
const INR = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN');

const STATUS_COLOR = {
  AVAILABLE: '#059669', TENTATIVE: '#d97706', BOOKED: '#ef4444', MAINTENANCE: '#64748b',
};

// Availability PDF — all sites with status, current client, dates
router.get('/availability/pdf', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { type } = req.query;
  const sites = await prisma.site.findMany({
    where: { active: true, ...(type ? { type } : {}) },
    orderBy: { srNo: 'asc' },
    include: {
      bookings: {
        where: { status: { in: ['CONFIRMED', 'LIVE', 'TENTATIVE'] } },
        include: { order: { include: { client: { select: { name: true } } } } },
        orderBy: { startDate: 'desc' }, take: 1,
      },
    },
  });

  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="Site-Availability.pdf"');
  doc.pipe(res);

  const logoPath = path.join(__dirname, '../assets/logo.png');
  try {
    doc.image(logoPath, 30, 25, { height: 25 });
    doc.fontSize(18).fillColor('#ef4444').text('SITE AVAILABILITY', 30, 55);
  } catch (e) {
    doc.fontSize(18).fillColor('#ef4444').text('SITE AVAILABILITY', 30, 30);
  }
  doc.fontSize(9).fillColor('#555').text(`Generated on ${new Date().toLocaleDateString('en-IN')} · ${sites.length} sites`);
  doc.moveDown();

  // Table header
  const cols = { code: 30, zone: 80, city: 130, location: 200, type: 420, size: 490, rate: 550, status: 630, client: 700 };
  let y = doc.y + 4;

  const drawHeader = () => {
    doc.rect(30, y - 2, 780, 16).fill('#ef4444');
    doc.fillColor('#fff').fontSize(7.5)
      .text('Code', cols.code, y).text('Zone', cols.zone, y).text('City', cols.city, y)
      .text('Location', cols.location, y).text('Type', cols.type, y).text('Size', cols.size, y)
      .text('Rate/mo', cols.rate, y).text('Status', cols.status, y).text('Client / Period', cols.client, y);
    y += 18;
  };
  drawHeader();

  doc.font('Helvetica');
  for (const s of sites) {
    if (y > 520) { doc.addPage({ layout: 'landscape' }); y = 40; drawHeader(); }
    const bk = s.bookings[0];
    const period = bk ? `${new Date(bk.startDate).toLocaleDateString('en-IN')}–${new Date(bk.endDate).toLocaleDateString('en-IN')}` : '';
    const clientName = bk?.order?.client?.name || '';

    // Alternate row bg
    if (sites.indexOf(s) % 2 === 1) doc.rect(30, y - 1, 780, 14).fill('#f8fafc');
    doc.fillColor('#333').fontSize(7)
      .text(s.code, cols.code, y, { width: 45 })
      .text(s.zone, cols.zone, y, { width: 45 })
      .text(s.city, cols.city, y, { width: 65 })
      .text(s.location, cols.location, y, { width: 215 })
      .text(s.type, cols.type, y, { width: 60 })
      .text(`${s.width}x${s.height}`, cols.size, y, { width: 55 })
      .text(INR(s.monthlyRate), cols.rate, y, { width: 70 });
    // Status with color
    doc.fillColor(STATUS_COLOR[s.status] || '#333').text(s.status, cols.status, y, { width: 60 });
    doc.fillColor('#555').fontSize(6.5).text(clientName ? `${clientName}\n${period}` : '', cols.client, y, { width: 110 });
    y += Math.max(14, clientName ? 20 : 14);
  }

  doc.font('Helvetica').fontSize(7).fillColor('#888').text('Saangari Advertising · Bikaner, Rajasthan', 30, 560, { align: 'center', width: 780 });
  doc.end();
});

// Excel export of inventory (optionally filtered by type)
router.get('/inventory/excel', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { type } = req.query;
  const sites = await prisma.site.findMany({
    where: { active: true, ...(type ? { type } : {}) },
    orderBy: { srNo: 'asc' },
    include: {
      bookings: {
        where: { status: { in: ['CONFIRMED', 'LIVE'] } },
        include: { order: { include: { client: true } } },
        orderBy: { startDate: 'desc' }, take: 1,
      },
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
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  for (const s of sites) {
    ws.addRow({
      code: s.code, zone: s.zone, city: s.city, location: s.location, type: s.type,
      size: `${s.width}x${s.height}`, rate: s.monthlyRate, status: s.status,
      client: s.bookings[0]?.order?.client?.name || '',
    });
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// PPTX client deck: one slide per booked site with photos + details
router.get('/client/:clientId/pptx', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: Number(req.params.clientId) },
    include: {
      orders: { include: { company: true, items: { include: { site: true, photos: true } } }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const lines = client.orders.flatMap((o) => o.items.map((it) => ({ ...it, order: o })));
  const companyName = client.orders[0]?.company?.legalName || client.orders[0]?.company?.name || 'SAANGRI ADVERTISING';

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  const cover = pptx.addSlide();
  const logoPath = path.join(__dirname, '../assets/logo.png');
  cover.background = { color: 'EF4444' };
  try {
    if (fs.existsSync(logoPath)) {
      cover.addImage({ path: logoPath, x: 5.66, y: 1.0, w: 2, h: 1.2 });
    }
  } catch (e) {}
  cover.addText(companyName.toUpperCase(), { x: 0.5, y: 2.4, w: 12.3, h: 1, fontSize: 40, bold: true, color: 'FFFFFF', align: 'center' });
  cover.addText(`Campaign Proposal — ${client.name}`, { x: 0.5, y: 3.5, w: 12.3, h: 0.7, fontSize: 22, color: 'FFFFFF', align: 'center' });
  cover.addText(`${lines.length} site(s) · Bikaner`, { x: 0.5, y: 4.3, w: 12.3, h: 0.5, fontSize: 14, color: 'FFFFFF', align: 'center' });

  for (const it of lines) {
    const s = it.site;
    const slide = pptx.addSlide();
    try {
      if (fs.existsSync(logoPath)) {
        slide.addImage({ path: logoPath, x: 11.5, y: 0.2, w: 1.5, h: 0.8 });
      }
    } catch (e) {}
    slide.addText(`${s.code} — ${s.type}`, { x: 0.4, y: 0.3, w: 12.5, h: 0.6, fontSize: 24, bold: true, color: 'EF4444' });
    slide.addText(s.location, { x: 0.4, y: 0.95, w: 12.5, h: 0.5, fontSize: 13, color: '555555' });

    const details = [
      ['Zone', s.zone], ['Size', `${s.width} x ${s.height} ft (${s.sqft} sq.ft)`],
      ['Monthly Rate', `Rs ${s.monthlyRate.toLocaleString('en-IN')}`],
      ['Period', `${new Date(it.startDate).toLocaleDateString('en-IN')} - ${new Date(it.endDate).toLocaleDateString('en-IN')}`],
      ['Days', String(it.days)], ['Line Total', `Rs ${it.subtotal.toLocaleString('en-IN')}`],
      ['Order', it.order.orderNo],
      ['Coordinates', s.latitude ? `${s.latitude}, ${s.longitude}` : 'N/A'],
    ];
    slide.addTable(
      details.map(([k, v]) => [
        { text: k, options: { bold: true, fill: 'FEE2E2', color: 'EF4444' } },
        { text: v, options: {} },
      ]),
      { x: 0.4, y: 1.6, w: 5.5, colW: [2, 3.5], fontSize: 12, border: { pt: 0.5, color: 'DDDDDD' }, rowH: 0.42 }
    );

    const photos = it.photos.slice(0, 2);
    photos.forEach((p, i) => {
      if (p.filePath && p.filePath.startsWith('http')) {
        try {
          slide.addImage({ path: p.filePath, x: 6.2, y: 1.6 + i * 2.7, w: 6.5, h: 2.5 });
          slide.addText(`${p.phase} · ${new Date(p.takenAt).toLocaleDateString('en-IN')}`, { x: 6.2, y: 1.6 + i * 2.7 + 2.5, w: 6.5, h: 0.3, fontSize: 9, color: '888888' });
        } catch (e) {
          slide.addText('[ Site photo pending ]', { x: 6.2, y: 1.6 + i * 2.7, w: 6.5, h: 2.5, fill: 'F3F4F6', align: 'center', valign: 'middle', color: 'AAAAAA' });
        }
      } else {
        const abs = path.join(uploadDir, path.basename(p.filePath || ''));
        if (fs.existsSync(abs)) {
          slide.addImage({ path: abs, x: 6.2, y: 1.6 + i * 2.7, w: 6.5, h: 2.5 });
          slide.addText(`${p.phase} · ${new Date(p.takenAt).toLocaleDateString('en-IN')}`, { x: 6.2, y: 1.6 + i * 2.7 + 2.5, w: 6.5, h: 0.3, fontSize: 9, color: '888888' });
        } else {
          slide.addText('[ Site photo pending ]', { x: 6.2, y: 1.6 + i * 2.7, w: 6.5, h: 2.5, fill: 'F3F4F6', align: 'center', valign: 'middle', color: 'AAAAAA' });
        }
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
