// The amount we PAY a printing partner for one order's printing, in priority:
//  1. explicit Order.printCost (manual override);
//  2. printed area × the material's cost-per-sqft (e.g. Black Base ₹7.5);
//  3. printed area × the partner's default ₹/sqft;
//  4. 0 (unknown until a cost basis exists).
// Printed area = no. of prints × the average sqft of the order's live sites —
// a print is one flex, so 1 print on 3 sites is one flex, and 68 prints on 9
// sites (repeat flex changes) is 68 flexes. Per-site charging prints every site.
// Shared by Accounts, Reports and the partner account (routes/printingPartners.js).
function printedArea(order, items) {
  const live = (items || []).filter((i) => i.status !== 'CANCELLED' && i.site);
  const siteSqft = live.reduce((s, i) => s + (i.site.sqft || 0), 0);
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

// Cost of one order straight from the order + its items.
function orderPrintCost(order, partner) {
  const area = printedArea(order, order.items);
  return { ...computePrintCost({ printCost: order.printCost, printMaterial: order.printMaterial, totalSqft: area.sqft }, partner), area };
}

module.exports = { computePrintCost, printedArea, orderPrintCost };
