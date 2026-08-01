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

// PDFKit (unlike pptxgenjs) cannot read a remote URL — it needs a local path or
// a Buffer. Site images and monitoring photos are stored as Cloudinary URLs in
// production, so for the PDF routes we fetch the bytes into a Buffer. Local
// /uploads files are read straight off disk. Returns null on any failure so the
// caller falls back to its placeholder.
async function imageBuffer(src) {
  if (!src) return null;
  try {
    if (/^https?:\/\//.test(src)) {
      const resp = await fetch(src);
      if (!resp.ok) return null;
      return Buffer.from(await resp.arrayBuffer());
    }
    const abs = path.join(uploadDir, path.basename(src));
    return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  } catch (e) { return null; }
}

// Best photo to represent a site in a catalogue: its own image, else the most
// recent monitoring photo from any booking on it.
function sitePhoto(site) {
  if (site.imageUrl) return resolveImage(site.imageUrl);
  const photos = (site.bookings || []).flatMap((b) => b.photos || []);
  const latest = photos.sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt))[0];
  return latest ? resolveImage(latest.filePath) : null;
}

// Build a site `where` for the availability exports from the query. Supports the
// four combinations the client asked for:
//   • vacant        → status=AVAILABLE  (the default)
//   • booked        → status=BOOKED
//   • custom        → siteIds=1,2,3     (exactly the chosen sites, any status)
//   • vacant+custom → status=AVAILABLE & siteIds=…  (free sites plus the chosen)
function siteSelectionWhere({ type, status, siteIds }) {
  const ids = String(siteIds || '').split(',').map((s) => Number(s.trim())).filter(Boolean);
  const typeF = type ? { type } : {};
  if (ids.length && status) {
    // vacant + custom: everything free of this type, OR any explicitly picked site
    return { active: true, OR: [{ ...typeF, status }, { id: { in: ids } }] };
  }
  if (ids.length) return { active: true, id: { in: ids } }; // custom only
  if (status) return { active: true, ...typeF, status };    // vacant / booked / any status
  return { active: true, ...typeF, status: 'AVAILABLE' };   // default
}

// Availability PDF — a visual catalogue: a red cover, then one landscape page
// per site (photo + name + dimensions + coordinates), matching the printed deck.
router.get('/availability/pdf', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const { type, status, siteIds } = req.query;
  const sites = await prisma.site.findMany({
    where: siteSelectionWhere({ type, status, siteIds }),
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
    const img = await imageBuffer(sitePhoto(s));
    if (img) {
      // PDFKit ignores align/valign when `fit` is used — it anchors the scaled
      // image at the top-left. So scale manually and offset to truly centre the
      // photo inside the white frame.
      try {
        const src = doc.openImage(img);
        const scale = Math.min(panelW / src.width, imgH / src.height);
        const dw = src.width * scale, dh = src.height * scale;
        const dx = pad + (panelW - dw) / 2;
        const dy = imgY + (imgH - dh) / 2;
        doc.image(img, dx, dy, { width: dw, height: dh });
      } catch (e) { doc.rect(pad, imgY, panelW, imgH).fill('#f3f4f6'); }
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
router.get('/inventory/excel', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
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
router.get('/client/:clientId/pptx', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
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

// PPTX deck of selected / filtered sites (vacant, booked, custom or a mix) — the
// inventory-side counterpart to the availability PDF, driven by the same filters.
router.get('/sites/pptx', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const { type, status, siteIds } = req.query;
  const sites = await prisma.site.findMany({
    where: siteSelectionWhere({ type, status, siteIds }),
    orderBy: { srNo: 'asc' },
    include: {
      bookings: {
        where: { status: { in: ['CONFIRMED', 'LIVE', 'TENTATIVE'] } },
        include: { photos: true },
        orderBy: { startDate: 'desc' }, take: 1,
      },
    },
  });

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_4x3';
  const SW = 10;
  const logoPath = path.join(__dirname, '../assets/logo.png');
  const logoOnWhite = path.join(__dirname, '../assets/logo-onwhite.png');

  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  try {
    if (fs.existsSync(logoOnWhite)) cover.addImage({ path: logoOnWhite, x: 2, y: 1.6, w: 6, h: 3 });
    else if (fs.existsSync(logoPath)) cover.addImage({ path: logoPath, x: 3.25, y: 1.6, w: 3.5, h: 2.6 });
  } catch (e) {}
  cover.addText('Site Availability', { x: 0.5, y: 4.9, w: 9, h: 0.6, fontSize: 26, bold: true, color: '9E2015', align: 'center' });
  cover.addText(`${sites.length} site(s)${type ? ' · ' + type : ''} · Bikaner, Rajasthan · ${new Date().toLocaleDateString('en-IN')}`,
    { x: 0.5, y: 5.6, w: 9, h: 0.4, fontSize: 12, color: '888888', align: 'center' });

  for (const s of sites) {
    const slide = pptx.addSlide();
    slide.background = { color: '9E2015' };
    const img = sitePhoto(s);
    const px = 1, py = 0.5, pw = SW - px * 2, ph = 3.7;
    slide.addShape(pptx.ShapeType.rect, { x: px - 0.06, y: py - 0.06, w: pw + 0.12, h: ph + 0.12, fill: { color: 'FFFFFF' } });
    if (img) {
      try { slide.addImage({ path: img, x: px, y: py, w: pw, h: ph, sizing: { type: 'cover', w: pw, h: ph } }); }
      catch (e) { slide.addText('Photo pending', { x: px, y: py, w: pw, h: ph, align: 'center', valign: 'middle', color: '9CA3AF', fill: { color: 'F3F4F6' } }); }
    } else {
      slide.addText('Photo pending', { x: px, y: py, w: pw, h: ph, align: 'center', valign: 'middle', color: '9CA3AF', fill: { color: 'F3F4F6' } });
    }
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
  res.setHeader('Content-Disposition', 'attachment; filename="Site-Availability.pptx"');
  res.end(buffer);
});

// Standalone "quick quotation" — a plain proposal with no site mapping and no
// order/booking created. The client asked for a short form (name, company,
// address, contact + free rate lines that can span any number of months) that
// simply prints a PDF. Nothing is persisted.
router.post('/quotation/simple', requireRole('SALES', 'MANAGER', 'FINANCE'), async (req, res) => {
  const { companyName, clientName, clientCompany, address, contact, lines = [], notes } = req.body || {};

  const doc = new PDFDocument({ margin: 45, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Quotation-${(clientName || 'client').replace(/\s+/g, '_')}.pdf"`);
  doc.pipe(res);

  const logoPath = path.join(__dirname, '../assets/logo.png');
  try { doc.image(logoPath, 45, 45, { height: 35 }); }
  catch (e) { doc.fontSize(20).fillColor(BRAND).text((companyName || 'SAANGARI ADVERTISING').toUpperCase(), 45, 45); }
  doc.fontSize(9).fillColor('#555').text('Outdoor Media — Bikaner, Rajasthan', 45, 85);
  doc.fontSize(16).fillColor('#000').text('QUOTATION', 0, 48, { align: 'right' });
  doc.fontSize(10).fillColor('#333')
    .text(companyName || 'Saangari Advertising', { align: 'right' })
    .text(`Date: ${new Date().toLocaleDateString('en-IN')}`, { align: 'right' });

  doc.moveDown(2);
  doc.fontSize(11).fillColor('#000').text('To:', 45);
  doc.fontSize(10).fillColor('#333');
  if (clientName) doc.text(clientName);
  if (clientCompany) doc.text(clientCompany);
  if (address) doc.text(address);
  if (contact) doc.text(`Contact: ${contact}`);

  doc.moveDown();
  const x = { desc: 45, months: 320, rate: 400, amt: 480 };
  let y = doc.y + 6;
  doc.rect(45, y - 2, 505, 18).fill(BRAND);
  doc.fillColor('#fff').fontSize(9)
    .text('Description', x.desc + 4, y).text('Months', x.months, y).text('Rate', x.rate, y)
    .text('Amount', x.amt, y, { width: 66, align: 'right' });
  y += 22;
  let total = 0;
  doc.font('Helvetica').fillColor('#333');
  for (const l of lines) {
    if (!l || (!l.description && !l.rate)) continue;
    const months = Number(l.months) || 1;
    const rate = Number(l.rate) || 0;
    const amount = Math.round(months * rate);
    total += amount;
    doc.fontSize(9)
      .text(l.description || '—', x.desc + 4, y, { width: 265 })
      .text(String(months), x.months, y, { width: 70 })
      .text(INR(rate), x.rate, y, { width: 70 })
      .text(INR(amount), x.amt, y, { width: 66, align: 'right' });
    y += Math.max(16, doc.heightOfString(l.description || '—', { width: 265, fontSize: 9 }));
    if (y > 730) { doc.addPage(); y = 60; }
  }
  y += 6;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
    .text('Total', x.rate - 40, y, { width: 100, align: 'right' })
    .text(INR(total), x.amt, y, { width: 66, align: 'right' });

  if (notes) {
    doc.moveDown(3).font('Helvetica').fontSize(9).fillColor('#555').text('Notes / Terms:', 45).text(notes, { width: 505 });
  }
  doc.font('Helvetica').fontSize(8).fillColor('#888').text('This is a quotation and not a tax invoice.', 45, 790, { align: 'center', width: 505 });
  doc.end();
});

// ── Monitoring photos export ───────────────────────────────────────────────
// Bundle a campaign's monitoring proofs into a shareable deck/document. One
// entry per uploaded photo, captioned with the site, phase (Start/Mid/End),
// kind and the date/geo it was taken. Ordered by site, then phase, then kind.
// One slide/page per (site, monitoring round) — a collage of that site's photos
// for that round, titled with "srNo - LOCATION" + the date, footed with the
// dimensions and geo. Matches the client's reference deck (SENCO format).
const PHASE_ORDER = { START: 0, MID: 1, END: 2 };
const KIND_ORDER = { GPS: 0, NORMAL: 1, NEWSPAPER: 2 };
const ddmmyyyy = (d) => new Date(d).toLocaleDateString('en-GB').replace(/\//g, '.');

async function loadOrderPhotos(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      client: { select: { name: true, company: true } },
      company: { select: { name: true, legalName: true } },
      items: { include: { site: true, photos: true } },
    },
  });
  if (!order) return null;

  // Group photos by (site, phase). Each group becomes one slide/page.
  const map = new Map();
  for (const it of order.items) {
    for (const p of it.photos || []) {
      const key = `${it.siteId}|${p.phase}`;
      if (!map.has(key)) map.set(key, { site: it.site, phase: p.phase, photos: [] });
      map.get(key).photos.push(p);
    }
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.photos.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
    g.date = g.photos.map((p) => p.takenAt).sort((a, b) => new Date(a) - new Date(b))[0];
    const geo = g.photos.find((p) => p.latitude);
    g.latitude = geo ? geo.latitude : g.site.latitude;
    g.longitude = geo ? geo.longitude : g.site.longitude;
  }
  // Order by monitoring round (date), then by site — same as the reference deck.
  groups.sort((a, b) =>
    (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9) ||
    (a.site.srNo || 0) - (b.site.srNo || 0));

  const photoCount = groups.reduce((n, g) => n + g.photos.length, 0);
  return { order, groups, photoCount };
}

// Collage slots (inches, on a 10 x 7.5 canvas) for a given photo count. Three
// photos use the reference layout: two stacked left + one tall right.
function photoSlots(n) {
  if (n <= 1) return [{ x: 1.6, y: 1.35, w: 6.8, h: 5.0 }];
  if (n === 2) return [{ x: 0.5, y: 1.4, w: 4.45, h: 4.9 }, { x: 5.05, y: 1.4, w: 4.45, h: 4.9 }];
  if (n === 3) return [
    { x: 0.5, y: 1.25, w: 4.35, h: 2.6 },
    { x: 0.5, y: 3.95, w: 4.35, h: 2.6 },
    { x: 5.0, y: 1.25, w: 4.5, h: 5.3 },
  ];
  const cols = 3, rows = Math.ceil(n / cols), top = 1.25, side = 0.5, gap = 0.15;
  const w = (10 - side * 2 - (cols - 1) * gap) / cols;
  const h = (6.55 - top - (rows - 1) * gap) / rows, slots = [];
  for (let i = 0; i < n; i++) { const r = Math.floor(i / cols), c = i % cols; slots.push({ x: side + c * (w + gap), y: top + r * (h + gap), w, h }); }
  return slots;
}
const groupTitle = (g) => `${g.site.srNo ? g.site.srNo + ' - ' : ''}${(g.site.location || g.site.code || '').toUpperCase()}`;
const groupDims = (s) => `Width: ${s.width || '-'} ft | Height: ${s.height || '-'} ft | Total Area: ${s.sqft || Math.round((s.width || 0) * (s.height || 0)) || '-'} sq.ft`;

router.get('/orders/:id/photos.pdf', requireRole('SALES', 'MANAGER', 'FINANCE', 'OPS'), async (req, res) => {
  const data = await loadOrderPhotos(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'Order not found' });
  const { order, groups, photoCount } = data;

  // 10 x 7.5in page (720 x 540pt) so slot inches map to points at 72/in — the
  // same collage geometry as the PPTX and the reference deck.
  const IN = 72;
  const doc = new PDFDocument({ size: [10 * IN, 7.5 * IN], margin: 0 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Monitoring-${order.orderNo}.pdf"`);
  doc.pipe(res);
  const W = doc.page.width, H = doc.page.height;
  const logoPath = path.join(__dirname, '../assets/logo.png');

  // Cover
  doc.rect(0, 0, W, H).fill(BRAND);
  try { doc.image(logoPath, (W - 260) / 2, H / 2 - 140, { width: 260 }); }
  catch (e) { doc.fontSize(40).fillColor('#fff').text('SAANGARI', 0, H / 2 - 50, { align: 'center', width: W }); }
  doc.fontSize(18).fillColor('#fff').font('Helvetica-Bold').text('Monitoring Report', 0, H - 120, { align: 'center', width: W });
  doc.font('Helvetica').fontSize(12).fillColor('#ffe9e9').text(
    `${order.orderNo} · ${order.client?.company || order.client?.name || ''} · ${new Date().toLocaleDateString('en-IN')}`,
    0, H - 90, { align: 'center', width: W });

  for (const g of groups) {
    doc.addPage({ size: [10 * IN, 7.5 * IN], margin: 0 });
    doc.rect(0, 0, W, H).fill(BRAND);
    // Title (site) + date
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(groupTitle(g), 0.5 * IN, 0.28 * IN, { align: 'center', width: 9 * IN });
    doc.fillColor('#ffe9e9').font('Helvetica-Bold').fontSize(13).text(ddmmyyyy(g.date), 0.5 * IN, 0.78 * IN, { align: 'center', width: 9 * IN });

    const slots = photoSlots(g.photos.length);
    for (let i = 0; i < g.photos.length; i++) {
      const s = slots[i], sx = s.x * IN, sy = s.y * IN, sw = s.w * IN, sh = s.h * IN;
      doc.rect(sx, sy, sw, sh).fill('#ffffff'); // white mat — whole photo fits inside, nothing cropped
      const buf = await imageBuffer(g.photos[i].filePath);
      if (buf) {
        try {
          // fit (not cover) keeps the full image; portrait shots letterbox on the white mat
          doc.image(buf, sx + 4, sy + 4, { fit: [sw - 8, sh - 8], align: 'center', valign: 'center' });
        } catch (e) {}
      } else {
        doc.fillColor('#9ca3af').fontSize(11).text('Image unavailable', sx, sy + sh / 2 - 6, { align: 'center', width: sw });
      }
      doc.lineWidth(1).strokeColor('#e5e7eb').rect(sx, sy, sw, sh).stroke();
    }
    // Footer: dimensions + geo
    doc.fillColor('#ffffff').font('Helvetica').fontSize(11).text(groupDims(g.site), 0.5 * IN, 6.72 * IN, { align: 'center', width: 9 * IN });
    if (g.latitude && g.longitude) {
      doc.fillColor('#ffd9d9').fontSize(10).text(`Latitude: ${g.latitude} | Longitude: ${g.longitude}`, 0.5 * IN, 7.0 * IN, { align: 'center', width: 9 * IN });
    }
  }

  if (photoCount === 0) {
    doc.addPage({ size: [10 * IN, 7.5 * IN], margin: 0 });
    doc.rect(0, 0, W, H).fill(BRAND);
    doc.fillColor('#ffe9e9').fontSize(15).text('No monitoring photos uploaded for this campaign yet.', 0, H / 2, { align: 'center', width: W });
  }
  doc.end();
});

router.get('/orders/:id/photos.pptx', requireRole('SALES', 'MANAGER', 'FINANCE', 'OPS'), async (req, res) => {
  const data = await loadOrderPhotos(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'Order not found' });
  const { order, groups } = data;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_4x3';
  const logoOnWhite = path.join(__dirname, '../assets/logo-onwhite.png');
  const logoPath = path.join(__dirname, '../assets/logo.png');

  const cover = pptx.addSlide();
  cover.background = { color: '9E2015' };
  try {
    if (fs.existsSync(logoPath)) cover.addImage({ path: logoPath, x: 3.25, y: 1.6, w: 3.5, h: 2.6 });
    else if (fs.existsSync(logoOnWhite)) cover.addImage({ path: logoOnWhite, x: 2, y: 1.6, w: 6, h: 3 });
  } catch (e) {}
  cover.addText('Monitoring Report', { x: 0.5, y: 4.9, w: 9, h: 0.6, fontSize: 26, bold: true, color: 'FFFFFF', align: 'center' });
  cover.addText(`${order.orderNo} · ${order.client?.company || order.client?.name || ''}`, { x: 0.5, y: 5.5, w: 9, h: 0.5, fontSize: 16, color: 'FFE9E9', align: 'center' });
  cover.addText(`${new Date().toLocaleDateString('en-IN')}`, { x: 0.5, y: 6.1, w: 9, h: 0.4, fontSize: 12, color: 'FFD9D9', align: 'center' });

  for (const g of groups) {
    const slide = pptx.addSlide();
    slide.background = { color: '9E2015' };
    slide.addText(groupTitle(g), { x: 0.4, y: 0.18, w: 9.2, h: 0.55, fontSize: 18, bold: true, color: 'FFFFFF', align: 'center' });
    slide.addText(ddmmyyyy(g.date), { x: 0.4, y: 0.72, w: 9.2, h: 0.4, fontSize: 13, bold: true, color: 'FFE9E9', align: 'center' });

    const slots = photoSlots(g.photos.length);
    for (let i = 0; i < g.photos.length; i++) {
      const s = slots[i];
      const img = resolveImage(g.photos[i].filePath);
      slide.addShape(pptx.ShapeType.rect, { x: s.x, y: s.y, w: s.w, h: s.h, fill: { color: 'FFFFFF' }, line: { color: 'E5E7EB', width: 1 } });
      if (img) {
        try { slide.addImage({ path: img, x: s.x, y: s.y, w: s.w, h: s.h, sizing: { type: 'contain', w: s.w, h: s.h } }); }
        catch (e) { slide.addText('Image unavailable', { x: s.x, y: s.y, w: s.w, h: s.h, align: 'center', valign: 'middle', color: '9CA3AF' }); }
      }
    }
    slide.addText(groupDims(g.site), { x: 0.4, y: 6.66, w: 9.2, h: 0.35, fontSize: 11, color: 'FFFFFF', align: 'center' });
    if (g.latitude && g.longitude) {
      slide.addText(`Latitude: ${g.latitude} | Longitude: ${g.longitude}`, { x: 0.4, y: 6.98, w: 9.2, h: 0.32, fontSize: 10, color: 'FFD9D9', align: 'center' });
    }
  }

  const buffer = await pptx.write('nodebuffer');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="Monitoring-${order.orderNo}.pptx"`);
  res.end(buffer);
});

module.exports = router;
