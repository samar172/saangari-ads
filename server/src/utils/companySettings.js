// Business Setup → "Rates & defaults" for one business (Company.settings JSON).
// Everything here is a starting value only: bookings and quotations can still
// change any number per booking.
//   mediaRates  printing / mounting / remount ₹ per site, per media type code
//   charges     saved "other charges" (illumination, permit…) with a default amount
//               and basis: ONCE (flat), SITE (× sites), MONTH (× months)
//   booking     New Booking starting values
//   quotation   quotation letter: validity, signatory block
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const CHARGE_MODES = ['PRINT', 'TYPE', 'SITE'];
const BASES = ['ONCE', 'SITE', 'MONTH'];

function sanitizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const mediaRates = {};
  for (const [code, v] of Object.entries(r.mediaRates || {})) {
    if (!/^[A-Z0-9_]{1,40}$/.test(code) || !v) continue;
    const row = { print: num(v.print), mount: num(v.mount), remount: num(v.remount) };
    if (row.print || row.mount || row.remount) mediaRates[code] = row;
  }
  const charges = (Array.isArray(r.charges) ? r.charges : []).slice(0, 50).map((c, i) => ({
    id: str(c.id, 40) || `c${Date.now().toString(36)}${i}`,
    label: str(c.label, 80),
    amount: num(c.amount),
    basis: BASES.includes(c.basis) ? c.basis : 'ONCE',
  })).filter((c) => c.label);
  const b = r.booking || {};
  const booking = {
    chargeMode: b.chargeMode === 'PRINT' ? 'PRINT' : 'SITE', // 'TYPE' (retired) → per site
    mountings: Math.min(20, Math.max(0, Math.round(Number(b.mountings ?? 1)) || 0)),
    printingPartnerId: Number(b.printingPartnerId) > 0 ? Number(b.printingPartnerId) : null,
    printMaterial: str(b.printMaterial, 80) || null,
    paymentTerms: ['ADVANCE', 'POSTPAID'].includes(b.paymentTerms) ? b.paymentTerms : 'ADVANCE',
    billingCycle: ['', 'MONTHLY', 'QUARTERLY'].includes(b.billingCycle || '') ? (b.billingCycle || '') : '',
    monitoring: b.monitoring === undefined ? true : !!b.monitoring,
    taxCategory: ['GST', 'NON_GST'].includes(b.taxCategory) ? b.taxCategory : null,
  };
  const q = r.quotation || {};
  const quotation = {
    validityDays: Math.min(365, Math.max(0, Math.round(Number(q.validityDays)) || 0)),
    signatory: str(q.signatory, 80),
    signatoryTitle: str(q.signatoryTitle, 80),
    phone: str(q.phone, 120),
    paymentTerms: ['ADVANCE', 'POSTPAID'].includes(q.paymentTerms) ? q.paymentTerms : null,
  };
  return { mediaRates, charges, booking, quotation };
}

module.exports = { sanitizeSettings };
