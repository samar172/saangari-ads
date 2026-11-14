const prisma = require('../db');
const { orderPrintCost } = require('./printingCost');
const { logActivity } = require('./activity');

// Printing Reconciliation (Accounts → Reconciliation).
// Finds campaigns whose printing numbers don't add up, and applies cost-side
// corrections (partner, material, partner cost) — never the client's charge.
//
// Issues:
//   NO_COST      partner chosen but cost works out to ₹0 (no material / material
//                without ₹/sqft / sites without size) and nothing typed
//   NO_PARTNER   printing charged to the client but no partner chosen
//   LOSS         partner cost above what the client was charged for printing
//   ZERO_PRINTS  partner chosen but 0 prints (info — can be marked OK)
//   MISMATCH     no. of prints ≠ no. of sites (info — can be marked OK)
const LIVE = ['CONFIRMED', 'LIVE', 'COMPLETED'];
const INFO = ['ZERO_PRINTS', 'MISMATCH'];
const REVIEWERS = ['MANAGER', 'SUPER_ADMIN'];

const include = {
  client: { select: { id: true, name: true, company: true } },
  company: { select: { id: true, name: true } },
  printingPartner: { select: { id: true, name: true, ratePerSqft: true, materials: { select: { name: true, costPerSqft: true, rate: true, active: true } } } },
  items: { select: { id: true, status: true, prints: true, printMaterial: true, site: { select: { id: true, code: true, location: true, type: true, sqft: true, width: true, height: true } } } },
};

function issuesOf(o) {
  const c = orderPrintCost(o, o.printingPartner);
  const charged = Math.round(o.printingTotal || 0);
  const live = o.items.filter((i) => i.status !== 'CANCELLED' && i.site);
  const out = [];
  if (o.printingPartnerId && c.cost === 0 && (charged > 0 || o.noOfPrints > 0 || o.chargesPerSite)) {
    let why = 'no cost basis';
    const mat = o.printingPartner?.materials.find((m) => m.name === o.printMaterial);
    if (!o.printMaterial && !(o.printingPartner?.ratePerSqft > 0)) why = 'no material chosen';
    else if (o.printMaterial && !(mat?.costPerSqft > 0)) why = `${o.printMaterial} has no ₹/sqft`;
    else if (c.area.sqft <= 0) why = c.area.prints <= 0 ? '0 prints' : 'sites have no size';
    out.push({ code: 'NO_COST', label: `₹0 partner cost — ${why}` });
  }
  if (!o.printingPartnerId && charged > 0) out.push({ code: 'NO_PARTNER', label: 'Printing charged, no partner' });
  if (c.cost > 0 && c.cost > charged) out.push({ code: 'LOSS', label: `Loss ₹${(c.cost - charged).toLocaleString('en-IN')}` });
  if (!o.printReconOkAt) {
    if (o.printingPartnerId && !o.chargesPerSite && !(o.noOfPrints > 0)) out.push({ code: 'ZERO_PRINTS', label: '0 prints with a partner', info: true });
    else if (!o.chargesPerSite && o.noOfPrints > 0 && o.noOfPrints !== live.length) out.push({ code: 'MISMATCH', label: `${o.noOfPrints} prints on ${live.length} site${live.length === 1 ? '' : 's'}`, info: true });
  }
  return { issues: out, cost: c.cost, source: c.source, area: c.area, charged };
}

// One row per campaign with at least one issue. `all` = include info-only rows.
async function listPrintingIssues({ companyId } = {}) {
  const where = { status: { in: LIVE }, OR: [{ printingTotal: { gt: 0 } }, { printingPartnerId: { not: null } }] };
  if (companyId) where.companyId = Number(companyId);
  const orders = await prisma.order.findMany({ where, include, orderBy: { bookingDate: 'desc' } });
  const pending = await prisma.approvalRequest.findMany({ where: { status: 'PENDING', action: 'PRINT_CORRECTION' }, select: { id: true, payload: true, requestedBy: { select: { name: true } } } });
  const pendingFor = {};
  for (const p of pending) for (const ch of p.payload?.changes || []) pendingFor[ch.orderId] = { id: p.id, by: p.requestedBy?.name };
  const rows = [];
  for (const o of orders) {
    const r = issuesOf(o);
    if (!r.issues.length) continue;
    const live = o.items.filter((i) => i.status !== 'CANCELLED' && i.site);
    rows.push({
      id: o.id, orderNo: o.orderNo, status: o.status, bookingDate: o.bookingDate,
      client: o.client?.company || o.client?.name, company: o.company?.name,
      partnerId: o.printingPartnerId, partner: o.printingPartner?.name || null, material: o.printMaterial,
      prints: o.noOfPrints, sites: live.length, perSite: o.chargesPerSite, printRate: o.printRate,
      charged: r.charged, cost: r.cost, costSource: r.source, enteredCost: Math.round(o.printCost || 0),
      margin: r.charged - r.cost, sqft: r.area.sqft, avgSqft: r.area.avgSqft,
      issues: r.issues, pending: pendingFor[o.id] || null,
    });
  }
  return rows;
}

async function countPrintingIssues(opts) {
  const rows = await listPrintingIssues(opts);
  return { total: rows.length, needsFix: rows.filter((r) => r.issues.some((i) => !i.info)).length };
}

// The printing section of one booking, for the fix dialog.
async function printingSection(orderId) {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include });
  if (!o) return null;
  const r = issuesOf(o);
  return {
    id: o.id, orderNo: o.orderNo, status: o.status, client: o.client?.company || o.client?.name, company: o.company?.name,
    partnerId: o.printingPartnerId, partner: o.printingPartner?.name || null, material: o.printMaterial,
    prints: o.noOfPrints, printRate: o.printRate, perSite: o.chargesPerSite, mounting: o.mountingCost,
    charged: r.charged, cost: r.cost, costSource: r.source, enteredCost: Math.round(o.printCost || 0), area: r.area,
    remarks: o.printRemarks, reconOkAt: o.printReconOkAt, reconNote: o.printReconNote,
    sites: o.items.filter((i) => i.status !== 'CANCELLED' && i.site).map((i) => ({ code: i.site.code, location: i.site.location, type: i.site.type, sqft: i.site.sqft, size: i.site.width && i.site.height ? `${i.site.width}×${i.site.height}` : null })),
    issues: r.issues,
  };
}

// Normalise one requested change; returns { orderId, orderNo, before, after }.
async function prepareChange(raw) {
  const id = Number(raw.orderId);
  const o = await prisma.order.findUnique({ where: { id }, include });
  if (!o) throw Object.assign(new Error(`Campaign ${id} not found`), { status: 404 });
  const before = { partnerId: o.printingPartnerId, partner: o.printingPartner?.name || null, material: o.printMaterial, printCost: Math.round(o.printCost || 0), cost: orderPrintCost(o, o.printingPartner).cost, ok: !!o.printReconOkAt };
  const after = { ...before };
  if (raw.partnerId !== undefined) {
    after.partnerId = raw.partnerId ? Number(raw.partnerId) : null;
    if (after.partnerId !== before.partnerId) after.material = null;
  }
  if (raw.material !== undefined) after.material = raw.material || null;
  if (raw.printCost !== undefined) after.printCost = Math.max(0, Math.round(Number(raw.printCost) || 0));
  if (raw.markOk !== undefined) after.ok = !!raw.markOk;
  let partner = o.printingPartner;
  if (after.partnerId !== before.partnerId) {
    partner = after.partnerId ? await prisma.printingPartner.findUnique({ where: { id: after.partnerId }, include: { materials: true } }) : null;
    if (after.partnerId && !partner) throw Object.assign(new Error('Printing partner not found'), { status: 400 });
    after.partner = partner?.name || null;
  }
  if (after.material && partner && !partner.materials.some((m) => m.name === after.material)) {
    throw Object.assign(new Error(`${after.partner || 'This partner'} has no material "${after.material}"`), { status: 400 });
  }
  const items = after.material !== before.material ? o.items.map((i) => (i.printMaterial ? { ...i, printMaterial: after.material } : i)) : o.items;
  after.cost = orderPrintCost({ ...o, items, printingPartnerId: after.partnerId, printMaterial: after.material, printCost: after.printCost }, partner).cost;
  const same = ['partnerId', 'material', 'printCost', 'ok'].every((k) => after[k] === before[k]);
  return { orderId: id, orderNo: o.orderNo, before, after, same };
}

const describe = (ch) => {
  const parts = [];
  if (ch.before.partnerId !== ch.after.partnerId) parts.push(`partner ${ch.before.partner || 'none'} → ${ch.after.partner || 'none'}`);
  if (ch.before.material !== ch.after.material) parts.push(`material ${ch.before.material || 'none'} → ${ch.after.material || 'none'}`);
  if (ch.before.printCost !== ch.after.printCost) parts.push(`typed cost ₹${ch.before.printCost} → ₹${ch.after.printCost}`);
  if (ch.before.ok !== ch.after.ok) parts.push(ch.after.ok ? 'marked as checked' : 'check mark removed');
  parts.push(`partner cost ₹${ch.before.cost.toLocaleString('en-IN')} → ₹${ch.after.cost.toLocaleString('en-IN')}`);
  return parts.join(' · ');
};

async function applyPrintCorrections({ changes, reason, user, requestedBy }) {
  await prisma.$transaction(async (tx) => {
    for (const ch of changes) {
      await tx.order.update({
        where: { id: ch.orderId },
        data: {
          printingPartnerId: ch.after.partnerId, printMaterial: ch.after.material, printCost: ch.after.printCost,
          printReconOkAt: ch.after.ok ? (ch.before.ok ? undefined : new Date()) : null,
          printReconNote: ch.after.ok ? reason : null,
        },
      });
      // Per-site campaigns: sites that carry their own material follow the change.
      if (ch.after.material !== ch.before.material) {
        await tx.booking.updateMany({ where: { orderId: ch.orderId, status: { not: 'CANCELLED' }, printMaterial: { not: null } }, data: { printMaterial: ch.after.material } });
      }
    }
  });
  for (const ch of changes) {
    logActivity({
      type: 'CAMPAIGN_EDIT', user, orderId: ch.orderId, orderNo: ch.orderNo,
      summary: `${ch.orderNo} · printing corrected (Recon)`,
      detail: `${describe(ch)}. Reason: ${reason}${requestedBy ? ` · requested by ${requestedBy}` : ''}`,
    });
  }
}

// Entry point for the API: Manager/Super Admin apply directly; others file one
// PRINT_CORRECTION approval covering every campaign in the request.
async function requestPrintCorrections({ items, reason, user }) {
  const why = String(reason || '').trim();
  if (!why) throw Object.assign(new Error('Please give a reason.'), { status: 400 });
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('Nothing to correct.'), { status: 400 });
  if (items.length > 200) throw Object.assign(new Error('At most 200 campaigns at a time.'), { status: 400 });
  const changes = (await Promise.all(items.map(prepareChange))).filter((c) => !c.same);
  if (!changes.length) throw Object.assign(new Error('Nothing changes — the values are the same as now.'), { status: 400 });
  if (REVIEWERS.includes(user.role)) {
    await applyPrintCorrections({ changes, reason: why, user });
    return { done: true, count: changes.length };
  }
  const pending = await prisma.approvalRequest.findMany({ where: { status: 'PENDING', action: 'PRINT_CORRECTION' }, select: { payload: true } });
  const busy = new Set(pending.flatMap((p) => (p.payload?.changes || []).map((c) => c.orderId)));
  const clash = changes.filter((c) => busy.has(c.orderId)).map((c) => c.orderNo);
  if (clash.length) throw Object.assign(new Error(`Already awaiting approval: ${clash.join(', ')}`), { status: 409 });
  const label = changes.length === 1 ? `${changes[0].orderNo} · printing correction` : `Printing correction · ${changes.length} campaigns`;
  await prisma.approvalRequest.create({
    data: {
      action: 'PRINT_CORRECTION', entityType: 'order', entityId: changes.length === 1 ? changes[0].orderId : null,
      label, reason: why, payload: { changes: changes.map(({ same, ...c }) => c) }, requestedById: user.id,
    },
  });
  return { pending: true, count: changes.length };
}

// Called by the approvals queue. Re-reads each campaign so the approver applies
// the requested target values (the "before" shown is from request time).
async function executePrintCorrection(request, approver) {
  const requester = await prisma.user.findUnique({ where: { id: request.requestedById }, select: { name: true } });
  const changes = [];
  for (const c of request.payload?.changes || []) {
    const ch = await prepareChange({ orderId: c.orderId, partnerId: c.after.partnerId, material: c.after.material, printCost: c.after.printCost, markOk: c.after.ok });
    if (!ch.same) changes.push(ch);
  }
  if (changes.length) await applyPrintCorrections({ changes, reason: request.reason, user: approver, requestedBy: requester?.name });
}

module.exports = { listPrintingIssues, countPrintingIssues, printingSection, requestPrintCorrections, executePrintCorrection, describe, INFO };
