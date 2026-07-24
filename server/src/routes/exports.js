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
const BRAND = '#9E2015'; // Saangari red — matches the logo.png background exactly

const STATUS_COLOR = {
  AVAILABLE: '#059669', TENTATIVE: '#d97706', BOOKED: '#ef4444', MAINTENANCE: '#64748b',
};

// Resolve a stored image path to something PDFKit/pptx can read: a full URL
// (Cloudinary) is used as-is, otherwise it's a filename under /uploads.
function resolveImage(filePath) {
  if (!filePath) return null;
  if (/^https?:\/\//.test(filePath)) return filePath;
  const abs = path.join(uploadDir, path.basename(filePath));
  return fs.existsSync(abs) ? abs : null;
}

// Best photo to represent a site in a catalogue: its own image, else the most
// recent monitoring photo from any booking on it.
function sitePhoto(site) {
  if (site.imageUrl) return resolveImage(site.imageUrl);
  const photos = (site.bookings || []).flatMap((b) => b.photos || []);
  const latest = photos.sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt))[0];
  return latest ? resolveImage(latest.filePath) : null;
}

// Availability PDF — a visual catalogue: a red cover, then one landscape page
// per site (photo + name + dimensions + coordinates), matching the printed deck.
router.get('/availability/pdf', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { type } = req.query;
  const sites = await prisma.site.findMany({
    where: { active: true, ...(type ? { type } : {}) },
    orderBy: { srNo: 'asc' },
    include: {
      bookings: {
        where: { status: { in: ['CONFIRMED', 'LIVE', 'TENTATIVE'] } },
        include: { photos: true },
        orderBy: { startDate: 'desc' }, take: 1,
      },
    },
  });

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="Site-Availability.pdf"');
  doc.pipe(res);

  const W = doc.page.width;   // 842
  const H = doc.page.height;  // 595
  const logoPath = path.join(__dirname, '../assets/logo.png');

  // ── Cover: full red page with the centred logo ──
  doc.rect(0, 0, W, H).fill(BRAND);
  try {
    const lw = 360, lh = 267; // logo.png aspect ~1914x1418
    doc.image(logoPath, (W - lw) / 2, (H - lh) / 2 - 20, { width: lw });
  } catch (e) {
    doc.fontSize(48).fillColor('#fff').text('SAANGARI', 0, H / 2 - 40, { align: 'center', width: W });
  }
  doc.fontSize(12).fillColor('#ffffff').text(
    `Site Availability${type ? ` · ${type}` : ''}  ·  ${new Date().toLocaleDateString('en-IN')}`,
    0, H - 60, { align: 'center', width: W },
  );

  // ── One page per site ──
  for (const s of sites) {
    doc.addPage({ layout: 'landscape', margin: 0 });
    doc.rect(0, 0, W, H).fill(BRAND);

    // White-framed photo panel
    const pad = 60, panelW = W - pad * 2, imgH = 300, imgY = 40;
    doc.rect(pad - 6, imgY - 6, panelW + 12, imgH + 12).fill('#ffffff');
    const img = sitePhoto(s);
    if (img) {
      try { doc.image(img, pad, imgY, { fit: [panelW, imgH], align: 'center', valign: 'center' }); }
      catch (e) { doc.rect(pad, imgY, panelW, imgH).fill('#f3f4f6'); }
    } else {
      doc.rect(pad, imgY, panelW, imgH).fill('#f3f4f6');
      doc.fillColor('#9ca3af').fontSize(14).text('Photo pending', pad, imgY + imgH / 2 - 8, { align: 'center', width: panelW });
    }

    // Caption block
    const title = `${s.srNo ? s.srNo + ' - ' : ''}${(s.location || s.code).toUpperCase()}`;
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
      .text(title, pad, imgY + imgH + 26, { align: 'center', width: panelW });
    doc.font('Helvetica').fontSize(13).fillColor('#ffe9e9')
      .text(`Width: ${s.width} ft | Height: ${s.height} ft | Total Area: ${s.sqft || Math.round(s.width * s.height)} sq.ft`,
        pad, doc.y + 8, { align: 'center', width: panelW });
    if (s.latitude && s.longitude) {
      doc.text(`Latitude: ${s.latitude} | Longitude: ${s.longitude}`, pad, doc.y + 2, { align: 'center', width: panelW });
    }
    doc.fontSize(10).fillColor('#ffd0d0')
      .text(`${s.code} · ${s.type} · ${s.zone}${s.city ? ', ' + s.city : ''}`, pad, doc.y + 6, { align: 'center', width: panelW });
  }

  if (sites.length === 0) {
    doc.addPage({ layout: 'landscape', margin: 0 });
    doc.rect(0, 0, W, H).fill('#ffffff');
    doc.fillColor('#888').fontSize(16).text('No sites to show for this filter.', 0, H / 2, { align: 'center', width: W });
  }

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
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9E2015' } };
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

// Stream a styled workbook: brand-red header row, then send with a filename.
async function sendWorkbook(res, filename, sheetName, columns, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns;
  const head = ws.getRow(1);
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9E2015' } };
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rows.forEach((r) => ws.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

// Campaigns / quotations export. `status` narrows to one; `excludeStatus` drops
// some (the Campaigns tab passes QUOTATION here). Mirrors the on-screen list.
router.get('/orders/excel', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { status, excludeStatus, companyId } = req.query;
  const where = {};
  if (status) where.status = status;
  else if (excludeStatus) where.status = { notIn: String(excludeStatus).split(',') };
  if (companyId) where.companyId = Number(companyId);

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { name: true } },
      category: { select: { name: true } },
      company: { select: { name: true } },
      items: { select: { status: true, startDate: true, endDate: true, subtotal: true, site: { select: { code: true } } } },
      payments: { select: { amount: true } },
    },
  });

  const RECEIVABLE = ['CONFIRMED', 'LIVE', 'COMPLETED'];
  const rows = orders.map((o) => {
    const live = o.items.filter((i) => i.status !== 'CANCELLED' && i.startDate && i.endDate);
    const start = live.length ? new Date(Math.min(...live.map((i) => +new Date(i.startDate)))) : null;
    const end = live.length ? new Date(Math.max(...live.map((i) => +new Date(i.endDate)))) : null;
    const paid = o.payments.reduce((s, p) => s + p.amount, 0);
    const receivable = RECEIVABLE.includes(o.status);
    return {
      orderNo: o.orderNo,
      date: new Date(o.bookingDate).toLocaleDateString('en-IN'),
      client: o.client.name,
      category: o.category?.name || '',
      company: o.company?.name || '',
      status: o.status,
      terms: o.paymentTerms === 'POSTPAID' ? 'Postpaid' : 'Advance',
      sites: o.items.map((i) => i.site.code).join(', '),
      siteCount: o.items.length,
      start: start ? start.toLocaleDateString('en-IN') : '',
      end: end ? end.toLocaleDateString('en-IN') : '',
      grandTotal: o.grandTotal,
      paid: receivable ? paid : 0,
      balance: receivable ? Math.max(0, o.grandTotal - paid) : 0,
    };
  });

  await sendWorkbook(res, status === 'QUOTATION' ? 'quotations.xlsx' : 'campaigns.xlsx',
    status === 'QUOTATION' ? 'Quotations' : 'Campaigns',
    [
      { header: 'Order', key: 'orderNo', width: 12 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Client', key: 'client', width: 22 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Business', key: 'company', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Terms', key: 'terms', width: 10 },
      { header: 'Sites', key: 'sites', width: 28 },
      { header: '# Sites', key: 'siteCount', width: 8 },
      { header: 'Start', key: 'start', width: 12 },
      { header: 'End', key: 'end', width: 12 },
      { header: 'Grand Total', key: 'grandTotal', width: 14 },
      { header: 'Paid', key: 'paid', width: 12 },
      { header: 'Balance', key: 'balance', width: 12 },
    ], rows);
});

// Invoices export
router.get('/invoices/excel', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { companyId } = req.query;
  const invoices = await prisma.invoice.findMany({
    where: { ...(companyId ? { companyId: Number(companyId) } : {}) },
    orderBy: { issuedAt: 'desc' },
    include: {
      client: { select: { name: true } },
      order: { select: { orderNo: true } },
      company: { select: { name: true } },
    },
  });
  const rows = invoices.map((i) => ({
    invoiceNo: i.invoiceNo,
    date: new Date(i.issuedAt).toLocaleDateString('en-IN'),
    client: i.client.name,
    order: i.order.orderNo,
    company: i.company?.name || '',
    tax: i.taxCategory === 'GST' ? (i.interState ? 'IGST' : 'CGST+SGST') : 'Non-GST',
    amount: i.amount,
    gst: i.gstAmount,
    total: i.total,
    status: i.status,
  }));
  await sendWorkbook(res, 'invoices.xlsx', 'Invoices', [
    { header: 'Invoice No', key: 'invoiceNo', width: 18 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Client', key: 'client', width: 22 },
    { header: 'Order', key: 'order', width: 12 },
    { header: 'Business', key: 'company', width: 18 },
    { header: 'Tax', key: 'tax', width: 12 },
    { header: 'Taxable', key: 'amount', width: 14 },
    { header: 'GST', key: 'gst', width: 12 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Status', key: 'status', width: 10 },
  ], rows);
});

// Reports export — the overview figures as a two-column sheet plus a per-order
// revenue breakdown, so the numbers on the dashboard are downloadable.
router.get('/reports/excel', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const { companyId } = req.query;
  const NON_CANCELLED = { notIn: ['CANCELLED'] };
  const where = { status: NON_CANCELLED, ...(companyId ? { companyId: Number(companyId) } : {}) };

  const [orders, payments] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { bookingDate: 'desc' },
      include: { client: { select: { name: true } }, category: { select: { name: true } } },
    }),
    prisma.payment.aggregate({ where: companyId ? { companyId: Number(companyId) } : {}, _sum: { amount: true, tdsAmount: true, netReceived: true } }),
  ]);

  const confirmed = orders.filter((o) => o.status !== 'QUOTATION');
  const quotations = orders.filter((o) => o.status === 'QUOTATION');
  const bookedValue = confirmed.reduce((s, o) => s + o.grandTotal, 0);
  const paid = payments._sum.amount || 0;

  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ header: 'Metric', key: 'k', width: 26 }, { header: 'Value', key: 'v', width: 20 }];
  summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9E2015' } };
  summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  [
    ['Booked Value (confirmed+)', bookedValue],
    ['Quotation Pipeline', quotations.reduce((s, o) => s + o.grandTotal, 0)],
    ['Open Quotations', quotations.length],
    ['Collected (gross)', paid],
    ['TDS Deducted', payments._sum.tdsAmount || 0],
    ['Net Received', payments._sum.netReceived || 0],
    ['Outstanding', Math.max(0, bookedValue - paid)],
    ['GST Collected', confirmed.reduce((s, o) => s + o.gstAmount, 0)],
    ['Confirmed Orders', confirmed.length],
  ].forEach(([k, v]) => summary.addRow({ k, v }));

  const detail = wb.addWorksheet('Orders');
  detail.columns = [
    { header: 'Order', key: 'orderNo', width: 12 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Client', key: 'client', width: 22 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Grand Total', key: 'grandTotal', width: 14 },
    { header: 'GST', key: 'gst', width: 12 },
  ];
  detail.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9E2015' } };
  detail.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  confirmed.forEach((o) => detail.addRow({
    orderNo: o.orderNo, date: new Date(o.bookingDate).toLocaleDateString('en-IN'),
    client: o.client.name, category: o.category?.name || '', status: o.status,
    grandTotal: o.grandTotal, gst: o.gstAmount,
  }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="reports.xlsx"');
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

  // 4:3 deck, matching the printed proposal. 10 x 7.5 inches.
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_4x3';
  const SW = 10, SH = 7.5;
  const logoPath = path.join(__dirname, '../assets/logo.png');
  const logoOnWhite = path.join(__dirname, '../assets/logo-onwhite.png');

  // ── Cover: white background, large centred logo (as in the reference deck) ──
  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  try {
    if (fs.existsSync(logoOnWhite)) cover.addImage({ path: logoOnWhite, x: 2, y: 1.6, w: 6, h: 3 });
    else if (fs.existsSync(logoPath)) cover.addImage({ path: logoPath, x: 3.25, y: 1.6, w: 3.5, h: 2.6 });
  } catch (e) {}
  cover.addText(`Campaign Proposal`, { x: 0.5, y: 4.9, w: 9, h: 0.6, fontSize: 26, bold: true, color: '9E2015', align: 'center' });
  cover.addText(client.name, { x: 0.5, y: 5.5, w: 9, h: 0.5, fontSize: 18, color: '333333', align: 'center' });
  cover.addText(`${lines.length} site(s) · Bikaner, Rajasthan · ${new Date().toLocaleDateString('en-IN')}`,
    { x: 0.5, y: 6.1, w: 9, h: 0.4, fontSize: 12, color: '888888', align: 'center' });

  // ── One slide per site: full-bleed red, framed photo, caption underneath ──
  for (const it of lines) {
    const s = it.site;
    const slide = pptx.addSlide();
    slide.background = { color: '9E2015' };

    // Framed photo
    const img = it.photos?.map((p) => resolveImage(p.filePath)).find(Boolean) || resolveImage(s.imageUrl);
    const px = 1, py = 0.5, pw = SW - px * 2, ph = 3.7;
    slide.addShape(pptx.ShapeType.rect, { x: px - 0.06, y: py - 0.06, w: pw + 0.12, h: ph + 0.12, fill: { color: 'FFFFFF' } });
    if (img) {
      try { slide.addImage({ path: img, x: px, y: py, w: pw, h: ph, sizing: { type: 'cover', w: pw, h: ph } }); }
      catch (e) { slide.addText('Photo pending', { x: px, y: py, w: pw, h: ph, align: 'center', valign: 'middle', color: '9CA3AF', fill: { color: 'F3F4F6' } }); }
    } else {
      slide.addText('Photo pending', { x: px, y: py, w: pw, h: ph, align: 'center', valign: 'middle', color: '9CA3AF', fill: { color: 'F3F4F6' } });
    }

    // Caption
    const title = `${s.srNo ? s.srNo + ' - ' : ''}${(s.location || s.code).toUpperCase()}`;
    slide.addText(title, { x: 0.5, y: py + ph + 0.25, w: SW - 1, h: 0.8, fontSize: 22, bold: true, color: 'FFFFFF', align: 'center' });
    slide.addText(`Width: ${s.width} ft | Height: ${s.height} ft | Total Area: ${s.sqft || Math.round(s.width * s.height)} sq.ft`,
      { x: 0.5, y: py + ph + 1.0, w: SW - 1, h: 0.35, fontSize: 13, color: 'FFE9E9', align: 'center' });
    if (s.latitude && s.longitude) {
      slide.addText(`Latitude: ${s.latitude} | Longitude: ${s.longitude}`,
        { x: 0.5, y: py + ph + 1.35, w: SW - 1, h: 0.35, fontSize: 13, color: 'FFE9E9', align: 'center' });
    }
    slide.addText(`${s.code} · ${s.type} · ${s.zone}${s.city ? ', ' + s.city : ''}`,
      { x: 0.5, y: py + ph + 1.7, w: SW - 1, h: 0.3, fontSize: 10, color: 'FFD0D0', align: 'center' });
  }

  const buffer = await pptx.write('nodebuffer');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="${client.name.replace(/\s+/g, '_')}_proposal.pptx"`);
  res.end(buffer);
});

module.exports = router;
