const dayjs = require('dayjs');
const prisma = require('../db');
const { nextInvoiceNo } = require('./counters');
const { GST_RATE } = require('./pricing');
const { logActivity } = require('./activity');
const { billingPlan, periodsFor, draftFor, othersTaxable } = require('./billingPlan');

// How long a freshly generated invoice stays editable. After this it locks;
// a wrong bill is then cancelled (with a reason) and re-issued.
const EDIT_WINDOW_HOURS = 24;

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

// Is this invoice still inside its edit window? Paid and cancelled invoices are
// always locked; invoices issued before the window existed are locked too.
function lockState(invoice, now = new Date()) {
  if (invoice.status === 'CANCELLED') return { editable: false, reason: 'Cancelled' };
  if (invoice.status === 'PAID') return { editable: false, reason: 'Paid — locked' };
  if (!invoice.editableUntil) return { editable: false, reason: 'Locked' };
  if (new Date(invoice.editableUntil) <= now) return { editable: false, reason: `Locked since ${dayjs(invoice.editableUntil).format('DD MMM YYYY, hh:mm A')}` };
  return { editable: true, editableUntil: invoice.editableUntil };
}

const planInclude = { client: true, company: true, addOns: true, invoices: true, items: { include: { photos: true, site: true } } };

// Roll the campaign's "next bill due" to the start of its next unbilled period
// (cleared when everything is billed). One-time campaigns are left alone.
async function rollNextBillingDate(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: planInclude });
  if (!order?.billingCycle) return;
  const next = billingPlan(order).next;
  await prisma.order.update({ where: { id: orderId }, data: { nextBillingDate: next ? next.periodStart : null } });
}

// Create the invoice for an order's next unbilled period (or `periodIndex`).
// Shared by Finance's direct POST and the approved GENERATE_INVOICE request.
// Throws errors tagged with `.status` (and `.canForce` for the soft
// proof-of-display gate).
async function createInvoiceForOrder({ orderId, force = false, dueDate, user, periodIndex }) {
  const order = await prisma.order.findUnique({ where: { id: Number(orderId) }, include: planInclude });
  if (!order) { const e = new Error('Order not found'); e.status = 404; throw e; }

  const plan = billingPlan(order);
  if (!plan.periods.length) { const e = new Error(`${order.orderNo} has no billable sites.`); e.status = 400; throw e; }
  const target = periodIndex != null && periodIndex !== '' ? plan.periods[Number(periodIndex)] : plan.next;
  if (!target) {
    const e = new Error(plan.cycle
      ? `${order.orderNo} is fully invoiced — every billing period already has a bill.`
      : `${order.orderNo} already has an invoice. Cancel it before issuing a new one.`);
    e.status = 409; throw e;
  }
  if (target.invoice) { const e = new Error(`${target.label || 'This period'} is already invoiced (${target.invoice.invoiceNo}).`); e.status = 409; throw e; }

  const hasRegularLine = order.items.some((it) => it.type === 'REGULAR');
  const photoCount = order.items.reduce((n, it) => n + it.photos.length, 0);
  if (hasRegularLine && photoCount === 0 && !force) {
    const e = new Error('No monitoring photo uploaded yet (proof-of-display). You can invoice anyway.');
    e.status = 422; e.canForce = true; throw e;
  }

  const draft = target.draft;
  const taxCategory = order.taxCategory;
  const interState = order.interState;
  const split = gstSplit(taxCategory, interState, draft.taxable);
  const invoiceNo = await nextInvoiceNo(taxCategory);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo, orderId: order.id, clientId: order.clientId, companyId: order.companyId, taxCategory,
      interState, amount: draft.taxable,
      gstRate: split.gstApplicable ? GST_RATE : 0,
      cgst: split.cgst, sgst: split.sgst, igst: split.igst, gstAmount: split.gstAmount,
      total: split.total, status: 'SENT', generatedById: user?.id,
      dueDate: dueDate ? new Date(dueDate) : lastWorkingDayOfMonth(new Date()),
      periodStart: draft.periodStart, periodEnd: draft.periodEnd, periodLabel: draft.label,
      lines: draft.rows,
      editableUntil: dayjs().add(EDIT_WINDOW_HOURS, 'hour').toDate(),
    },
  });

  await prisma.ledgerEntry.create({
    data: { clientId: order.clientId, companyId: order.companyId, invoiceId: invoice.id, type: 'DEBIT', amount: split.total, narration: `Invoice ${invoiceNo}` },
  });
  await rollNextBillingDate(order.id);

  logActivity({
    type: 'INVOICE', user, orderId: order.id, orderNo: order.orderNo, invoiceId: invoice.id,
    summary: `Invoice raised · ${invoiceNo}${draft.label ? ` · ${draft.label}` : ''}`,
    detail: `${order.client?.company?.trim() || order.client?.name || ''} · ₹${Number(split.total).toLocaleString('en-IN')} · editable for ${EDIT_WINDOW_HOURS}h`,
  });
  return invoice;
}

// Re-draft an existing invoice from the campaign's current commercials (used
// by the in-window edit). Keeps its own period; other bills are untouched.
async function redraftInvoice(invoiceId) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  const order = await prisma.order.findUnique({ where: { id: invoice.orderId }, include: planInclude });
  const others = order.invoices.filter((i) => i.status !== 'CANCELLED' && i.id !== invoice.id);
  // An invoice from before billing periods existed covered the whole run.
  const periods = invoice.periodStart ? periodsFor(order) : periodsFor({ ...order, billingCycle: null });
  let index = invoice.periodStart ? periods.findIndex((p) => p.start.isSame(dayjs(invoice.periodStart).startOf('day'))) : 0;
  if (index < 0) index = 0;
  return draftFor(order, periods, index, othersTaxable(order, periods, index, others));
}

// Cancel a wrong bill. Never deletes: the invoice stays on record (number kept)
// marked CANCELLED with who/when/why, its amount is reversed in the client's
// ledger with a matching credit, and the period becomes billable again.
async function cancelInvoice({ invoiceId, reason, user }) {
  const why = String(reason || '').trim();
  if (!why) { const e = new Error('A reason is required to cancel an invoice.'); e.status = 400; throw e; }
  const invoice = await prisma.invoice.findUnique({ where: { id: Number(invoiceId) }, include: { order: { select: { orderNo: true } } } });
  if (!invoice) { const e = new Error('Invoice not found'); e.status = 404; throw e; }
  if (invoice.status === 'CANCELLED') { const e = new Error(`${invoice.invoiceNo} is already cancelled.`); e.status = 409; throw e; }

  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: why, cancelledById: user?.id || null, cancelledByName: user?.name || null, editableUntil: null },
    });
    await tx.ledgerEntry.create({
      data: {
        clientId: invoice.clientId, companyId: invoice.companyId, invoiceId: invoice.id, type: 'CREDIT', amount: invoice.total,
        narration: `Invoice ${invoice.invoiceNo} cancelled — ${why}`.slice(0, 250),
      },
    });
    return inv;
  });
  await rollNextBillingDate(invoice.orderId);

  logActivity({
    type: 'INVOICE_CANCEL', user, orderId: invoice.orderId, orderNo: invoice.order?.orderNo, invoiceId: invoice.id,
    summary: `Invoice cancelled · ${invoice.invoiceNo}`,
    detail: `₹${Number(invoice.total).toLocaleString('en-IN')} reversed · ${why}`,
  });
  return updated;
}

module.exports = {
  createInvoiceForOrder, redraftInvoice, cancelInvoice, lockState, rollNextBillingDate,
  lastWorkingDayOfMonth, gstSplit, EDIT_WINDOW_HOURS, planInclude,
};
