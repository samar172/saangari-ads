// What we pay the printing partner, worked out from the partner's own rates
// (Printing Partners → materials). Mirrors server/src/utils/printingCost.js:
//   1. a typed amount wins;
//   2. printed area × the chosen material's cost ₹/sqft;
//   3. printed area × the partner's default ₹/sqft;
//   4. unknown (0).
// Printed area = no. of prints × the average sqft of the sites (one print is
// one flex). In per-site / by-media-type charging every site is one print.
// When nothing is typed the order stores 0 and the server keeps using the same
// auto figure, so it follows the sites if they change later.
export function autoPartnerCost({ partner, materialName, sites, prints }) {
  if (!partner) return { cost: 0, note: '', missing: '' };
  const avg = sites.length ? sites.reduce((s, x) => s + (Number(x?.sqft) || 0), 0) / sites.length : 0;
  const n = Math.max(0, Number(prints) || 0);
  const sqft = Math.round(n * avg * 100) / 100;
  const area = `${n} print${n === 1 ? '' : 's'} × ${Math.round(avg * 100) / 100} sqft`;
  const mat = (partner.materials || []).find((m) => m.name === materialName);
  if (mat?.costPerSqft > 0 && sqft > 0) {
    return { cost: Math.round(sqft * mat.costPerSqft), note: `${area} × ₹${mat.costPerSqft}/sqft (${mat.name})` };
  }
  if (partner.ratePerSqft > 0 && sqft > 0) {
    return { cost: Math.round(sqft * partner.ratePerSqft), note: `${area} × ₹${partner.ratePerSqft}/sqft (partner rate)` };
  }
  let missing = '';
  if (!sites.length) missing = 'Add sites to work out the partner cost.';
  else if (n <= 0) missing = 'Enter the no. of prints to work out the partner cost.';
  else if (sqft <= 0) missing = 'These sites have no size (sqft) in Inventory — enter the cost.';
  else if (!materialName) missing = 'Pick a material to work out the partner cost from its ₹/sqft.';
  else missing = `${materialName} has no cost ₹/sqft set for this partner — set it under Printing Partners or enter the cost.`;
  return { cost: 0, note: '', missing };
}

export function PartnerCostField({ value, onChange, auto }) {
  const typed = Number(value) > 0;
  return (
    <div>
      <label className="label">Partner cost (total you pay)</label>
      <input type="number" min="0" className="input" value={typed ? value : ''} onChange={(e) => onChange(e.target.value)}
        placeholder={auto.cost > 0 ? `Auto ₹${auto.cost.toLocaleString('en-IN')}` : 'What you pay the printer'} />
      {auto.cost > 0 && (
        <div className="text-[11px] text-slate-500 mt-1">
          {typed ? <>Entered amount used · auto would be ₹{auto.cost.toLocaleString('en-IN')} ({auto.note}). <button type="button" className="underline text-brand-light" onClick={() => onChange('')}>Use auto</button></>
            : <>Auto: <b>₹{auto.cost.toLocaleString('en-IN')}</b> = {auto.note}. Type an amount to override.</>}
        </div>
      )}
      {!typed && auto.cost <= 0 && auto.missing && <div className="text-[11px] text-amber-600 mt-1">{auto.missing}</div>}
    </div>
  );
}
