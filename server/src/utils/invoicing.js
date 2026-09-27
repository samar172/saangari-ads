const dayjs = require('dayjs');
const prisma = require('../db');
const { nextInvoiceNo } = require('./counters');
const { GST_RATE } = require('./pricing');
const { logActivity } = require('./activity');

// Monthly billing: an invoice defaults to being due on the last working day
// (Mon–Fri) of its issue month. Editable before the invoice is finalised.
function lastWorkingDayOfMonth(d) {
  let day = dayjs(d || undefined).endOf('month');
  while (day.day() === 0 || day.day() === 6) day = day.subtract(1, 'day');
  return day.startOf('day').toDate();
}

// GST split for a chosen tax category over a taxable amount.
function gstSplit(taxCategory, interState, taxableAmount) {
  const gstApplicable = taxCategory === 'GST';
  const gstAmount = gstApplicable ? Math.round(taxableAmount * GST_RATE / 100) : 0;
  let cgst = 0, sgst = 0, igst = 0;
  if (gstApplicable) {
    if (interState) igst = gstAmount;
    else { cgst = Math.round(gstAmount / 2); sgst = gstAmount - cgst; }
  }
  return { gstApplicable, gstAmount, cgst, sgst, igst, total: taxableAmount + gstAmount };
}

// Create the invoice for an order. Shared by Finance's direct POST and the
// approved GENERATE_INVOICE request, so both behave identically. Throws errors
// tagged with `.status` (and `.canForce` for the soft proof-of-display gate).
async function createInvoiceForOrder({ orderId, force = false, dueDate, user }) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: { client: true, company: true, items: { include: { photos: true } } },
  });
  if (!order) { const e = new Error('Order not found'); e.status = 404; throw e; }

  const existing = await prisma.invoice.findFirst({ where: { orderId: order.id, status: { not: 'CANCELLED' } } });
  if (existing) { const e = new Error(`${order.orderNo} already has an invoice (${existing.invoiceNo}). Void it before issuing a new one.`); e.status = 409; throw e; }

  const hasRegularLine = order.items.some((it) => it.type === 'REGULAR');
  const photoCount = order.items.reduce((n, it) => n + it.photos.length, 0);
  if (hasRegularLine && photoCount === 0 && !force) {
    const e = new Error('No monitoring photo uploaded yet (proof-of-display). You can invoice anyway.');
    e.status = 422; e.canForce = true; throw e;
  }

  const taxCategory = order.taxCategory;
  const interState = order.interState;
  const amount = order.taxableAmount;
  const split = gstSplit(taxCategory, interState, amount);
  const invoiceNo = await nextInvoiceNo(taxCategory);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo, orderId: order.id, clientId: order.clientId, companyId: order.companyId, taxCategory,
      interState, amount,
      gstRate: split.gstApplicable ? GST_RATE : 0,
      cgst: split.cgst, sgst: split.sgst, igst: split.igst, gstAmount: split.gstAmount,
      total: split.total, status: 'SENT', generatedById: user?.id,
      dueDate: dueDate ? new Date(dueDate) : lastWorkingDayOfMonth(new Date()),
    },
  });

  await prisma.ledgerEntry.create({
    data: { clientId: order.clientId, companyId: order.companyId, invoiceId: invoice.id, type: 'DEBIT', amount: split.total, narration: `Invoice ${invoiceNo}` },
  });

  logActivity({
    type: 'INVOICE', user, orderId: order.id, orderNo: order.orderNo, invoiceId: invoice.id,
    summary: `Invoice raised · ${invoiceNo}`,
    detail: `${order.client?.company?.trim() || order.client?.name || ''} · ₹${Number(split.total).toLocaleString('en-IN')}`,
  });
  return invoice;
}

module.exports = { createInvoiceForOrder, lastWorkingDayOfMonth, gstSplit };
