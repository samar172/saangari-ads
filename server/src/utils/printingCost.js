// The amount we PAY a printing partner for one order's printing, in priority:
//  1. explicit Order.printCost (manual override);
//  2. area × the material's cost-per-sqft (per-material rate, e.g. White Base ₹5.5);
//  3. area × the partner's default ₹/sqft;
//  4. 0 (unknown until a cost basis exists).
// Mirrors loadPartnerAccount in routes/printingPartners.js — keep them in step.
function computePrintCost({ printCost, printMaterial, totalSqft }, partner) {
  if (printCost > 0) return { cost: Math.round(printCost), source: 'entered' };
  const mat = (partner?.materials || []).find((m) => m.name === printMaterial);
  const bySqftMaterial = mat?.costPerSqft ? Math.round((totalSqft || 0) * mat.costPerSqft) : 0;
  if (bySqftMaterial > 0) return { cost: bySqftMaterial, source: 'material_sqft' };
  const bySqftPartner = partner?.ratePerSqft ? Math.round((totalSqft || 0) * partner.ratePerSqft) : 0;
  if (bySqftPartner > 0) return { cost: bySqftPartner, source: 'sqft' };
  return { cost: 0, source: 'none' };
}

module.exports = { computePrintCost };
