const router = require('express').Router();
const dayjs = require('dayjs');
const prisma = require('../db');
const { requireRole, requirePermission } = require('../middleware/auth');
const { nextInvoiceNo } = require('../utils/counters');
const { GST_RATE, recomputeOrderTotals } = require('../utils/pricing');
const { logActivity } = require('../utils/activity');
const { createInvoiceForOrder, redraftInvoice, cancelInvoice, unlockInvoice, lockState, bankAccountsOf, lastWorkingDayOfMonth, gstSplit } = require('../utils/invoicing');
const { buildBillXlsx } = require('../utils/billXlsx');
const { buildBillPdf } = require('../utils/billPdf');
const { loadBillHeader } = require('../utils/billHeader');


router.get('/', requirePermission('invoices', 'view'), async (req, res) => {
  const { companyId } = req.query;
  const where = {};
  if (companyId) where.companyId = Number(companyId);

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    include: {
      client: { select: { name: true, phone: true, company: true } },
      company: { select: { id: true, name: true, code: true } },
      order: { select: { orderNo: true, items: { select: { site: { select: { code: true } } } } } },
    },
  });
  res.json(invoices);
});

router.get('/:id', requirePermission('invoices', 'view'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      // Pull the client's named contacts too, so the "Send bill" action can route
      // to whoever is flagged billsTo (falling back to the client's own phone/email).
      client: { include: { contacts: { orderBy: [{ billsTo: 'desc' }, { createdAt: 'asc' }] } } },
      company: true,
      order: {
        include: {
          items: { include: { site: true } },
          addOns: true
        }
      },
    },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  // Edit-window state + the invoice's own audit trail (raised, edits with
  // before → after, shares, cancellation).
  const history = await prisma.activityLog.findMany({ where: { invoiceId: invoice.id }, orderBy: { createdAt: 'desc' } });
  const pendingUnlock = await prisma.approvalRequest.findFirst({ where: { status: 'PENDING', action: 'UNLOCK_INVOICE', entityType: 'invoice', entityId: invoice.id }, select: { id: true, requestedBy: { select: { name: true } } } });
  res.json({ ...invoice, lock: lockState(invoice), history, pendingUnlock });
});

// Log that a bill was shared with the client over WhatsApp / email. The message
// is opened client-side (wa.me / mailto) and the person presses send; this only
// records that it happened, into the Activity feed. We never claim delivery.
router.post('/:id/share', requirePermission('invoices', 'edit'), async (req, res) => {
  const id = Number(req.params.id);
  const { channel, toName, toContact } = req.body || {};
  const ch = channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP';
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: { select: { name: true, company: true } } },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const who = invoice.client?.company?.trim() || invoice.client?.name || '';
  logActivity({
    type: 'INVOICE_SENT', user: req.user, orderId: invoice.orderId, invoiceId: invoice.id,
    summary: `Bill sent (${ch === 'EMAIL' ? 'Email' : 'WhatsApp'}) · ${invoice.invoiceNo}`,
    detail: [who, toName, toContact].filter(Boolean).join(' · '),
  });
  res.json({ ok: true });
});

router.patch('/:id/commercials', requirePermission('invoices', 'edit'), async (req, res) => {
  const { id } = req.params;
  const { discountPct, discountRemarks, printingTotal, mountingCost, addOns, dueDate, issuedAt, bankAccountId, poNumber, poDate } = req.body;

  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(id) },
    include: { order: { include: { items: true, addOns: true } } }
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  // Editable only inside its 24h window; after that it's locked — a wrong
  // bill is cancelled and re-issued instead.
  const lock = lockState(invoice);
  if (!lock.editable) {
    return res.status(423).json({ error: `${invoice.invoiceNo} is locked (${lock.reason}). Cancel it and generate a fresh invoice to correct it.` });
  }

  // Bank / PO changes (within the edit window).
  const bankAndPo = {};
  if (bankAccountId !== undefined) {
    const company = await prisma.company.findUnique({ where: { id: invoice.companyId } });
    const acct = bankAccountsOf(company).find((a) => String(a.id) === String(bankAccountId));
    if (acct) Object.assign(bankAndPo, { bankName: acct.bankName, bankAccountNo: acct.accountNo, bankBranchIfsc: acct.branchIfsc });
  }
  if (poNumber !== undefined) bankAndPo.poNumber = poNumber ? String(poNumber).trim() : null;
  if (poDate !== undefined) bankAndPo.poDate = poDate ? new Date(poDate) : null;

  const order = invoice.order;
  const before = {
    amount: invoice.amount, total: invoice.total, discountPct: order.discountPct, printingTotal: order.printingTotal,
    mountingCost: order.mountingCost, addOns: (order.addOns || []).map((a) => `${a.label} ₹${a.amount}`).join(', '),
    dueDate: invoice.dueDate, issuedAt: invoice.issuedAt,
    bank: invoice.bankAccountNo ? `${invoice.bankName} ${invoice.bankAccountNo}` : '', poNumber: invoice.poNumber || '',
  };

  // 1. Update Order's add-ons
  await prisma.orderAddOn.deleteMany({ where: { orderId: order.id } });
  if (addOns && addOns.length > 0) {
    await prisma.orderAddOn.createMany({
      data: addOns.map(a => ({ orderId: order.id, label: a.label, amount: Number(a.amount) || 0 }))
    });
  }

  const addOnTotal = (addOns || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);

  // 2. Recompute Order Totals
  const testOrder = {
    ...order,
    addOnTotal,
    // Fall back to the order's existing values when a field is omitted, so a
    // partial PATCH (e.g. only discountPct) doesn't zero out real production charges.
    printingTotal: printingTotal !== undefined ? Number(printingTotal) || 0 : order.printingTotal,
    mountingCost: mountingCost !== undefined ? Number(mountingCost) || 0 : order.mountingCost,
    discountPct: discountPct !== undefined ? Math.min(100, Math.max(0, Number(discountPct) || 0)) : order.discountPct,
  };

  const newTotals = recomputeOrderTotals(testOrder, order.items);

  // 3. Update Order. Persist explicit columns only — recomputeOrderTotals returns
  // `mountingTotal`/`gstRate`, which are NOT columns on Order (it has mountingCost,
  // and no gstRate), so spreading the whole result would make Prisma throw.
  await prisma.order.update({
    where: { id: order.id },
    data: {
      printingTotal: testOrder.printingTotal,
      mountingCost: testOrder.mountingCost,
      discountPct: testOrder.discountPct,
      discountRemarks: discountRemarks || order.discountRemarks,
      addOnTotal,
      rentalSubtotal: newTotals.rentalSubtotal,
      discountAmount: newTotals.discountAmount,
      taxableAmount: newTotals.taxableAmount,
      cgst: newTotals.cgst, sgst: newTotals.sgst, igst: newTotals.igst,
      gstAmount: newTotals.gstAmount, grandTotal: newTotals.grandTotal,
    }
  });

  // 4. Update Invoice — re-draft this bill's own period from the new
  // commercials (a monthly bill only carries its month), honour the invoice's
  // own tax category, and allow editing the issue/due dates.
  const draft = await redraftInvoice(invoice.id);
  const split = gstSplit(invoice.taxCategory, invoice.interState, draft.taxable);
  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      amount: draft.taxable,
      lines: draft.rows,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
      gstAmount: split.gstAmount,
      total: split.total,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(issuedAt && !Number.isNaN(new Date(issuedAt).getTime()) ? { issuedAt: new Date(issuedAt) } : {}),
      ...bankAndPo,
    }
  });

  // 5. Update Ledger Entry
  const ledger = await prisma.ledgerEntry.findFirst({
    where: { invoiceId: invoice.id, type: 'DEBIT' }
  });

  if (ledger) {
    await prisma.ledgerEntry.update({
      where: { id: ledger.id },
      data: { amount: split.total }
    });
  }

  // Audit log: exactly what changed, before → after.
  const fmtD = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
  const after = {
    amount: updatedInvoice.amount, total: updatedInvoice.total, discountPct: testOrder.discountPct, printingTotal: testOrder.printingTotal,
    mountingCost: testOrder.mountingCost, addOns: (addOns || []).map((a) => `${a.label} ₹${Number(a.amount) || 0}`).join(', '),
    dueDate: updatedInvoice.dueDate, issuedAt: updatedInvoice.issuedAt,
    bank: updatedInvoice.bankAccountNo ? `${updatedInvoice.bankName} ${updatedInvoice.bankAccountNo}` : '', poNumber: updatedInvoice.poNumber || '',
  };
  const LABEL = { total: 'Total', amount: 'Taxable', discountPct: 'Discount %', printingTotal: 'Printing', mountingCost: 'Mounting', addOns: 'Add-ons', dueDate: 'Due date', issuedAt: 'Invoice date', bank: 'Bank', poNumber: 'PO No.' };
  const changes = Object.keys(LABEL).filter((k) => {
    const a = before[k], b = after[k];
    return (k === 'dueDate' || k === 'issuedAt') ? fmtD(a) !== fmtD(b) : String(a ?? '') !== String(b ?? '');
  }).map((k) => {
    const show = (v) => {
      if (k === 'dueDate' || k === 'issuedAt') return fmtD(v);
      if (k === 'discountPct') return `${Number(v) || 0}%`;
      if (typeof v === 'number') return `₹${v.toLocaleString('en-IN')}`;
      return v || '—';
    };
    return `${LABEL[k]}: ${show(before[k])} → ${show(after[k])}`;
  });
  logActivity({
    type: 'INVOICE_EDIT', user: req.user, orderId: order.id, orderNo: order.orderNo, invoiceId: invoice.id,
    summary: `Invoice edited · ${invoice.invoiceNo}`,
    detail: changes.length ? changes.join(' · ') : 'Saved with no changes',
  });

  res.json(updatedInvoice);
});

// Reopen a locked invoice for 24 hours of edits. Manager / Super Admin reopen
// directly; anyone else who may edit invoices files an UNLOCK_INVOICE approval.
router.post('/:id/unlock', requirePermission('invoices', 'edit'), async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Please give a reason.' });
  try {
    if (req.user.role === 'MANAGER' || req.user.role === 'SUPER_ADMIN') {
      const inv = await unlockInvoice({ invoiceId: id, reason, user: req.user });
      return res.json({ done: true, editableUntil: inv.editableUntil });
    }
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (['CANCELLED', 'PAID'].includes(invoice.status)) return res.status(409).json({ error: `${invoice.invoiceNo} is ${invoice.status.toLowerCase()} — cancel and re-issue it to correct it.` });
    if (lockState(invoice).editable) return res.status(409).json({ error: `${invoice.invoiceNo} is already editable.` });
    const pending = await prisma.approvalRequest.findFirst({ where: { status: 'PENDING', action: 'UNLOCK_INVOICE', entityType: 'invoice', entityId: id } });
    if (pending) return res.status(409).json({ error: 'An edit request for this invoice is already awaiting approval.' });
    await prisma.approvalRequest.create({
      data: { action: 'UNLOCK_INVOICE', entityType: 'invoice', entityId: id, label: `${invoice.invoiceNo} · reopen for editing`, reason, requestedById: req.user.id },
    });
    res.status(202).json({ pending: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Could not reopen the invoice' });
  }
});

// Cancel a wrong bill (reason required). Manager / Super Admin cancel directly;
// everyone else files a CANCEL_INVOICE approval from the invoice screen.
router.post('/:id/cancel', requireRole('MANAGER'), async (req, res) => {
  try {
    const inv = await cancelInvoice({ invoiceId: Number(req.params.id), reason: req.body?.reason, user: req.user });
    res.json(inv);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Could not cancel the invoice' });
  }
});

// Generate a tax invoice for an order. Blocked until at least one monitoring
// photo exists on any line (proof-of-display gate) — but purely loose orders
// are 1–2 day displays with no monitoring cycle, so they invoice straight away.
router.post('/', requirePermission('invoices', 'add'), async (req, res) => {
  const { orderId, force, dueDate, periodIndex, start, end, bankAccountId, poNumber, poDate } = req.body || {};
  try {
    const invoice = await createInvoiceForOrder({ orderId, force: !!force, dueDate, periodIndex, start, end, bankAccountId, poNumber, poDate, user: req.user });
    res.status(201).json(invoice);
  } catch (e) {
    const body = { error: e.message || 'Could not generate invoice' };
    if (e.canForce) body.canForce = true;
    return res.status(e.status || 500).json(body);
  }
});

router.post('/:id/mark-paid', requireRole('FINANCE'), async (req, res) => {
  const id = Number(req.params.id);
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'PAID') return res.json(invoice); // idempotent — no replayed credit
  if (invoice.status === 'CANCELLED') return res.status(400).json({ error: `${invoice.invoiceNo} is cancelled.` });

  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.update({ where: { id }, data: { status: 'PAID' } });
    // Settle what is still owed on BILLED amounts, capped at this invoice — a
    // campaign billed monthly must not be marked fully paid off one month's
    // bill, and money already recorded via the payments route isn't counted
    // twice. Mirrors that route: one Payment row + one ledger CREDIT.
    const order = await tx.order.findUnique({
      where: { id: invoice.orderId },
      include: { payments: { select: { amount: true } }, invoices: { select: { status: true, total: true } } },
    });
    const paid = (order?.payments || []).reduce((s, p) => s + p.amount, 0);
    const billed = (order?.invoices || []).filter((i) => i.status !== 'CANCELLED').reduce((s, i) => s + (i.total || 0), 0);
    const remaining = Math.max(0, Math.min(Math.round(invoice.total), Math.round(billed - paid)));
    if (remaining > 0) {
      const payment = await tx.payment.create({
        data: {
          orderId: invoice.orderId, clientId: invoice.clientId, companyId: invoice.companyId,
          amount: remaining, netReceived: remaining, mode: 'BANK',
          reference: `Invoice ${invoice.invoiceNo}`, recordedById: req.user.id,
        },
      });
      await tx.ledgerEntry.create({
        data: { clientId: invoice.clientId, companyId: invoice.companyId, invoiceId: invoice.id, paymentId: payment.id, type: 'CREDIT', amount: remaining, narration: `Payment for ${invoice.invoiceNo}` },
      });
    }
    return inv;
  });
  res.json(updated);
});

// Editable Excel bill in the accounts team's own bill.xlsx layout.
router.get('/:id/bill.xlsx', requirePermission('invoices', 'view'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(req.params.id) },
    include: { client: true, company: true, order: { include: { items: { include: { site: true } }, addOns: true } } },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const header = await loadBillHeader(invoice.company, invoice.taxCategory === 'GST');
  const buffer = await buildBillXlsx(invoice, { header });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Bill-${invoice.invoiceNo.replace(/\//g, '-')}.xlsx"`);
  res.end(Buffer.from(buffer));
});

// Downloadable PDF — the same layout as the Excel bill (see utils/billPdf.js).
router.get('/:id/pdf', requirePermission('invoices', 'view'), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(req.params.id) },
    include: { client: true, company: true, order: { include: { items: { include: { site: true } }, addOns: true } } },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const header = await loadBillHeader(invoice.company, invoice.taxCategory === 'GST');
  const doc = buildBillPdf(invoice, { header });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNo.replace(/\//g, '-')}.pdf"`);
  doc.pipe(res);
  doc.end();
});

module.exports = router;
