const path = require('path');
const PDFDocument = require('pdfkit');
const { billModel } = require('./billModel');

// The bill as a PDF, drawn cell-for-cell like the Excel bill (billXlsx.js) —
// same columns, row heights, merged blocks and borders — then scaled to fit one
// A4 page the way Excel's "fit to page" prints it. Content from billModel.
const SIGNATURE = path.join(__dirname, '../assets/signature.png');
const GRID_ROWS = 18;
// Excel column width (characters) → points. Helvetica runs ~12% wider than
// Calibri, so columns get that much extra room to keep the sheet's wrapping.
const CHAR_PT = 6.3;

// `header` = { buffer, ext, width, height } from loadBillHeader, or null.
function buildBillPdf(invoice, { header } = {}) {
  const m = billModel(invoice);
  const colChars = [9.14, 31.57, 10.14, 10.57, 8.71, 9.14, 9.14, m.igst ? 14.57 : 9.14];
  const colX = [0];
  for (const w of colChars) colX.push(colX[colX.length - 1] + w * CHAR_PT);
  const sheetW = colX[8];

  // Row heights (points), mirroring the Excel sheet row by row.
  const H = [];
  const add = (h) => { H.push(h); return H.length - 1; };
  const band = add(130.5), head = add(38.25), parties = add(96.75), gridHead = add(15);
  const gridN = Math.max(GRID_ROWS, m.rows.length);
  const grid = [];
  for (let i = 0; i < gridN; i++) grid.push(add(15 * Math.max(1, Math.ceil(String(m.rows[i]?.location || '').length / 31))));
  const tTotal = add(15);
  const tGst = m.gst ? add(15) : null;
  const tGrand = add(15);
  const words = add(30);
  let tax = null;
  if (m.gst) {
    tax = { h1: add(15), h2: add(15) };
    if (!m.igst) tax.v = add(15);
    tax.t = add(15);
    tax.words = add(31.5);
  }
  const p1 = add(15); add(15); const p3 = add(45.75);
  add(10.5); const s1 = add(15); add(15); const s3 = add(48);
  const rowY = [0];
  for (const h of H) rowY.push(rowY[rowY.length - 1] + h);
  const sheetH = rowY[H.length];

  // Fit the sheet to one A4 page like Excel's "fit to page". The scale is
  // applied to every coordinate here (not via a PDF transform) because PDFKit
  // starts a new page from unscaled positions, which would split the bill.
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const M = 24;
  const S = Math.min((doc.page.width - 2 * M) / sheetW, (doc.page.height - 2 * M) / sheetH);
  const ox = (doc.page.width - sheetW * S) / 2, oy = M;
  const X = (v) => ox + v * S, Y = (v) => oy + v * S;
  doc.lineWidth(0.6).strokeColor('#000');

  // A merged block from (r1,c1) to (r2,c2), 0-based rows into H and cols 0..7.
  function cell(r1, c1, r2, c2, text, o = {}) {
    const x = X(colX[c1]), y = Y(rowY[r1]), w = (colX[c2 + 1] - colX[c1]) * S, h = (rowY[r2 + 1] - rowY[r1]) * S;
    if (o.fill) doc.save().rect(x, y, w, h).fill(o.fill).restore();
    if (o.border === 'box') doc.rect(x, y, w, h).stroke();
    else if (o.border === 'bottom') doc.moveTo(x, y + h).lineTo(x + w, y + h).stroke();
    if (text == null || text === '') return;
    // Helvetica sets ~10% larger than Calibri at the same size, so body text
    // drops to 10pt to sit inside the sheet's 15pt rows with room to spare.
    const fs = (o.size || 10) * S;
    doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs).fillColor(o.color || '#000');
    const pad = 4 * S;
    const opts = { width: w - 2 * pad, align: o.align || 'left', lineGap: 0 };
    const blockH = doc.heightOfString(String(text), opts);
    const lineH = doc.currentLineHeight(true);
    let ty;
    if (o.valign === 'top') ty = y + pad;
    else if (blockH <= lineH * 1.05) {
      // One line: put the capitals' middle on the row's middle, from the font's
      // own metrics (text is placed by the top of its line box, not the glyphs).
      const ascent = (doc._font.ascender / 1000) * fs;
      const capHeight = ((doc._font.capHeight || 718) / 1000) * fs;
      ty = y + h / 2 + capHeight / 2 - ascent;
    } else ty = y + (h - blockH) / 2;
    doc.text(String(text), x + pad, Math.max(y + 0.5, ty), opts);
  }
  const money = (n) => (n == null ? '' : String(Math.round(n)));
  const dec = (n) => Number(n || 0).toFixed(2);

  if (m.showHeader && header) {
    try { doc.image(header.buffer, X(0), Y(0), { fit: [sheetW * S, H[band] * S], align: 'center', valign: 'top' }); } catch (e) { /* optional */ }
  }
  if (m.cancelled) cell(band, 0, band, 7, m.cancelled, { bold: true, size: 16, color: '#dc2626', align: 'center' });
  if (m.invoiceNoText) cell(head, 0, head, 3, m.invoiceNoText.trim(), { bold: true, size: 12 });
  cell(head, 4, head, 7, m.dateText, { bold: true, size: 12, align: 'right' });
  cell(parties, 0, parties, 2, m.billTo.join('\n'), { bold: true, size: 12, valign: 'top' });
  cell(parties, 3, parties, 7, m.billFrom.join('\n'), { bold: true, size: 12, valign: 'top' });
  doc.moveTo(X(0), Y(rowY[parties + 1])).lineTo(X(sheetW), Y(rowY[parties + 1])).stroke();

  ['#', 'Location', 'From', 'Till', 'Duration', 'Qty', 'Price', 'Total'].forEach((t, c) => cell(gridHead, c, gridHead, c, t, { bold: true, border: 'box' }));
  grid.forEach((ri, i) => {
    const l = m.rows[i];
    for (let c = 0; c < 8; c++) cell(ri, c, ri, c, null, { border: 'box' });
    if (!l) return;
    cell(ri, 0, ri, 0, String(i + 1), { align: 'right' });
    cell(ri, 1, ri, 1, l.location);
    cell(ri, 2, ri, 2, l.from, { align: 'center', size: 10 });
    cell(ri, 3, ri, 3, l.till, { align: 'center', size: 10 });
    cell(ri, 4, ri, 4, l.duration, { align: 'center', size: 10 });
    cell(ri, 5, ri, 5, String(l.qty ?? ''), { align: 'right' });
    cell(ri, 6, ri, 6, money(l.price), { align: 'right' });
    cell(ri, 7, ri, 7, money(l.total), { align: 'right' });
  });

  const labelRow = (ri, text, value, o = {}) => {
    cell(ri, 0, ri, 6, text, { bold: true, align: 'right', border: 'box', fill: o.fill, color: o.color });
    cell(ri, 7, ri, 7, money(value), { align: 'right', border: 'box', fill: o.fill, color: o.color });
  };
  labelRow(tTotal, 'Total', m.taxable);
  if (m.gst) labelRow(tGst, 'GST @18%', m.gstAmount);
  labelRow(tGrand, 'Grand Total', m.total, { fill: '#F2DCDB', color: '#FF0000' });
  cell(words, 0, words, 7, m.wordsText, { bold: true, border: 'box' });

  if (m.gst) {
    const { h1, h2, v, t } = tax;
    cell(h1, 0, h2, 1, 'Taxable Value', { align: 'right', border: 'box' });
    if (!m.igst) {
      cell(h1, 2, h1, 3, 'CGST', { align: 'center', border: 'box' });
      cell(h1, 4, h1, 5, 'SGST/UTGST', { align: 'center', border: 'box' });
      cell(h1, 6, h2, 7, 'Total\nTax Amount', { align: 'center', border: 'box' });
      ['Rate', 'Amount', 'Rate', 'Amount'].forEach((s, i) => cell(h2, 2 + i, h2, 2 + i, s, { border: 'box' }));
      cell(v, 0, v, 0, null, { border: 'box' });
      cell(v, 1, v, 1, money(m.taxable), { align: 'right', border: 'box' });
      cell(v, 2, v, 2, '9%', { align: 'right', border: 'box' });
      cell(v, 3, v, 3, dec(m.cgst), { align: 'right', border: 'box' });
      cell(v, 4, v, 4, '9%', { align: 'right', border: 'box' });
      cell(v, 5, v, 5, dec(m.sgst), { align: 'right', border: 'box' });
      cell(v, 6, v, 7, dec(m.cgst + m.sgst), { align: 'center', border: 'box' });
      cell(t, 0, t, 0, 'TOTAL', { bold: true, border: 'box' });
      cell(t, 1, t, 1, money(m.taxable), { align: 'right', border: 'box' });
      cell(t, 2, t, 2, null, { border: 'box' });
      cell(t, 3, t, 3, dec(m.cgst), { align: 'right', border: 'box' });
      cell(t, 4, t, 4, null, { border: 'box' });
      cell(t, 5, t, 5, dec(m.sgst), { align: 'right', border: 'box' });
      cell(t, 6, t, 7, dec(m.cgst + m.sgst), { align: 'center', border: 'box' });
    } else {
      cell(h1, 2, h1, 5, 'IGST', { align: 'center', border: 'box' });
      cell(h1, 6, h2, 7, 'Total\nTax Amount', { align: 'center', border: 'box' });
      cell(h2, 2, h2, 3, 'Rate', { align: 'center', border: 'box' });
      cell(h2, 4, h2, 5, 'Amount', { align: 'center', border: 'box' });
      cell(t, 0, t, 0, 'TOTAL', { bold: true, border: 'box' });
      cell(t, 1, t, 1, money(m.taxable), { align: 'right', border: 'box' });
      cell(t, 2, t, 3, '18%', { align: 'center', border: 'box' });
      cell(t, 4, t, 5, money(m.igstAmount), { align: 'center', border: 'box' });
      cell(t, 6, t, 7, dec(m.igstAmount), { align: 'center', border: 'box' });
    }
    cell(tax.words, 0, tax.words, 7, m.taxWordsText, { bold: true });
  }

  if (m.panText) cell(p1, 0, p3, 2, m.panText, { valign: 'top' });
  if (m.bankText) cell(p1, 3, p3, 7, m.bankText, { valign: 'top' });
  cell(s1, 4, s3, 7, m.signText, { bold: true, align: 'center', valign: 'top' });
  try {
    doc.image(SIGNATURE, X(colX[4] + 0.75 * (colX[5] - colX[4])), Y(rowY[s1 - 1] + 6), { width: 94 * S, height: 59 * S });
  } catch (e) { /* signature is decorative — the bill is valid without it */ }

  return doc;
}

module.exports = { buildBillPdf };
