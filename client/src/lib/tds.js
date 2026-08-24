// TDS is deducted by the client on the taxable (pre-GST) value of a payment, not
// on the GST-inclusive gross. For a GST order the gross carries 18% GST, so strip
// it before applying the rate; a Non-GST payment has no GST to strip. Mirrors the
// server's computeTds so the on-screen preview matches what gets recorded.
export const GST_RATE = 18;

export function tdsBaseOf(gross, isGst) {
  const g = Number(gross) || 0;
  return isGst ? g / (1 + GST_RATE / 100) : g;
}

export function tdsAmountOf(gross, pct, isGst) {
  const p = Number(pct) || 0;
  if (!(p > 0)) return 0;
  return Math.round(tdsBaseOf(gross, isGst) * p / 100);
}
