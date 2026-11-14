const path = require('path');
const ExcelJS = require('exceljs');
const { billModel, amountInWords } = require('./billModel');

// Tax invoice as an editable Excel bill, laid out exactly like the accounts
// team's own bill.xlsx: Calibri, a blank letterhead band, Bill To / Bill From,
// a bordered # / Location / From / Till / Duration / Qty / Price / Total grid,
// Total → GST @18% → Grand Total (red on pink), amount in words, the tax
// breakup table (CGST+SGST within Rajasthan, IGST across states), PAN (+ PO) +
// bank details and the signed "For SAANGARI ADS PVT LTD" block. Totals are
// live formulas (with cached results) so the sheet stays editable. Content
// comes from billModel, shared with the PDF.
const SIGNATURE = path.join(__dirname, '../assets/signature.png');
const GRID_ROWS = 18; // rows 5–22 in the reference sheet

// `header` = { buffer, ext, width, height } from loadBillHeader, or null.
async function buildBillXlsx(invoice, { header } = {}) {
  const m = billModel(invoice);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(String(invoice.invoiceNo).replace(/[\\/?*[\]:]/g, '-').slice(0, 31), {
    views: [{ zoomScale: 85, showGridLines: true }],
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      margins: { left: 0.5118, right: 0.5118, top: 0.1575, bottom: 0.1575, header: 0.315, footer: 0.315 },
    },
  });
  ws.columns = [
    { width: 9.14 }, { width: 31.57 }, { width: 10.14 }, { width: 10.57 },
    { width: 8.71 }, { width: 9.14 }, { width: 9.14 }, { width: m.igst ? 14.57 : 9.14 },
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
  if (m.showHeader && header) {
    // Fit inside the band (sheet width × 130.5pt ≈ 172px), aspect kept.
    // Excel column width ≈ 7px per character + 5px.
    const bandW = ws.columns.reduce((s, c) => s + c.width * 7 + 5, 0), bandH = 172;
    const k = Math.min(bandW / header.width, bandH / header.height);
    try {
      const img = wb.addImage({ buffer: header.buffer, extension: header.ext });
      ws.addImage(img, { tl: { col: 0, row: 0 }, ext: { width: Math.round(header.width * k), height: Math.round(header.height * k) }, editAs: 'oneCell' });
    } catch (e) { /* the bill is valid without the header */ }
  }
  if (m.cancelled) {
    set('A1', m.cancelled, { font: { bold: true, size: 16, color: { argb: 'FFDC2626' } }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } });
  }

  // Row 2 — invoice no. and date
  ws.getRow(2).height = 38.25;
  ws.mergeCells('A2:D2'); ws.mergeCells('E2:H2');
  if (m.invoiceNoText) set('A2', m.invoiceNoText, { font: { bold: true, size: 12 }, alignment: { horizontal: 'left' } });
  set('E2', m.dateText, { font: { bold: true, size: 12 }, alignment: { horizontal: 'right' } });

  // Row 3 — Bill To / Bill From
  ws.getRow(3).height = 96.75;
  ws.mergeCells('A3:C3'); ws.mergeCells('D3:H3');
  const top = { horizontal: 'left', vertical: 'top', wrapText: true };
  set('A3', m.billTo.join('\n'), { font: { bold: true, size: 12 }, alignment: top });
  set('D3', m.billFrom.join('\n'), { font: { bold: true, size: 12 }, alignment: top });
  for (let c = 1; c <= 8; c++) ws.getCell(3, c).border = { bottom: thin };

  // Row 4 — grid header
  ['#', 'Location', 'From', 'Till', 'Duration', 'Qty', 'Price', 'Total'].forEach((h, i) => {
    set(ws.getCell(4, i + 1).address, h, { font: { bold: true }, border: box, alignment: { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center', indent: i === 1 ? 1 : 0 } });
  });

  // Rows 5+ — line items, padded to the reference sheet's 18-row grid.
  const gridRows = Math.max(GRID_ROWS, m.rows.length);
  const first = 5, last = first + gridRows - 1;
  for (let i = 0; i < gridRows; i++) {
    const r = first + i;
    const l = m.rows[i];
    // Column B fits ~31 characters a line; grow the row for longer locations.
    ws.getRow(r).height = 15 * Math.max(1, Math.ceil(String(l?.location || '').length / 31));
    for (let c = 1; c <= 8; c++) ws.getCell(r, c).border = box;
    if (!l) continue;
    const center = { horizontal: 'center', vertical: 'middle' };
    const mid = { vertical: 'middle' };
    set(`A${r}`, i + 1, { border: box, alignment: { ...mid, horizontal: 'center' } });
    set(`B${r}`, l.location, { border: box, alignment: { ...mid, wrapText: true, indent: 1 } });
    if (l.from) set(`C${r}`, l.from, { border: box, alignment: center });
    if (l.till) set(`D${r}`, l.till, { border: box, alignment: center });
    if (l.duration) set(`E${r}`, l.duration, { border: box, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true } });
    set(`F${r}`, l.qty, { border: box, alignment: { ...mid, horizontal: 'center' } });
    set(`G${r}`, l.price, { border: box, alignment: { ...mid, horizontal: 'right', indent: 1 } });
    // A part-month row prints the monthly rate as Price, so its Total is the
    // prorated amount itself rather than Qty × Price.
    set(`H${r}`, l.prorated ? l.total : { formula: `F${r}*G${r}`, result: l.total }, { border: box, alignment: { ...mid, horizontal: 'right', indent: 1 } });
  }

  // Totals
  let r = last + 1;
  const tTotal = r;
  const labelRow = (row, text, valueCell, opts = {}) => {
    ws.mergeCells(`A${row}:G${row}`);
    set(`A${row}`, text, { font: { bold: true, ...(opts.font || {}) }, alignment: { horizontal: 'right', vertical: 'middle', indent: 1 }, fill: opts.fill });
    boxRange(row, 1, row, 7);
    set(`H${row}`, valueCell, { border: box, font: opts.font, fill: opts.fill, alignment: { horizontal: 'right', vertical: 'middle', indent: 1 } });
  };
  labelRow(r, 'Total', { formula: `SUM(H${first}:H${last})`, result: m.taxable });
  let tGst = null;
  if (m.gst) {
    r += 1; tGst = r;
    labelRow(r, 'GST @18%', { formula: `ROUND(H${tTotal}*18%,0)`, result: m.gstAmount });
  }
  r += 1;
  const red = { color: { argb: 'FFFF0000' } };
  const pink = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2DCDB' } };
  labelRow(r, 'Grand Total', { formula: m.gst ? `H${tTotal}+H${tGst}` : `H${tTotal}`, result: m.total }, { font: red, fill: pink });

  // Amount in words
  r += 1;
  ws.getRow(r).height = 30;
  ws.mergeCells(`A${r}:H${r}`);
  set(`A${r}`, m.wordsText, { font: { bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } });
  boxRange(r, 1, r, 8);

  // Tax breakup — CGST + SGST within the state, IGST across states.
  if (m.gst) {
    const h1 = r + 1, h2 = r + 2;
    const ctr = { horizontal: 'center' };
    ws.getRow(h1).height = 15;
    ws.mergeCells(`A${h1}:B${h2}`);
    set(`A${h1}`, 'Taxable Value', { alignment: { horizontal: 'right', vertical: 'middle' } });
    let t;
    if (!m.igst) {
      const v = r + 3; t = r + 4;
      ws.mergeCells(`C${h1}:D${h1}`); ws.mergeCells(`E${h1}:F${h1}`); ws.mergeCells(`G${h1}:H${h2}`);
      set(`C${h1}`, 'CGST', { alignment: ctr });
      set(`E${h1}`, 'SGST/UTGST', { alignment: ctr });
      set(`G${h1}`, 'Total \nTax Amount', { alignment: { horizontal: 'center', wrapText: true } });
      set(`C${h2}`, 'Rate'); set(`D${h2}`, 'Amount'); set(`E${h2}`, 'Rate'); set(`F${h2}`, 'Amount');
      set(`B${v}`, { formula: `H${tTotal}`, result: m.taxable });
      set(`C${v}`, 0.09, { numFmt: '0%' });
      set(`D${v}`, { formula: `ROUND(H${tGst}/2,0)`, result: m.cgst }, { numFmt: '0.00;[Red]0.00' });
      set(`E${v}`, 0.09, { numFmt: '0%' });
      set(`F${v}`, { formula: `H${tGst}-D${v}`, result: m.sgst }, { numFmt: '0.00;[Red]0.00' });
      ws.mergeCells(`G${v}:H${v}`);
      set(`G${v}`, { formula: `D${v}+F${v}`, result: m.cgst + m.sgst }, { alignment: ctr, numFmt: '0.00' });
      set(`A${t}`, 'TOTAL', { font: { bold: true } });
      set(`B${t}`, { formula: `B${v}`, result: m.taxable });
      set(`D${t}`, { formula: `D${v}`, result: m.cgst }, { numFmt: '0.00;[Red]0.00' });
      set(`F${t}`, { formula: `F${v}`, result: m.sgst }, { numFmt: '0.00;[Red]0.00' });
      ws.mergeCells(`G${t}:H${t}`);
      set(`G${t}`, { formula: `G${v}`, result: m.cgst + m.sgst }, { alignment: ctr, numFmt: '0.00' });
    } else {
      // IGST, as on the IGST sheet: header, Rate / Amount, then one TOTAL row.
      t = r + 3;
      ws.mergeCells(`C${h1}:F${h1}`); ws.mergeCells(`G${h1}:H${h2}`);
      ws.mergeCells(`C${h2}:D${h2}`); ws.mergeCells(`E${h2}:F${h2}`);
      set(`C${h1}`, 'IGST', { alignment: ctr });
      set(`G${h1}`, 'Total \nTax Amount', { alignment: { horizontal: 'center', wrapText: true } });
      set(`C${h2}`, 'Rate', { alignment: ctr }); set(`E${h2}`, 'Amount', { alignment: ctr });
      set(`A${t}`, 'TOTAL', { font: { bold: true } });
      set(`B${t}`, { formula: `H${tTotal}`, result: m.taxable });
      ws.mergeCells(`C${t}:D${t}`); ws.mergeCells(`E${t}:F${t}`); ws.mergeCells(`G${t}:H${t}`);
      set(`C${t}`, 0.18, { numFmt: '0%', alignment: ctr });
      set(`E${t}`, { formula: `H${tGst}`, result: m.igstAmount }, { numFmt: '0', alignment: ctr });
      set(`G${t}`, { formula: `E${t}`, result: m.igstAmount }, { numFmt: '0.00', alignment: ctr });
    }
    boxRange(h1, 1, t, 8);

    r = t + 1;
    ws.getRow(r).height = 31.5;
    ws.mergeCells(`A${r}:H${r}`);
    set(`A${r}`, m.taxWordsText, { font: { bold: true }, alignment: { horizontal: 'left', vertical: 'middle' } });
  }

  // PAN (+ PO) and bank details — GST bills only, as on the sheets.
  const p1 = r + 1, p3 = r + 3;
  ws.getRow(p1).height = 15; ws.getRow(p3).height = 45.75;
  ws.mergeCells(`A${p1}:C${p3}`); ws.mergeCells(`D${p1}:H${p3}`);
  if (m.panText) set(`A${p1}`, m.panText, { alignment: { horizontal: 'left', vertical: 'top', wrapText: true } });
  if (m.bankText) set(`D${p1}`, m.bankText, { alignment: { horizontal: 'left', vertical: 'top', wrapText: true } });

  // Signature block
  const gap = p3 + 1, s1 = p3 + 2, s3 = p3 + 4;
  ws.getRow(gap).height = 10.5; ws.getRow(s1).height = 15; ws.getRow(s3).height = 48;
  ws.mergeCells(`E${s1}:H${s3}`);
  set(`E${s1}`, m.signText, { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'top', wrapText: true } });
  try {
    const img = wb.addImage({ filename: SIGNATURE, extension: 'png' });
    ws.addImage(img, { tl: { col: 4.75, row: gap - 1 + 0.6 }, ext: { width: 125, height: 79 }, editAs: 'oneCell' });
  } catch (e) { /* signature is decorative — the bill is valid without it */ }

  ws.pageSetup.printArea = `A1:H${s3}`;
  return wb.xlsx.writeBuffer();
}

module.exports = { buildBillXlsx, amountInWords };
