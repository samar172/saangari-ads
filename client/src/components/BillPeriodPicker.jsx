import { useEffect, useState } from 'react';
import api from '../api';
import { Money } from './ui';

const ymd = (d) => (d ? String(d).slice(0, 10) : '');
const fmtD = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// "Bill for": choose which billing cycle to invoice — any unbilled month/quarter,
// not only the next one — or custom From → To dates. Shows a live preview of
// the bill. Reports the choice upward as { periodIndex } or { start, end }
// (null while the choice is invalid), ready to send to POST /invoices.
export default function BillPeriodPicker({ orderId, taxCategory, plan, onChange }) {
  const open = (plan?.periods || []).filter((p) => p.status === 'OPEN');
  const [choice, setChoice] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [custom, setCustom] = useState(null); // { draft } | { error }

  // Default: the next open cycle, else custom dates covering what's left.
  useEffect(() => {
    if (!plan) return;
    if (plan.next) setChoice(String(plan.next.index));
    else setChoice('CUSTOM');
    setStart(ymd(plan.nextUnbilledDate || plan.campaignStart));
    setEnd(ymd(plan.nextUnbilledEnd || plan.campaignEnd));
  }, [plan]);

  // Live preview + validation of custom dates.
  useEffect(() => {
    if (choice !== 'CUSTOM' || !start || !end) { setCustom(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      api.get(`/orders/${orderId}/billing-plan`, { params: { start, end } })
        .then((r) => { if (alive) setCustom(r.data.custom || null); })
        .catch(() => { if (alive) setCustom({ error: 'Could not price these dates' }); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [choice, start, end, orderId]);

  const period = choice !== 'CUSTOM' && choice !== '' ? plan?.periods.find((p) => String(p.index) === choice) : null;
  const draft = period ? period.billNow : custom?.draft;
  const gst = (t) => (taxCategory === 'GST' ? Math.round(t * 0.18) : 0);

  useEffect(() => {
    if (period?.billNow) onChange?.({ periodIndex: period.index, draft: period.billNow });
    else if (choice === 'CUSTOM' && custom?.draft) onChange?.({ start, end, draft: custom.draft });
    else onChange?.(null);
  }, [choice, period, custom, start, end]); // eslint-disable-line

  if (!plan) return null;
  if (plan.fullyBilled) {
    return <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">Every day of this campaign is already invoiced. Cancel a bill to re-issue it.</div>;
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="label">Bill for</label>
        <select className="input" value={choice} onChange={(e) => setChoice(e.target.value)}>
          {plan.periods.map((p) => (
            <option key={p.index} value={String(p.index)} disabled={p.status !== 'OPEN'}>
              {p.label || 'Full campaign'} · {fmtD(p.periodStart)} → {fmtD(p.periodEnd)}
              {p.status === 'OPEN' ? ` · ₹${(p.billNow.taxable + gst(p.billNow.taxable)).toLocaleString('en-IN')}` : ` · ${p.status === 'BILLED' ? 'billed' : 'partly billed'} (${p.invoices.map((i) => i.invoiceNo).join(', ')})`}
            </option>
          ))}
          <option value="CUSTOM">Custom dates…</option>
        </select>
        {open.length === 0 && choice !== 'CUSTOM' && <p className="text-[11px] text-amber-700 mt-1">No full cycle is left unbilled — use custom dates.</p>}
      </div>

      {choice === 'CUSTOM' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={start} min={ymd(plan.campaignStart)} max={ymd(plan.campaignEnd)} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={end} min={ymd(plan.campaignStart)} max={ymd(plan.campaignEnd)} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <p className="col-span-2 text-[11px] text-slate-400 -mt-1">Campaign runs {fmtD(plan.campaignStart)} → {fmtD(plan.campaignEnd)}. Dates already on a bill can't be billed again.</p>
        </div>
      )}

      {choice === 'CUSTOM' && custom?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{custom.error}</div>
      )}
      {draft && (
        <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm text-slate-700">
          <b>{draft.label || 'Full campaign'}</b>: {fmtD(draft.periodStart)} → {fmtD(draft.periodEnd)}
          {' · '}taxable <Money value={draft.taxable} />
          {taxCategory === 'GST' && <> + GST <Money value={gst(draft.taxable)} /></>}
          {' '}= <b><Money value={draft.taxable + gst(draft.taxable)} /></b>
          {draft.rows.some((r) => r.kind === 'PRINT' || r.kind === 'ADDON') && <div className="text-[11px] text-slate-500 mt-0.5">Includes printing / mounting / extra charges (billed once, on the first bill).</div>}
        </div>
      )}
    </div>
  );
}
