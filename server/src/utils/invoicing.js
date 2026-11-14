const dayjs = require('dayjs');
const prisma = require('../db');
const { nextInvoiceNo } = require('./counters');
const { GST_RATE } = require('./pricing');
const { logActivity } = require('./activity');
const { billingPlan, redraftFor } = require('./billingPlan');

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

// The business's bank accounts a bill can show ([{ id, label, bankName,
// accountNo, branchIfsc }]); the older single-account fields count as one.
function bankAccountsOf(company) {
  const list = Array.isArray(company?.bankAccounts) ? company.bankAccounts.filter((a) => a && a.accountNo) : [];
  if (!list.length && company?.bankAccountNo) {
    list.push({ id: 'legacy', label: company.bankName, bankName: company.bankName, accountNo: company.bankAccountNo, branchIfsc: company.bankBranchIfsc });
  }
  return list;
}

// Default account for a new bill: the one last used for this client, else the
// business's first account.
async function defaultBankFor(order) {
  const accounts = bankAccountsOf(order.company);
  if (!accounts.length) return null;
  const last = await prisma.invoice.findFirst({
    where: { clientId: order.clientId, companyId: order.companyId, bankAccountNo: { not: null } },
    orderBy: { id: 'desc' }, select: { bankAccountNo: true },
  });
  return accounts.find((a) => a.accountNo === last?.bankAccountNo) || accounts[0];
}

const planInclude = { client: true, company: true, addOns: true, invoices: true, reprints: true, items: { include: { photos: true, site: true } } };

// Roll the campaign's "next bill due" to its next unbilled period — or the
// first unbilled day when custom bills left a gap — cleared when everything is
// billed. One-time campaigns are left alone.
async function rollNextBillingDate(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: planInclude });
  if (!order?.billingCycle) return;
  const plan = billingPlan(order);
  const next = plan.next ? plan.next.periodStart : plan.nextUnbilledDate;
  await prisma.order.update({ where: { id: orderId }, data: { nextBillingDate: next || null } });
}

// Create an invoice for a chosen billing period (`periodIndex`), a custom
// `start`–`end` range, or — when neither is given — the next unbilled period.
// Shared by Finance's direct POST and the approved GENERATE_INVOICE request.
// Throws errors tagged with `.status` (and `.canForce` for the soft
// proof-of-display gate).
async function createInvoiceForOrder({ orderId, force = false, dueDate, user, periodIndex, start, end, bankAccountId, poNumber, poDate }) {
  const order = await prisma.order.findUnique({ where: { id: Number(orderId) }, include: planInclude });
  if (!order) { const e = new Error('Order not found'); e.status = 404; throw e; }
  const fail = (msg, status) => { const e = new Error(msg); e.status = status; throw e; };

  const plan = billingPlan(order, start && end ? { start, end } : undefined);
  if (!plan.periods.length) fail(`${order.orderNo} has no billable sites.`, 400);
  let draft;
  if (start && end) {
    if (plan.custom.error) fail(plan.custom.error, 409);
    draft = plan.custom.draft;
  } else {
    const target = periodIndex != null && periodIndex !== '' ? plan.periods[Number(periodIndex)] : plan.next;
    if (!target) {
      fail(plan.fullyBilled
        ? `${order.orderNo} is fully invoiced — every day of the campaign already has a bill.`
        : `No full billing period is left unbilled on ${order.orderNo}. Use custom dates to bill the remaining days.`, 409);
    }
    if (target.status !== 'OPEN') {
      fail(`${target.label || 'This period'} is already ${target.status === 'BILLED' ? 'invoiced' : 'partly invoiced'} (${target.invoices.map((i) => i.invoiceNo).join(', ')}). Use custom dates for the remaining days.`, 409);
    }
    draft = target.billNow;
  }

  const hasRegularLine = order.items.some((it) => it.type === 'REGULAR');
  const photoCount = order.items.reduce((n, it) => n + it.photos.length, 0);
  if (hasRegularLine && photoCount === 0 && !force) {
    const e = new Error('No monitoring photo uploaded yet (proof-of-display). You can invoice anyway.');
    e.status = 422; e.canForce = true; throw e;
  }

  const taxCategory = order.taxCategory;
  const interState = order.interState;
  const split = gstSplit(taxCategory, interState, draft.taxable);
  // Bank printed on the bill (GST bills): the one picked, else the default.
  const accounts = bankAccountsOf(order.company);
  const bank = (bankAccountId && accounts.find((a) => String(a.id) === String(bankAccountId))) || await defaultBankFor(order);
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
      bankName: bank?.bankName || null, bankAccountNo: bank?.accountNo || null, bankBranchIfsc: bank?.branchIfsc || null,
      poNumber: poNumber ? String(poNumber).trim() : null,
      poDate: poDate ? new Date(poDate) : null,
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
  if (invoice.reprintId) { const e = new Error(`${invoice.invoiceNo} is a reprint bill — cancel it and bill the reprint again to correct it.`); e.status = 409; throw e; }
  const order = await prisma.order.findUnique({ where: { id: invoice.orderId }, include: planInclude });
  return redraftFor(order, invoice);
}

// Reopen a locked invoice for another 24-hour edit window (after approval,
// or directly by a Manager/Admin). Paid and cancelled bills can't be reopened —
// those are corrected by cancel & re-issue. Logged with who/why.
async function unlockInvoice({ invoiceId, reason, user, requestedBy }) {
  const why = String(reason || '').trim();
  if (!why) { const e = new Error('A reason is required to reopen an invoice.'); e.status = 400; throw e; }
  const invoice = await prisma.invoice.findUnique({ where: { id: Number(invoiceId) }, include: { order: { select: { orderNo: true } } } });
  if (!invoice) { const e = new Error('Invoice not found'); e.status = 404; throw e; }
  if (invoice.status === 'CANCELLED') { const e = new Error(`${invoice.invoiceNo} is cancelled — generate a fresh invoice instead.`); e.status = 409; throw e; }
  if (invoice.status === 'PAID') { const e = new Error(`${invoice.invoiceNo} is paid — cancel and re-issue it to correct it.`); e.status = 409; throw e; }
  if (lockState(invoice).editable) { const e = new Error(`${invoice.invoiceNo} is already editable.`); e.status = 409; throw e; }
  if (invoice.reprintId) { const e = new Error(`${invoice.invoiceNo} is a reprint bill — cancel it and bill the reprint again to correct it.`); e.status = 409; throw e; }
  const editableUntil = dayjs().add(EDIT_WINDOW_HOURS, 'hour').toDate();
  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { editableUntil } });
  logActivity({
    type: 'INVOICE_UNLOCK', user, orderId: invoice.orderId, orderNo: invoice.order?.orderNo, invoiceId: invoice.id,
    summary: `Invoice reopened for ${EDIT_WINDOW_HOURS}h · ${invoice.invoiceNo}`,
    detail: `${requestedBy ? `Requested by ${requestedBy} · ` : ''}${why}`,
  });
  return updated;
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
    // A cancelled reprint bill leaves its reprint unbilled again.
    if (invoice.reprintId) await tx.reprint.updateMany({ where: { id: invoice.reprintId, invoiceId: invoice.id }, data: { invoiceId: null } });
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

// A separate bill for one client-paid reprint (its sites' printing + mounting).
// Locked from the start (no in-window edit — cancel and re-bill to correct);
// kept outside the campaign's period coverage.
async function createReprintInvoice({ reprintId, user, dueDate }) {
  const rp = await prisma.reprint.findUnique({ where: { id: Number(reprintId) } });
  if (!rp) { const e = new Error('Reprint not found'); e.status = 404; throw e; }
  if (rp.chargeTo !== 'CLIENT') { const e = new Error(`${rp.reprintNo} is free — nothing to bill.`); e.status = 400; throw e; }
  const order = await prisma.order.findUnique({ where: { id: rp.orderId }, include: planInclude });
  const live = order.invoices.filter((i) => i.status !== 'CANCELLED');
  if (live.some((i) => i.reprintId === rp.id || (Array.isArray(i.lines) && i.lines.some((r) => r.kind === 'REPRINT' && r.reprintId === rp.id)))) {
    const e = new Error(`${rp.reprintNo} is already billed.`); e.status = 409; throw e;
  }
  const rows = (Array.isArray(rp.lines) ? rp.lines : []).map((l) => {
    const amt = Math.round((Number(l.printCharge) || 0) + (Number(l.mountCharge) || 0));
    const what = l.prints ? `${l.prints} print${l.prints === 1 ? '' : 's'}${l.material ? `, ${l.material}` : ''}` : 'remount';
    return { kind: 'REPRINT', reprintId: rp.id, location: `Reprint ${rp.reprintNo} — ${l.location || l.code || ''} (${what})`, code: l.code || '', qty: 1, price: amt };
  }).filter((r) => r.price);
  const taxable = rows.reduce((s, r) => s + r.price, 0);
  if (!taxable) { const e = new Error(`${rp.reprintNo} has no charge to bill.`); e.status = 400; throw e; }
  const split = gstSplit(order.taxCategory, order.interState, taxable);
  const bank = await defaultBankFor(order);
  const invoiceNo = await nextInvoiceNo(order.taxCategory);
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo, orderId: order.id, clientId: order.clientId, companyId: order.companyId, taxCategory: order.taxCategory,
      interState: order.interState, amount: taxable, gstRate: split.gstApplicable ? GST_RATE : 0,
      cgst: split.cgst, sgst: split.sgst, igst: split.igst, gstAmount: split.gstAmount, total: split.total,
      status: 'SENT', generatedById: user?.id,
      dueDate: dueDate ? new Date(dueDate) : lastWorkingDayOfMonth(new Date()),
      periodLabel: `Reprint ${rp.reprintNo}`, reprintId: rp.id, lines: rows, editableUntil: null,
      bankName: bank?.bankName || null, bankAccountNo: bank?.accountNo || null, bankBranchIfsc: bank?.branchIfsc || null,
    },
  });
  await prisma.ledgerEntry.create({ data: { clientId: order.clientId, companyId: order.companyId, invoiceId: invoice.id, type: 'DEBIT', amount: split.total, narration: `Invoice ${invoiceNo} (reprint ${rp.reprintNo})` } });
  await prisma.reprint.update({ where: { id: rp.id }, data: { invoiceId: invoice.id } });
  logActivity({
    type: 'INVOICE', user, orderId: order.id, orderNo: order.orderNo, invoiceId: invoice.id,
    summary: `Reprint bill raised · ${invoiceNo} · ${rp.reprintNo}`,
    detail: `${order.client?.company?.trim() || order.client?.name || ''} · ₹${Number(split.total).toLocaleString('en-IN')}`,
  });
  return invoice;
}

module.exports = {
  createReprintInvoice, createInvoiceForOrder, redraftInvoice, cancelInvoice, unlockInvoice, lockState, bankAccountsOf, defaultBankFor, rollNextBillingDate,
  lastWorkingDayOfMonth, gstSplit, EDIT_WINDOW_HOURS, planInclude,
};
