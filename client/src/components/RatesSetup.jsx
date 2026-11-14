import { useEffect, useState } from 'react';
import api from '../api';

// Business Setup → "Rates & defaults" for one business. Edits the
// Company.settings object (saved with the rest of the business form):
//   mediaRates  printing / mounting / remount ₹ per site, per media type
//   charges     saved other charges (illumination, permit…) — one click in New Booking
//   booking     New Booking starting values
//   quotation   quotation letter defaults
// Everything stays editable on each booking / quotation.
export const EMPTY_SETTINGS = {
  mediaRates: {},
  charges: [],
  booking: { chargeMode: 'PRINT', mountings: 1, printingPartnerId: null, printMaterial: null, paymentTerms: 'ADVANCE', billingCycle: '', monitoring: true, taxCategory: null },
  quotation: { validityDays: 0, signatory: '', signatoryTitle: '', phone: '', paymentTerms: null },
};

export function withSettingDefaults(s) {
  const x = s && typeof s === 'object' ? s : {};
  return {
    mediaRates: x.mediaRates || {},
    charges: Array.isArray(x.charges) ? x.charges : [],
    booking: { ...EMPTY_SETTINGS.booking, ...(x.booking || {}) },
    quotation: { ...EMPTY_SETTINGS.quotation, ...(x.quotation || {}) },
  };
}

const BASIS = [['ONCE', 'One-time'], ['SITE', 'Per site'], ['MONTH', 'Per month']];
const box = 'card p-4 bg-slate-50 border-slate-200';

export default function RatesSetup({ value, onChange, gstLocked }) {
  const s = withSettingDefaults(value);
  const [types, setTypes] = useState([]);
  const [partners, setPartners] = useState([]);
  useEffect(() => {
    api.get('/media-types').then((r) => setTypes((r.data || []).filter((t) => t.active !== false))).catch(() => {});
    api.get('/printing-partners').then((r) => setPartners((r.data || []).filter((p) => p.active))).catch(() => {});
  }, []);

  const put = (k, v) => onChange({ ...s, [k]: v });
  const setRate = (code, k, v) => put('mediaRates', { ...s.mediaRates, [code]: { ...(s.mediaRates[code] || {}), [k]: v } });
  const setCharge = (i, k, v) => put('charges', s.charges.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const setB = (k, v) => put('booking', { ...s.booking, [k]: v });
  const setQ = (k, v) => put('quotation', { ...s.quotation, [k]: v });
  const partner = partners.find((p) => String(p.id) === String(s.booking.printingPartnerId));

  return (
    <div className="space-y-4">
      {/* 1. Printing & mounting per media type */}
      <div className={box}>
        <div className="font-semibold text-slate-800 text-sm mb-1">Printing &amp; mounting rates by media type</div>
        <div className="text-xs text-slate-500 mb-3">₹ per site charged to the client. Used by New Booking ("By media type") and New Quotation; Inventory rates are used only for "Per site". Blank = take it from Inventory.</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="text-[11px] uppercase text-slate-400">
              <tr><th className="text-left py-1 pr-2">Media type</th><th className="text-left py-1 px-2">Printing ₹</th><th className="text-left py-1 px-2">Mounting ₹</th><th className="text-left py-1 px-2">Remount ₹</th></tr>
            </thead>
            <tbody>
              {types.map((t) => {
                const r = s.mediaRates[t.code] || {};
                return (
                  <tr key={t.code} className="border-t border-slate-200">
                    <td className="py-1.5 pr-2 font-medium text-slate-700">{t.label}</td>
                    {['print', 'mount', 'remount'].map((k) => (
                      <td key={k} className="py-1.5 px-2">
                        <input type="number" min="0" className="input py-1 text-xs w-28" value={r[k] || ''} placeholder={k === 'remount' ? 'same as mounting' : ''}
                          onChange={(e) => setRate(t.code, k, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {types.length === 0 && <tr><td colSpan={4} className="py-3 text-xs text-slate-400">No media types yet — add them under Business Setup → Media types.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Saved other charges */}
      <div className={box}>
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold text-slate-800 text-sm">Other charges</div>
          <button type="button" className="text-xs text-brand-light font-medium" onClick={() => put('charges', [...s.charges, { id: '', label: '', amount: '', basis: 'ONCE' }])}>+ Add charge</button>
        </div>
        <div className="text-xs text-slate-500 mb-3">Illumination, permit, transport, design… They appear as one-click buttons under "Other charges" in New Booking; the amount can still be changed there.</div>
        {s.charges.length === 0 && <div className="text-xs text-slate-400">No saved charges yet.</div>}
        <div className="space-y-2">
          {s.charges.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_8rem_auto] gap-2 items-center">
              <input className="input py-1.5 text-sm" placeholder="e.g. Illumination" value={c.label} onChange={(e) => setCharge(i, 'label', e.target.value)} />
              <input type="number" min="0" className="input py-1.5 text-sm" placeholder="₹" value={c.amount} onChange={(e) => setCharge(i, 'amount', e.target.value)} />
              <select className="input py-1.5 text-sm" value={c.basis} onChange={(e) => setCharge(i, 'basis', e.target.value)}>
                {BASIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button type="button" className="text-slate-400 hover:text-red-600 px-1" onClick={() => put('charges', s.charges.filter((_, j) => j !== i))}>&times;</button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Booking defaults */}
      <div className={box}>
        <div className="font-semibold text-slate-800 text-sm mb-1">New Booking defaults</div>
        <div className="text-xs text-slate-500 mb-3">Starting values on New Booking for this business — change them per booking as needed.</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="label">Charge printing &amp; mounting</span>
            <select className="input" value={s.booking.chargeMode} onChange={(e) => setB('chargeMode', e.target.value)}>
              <option value="PRINT">Per print</option><option value="TYPE">By media type</option><option value="SITE">Per site</option>
            </select>
          </label>
          <label className="block"><span className="label">No. of mountings</span>
            <input type="number" min="0" className="input" value={s.booking.mountings} onChange={(e) => setB('mountings', e.target.value)} />
          </label>
          <label className="block"><span className="label">Printing partner</span>
            <select className="input" value={s.booking.printingPartnerId || ''} onChange={(e) => onChange({ ...s, booking: { ...s.booking, printingPartnerId: e.target.value ? Number(e.target.value) : null, printMaterial: null } })}>
              <option value="">None</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Material</span>
            <select className="input" value={s.booking.printMaterial || ''} disabled={!partner} onChange={(e) => setB('printMaterial', e.target.value || null)}>
              <option value="">{partner ? 'None' : 'Pick a partner first'}</option>
              {(partner?.materials || []).filter((m) => m.active).map((m) => <option key={m.id} value={m.name}>{m.name}{m.costPerSqft ? ` (cost ₹${m.costPerSqft}/sqft)` : ''}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Payment terms</span>
            <select className="input" value={s.booking.paymentTerms} onChange={(e) => setB('paymentTerms', e.target.value)}>
              <option value="ADVANCE">Advance</option><option value="POSTPAID">Postpaid (monthly)</option>
            </select>
          </label>
          <label className="block"><span className="label">Billing cycle</span>
            <select className="input" value={s.booking.billingCycle || ''} onChange={(e) => setB('billingCycle', e.target.value)}>
              <option value="">None</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option>
            </select>
          </label>
          {!gstLocked && (
            <label className="block"><span className="label">Tax</span>
              <select className="input" value={s.booking.taxCategory || ''} onChange={(e) => setB('taxCategory', e.target.value || null)}>
                <option value="">Ask each time (client's setting)</option><option value="GST">GST</option><option value="NON_GST">Non-GST</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={!!s.booking.monitoring} onChange={(e) => setB('monitoring', e.target.checked)} />
            <span className="text-sm text-slate-700">Monitoring on by default</span>
          </label>
        </div>
      </div>

      {/* 4. Quotation defaults */}
      <div className={box}>
        <div className="font-semibold text-slate-800 text-sm mb-1">Quotation letter defaults</div>
        <div className="text-xs text-slate-500 mb-3">Used on the Word / PDF quotation letter. Blank = the standard letter (Anant Pareek, Business Head). Standing terms are in "Terms &amp; Conditions" below.</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="label">Signatory name</span>
            <input className="input" placeholder="Anant Pareek" value={s.quotation.signatory} onChange={(e) => setQ('signatory', e.target.value)} />
          </label>
          <label className="block"><span className="label">Signatory title</span>
            <input className="input" placeholder="Business Head" value={s.quotation.signatoryTitle} onChange={(e) => setQ('signatoryTitle', e.target.value)} />
          </label>
          <label className="block"><span className="label">Phone line</span>
            <input className="input" placeholder="+91-988-988-1751, 9468942994" value={s.quotation.phone} onChange={(e) => setQ('phone', e.target.value)} />
          </label>
          <label className="block"><span className="label">Valid for (days)</span>
            <input type="number" min="0" className="input" placeholder="0 = don't print" value={s.quotation.validityDays || ''} onChange={(e) => setQ('validityDays', e.target.value)} />
          </label>
          <label className="block"><span className="label">Default payment terms</span>
            <select className="input" value={s.quotation.paymentTerms || ''} onChange={(e) => setQ('paymentTerms', e.target.value || null)}>
              <option value="">Advance (standard)</option><option value="ADVANCE">Advance</option><option value="POSTPAID">Monthly</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
