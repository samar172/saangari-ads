const prisma = require('../db');

// Atomic per-key sequence, used for order/booking/invoice numbering.
async function nextNumber(key) {
  const row = await prisma.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return row.value;
}

async function nextOrderNo() {
  const n = await nextNumber('ORDER');
  return `SO-${String(n).padStart(5, '0')}`;
}

async function nextBookingNo() {
  const n = await nextNumber('BOOKING');
  return `BK-${String(n).padStart(5, '0')}`;
}

// Separate numbering sequences for GST and Non-GST invoices, per financial year (Apr–Mar).
function financialYear(date = new Date()) {
  const y = date.getFullYear();
  const start = date.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

// Business Setup → Invoice numbering (Company.settings.invoice). Active when the
// business has set a prefix or a starting number, from its start date on.
function invoiceSeries(settings, taxCategory, date = new Date()) {
  const v = settings && settings.invoice;
  if (!v || (!v.prefix && !v.startNo)) return null;
  if (v.startDate && dayStr(date) < v.startDate) return null;
  const prefix = v.prefix || (taxCategory === 'GST' ? 'GST' : 'NGST');
  const fy = financialYear(date);
  const fmt = (n) => [prefix, v.includeFY === false ? null : fy, String(n).padStart(v.digits || 4, '0')].filter(Boolean).join('/');
  return { prefix, fy, key: `INV-S-${v.companyId}-${prefix}-${fy}`, fmt };
}
const dayStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function seriesFor(companyId, taxCategory, date) {
  const c = companyId ? await prisma.company.findUnique({ where: { id: Number(companyId) }, select: { settings: true } }) : null;
  const st = c?.settings?.invoice ? { invoice: { ...c.settings.invoice, companyId: Number(companyId) } } : null;
  return invoiceSeries(st, taxCategory, date);
}

async function nextInvoiceNo(taxCategory, companyId) {
  const sr = await seriesFor(companyId, taxCategory);
  if (sr) {
    // Skip any number that is already taken (e.g. issued before the series was set).
    for (let i = 0; i < 1000; i++) {
      const no = sr.fmt(await nextNumber(sr.key));
      if (!(await prisma.invoice.findUnique({ where: { invoiceNo: no }, select: { id: true } }))) return no;
    }
    throw new Error('Could not find a free invoice number — check the invoice series in Business Setup.');
  }
  const fy = financialYear();
  const prefix = taxCategory === 'GST' ? 'GST' : 'NGST';
  const n = await nextNumber(`INV-${prefix}-${fy}`);
  return `${prefix}/${fy}/${String(n).padStart(4, '0')}`;
}

// The number the next bill would get, without using it up.
async function peekInvoiceNo(companyId, taxCategory) {
  const sr = await seriesFor(companyId, taxCategory);
  if (!sr) {
    const fy = financialYear(); const prefix = taxCategory === 'GST' ? 'GST' : 'NGST';
    const row = await prisma.counter.findUnique({ where: { key: `INV-${prefix}-${fy}` } });
    return `${prefix}/${fy}/${String((row?.value || 0) + 1).padStart(4, '0')}`;
  }
  const row = await prisma.counter.findUnique({ where: { key: sr.key } });
  let n = (row?.value || 0) + 1;
  while (await prisma.invoice.findUnique({ where: { invoiceNo: sr.fmt(n) }, select: { id: true } })) n++;
  return sr.fmt(n);
}

// Saving a new starting number moves the counter so the next bill is that number.
// Returns an error message when that number is already taken.
async function applyInvoiceStart(companyId, prev, next) {
  const v = next && next.invoice;
  if (!v || !v.startNo) return null;
  const p = prev && prev.invoice;
  if (p && p.startNo === v.startNo && p.startDate === v.startDate && p.prefix === v.prefix && p.includeFY === v.includeFY && p.digits === v.digits) return null;
  const when = v.startDate ? new Date(`${v.startDate}T12:00:00`) : new Date();
  const cats = v.prefix ? ['GST'] : ['GST', 'NON_GST'];
  for (const cat of cats) {
    const sr = invoiceSeries({ invoice: { ...v, companyId: Number(companyId), startDate: '' } }, cat, when);
    const taken = await prisma.invoice.findUnique({ where: { invoiceNo: sr.fmt(v.startNo) }, select: { invoiceNo: true } });
    if (taken) return `Invoice ${taken.invoiceNo} already exists — start the series after your last bill number.`;
    await prisma.counter.upsert({ where: { key: sr.key }, update: { value: v.startNo - 1 }, create: { key: sr.key, value: v.startNo - 1 } });
  }
  return null;
}

// Quotation letters: BKN/<FY>/PR/<n>, a fresh sequence each financial year.
async function nextQuoteNo(date = new Date()) {
  const fy = financialYear(date);
  const n = await nextNumber(`QUOTE-${fy}`);
  return `BKN/${fy}/PR/${n}`;
}

async function nextReprintNo() {
  const n = await nextNumber('REPRINT');
  return `RP-${String(n).padStart(4, '0')}`;
}

module.exports = { peekInvoiceNo, applyInvoiceStart, nextOrderNo, nextBookingNo, nextInvoiceNo, nextQuoteNo, nextReprintNo, financialYear };
