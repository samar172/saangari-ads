// The amount we PAY a printing partner for one order's printing, in priority:
//  1. explicit Order.printCost (manual override);
//  2. printed area × the material's cost-per-sqft (e.g. Black Base ₹7.5);
//  3. printed area × the partner's default ₹/sqft;
//  4. 0 (unknown until a cost basis exists).
// Printed area:
//  • per-site detail (new bookings: each line has its own prints/material) —
//    Σ prints × that site's sqft, each at its own material's rate;
//  • otherwise no. of prints × the average sqft of the order's live sites — a
//    print is one flex, so 1 print on 3 sites is one flex, and 68 prints on 9
//    sites (repeat flex changes) is 68 flexes. Per-site charging prints every site.
// Shared by Accounts, Reports, Recon and the partner account.
const liveLines = (items) => (items || []).filter((i) => i.status !== 'CANCELLED' && i.site);
const hasSiteDetail = (order, items) => !!order.chargesPerSite && liveLines(items).some((i) => i.prints != null || i.printMaterial);

function printedArea(order, items) {
  const live = liveLines(items);
  const siteSqft = live.reduce((s, i) => s + (i.site.sqft || 0), 0);
  if (hasSiteDetail(order, items)) {
    const prints = live.reduce((s, i) => s + (i.prints == null ? 1 : i.prints), 0);
    const sqft = live.reduce((s, i) => s + (i.prints == null ? 1 : i.prints) * (i.site.sqft || 0), 0);
    return { sqft: Math.round(sqft * 100) / 100, prints, avgSqft: prints ? Math.round((sqft / prints) * 100) / 100 : 0, sites: live.length, perSite: true };
  }
  const avg = live.length ? siteSqft / live.length : 0;
  const prints = order.chargesPerSite ? live.length : Math.max(0, Number(order.noOfPrints) || 0);
  return { sqft: Math.round(prints * avg * 100) / 100, prints, avgSqft: Math.round(avg * 100) / 100, sites: live.length };
}

function computePrintCost({ printCost, printMaterial, totalSqft }, partner) {
  if (printCost > 0) return { cost: Math.round(printCost), source: 'entered' };
  const mat = (partner?.materials || []).find((m) => m.name === printMaterial);
  const bySqftMaterial = mat?.costPerSqft ? Math.round((totalSqft || 0) * mat.costPerSqft) : 0;
  if (bySqftMaterial > 0) return { cost: bySqftMaterial, source: 'material_sqft', rate: mat.costPerSqft, label: mat.name };
  const bySqftPartner = partner?.ratePerSqft ? Math.round((totalSqft || 0) * partner.ratePerSqft) : 0;
  if (bySqftPartner > 0) return { cost: bySqftPartner, source: 'sqft', rate: partner.ratePerSqft, label: 'partner rate' };
  return { cost: 0, source: 'none' };
}

// ₹/sqft for one material name at this partner (material, else partner default).
function rateFor(partner, materialName) {
  const mat = (partner?.materials || []).find((m) => m.name === materialName);
  if (mat?.costPerSqft > 0) return mat.costPerSqft;
  return partner?.ratePerSqft > 0 ? partner.ratePerSqft : 0;
}

// Cost of one order straight from the order + its items.
function orderPrintCost(order, partner) {
  const area = printedArea(order, order.items);
  if (!(order.printCost > 0) && area.perSite) {
    // Each site at its own material (falling back to the order's material).
    let cost = 0, missing = 0;
    for (const i of liveLines(order.items)) {
      const n = i.prints == null ? 1 : i.prints;
      if (!n) continue;
      const r = rateFor(partner, i.printMaterial || order.printMaterial);
      if (r > 0) cost += n * (i.site.sqft || 0) * r; else missing += 1;
    }
    cost = Math.round(cost);
    return cost > 0
      ? { cost, source: 'site_material', label: 'per-site material', area, missing }
      : { cost: 0, source: 'none', area, missing };
  }
  return { ...computePrintCost({ printCost: order.printCost, printMaterial: order.printMaterial, totalSqft: area.sqft }, partner), area };
}

module.exports = { computePrintCost, printedArea, orderPrintCost, rateFor };
