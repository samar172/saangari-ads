import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth';
import DetailDialog from './DetailDialog';
import { Money, Spinner } from './ui';

// Accounts → Reconciliation → Printing. Campaigns whose printing numbers don't
// add up (₹0 partner cost, no partner, loss, prints ≠ sites). Fix one in a 90%
// dialog showing only that booking's printing section, or tick several and set
// partner/material in one go. Cost side only — the client's bill never changes.
// Manager/Super Admin apply directly; others send it for approval.
const ISSUE = {
  NO_COST: ['₹0 partner cost', 'bg-red-100 text-red-700'],
  NO_PARTNER: ['No partner', 'bg-amber-100 text-amber-800'],
  LOSS: ['Loss', 'bg-red-100 text-red-700'],
  ZERO_PRINTS: ['0 prints', 'bg-slate-100 text-slate-600'],
  MISMATCH: ['Prints ≠ sites', 'bg-slate-100 text-slate-600'],
};
const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
const rupees = (n) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n || 0)).toLocaleString('en-IN')}`;

// Partner cost for a set of values — mirrors server/src/utils/printingCost.js.
function costFor({ partner, material, printCost, prints, perSite, sites }) {
  if (Number(printCost) > 0) return { cost: Math.round(Number(printCost)), how: 'typed' };
  const live = sites || [];
  const avg = live.length ? live.reduce((s, x) => s + (x.sqft || 0), 0) / live.length : 0;
  const n = perSite ? live.length : Math.max(0, Number(prints) || 0);
  const sqft = n * avg;
  const mat = (partner?.materials || []).find((m) => m.name === material);
  if (mat?.costPerSqft > 0 && sqft > 0) return { cost: Math.round(sqft * mat.costPerSqft), how: `${n} print${n === 1 ? '' : 's'} × ${Math.round(avg * 100) / 100} sqft × ₹${mat.costPerSqft} (${mat.name})` };
  if (partner?.ratePerSqft > 0 && sqft > 0) return { cost: Math.round(sqft * partner.ratePerSqft), how: `${n} prints × ${Math.round(avg * 100) / 100} sqft × ₹${partner.ratePerSqft} (partner rate)` };
  return { cost: 0, how: 'no cost basis' };
}

export default function PrintingRecon({ cid }) {
  const { user } = useAuth();
  const direct = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';
  const [rows, setRows] = useState(null);
  const [partners, setPartners] = useState([]);
  const [filter, setFilter] = useState('FIX'); // FIX | ALL | <issue code>
  const [partnerF, setPartnerF] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const [open, setOpen] = useState(null); // orderId for the single dialog
  const [bulk, setBulk] = useState(false);
  const [msg, setMsg] = useState('');

  function load() {
    api.get('/recon/printing', { params: { companyId: cid || undefined } }).then((r) => setRows(r.data)).catch(() => setRows([]));
  }
  useEffect(load, [cid]); // eslint-disable-line
  useEffect(() => { api.get('/printing-partners').then((r) => setPartners(r.data.filter((p) => p.active))).catch(() => {}); }, []);

  const shown = useMemo(() => (rows || []).filter((r) => {
    if (filter === 'FIX' && !r.issues.some((i) => !i.info)) return false;
    if (filter !== 'FIX' && filter !== 'ALL' && !r.issues.some((i) => i.code === filter)) return false;
    if (partnerF && String(r.partnerId || '') !== partnerF) return false;
    const n = q.trim().toLowerCase();
    return !n || `${r.orderNo} ${r.client} ${r.partner || ''}`.toLowerCase().includes(n);
  }), [rows, filter, partnerF, q]);
  const counts = useMemo(() => {
    const c = { FIX: 0, ALL: (rows || []).length };
    for (const r of rows || []) {
      if (r.issues.some((i) => !i.info)) c.FIX += 1;
      for (const i of r.issues) c[i.code] = (c[i.code] || 0) + 1;
    }
    return c;
  }, [rows]);
  const totals = shown.reduce((t, r) => ({ charged: t.charged + r.charged, cost: t.cost + r.cost }), { charged: 0, cost: 0 });
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const done = (r) => { setMsg(r.pending ? `Sent for approval (${r.count} campaign${r.count === 1 ? '' : 's'}).` : `Corrected ${r.count} campaign${r.count === 1 ? '' : 's'}.`); setOpen(null); setBulk(false); setPicked([]); load(); };

  if (!rows) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[['FIX', 'Needs fixing'], ['NO_COST', '₹0 partner cost'], ['NO_PARTNER', 'No partner'], ['LOSS', 'Loss'], ['MISMATCH', 'Prints ≠ sites'], ['ZERO_PRINTS', '0 prints'], ['ALL', 'All']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === k ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
            {l} <span className="opacity-70">{counts[k] || 0}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-full sm:w-64" placeholder="Search campaign / client / partner…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={partnerF} onChange={(e) => setPartnerF(e.target.value)}>
          <option value="">All partners</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="flex-1" />
        {picked.length > 0 && (
          <button className="btn-primary text-sm" onClick={() => setBulk(true)}>Fix {picked.length} selected…</button>
        )}
      </div>
      {msg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">{msg}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-3 py-3 w-8"><input type="checkbox" checked={shown.length > 0 && shown.every((r) => picked.includes(r.id))}
                onChange={(e) => setPicked(e.target.checked ? [...new Set([...picked, ...shown.filter((r) => !r.pending).map((r) => r.id)])] : picked.filter((id) => !shown.some((r) => r.id === id)))} /></th>
              <th className="px-3 py-3 text-left">Campaign</th>
              <th className="px-3 py-3 text-left">Partner · material</th>
              <th className="px-3 py-3 text-right">Prints / sites</th>
              <th className="px-3 py-3 text-right">Charged</th>
              <th className="px-3 py-3 text-right">Partner cost</th>
              <th className="px-3 py-3 text-right">Margin</th>
              <th className="px-3 py-3 text-left">Issue</th>
              <th className="px-3 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(r.id)}>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" disabled={!!r.pending} checked={picked.includes(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-3 py-2.5"><div className="font-medium text-brand">{r.orderNo}</div><div className="text-xs text-slate-500 truncate max-w-[220px]">{r.client} · {fmt(r.bookingDate)}</div></td>
                <td className="px-3 py-2.5">{r.partner || <span className="text-slate-400">—</span>}<div className="text-xs text-slate-500">{r.material || <span className="text-amber-600">no material</span>}</div></td>
                <td className="px-3 py-2.5 text-right">{r.perSite ? `${r.sites} (per site)` : `${r.prints} / ${r.sites}`}</td>
                <td className="px-3 py-2.5 text-right"><Money value={r.charged} /></td>
                <td className="px-3 py-2.5 text-right">{r.cost ? <Money value={r.cost} /> : <span className="text-red-600 font-medium">₹0</span>}</td>
                <td className={`px-3 py-2.5 text-right font-medium ${r.margin < 0 ? 'text-red-600' : 'text-emerald-700'}`}><Money value={r.margin} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">{r.issues.map((i) => <span key={i.code} title={i.label} className={`badge ${ISSUE[i.code]?.[1]}`}>{ISSUE[i.code]?.[0] || i.code}</span>)}</div>
                  {r.pending && <div className="text-[11px] text-amber-700 mt-0.5">Awaiting approval · {r.pending.by}</div>}
                </td>
                <td className="px-3 py-2.5 text-right"><span className="text-brand-light underline text-xs">Fix</span></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">Nothing to reconcile here 🎉</td></tr>}
          </tbody>
          {shown.length > 0 && (
            <tfoot className="bg-slate-50 text-sm font-medium">
              <tr><td colSpan={4} className="px-3 py-2 text-slate-500">{shown.length} campaign{shown.length === 1 ? '' : 's'}</td>
                <td className="px-3 py-2 text-right"><Money value={totals.charged} /></td><td className="px-3 py-2 text-right"><Money value={totals.cost} /></td>
                <td className="px-3 py-2 text-right"><Money value={totals.charged - totals.cost} /></td><td colSpan={2} /></tr>
            </tfoot>
          )}
        </table>
      </div>

      {open && <FixDialog orderId={open} partners={partners} direct={direct} onClose={() => setOpen(null)} onDone={done} />}
      {bulk && <BulkDialog rows={(rows || []).filter((r) => picked.includes(r.id))} partners={partners} direct={direct} onClose={() => setBulk(false)} onDone={done} />}
    </div>
  );
}

function Box({ title, children }) {
  return <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">{title}</div>{children}</div>;
}

// One campaign's printing section only.
function FixDialog({ orderId, partners, direct, onClose, onDone }) {
  const navigate = useNavigate();
  const [s, setS] = useState(null);
  const [v, setV] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get(`/recon/printing/${orderId}`).then((r) => {
      setS(r.data);
      setV({ partnerId: r.data.partnerId ? String(r.data.partnerId) : '', material: r.data.material || '', printCost: r.data.enteredCost || '', markOk: !!r.data.reconOkAt });
    }).catch(() => setErr('Could not load this campaign'));
  }, [orderId]);
  const partner = partners.find((p) => String(p.id) === String(v?.partnerId));
  const after = s && v ? costFor({ partner, material: v.material, printCost: v.printCost, prints: s.prints, perSite: s.perSite, sites: s.sites }) : null;
  const hasInfo = s?.issues.some((i) => i.info) || s?.reconOkAt;

  async function submit() {
    setErr('');
    if (!reason.trim()) return setErr('Please give a reason.');
    setBusy(true);
    try {
      const { data } = await api.post('/recon/printing/fix', {
        reason, items: [{ orderId, partnerId: v.partnerId ? Number(v.partnerId) : null, material: v.material || null, printCost: Number(v.printCost) || 0, markOk: hasInfo ? v.markOk : undefined }],
      });
      onDone(data);
    } catch (e) { setErr(e.response?.data?.error || 'Could not save'); } finally { setBusy(false); }
  }

  return (
    <DetailDialog open onClose={onClose} title={s ? `${s.orderNo} · printing` : 'Printing'}
      headline={s ? <span>{rupees(s.charged)} <span className="text-base font-normal text-slate-500">charged · partner cost {rupees(s.cost)} → {rupees(after?.cost)}</span></span> : null}
      explain={s ? `${s.client} · ${s.company} · ${s.status.toLowerCase()}. Only the cost side can change here — the client's bill stays the same.` : null}
      footer={s && (
        <div className="flex flex-wrap items-center gap-2">
          {err && <span className="text-sm text-red-600 mr-auto">{err}</span>}
          <button className="btn-ghost ml-auto" onClick={() => navigate(`/orders/${s.id}`)}>Open campaign</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : direct ? 'Save correction' : 'Send for approval'}</button>
        </div>
      )}>
      {!s || !v ? (err ? <div className="text-red-600 text-sm">{err}</div> : <Spinner />) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4 min-w-0">
            <Box title="What's wrong">
              <div className="flex flex-wrap gap-1.5">{s.issues.length ? s.issues.map((i) => <span key={i.code} className={`badge ${ISSUE[i.code]?.[1]}`}>{i.label}</span>) : <span className="text-sm text-emerald-700">No open issue.</span>}</div>
            </Box>
            <Box title="Printing (client charge — read only)">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><dt className="text-xs text-slate-500">Charged as</dt><dd className="font-medium">{s.perSite ? 'Per site' : 'Per print'}</dd></div>
                <div><dt className="text-xs text-slate-500">No. of prints</dt><dd className="font-medium">{s.perSite ? `${s.sites} (every site)` : s.prints}</dd></div>
                <div><dt className="text-xs text-slate-500">Rate per print</dt><dd className="font-medium">{s.perSite ? '—' : rupees(s.printRate)}</dd></div>
                <div><dt className="text-xs text-slate-500">Printing charged</dt><dd className="font-medium">{rupees(s.charged)}</dd></div>
              </dl>
              {s.remarks && <div className="mt-3 text-xs text-slate-500">Remarks: {s.remarks}</div>}
            </Box>
            <Box title={`Sites (${s.sites.length}) · avg ${s.area.avgSqft} sqft`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead className="text-[11px] uppercase text-slate-400"><tr><th className="text-left py-1">Code</th><th className="text-left py-1">Location</th><th className="text-left py-1">Type</th><th className="text-right py-1">Size</th><th className="text-right py-1">Sqft</th></tr></thead>
                  <tbody>{s.sites.map((x) => (
                    <tr key={x.code} className="border-t border-slate-100"><td className="py-1.5 font-medium">{x.code}</td><td className="py-1.5 text-slate-600">{x.location}</td><td className="py-1.5 text-slate-500">{x.type}</td><td className="py-1.5 text-right text-slate-500">{x.size || '—'}</td>
                      <td className={`py-1.5 text-right ${x.sqft ? '' : 'text-red-600'}`}>{x.sqft || 'no size'}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Box>
          </div>
          <div className="space-y-4">
            <Box title="Partner cost (what we pay)">
              <div className="space-y-3">
                <label className="block"><span className="label">Printing partner</span>
                  <select className="input" value={v.partnerId} onChange={(e) => setV({ ...v, partnerId: e.target.value, material: '' })}>
                    <option value="">None (printed ourselves)</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="block"><span className="label">Material</span>
                  <select className="input" value={v.material} disabled={!partner} onChange={(e) => setV({ ...v, material: e.target.value })}>
                    <option value="">{partner ? 'None' : 'Pick a partner first'}</option>
                    {(partner?.materials || []).filter((m) => m.active || m.name === v.material).map((m) => <option key={m.id} value={m.name}>{m.name}{m.costPerSqft ? ` — ₹${m.costPerSqft}/sqft` : ' — no ₹/sqft'}</option>)}
                  </select>
                </label>
                <label className="block"><span className="label">Partner cost typed (optional)</span>
                  <input type="number" min="0" className="input" placeholder={after?.cost && !(Number(v.printCost) > 0) ? `Auto ₹${after.cost.toLocaleString('en-IN')}` : 'Leave blank to use auto'} value={Number(v.printCost) > 0 ? v.printCost : ''} onChange={(e) => setV({ ...v, printCost: e.target.value })} />
                </label>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">Partner cost</span><span>{rupees(s.cost)} → <b>{rupees(after.cost)}</b></span></div>
                  <div className="text-[11px] text-slate-500">{after.how}</div>
                  <div className="flex justify-between"><span className="text-slate-500">Margin</span><span>{rupees(s.charged - s.cost)} → <b className={s.charged - after.cost < 0 ? 'text-red-600' : 'text-emerald-700'}>{rupees(s.charged - after.cost)}</b></span></div>
                </div>
                {hasInfo && (
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={v.markOk} onChange={(e) => setV({ ...v, markOk: e.target.checked })} />
                    <span>Prints / sites are correct as they are (e.g. repeat flex changes) — hide the info flag.</span>
                  </label>
                )}
                <label className="block"><span className="label">Reason *</span>
                  <textarea className="input h-20" placeholder="e.g. M B billed White Base, 992 sqft × ₹5.5" value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                {!direct && <p className="text-[11px] text-slate-500">A Manager or Super Admin approves this before it's applied.</p>}
              </div>
            </Box>
          </div>
        </div>
      )}
    </DetailDialog>
  );
}

// Several campaigns: set the same partner / material on all of them.
function BulkDialog({ rows, partners, direct, onClose, onDone }) {
  const [partnerId, setPartnerId] = useState(() => {
    const ids = [...new Set(rows.map((r) => r.partnerId).filter(Boolean))];
    return ids.length === 1 ? String(ids[0]) : '';
  });
  const [material, setMaterial] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const partner = partners.find((p) => String(p.id) === partnerId);
  const mat = (partner?.materials || []).find((m) => m.name === material);
  // Cost preview per row from the list data (prints × avg sqft × ₹/sqft).
  const preview = rows.map((r) => {
    if (r.enteredCost > 0) return { ...r, newCost: r.enteredCost };
    const n = r.perSite ? r.sites : r.prints;
    const rate = mat?.costPerSqft || partner?.ratePerSqft || 0;
    return { ...r, newCost: Math.round(n * (r.avgSqft || 0) * rate) };
  });
  const before = rows.reduce((s, r) => s + r.cost, 0);
  const afterTotal = preview.reduce((s, r) => s + r.newCost, 0);
  const charged = rows.reduce((s, r) => s + r.charged, 0);

  async function submit() {
    setErr('');
    if (!partnerId) return setErr('Pick a partner.');
    if (!reason.trim()) return setErr('Please give a reason.');
    setBusy(true);
    try {
      const { data } = await api.post('/recon/printing/fix', { reason, items: rows.map((r) => ({ orderId: r.id, partnerId: Number(partnerId), material: material || null })) });
      onDone(data);
    } catch (e) { setErr(e.response?.data?.error || 'Could not save'); } finally { setBusy(false); }
  }

  return (
    <DetailDialog open onClose={onClose} title={`Fix ${rows.length} campaigns · printing`}
      headline={<span>{rupees(before)} → {rupees(afterTotal)} <span className="text-base font-normal text-slate-500">partner cost · {rupees(charged)} charged</span></span>}
      explain="Sets the same partner and material on every selected campaign. A typed partner cost on a campaign is kept. Cost side only."
      footer={(
        <div className="flex flex-wrap items-center gap-2">
          {err && <span className="text-sm text-red-600 mr-auto">{err}</span>}
          <button className="btn-ghost ml-auto" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : direct ? `Apply to ${rows.length}` : `Send ${rows.length} for approval`}</button>
        </div>
      )}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 min-w-0">
          <Box title="Campaigns">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-[11px] uppercase text-slate-400"><tr><th className="text-left py-1">Campaign</th><th className="text-left py-1">Now</th><th className="text-right py-1">Prints</th><th className="text-right py-1">Charged</th><th className="text-right py-1">Cost now → new</th></tr></thead>
                <tbody>{preview.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-1.5"><div className="font-medium">{r.orderNo}</div><div className="text-xs text-slate-500">{r.client}</div></td>
                    <td className="py-1.5 text-xs text-slate-500">{r.partner || 'no partner'} · {r.material || 'no material'}</td>
                    <td className="py-1.5 text-right">{r.perSite ? r.sites : r.prints}</td>
                    <td className="py-1.5 text-right">{rupees(r.charged)}</td>
                    <td className="py-1.5 text-right">{rupees(r.cost)} → <b>{rupees(r.newCost)}</b></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Box>
        </div>
        <Box title="Set on all">
          <div className="space-y-3">
            <label className="block"><span className="label">Printing partner</span>
              <select className="input" value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setMaterial(''); }}>
                <option value="">Pick…</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Material</span>
              <select className="input" value={material} disabled={!partner} onChange={(e) => setMaterial(e.target.value)}>
                <option value="">None</option>
                {(partner?.materials || []).filter((m) => m.active).map((m) => <option key={m.id} value={m.name}>{m.name}{m.costPerSqft ? ` — ₹${m.costPerSqft}/sqft` : ''}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Reason *</span>
              <textarea className="input h-20" placeholder="e.g. M B bill no. 123 — all White Base" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            {!direct && <p className="text-[11px] text-slate-500">One approval request covers all {rows.length}.</p>}
          </div>
        </Box>
      </div>
    </DetailDialog>
  );
}
