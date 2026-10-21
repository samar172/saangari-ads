const path = require('path');
const ExcelJS = require('exceljs');

// Tax invoice as an editable Excel bill, laid out exactly like the accounts
// team's own bill.xlsx: Calibri, a blank letterhead band, Bill To / Bill From,
// a bordered # / Location / From / Till / Duration / Qty / Price / Total grid,
// Total → GST @18% → Grand Total (red on pink), amount in words, the tax
// breakup table (CGST+SGST within Rajasthan, IGST across states), PAN + bank
// details and the signed "For SAANGARI ADS PVT LTD" block. Totals are live
// formulas (with cached results) so the sheet stays editable.
const SIGNATURE = path.join(__dirname, '../assets/signature.png');

// Fallbacks for the GST business when its Business record is still blank —
// taken from the bills Saangari Ads issues today.
const SAPL_DEFAULTS = {
  billFromName: 'Saangari Ads PVT LTD',
  address: '2nd Floor, Opposite Kothari Palace\nRani Bazar, Bikaner, Rajasthan',
  gstin: '08ABOCS8825R1Z4',
  pan: 'ABOCS8825R',
  signFor: 'SAANGARI ADS PVT LTD',
  bankName: 'HDFC Bank',
  bankAccountNo: '50200103339571',
  bankBranchIfsc: 'HDFC0009247 (Samta Nagar)',
};

const { BILLABLE, durationLabel } = require('./billingPlan');
const GRID_ROWS = 18; // rows 5–22 in the reference sheet

// ── Amount in words (Indian system: thousand, lakh, crore) ──
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoDigits(n) { return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`; }
function threeDigits(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}
function amountInWords(amount) {
  let n = Math.round(Math.abs(Number(amount) || 0));
  if (n === 0) return 'Zero Only';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return `${parts.join(' ')} Only`;
}

const dmy = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}`;
};


// The rows the bill lists, in order: one per billable site line, then printing
// & mounting, add-ons and any discount — so the grid sums to the taxable value.
function billLines(invoice) {
  // Invoices store their rows as issued — a monthly bill carries only its own
  // month. Older invoices (before snapshots) are rebuilt from the campaign.
  if (Array.isArray(invoice.lines)) {
    return invoice.lines.map((r) => ({
      location: r.location, from: r.from ? dmy(r.from) : '', till: r.till ? dmy(r.till) : '',
      duration: r.duration || '', qty: r.qty, price: r.price,
    }));
  }
  const order = invoice.order;
  const lines = [];
  // A cancelled campaign's lines are all CANCELLED — list them anyway so a
  // reprinted bill still shows what was billed.
  const billable = order.items.filter((l) => BILLABLE.includes(l.status));
  const items = billable.length ? billable : order.items;
  for (const it of items) {
    lines.push({
      location: it.site?.location || it.site?.code || '',
      from: dmy(it.startDate), till: dmy(it.stoppedAt || it.endDate),
      duration: durationLabel(it.days), qty: 1, price: Math.round(it.subtotal),
    });
  }
  const pm = Math.round((order.printingTotal || 0) + (order.mountingCost || 0));
  if (pm) {
    const qty = Number(order.noOfPrints) > 0 ? Number(order.noOfPrints) : Math.max(1, items.length);
    const label = order.printingTotal && order.mountingCost ? 'Print & Mount' : order.printingTotal ? 'Printing' : 'Mounting';
    // Keep Qty × Price exact: fall back to a single lump line if it doesn't divide.
    if (pm % qty === 0) lines.push({ location: label, qty, price: pm / qty });
    else lines.push({ location: label, qty: 1, price: pm });
  }
  for (const a of order.addOns || []) {
    if (Number(a.amount)) lines.push({ location: a.label, qty: 1, price: Math.round(a.amount) });
  }
  if (order.discountAmount) {
    const pct = order.discountFlat > 0 ? '' : ` (${order.discountPct}%)`;
    lines.push({ location: `Less: Discount${pct}`, qty: 1, price: -Math.round(order.discountAmount) });
  }
  // The bill must total the invoice as issued. If the campaign changed after
  // invoicing (a stop/shift re-priced it), show the gap rather than let the
  // SUM drift from the amount the client was billed.
  const diff = Math.round(invoice.amount) - lines.reduce((s, l) => s + l.qty * l.price, 0);
  if (diff) lines.push({ location: 'Adjustment', qty: 1, price: diff });
  return lines;
}

async function buildBillXlsx(invoice) {
  const order = invoice.order;
  const company = invoice.company || {};
  const client = invoice.client || {};
  const isSapl = company.code === 'SAANGARI_ADS';
  const pick = (v, fallback) => (v && String(v).trim()) || (isSapl ? fallback : '');
  const gst = invoice.taxCategory === 'GST';
  const igst = gst && invoice.interState;

  const from = {
    name: (isSapl ? SAPL_DEFAULTS.billFromName : null) || company.legalName || company.name || '',
    address: pick(company.address, SAPL_DEFAULTS.address),
    gstin: pick(company.gstin, SAPL_DEFAULTS.gstin),
    pan: pick(company.pan, SAPL_DEFAULTS.pan),
    signFor: isSapl ? SAPL_DEFAULTS.signFor : (company.legalName || company.name || '').toUpperCase().replace(/PRIVATE LIMITED/, 'PVT LTD'),
    bankName: pick(company.bankName, SAPL_DEFAULTS.bankName),
    bankAccountNo: pick(company.bankAccountNo, SAPL_DEFAULTS.bankAccountNo),
    bankBranchIfsc: pick(company.bankBranchIfsc, SAPL_DEFAULTS.bankBranchIfsc),
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = from.name;
  const ws = wb.addWorksheet(String(invoice.invoiceNo).replace(/[\\/?*[\]:]/g, '-').slice(0, 31), {
    views: [{ zoomScale: 85, showGridLines: true }],
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      margins: { left: 0.5118, right: 0.5118, top: 0.1575, bottom: 0.1575, header: 0.315, footer: 0.315 },
    },
  });
  ws.columns = [
    { width: 9.14 }, { width: 31.57 }, { width: 10.14 }, { width: 10.57 },
    { width: 8.71 }, { width: 9.14 }, { width: 9.14 }, { width: igst ? 14.57 : 9.14 },
  ];

  const font = (o = {}) => ({ name: 'Calibri', size: 11, ...o });
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const set = (addr, value, style = {}) => {
    const c = ws.getCell(addr);
    c.value = value;
    c.font = font(style.font);
    if (style.alignment) c.alignment = style.alignment;
    if (style.border) c.border = style.border;
    if (style.numFmt) c.numFmt = style.numFmt;
    if (style.fill) c.fill = style.fill;
    return c;
  };
  // Border every cell of a merged range (Excel draws the outline from the parts).
  const boxRange = (r1, c1, r2, c2, border = box) => {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = border;
  };

  // Row 1 — blank band where the letterhead prints (a cancelled bill is
  // stamped here so a reprint can never pass for a live one).
  ws.getRow(1).height = 130.5;
  ws.mergeCells('A1:H1');
  if (invoice.status === 'CANCELLED') {
    set('A1', `CANCELLED${invoice.cancelledAt ? ` on ${dmy(invoice.cancelledAt)}` : ''}${invoice.cancelReason ? ` — ${invoice.cancelReason}` : ''}`,
      { font: { bold: true, size: 16, color: { argb: 'FFDC2626' } }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } });
  }

  // Row 2 — invoice no. and date
  ws.getRow(2).height = 38.25;
  ws.mergeCells('A2:D2'); ws.mergeCells('E2:H2');
  set('A2', `           Invoice No.:    ${invoice.invoiceNo}`, { font: { bold: true, size: 12 }, alignment: { horizontal: 'left' } });
  set('E2', dmy(invoice.issuedAt), { font: { bold: true, size: 12 }, alignment: { horizontal: 'right' } });

  // Row 3 — Bill To / Bill From
  ws.getRow(3).height = 96.75;
  ws.mergeCells('A3:C3'); ws.mergeCells('D3:H3');
  const billTo = ['Bill To', (client.company && client.company.trim()) || client.name, client.address,
    client.gstNumber ? `GSTIN/UIN : ${client.gstNumber}` : null].filter(Boolean).join('\n');
  const billFrom = ['Bill From', from.name, from.address, from.gstin ? `GST No.  : ${from.gstin}` : null].filter(Boolean).join('\n');
  const top = { horizontal: 'left', vertical: 'top', wrapText: true };
  set('A3', billTo, { font: { bold: true, size: 12 }, alignment: top });
  set('D3', billFrom, { font: { bold: true, size: 12 }, alignment: top });
  for (let c = 1; c <= 8; c++) ws.getCell(3, c).border = { bottom: thin };

  // Row 4 — grid header
  ['#', 'Location', 'From', 'Till', 'Duration', 'Qty', 'Price', 'Total'].forEach((h, i) => {
    set(ws.getCell(4, i + 1).address, h, { font: { bold: true }, border: box });
  });

  // Rows 5+ — line items, padded to the reference sheet's 18-row grid.
  const lines = billLines(invoice);
  const gridRows = Math.max(GRID_ROWS, lines.length);
  const first = 5, last = first + gridRows - 1;
  for (let i = 0; i < gridRows; i++) {
    const r = first + i;
    const l = lines[i];
    // Column B fits ~31 characters a line; grow the row for longer locations.
    ws.getRow(r).height = 15 * Math.max(1, Math.ceil(String(l?.location || '').length / 31));
    for (let c = 1; c <= 8; c++) ws.getCell(r, c).border = box;
    if (!l) continue;
    const center = { horizontal: 'center', vertical: 'middle' };
    set(`A${r}`, i + 1, { border: box });
    set(`B${r}`, l.location, { border: box, alignment: { wrapText: true } });
    if (l.from) set(`C${r}`, l.from, { border: box, alignment: center });
    if (l.till) set(`D${r}`, l.till, { border: box, alignment: center });
    if (l.duration) set(`E${r}`, l.duration, { border: box, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true } });
    set(`F${r}`, l.qty, { border: box });
    set(`G${r}`, l.price, { border: box });
    set(`H${r}`, { formula: `F${r}*G${r}`, result: l.qty * l.price }, { border: box });
  }

  // Totals
  const taxable = Math.round(invoice.amount);
  const gstAmt = Math.round(invoice.gstAmount || 0);
  let r = last + 1;
  const tTotal = r;
  const labelRow = (row, text, valueCell, opts = {}) => {
    ws.mergeCells(`A${row}:G${row}`);
    set(`A${row}`, text, { font: { bold: true, ...(opts.font || {}) }, alignment: { horizontal: 'right' }, fill: opts.fill });
    boxRange(row, 1, row, 7);
    set(`H${row}`, valueCell, { border: box, font: opts.font, fill: opts.fill });
  };
  labelRow(r, 'Total', { formula: `SUM(H${first}:H${last})`, result: taxable });
  let tGst = null;
  if (gst) {
    r += 1; tGst = r;
    labelRow(r, 'GST @18%', { formula: `ROUND(H${tTotal}*18%,0)`, result: gstAmt });
  }
  r += 1;
  const red = { color: { argb: 'FFFF0000' } };
  const pink = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2DCDB' } };
  labelRow(r, 'Grand Total', { formula: gst ? `H${tTotal}+H${tGst}` : `H${tTotal}`, result: Math.round(invoice.total) }, { font: red, fill: pink });

  // Amount in words
  r += 1;
  ws.getRow(r).height = 30;
  ws.mergeCells(`A${r}:H${r}`);
  set(`A${r}`, `Amount chargable (In Words) :    ${amountInWords(invoice.total)}`, { font: { bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } });
  boxRange(r, 1, r, 8);

  // Tax breakup — CGST + SGST within the state, IGST across states.
  if (gst) {
    const h1 = r + 1, h2 = r + 2, v = r + 3, t = r + 4;
    ws.getRow(h1).height = 15; ws.getRow(t).height = 15;
    const ctr = { horizontal: 'center' };
    ws.mergeCells(`A${h1}:B${h2}`);
    set(`A${h1}`, 'Taxable Value', { alignment: { horizontal: 'right', vertical: 'middle' } });
    if (!igst) {
      ws.mergeCells(`C${h1}:D${h1}`); ws.mergeCells(`E${h1}:F${h1}`); ws.mergeCells(`G${h1}:H${h2}`);
      set(`C${h1}`, 'CGST', { alignment: ctr });
      set(`E${h1}`, 'SGST/UTGST', { alignment: ctr });
      set(`G${h1}`, 'Total \nTax Amount', { alignment: { horizontal: 'center', wrapText: true } });
      set(`C${h2}`, 'Rate'); set(`D${h2}`, 'Amount'); set(`E${h2}`, 'Rate'); set(`F${h2}`, 'Amount');
      const cg = Math.round(invoice.cgst || 0), sg = Math.round(invoice.sgst || 0);
      set(`B${v}`, { formula: `H${tTotal}`, result: taxable });
      set(`C${v}`, 0.09, { numFmt: '0%' });
      set(`D${v}`, { formula: `ROUND(H${tGst}/2,0)`, result: cg }, { numFmt: '0.00;[Red]0.00' });
      set(`E${v}`, 0.09, { numFmt: '0%' });
      set(`F${v}`, { formula: `H${tGst}-D${v}`, result: sg }, { numFmt: '0.00;[Red]0.00' });
      ws.mergeCells(`G${v}:H${v}`);
      set(`G${v}`, { formula: `D${v}+F${v}`, result: cg + sg }, { alignment: ctr });
      set(`A${t}`, 'TOTAL', { font: { bold: true } });
      set(`B${t}`, { formula: `B${v}`, result: taxable });
      set(`D${t}`, { formula: `D${v}`, result: cg }, { numFmt: '0.00;[Red]0.00' });
      set(`F${t}`, { formula: `F${v}`, result: sg }, { numFmt: '0.00;[Red]0.00' });
      ws.mergeCells(`G${t}:H${t}`);
      set(`G${t}`, { formula: `G${v}`, result: cg + sg }, { alignment: ctr });
    } else {
      ws.mergeCells(`C${h1}:F${h1}`); ws.mergeCells(`G${h1}:H${h2}`);
      ws.mergeCells(`C${h2}:D${h2}`); ws.mergeCells(`E${h2}:F${h2}`);
      set(`C${h1}`, 'IGST', { alignment: ctr });
      set(`G${h1}`, 'Total \nTax Amount', { alignment: { horizontal: 'center', wrapText: true } });
      set(`C${h2}`, 'Rate', { alignment: ctr }); set(`E${h2}`, 'Amount', { alignment: ctr });
      const ig = Math.round(invoice.igst || 0);
      set(`B${v}`, { formula: `H${tTotal}`, result: taxable });
      ws.mergeCells(`C${v}:D${v}`); ws.mergeCells(`E${v}:F${v}`); ws.mergeCells(`G${v}:H${v}`);
      set(`C${v}`, 0.18, { numFmt: '0%', alignment: ctr });
      set(`E${v}`, { formula: `H${tGst}`, result: ig }, { numFmt: '0', alignment: ctr });
      set(`G${v}`, { formula: `E${v}`, result: ig }, { numFmt: '0.00', alignment: ctr });
      set(`A${t}`, 'TOTAL', { font: { bold: true } });
      set(`B${t}`, { formula: `B${v}`, result: taxable });
      ws.mergeCells(`C${t}:D${t}`); ws.mergeCells(`E${t}:F${t}`); ws.mergeCells(`G${t}:H${t}`);
      set(`E${t}`, { formula: `E${v}`, result: ig }, { numFmt: '0', alignment: ctr });
      set(`G${t}`, { formula: `G${v}`, result: ig }, { numFmt: '0.00', alignment: ctr });
    }
    boxRange(h1, 1, t, 8);

    r = t + 1;
    ws.getRow(r).height = 31.5;
    ws.mergeCells(`A${r}:H${r}`);
    set(`A${r}`, `Tax Amount (in words)  : ${amountInWords(gstAmt)}`, { font: { bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } });
  }

  // PAN + bank details
  const p1 = r + 1, p3 = r + 3;
  ws.getRow(p1).height = 15; ws.getRow(p3).height = 45.75;
  ws.mergeCells(`A${p1}:C${p3}`); ws.mergeCells(`D${p1}:H${p3}`);
  if (from.pan) set(`A${p1}`, `Company's PAN:     ${from.pan}`, { alignment: { horizontal: 'left', vertical: 'top' } });
  if (from.bankName || from.bankAccountNo) {
    set(`D${p1}`, [
      "Company's Bank Details",
      `Bank Name                   : ${from.bankName}`,
      `A/C No.                          : ${from.bankAccountNo}`,
      `Branch & IFSC Code  : ${from.bankBranchIfsc}`,
    ].join('\n'), { alignment: { horizontal: 'left', vertical: 'top', wrapText: true } });
  }

  // Signature block
  const gap = p3 + 1, s1 = p3 + 2, s3 = p3 + 4;
  ws.getRow(gap).height = 10.5; ws.getRow(s1).height = 15; ws.getRow(s3).height = 48;
  ws.mergeCells(`E${s1}:H${s3}`);
  set(`E${s1}`, `For ${from.signFor}\n\n\n\nAuthorised Signatory`, { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'top', wrapText: true } });
  try {
    const img = wb.addImage({ filename: SIGNATURE, extension: 'png' });
    ws.addImage(img, { tl: { col: 4.75, row: gap - 1 + 0.6 }, ext: { width: 125, height: 79 }, editAs: 'oneCell' });
  } catch (e) { /* signature is decorative — the bill is valid without it */ }

  ws.pageSetup.printArea = `A1:H${s3}`;
  return wb.xlsx.writeBuffer();
}

module.exports = { buildBillXlsx, amountInWords };
