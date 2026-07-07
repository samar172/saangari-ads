const prisma = require('../db');

// Atomic per-key sequence, used for booking and invoice numbering.
async function nextNumber(key) {
  const row = await prisma.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return row.value;
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

async function nextInvoiceNo(taxCategory) {
  const fy = financialYear();
  const prefix = taxCategory === 'GST' ? 'GST' : 'NGST';
  const n = await nextNumber(`INV-${prefix}-${fy}`);
  return `${prefix}/${fy}/${String(n).padStart(4, '0')}`;
}

module.exports = { nextBookingNo, nextInvoiceNo, financialYear };
