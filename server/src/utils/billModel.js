const { BILLABLE, durationLabel } = require('./billingPlan');

// Everything printed on a bill, worked out once and drawn twice — as the Excel
// bill (billXlsx.js) and as the PDF (billPdf.js) — so the two always match the
// accounts team's bill.xlsx: Bill To / Bill From, the # / Location / From /
// Till / Duration / Qty / Price / Total grid, Total → GST → Grand Total, amount
// in words, the CGST+SGST or IGST table, PAN (+ PO), bank and the signed block.
// Non-GST bills follow their sheet exactly: no invoice number, PAN or bank.

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
const dmySlash = (d) => dmy(d).replace(/\./g, '/');

// Bill From prints the legal name the way the sheets do: "Saangari Ads PVT LTD".
const shortLegal = (name) => String(name || '').replace(/private limited/i, 'PVT LTD').replace(/pvt\.? ?ltd\.?/i, 'PVT LTD').trim();

// Grid rows. Rows from an issued invoice's snapshot; a part-month site row shows
// the monthly rate as Price with the prorated amount as Total (Qty × Price
// doesn't apply to it). Older invoices without a snapshot are rebuilt from the
// campaign.
function gridRows(invoice) {
  if (Array.isArray(invoice.lines)) {
    return invoice.lines.map((r) => {
      const amount = (r.qty || 1) * r.price;
      const showRate = r.rate && Math.round(r.rate) !== Math.round(r.price);
      return {
        location: r.location, from: r.from ? dmy(r.from) : '', till: r.till ? dmy(r.till) : '',
        duration: r.duration || '', qty: r.qty, price: showRate ? Math.round(r.rate) : r.price, total: amount,
        prorated: !!showRate,
      };
    });
  }
  const order = invoice.order;
  const rows = [];
  const billable = order.items.filter((l) => BILLABLE.includes(l.status));
  const items = billable.length ? billable : order.items;
  for (const it of items) {
    rows.push({
      location: it.site?.billName || it.site?.location || it.site?.code || '',
      from: dmy(it.startDate), till: dmy(it.stoppedAt || it.endDate),
      duration: durationLabel(it.days), qty: 1, price: Math.round(it.subtotal), total: Math.round(it.subtotal),
    });
  }
  const pm = Math.round((order.printingTotal || 0) + (order.mountingCost || 0));
  if (pm) {
    const qty = Number(order.noOfPrints) > 0 ? Number(order.noOfPrints) : Math.max(1, items.length);
    const label = order.printingTotal && order.mountingCost ? 'Print & Mount' : order.printingTotal ? 'Printing' : 'Mounting';
    if (pm % qty === 0) rows.push({ location: label, qty, price: pm / qty, total: pm });
    else rows.push({ location: label, qty: 1, price: pm, total: pm });
  }
  for (const a of order.addOns || []) {
    if (Number(a.amount)) rows.push({ location: a.label, qty: 1, price: Math.round(a.amount), total: Math.round(a.amount) });
  }
  if (order.discountAmount) {
    const pct = order.discountFlat > 0 ? '' : ` (${order.discountPct}%)`;
    rows.push({ location: `Less: Discount${pct}`, qty: 1, price: -Math.round(order.discountAmount), total: -Math.round(order.discountAmount) });
  }
  const diff = Math.round(invoice.amount) - rows.reduce((s, r) => s + r.total, 0);
  if (diff) rows.push({ location: 'Adjustment', qty: 1, price: diff, total: diff });
  return rows;
}

function billModel(invoice) {
  const company = invoice.company || {};
  const client = invoice.client || {};
  const gst = invoice.taxCategory === 'GST';
  const igst = gst && invoice.interState;
  const fromName = shortLegal(company.legalName || company.name);
  const addressLines = String(company.address || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  // Bank printed on the bill: the account picked for this invoice; older
  // invoices fall back to the business's single saved account.
  const bank = invoice.bankAccountNo
    ? { name: invoice.bankName, accountNo: invoice.bankAccountNo, branchIfsc: invoice.bankBranchIfsc }
    : (company.bankAccountNo ? { name: company.bankName, accountNo: company.bankAccountNo, branchIfsc: company.bankBranchIfsc } : null);

  const rows = gridRows(invoice);
  return {
    gst, igst,
    // The header image (see billHeader.js) goes in the top band — except on a
    // cancelled bill, where the band carries the CANCELLED stamp instead.
    showHeader: invoice.status !== 'CANCELLED',
    cancelled: invoice.status === 'CANCELLED'
      ? `CANCELLED${invoice.cancelledAt ? ` on ${dmy(invoice.cancelledAt)}` : ''}${invoice.cancelReason ? ` — ${invoice.cancelReason}` : ''}`
      : null,
    // Non-GST sheets carry no invoice number.
    invoiceNoText: gst ? `           Invoice No.:    ${invoice.invoiceNo}` : '',
    dateText: gst ? `Date:- ${dmy(invoice.issuedAt)}` : `DATE:-${dmy(invoice.issuedAt)}`,
    billTo: ['Bill To', (client.company && client.company.trim()) || client.name, client.address,
      gst && client.gstNumber ? `GSTIN/UIN : ${client.gstNumber}` : null].filter(Boolean),
    billFrom: ['Bill From', fromName, ...addressLines, gst && company.gstin ? `GST No.  : ${company.gstin}` : null].filter(Boolean),
    rows,
    taxable: Math.round(invoice.amount),
    gstAmount: Math.round(invoice.gstAmount || 0),
    cgst: Math.round(invoice.cgst || 0), sgst: Math.round(invoice.sgst || 0), igstAmount: Math.round(invoice.igst || 0),
    total: Math.round(invoice.total),
    // The GST sheets label the words; the Non-GST sheet prints the words alone.
    wordsText: gst ? `Amount chargable (In Words) :    ${amountInWords(invoice.total)}` : amountInWords(invoice.total),
    taxWordsText: gst ? `Tax Amount (in words)  : ${amountInWords(invoice.gstAmount)}` : null,
    panText: gst ? [
      company.pan ? `Company's PAN:     ${company.pan}` : null,
      invoice.poNumber ? `PO No.-${invoice.poNumber}${invoice.poDate ? ` Date:- ${dmySlash(invoice.poDate)}` : ''}` : null,
    ].filter(Boolean).join('\n') : '',
    bankText: gst && bank ? [
      "Company's Bank Details",
      `Bank Name                   : ${bank.name || ''}`,
      `A/C No.                          : ${bank.accountNo || ''}`,
      `Branch & IFSC Code  : ${bank.branchIfsc || ''}`,
    ].join('\n') : '',
    signText: `For ${fromName.toUpperCase()}\n\n\n\nAuthorised Signatory`,
  };
}

module.exports = { billModel, amountInWords, dmy };
