const prisma = require('../db');
const { nextReprintNo } = require('./counters');
const { recomputeOrderTotals } = require('./pricing');
const { rateFor } = require('./printingCost');
const { billingPlan } = require('./billingPlan');
const { logActivity } = require('./activity');

// Reprints on a running campaign (torn flex, design change…).
//  • CLIENT-paid: approved at once; its charge (printing + mounting, ex-GST, not
//    discounted) is added to the campaign (Order.reprintTotal) and billed on the
//    next bill or a separate bill now.
//  • FREE (we bear it): needs Manager/Super Admin approval unless one of them
//    raises it. Only the partner cost counts.
// Status: REQUESTED → APPROVED → PRINTED → MOUNTED; REJECTED / CANCELLED end it.
const REVIEWERS = ['MANAGER', 'SUPER_ADMIN'];
const REASONS = { STORM: 'Torn by storm / wind', DESIGN_CHANGE: 'Design change', CLIENT_REQUEST: 'Client request', DAMAGE: 'Damage / theft', OTHER: 'Other' };
const ACTIVE = ['APPROVED', 'PRINTED', 'MOUNTED'];
const NEXT = { APPROVED: 'PRINTED', PRINTED: 'MOUNTED' };
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const histEntry = (status, user, note) => ({ at: new Date().toISOString(), status, by: user?.name || null, note: note || null });

const orderInclude = {
  client: true, invoices: true, reprints: true, addOns: true,
  printingPartner: { include: { materials: true } },
  items: { include: { site: true } },
};

// Re-price the campaign with a new reprint total.
async function setReprintTotal(tx, orderId, reprintTotal) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  const t = recomputeOrderTotals({ ...order, reprintTotal }, order.items);
  await tx.order.update({
    where: { id: orderId },
    data: {
      reprintTotal, rentalSubtotal: t.rentalSubtotal, discountAmount: t.discountAmount, taxableAmount: t.taxableAmount,
      cgst: t.cgst, sgst: t.sgst, igst: t.igst, gstAmount: t.gstAmount, grandTotal: t.grandTotal,
    },
  });
}

// Is this reprint on a live bill (its own, or rows on a campaign bill)?
function billedOn(order, rp) {
  return (order.invoices || []).find((i) => i.status !== 'CANCELLED'
    && (i.reprintId === rp.id || (Array.isArray(i.lines) && i.lines.some((r) => r.kind === 'REPRINT' && r.reprintId === rp.id)))) || null;
}

// Defaults for the dialog: each live site with its last print material, size and
// the campaign's printing / mounting per site.
async function reprintSetup(orderId) {
  const order = await prisma.order.findUnique({ where: { id: Number(orderId) }, include: orderInclude });
  if (!order) return null;
  const live = order.items.filter((i) => !['CANCELLED', 'WAITLIST'].includes(i.status) && i.site);
  const plan = billingPlan(order);
  return {
    orderId: order.id, orderNo: order.orderNo, status: order.status, client: order.client?.company || order.client?.name,
    partnerId: order.printingPartnerId, material: order.printMaterial,
    canBillNext: !plan.fullyBilled, reasons: REASONS,
    sites: live.map((i) => ({
      bookingId: i.id, siteId: i.siteId, code: i.site.code, location: i.site.billName || i.site.location, type: i.site.type,
      sqft: i.site.sqft || 0, size: i.site.width && i.site.height ? `${i.site.width}×${i.site.height}` : null,
      material: i.printMaterial || order.printMaterial || null,
      printCharge: order.chargesPerSite ? Math.round((i.printCharge || 0) / Math.max(1, i.prints == null ? 1 : i.prints)) : Math.round(order.printRate || i.site.printingCost || 0),
      mountCharge: order.chargesPerSite ? Math.round(i.mountCharge || 0) : Math.round(i.site.mountingCost || 0),
    })),
  };
}

async function createReprint({ orderId, body, user }) {
  const order = await prisma.order.findUnique({ where: { id: Number(orderId) }, include: orderInclude });
  if (!order) throw err('Campaign not found', 404);
  if (['QUOTATION', 'CANCELLED'].includes(order.status)) throw err(`${order.orderNo} is ${order.status.toLowerCase()} — reprints are for confirmed campaigns.`);
  const reason = REASONS[body.reason] ? body.reason : null;
  if (!reason) throw err('Pick a reason.');
  const chargeTo = body.chargeTo === 'FREE' ? 'FREE' : body.chargeTo === 'CLIENT' ? 'CLIENT' : null;
  if (!chargeTo) throw err('Choose who pays: client or free.');
  let billing = null;
  if (chargeTo === 'CLIENT') {
    billing = body.billing === 'SEPARATE' ? 'SEPARATE' : body.billing === 'NEXT_BILL' ? 'NEXT_BILL' : null;
    if (!billing) throw err('Choose: add to the next bill, or a separate bill now.');
    if (billing === 'NEXT_BILL' && billingPlan(order).fullyBilled) throw err(`${order.orderNo} has no bill left to raise — choose a separate bill.`);
  }
  const partnerId = body.partnerId ? Number(body.partnerId) : null;
  const partner = partnerId ? await prisma.printingPartner.findUnique({ where: { id: partnerId }, include: { materials: true } }) : null;
  if (partnerId && !partner) throw err('Printing partner not found');

  const byId = Object.fromEntries(order.items.map((i) => [i.id, i]));
  const lines = [];
  for (const raw of Array.isArray(body.sites) ? body.sites : []) {
    const b = byId[Number(raw.bookingId)];
    if (!b || !b.site) throw err('A chosen site is not on this campaign.');
    const prints = Math.max(0, Math.round(Number(raw.prints) || 0));
    const material = raw.material ? String(raw.material).slice(0, 80) : null;
    if (material && partner && !partner.materials.some((m) => m.name === material)) throw err(`${partner.name} has no material "${material}".`);
    const printCharge = chargeTo === 'CLIENT' ? Math.max(0, Math.round(Number(raw.printCharge) || 0)) : 0;
    const mountCharge = chargeTo === 'CLIENT' ? Math.max(0, Math.round(Number(raw.mountCharge) || 0)) : 0;
    const typed = Number(raw.cost);
    const cost = Number.isFinite(typed) && raw.cost !== '' && raw.cost != null
      ? Math.max(0, Math.round(typed))
      : Math.round(prints * (b.site.sqft || 0) * rateFor(partner, material));
    if (!prints && !mountCharge && !cost) continue;
    lines.push({
      bookingId: b.id, siteId: b.siteId, code: b.site.code, location: b.site.billName || b.site.location, type: b.site.type,
      sqft: b.site.sqft || 0, prints, material, printCharge, mountCharge, cost,
    });
  }
  if (!lines.length) throw err('Tick at least one site with prints or a remount.');
  const printTotal = lines.reduce((s, l) => s + l.printCharge, 0);
  const mountTotal = lines.reduce((s, l) => s + l.mountCharge, 0);
  const charge = printTotal + mountTotal;
  const cost = lines.reduce((s, l) => s + l.cost, 0);
  if (chargeTo === 'CLIENT' && !charge) throw err('Enter the printing / mounting charge for the client (or choose Free).');

  const direct = chargeTo === 'CLIENT' || REVIEWERS.includes(user.role);
  const status = direct ? 'APPROVED' : 'REQUESTED';
  const reprintNo = await nextReprintNo();
  const note = String(body.note || '').trim().slice(0, 500) || null;
  const rp = await prisma.$transaction(async (tx) => {
    const created = await tx.reprint.create({
      data: {
        reprintNo, orderId: order.id, reprintDate: body.date ? new Date(body.date) : new Date(), reason, note,
        printingPartnerId: partnerId, chargeTo, billing, status, lines, printTotal, mountTotal, charge, cost,
        history: [histEntry(status === 'REQUESTED' ? 'REQUESTED' : 'APPROVED', user, status === 'REQUESTED' ? 'Free reprint — sent for approval' : null)],
        createdById: user.id, createdByName: user.name,
      },
    });
    if (chargeTo === 'CLIENT') await setReprintTotal(tx, order.id, Math.round((order.reprintTotal || 0) + charge));
    if (status === 'REQUESTED') {
      await tx.approvalRequest.create({
        data: {
          action: 'REPRINT_FREE', entityType: 'order', entityId: order.id,
          label: `${order.orderNo} · free reprint ${reprintNo} · ${lines.length} site${lines.length === 1 ? '' : 's'} · cost ₹${cost.toLocaleString('en-IN')}`,
          reason: `${REASONS[reason]}${note ? ` — ${note}` : ''}`, payload: { reprintId: created.id, reprintNo, sites: lines.map((l) => `${l.code} × ${l.prints}`), cost },
          requestedById: user.id,
        },
      });
    }
    return created;
  });
  let invoice = null;
  if (chargeTo === 'CLIENT' && billing === 'SEPARATE') {
    const { createReprintInvoice } = require('./invoicing');
    invoice = await createReprintInvoice({ reprintId: rp.id, user });
  }
  logActivity({
    type: 'CAMPAIGN_EDIT', user, orderId: order.id, orderNo: order.orderNo,
    summary: `${order.orderNo} · reprint ${reprintNo} ${status === 'REQUESTED' ? 'requested (free)' : 'raised'}`,
    detail: `${REASONS[reason]} · ${lines.map((l) => `${l.code} × ${l.prints}`).join(', ')} · ${chargeTo === 'CLIENT' ? `client pays ₹${charge.toLocaleString('en-IN')} (${billing === 'SEPARATE' ? `bill ${invoice?.invoiceNo}` : 'next bill'})` : 'free'} · partner cost ₹${cost.toLocaleString('en-IN')}${note ? ` · ${note}` : ''}`,
  });
  return { reprint: await prisma.reprint.findUnique({ where: { id: rp.id } }), invoice, pending: status === 'REQUESTED' };
}

// Move along: APPROVED → PRINTED → MOUNTED, or CANCELLED.
async function setReprintStatus({ reprintId, status, user, note }) {
  const rp = await prisma.reprint.findUnique({ where: { id: Number(reprintId) } });
  if (!rp) throw err('Reprint not found', 404);
  const order = await prisma.order.findUnique({ where: { id: rp.orderId }, include: { invoices: true } });
  if (status === 'CANCELLED') {
    if (['CANCELLED', 'REJECTED'].includes(rp.status)) throw err(`${rp.reprintNo} is already ${rp.status.toLowerCase()}.`);
    const bill = billedOn(order, rp);
    if (bill) throw err(`${rp.reprintNo} is on bill ${bill.invoiceNo} — cancel that bill first.`, 409);
    await prisma.$transaction(async (tx) => {
      await tx.reprint.update({ where: { id: rp.id }, data: { status: 'CANCELLED', history: [...(rp.history || []), histEntry('CANCELLED', user, note)] } });
      if (rp.chargeTo === 'CLIENT' && ACTIVE.includes(rp.status)) await setReprintTotal(tx, rp.orderId, Math.max(0, Math.round((order.reprintTotal || 0) - rp.charge)));
      if (rp.status === 'REQUESTED') await tx.approvalRequest.updateMany({ where: { action: 'REPRINT_FREE', status: 'PENDING', entityId: rp.orderId, payload: { path: ['reprintId'], equals: rp.id } }, data: { status: 'REJECTED', reviewNote: 'Reprint cancelled', reviewedAt: new Date() } });
    });
  } else {
    if (NEXT[rp.status] !== status) throw err(`${rp.reprintNo} is ${rp.status.toLowerCase()} — it can't move to ${String(status).toLowerCase()}.`);
    await prisma.reprint.update({ where: { id: rp.id }, data: { status, history: [...(rp.history || []), histEntry(status, user, note)] } });
  }
  logActivity({ type: 'CAMPAIGN_EDIT', user, orderId: rp.orderId, orderNo: order.orderNo, summary: `${order.orderNo} · reprint ${rp.reprintNo} → ${status.toLowerCase()}`, detail: note || null });
  return prisma.reprint.findUnique({ where: { id: rp.id } });
}

// Approvals queue → free reprint approved.
async function approveFreeReprint(request, approver) {
  const rp = await prisma.reprint.findUnique({ where: { id: Number(request.payload?.reprintId) } });
  if (!rp) throw err('Reprint no longer exists');
  if (rp.status !== 'REQUESTED') throw err(`${rp.reprintNo} is already ${rp.status.toLowerCase()}.`);
  await prisma.reprint.update({ where: { id: rp.id }, data: { status: 'APPROVED', history: [...(rp.history || []), histEntry('APPROVED', approver, 'Approved from the queue')] } });
}
async function rejectFreeReprint(request, reviewer, note) {
  const rp = await prisma.reprint.findUnique({ where: { id: Number(request.payload?.reprintId) } });
  if (!rp || rp.status !== 'REQUESTED') return;
  await prisma.reprint.update({ where: { id: rp.id }, data: { status: 'REJECTED', history: [...(rp.history || []), histEntry('REJECTED', reviewer, note)] } });
}

// Reprints as partner jobs (cost side) — for the printing partner account.
async function partnerReprintJobs(partnerId) {
  const list = await prisma.reprint.findMany({
    where: { printingPartnerId: partnerId, status: { in: ACTIVE } },
    include: { order: { select: { id: true, orderNo: true, client: { select: { id: true, name: true } }, company: { select: { name: true } } } } },
    orderBy: { reprintDate: 'desc' },
  });
  return list.map((rp) => {
    const lines = Array.isArray(rp.lines) ? rp.lines : [];
    const prints = lines.reduce((s, l) => s + (l.prints || 0), 0);
    const sqft = lines.reduce((s, l) => s + (l.prints || 0) * (l.sqft || 0), 0);
    return {
      id: `rp${rp.id}`, reprintId: rp.id, isReprint: true, orderId: rp.order.id,
      orderNo: `${rp.order.orderNo} · ${rp.reprintNo}`, status: 'COMPLETED', bookingDate: rp.reprintDate,
      client: rp.order.client, company: rp.order.company?.name || null, description: `Reprint — ${REASONS[rp.reason] || rp.reason}`,
      noOfPrints: prints, printRate: 0, printingTotal: rp.printTotal, printMaterial: [...new Set(lines.map((l) => l.material).filter(Boolean))].join(', ') || null,
      materialRate: 0, materialCostPerSqft: 0, printCost: Math.round(rp.cost), costEntered: 0, costSource: 'reprint',
      costNote: `reprint ${rp.reprintNo} · ${prints} print${prints === 1 ? '' : 's'} · ${Math.round(sqft)} sqft${rp.chargeTo === 'FREE' ? ' · free to client' : ''}`,
      printMargin: Math.round(rp.printTotal - rp.cost), mountingCost: rp.mountTotal, totalSqft: Math.round(sqft * 100) / 100,
      sites: lines.map((l) => ({ code: l.code, location: l.location, sqft: l.sqft, size: null })),
    };
  });
}

module.exports = { REASONS, reprintSetup, createReprint, setReprintStatus, approveFreeReprint, rejectFreeReprint, partnerReprintJobs, billedOn };
