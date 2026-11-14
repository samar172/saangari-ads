import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../api';
import { useAuth, can } from '../auth';
import DetailDialog from './DetailDialog';
import { Money, Spinner } from './ui';

// Campaign → Reprints. A reprint (torn flex, design change…) lists the sites
// reprinted with prints / material / printing / mounting and the partner cost.
// Client-paid ones go straight through and are billed on the next bill or a
// separate bill now; free ones (we bear the cost) need Manager/Admin approval.
const STATUS_STYLE = {
  REQUESTED: 'bg-amber-100 text-amber-800', APPROVED: 'bg-sky-100 text-sky-800', PRINTED: 'bg-indigo-100 text-indigo-800',
  MOUNTED: 'bg-emerald-100 text-emerald-800', REJECTED: 'bg-red-100 text-red-700', CANCELLED: 'bg-slate-100 text-slate-500',
};
const NEXT = { APPROVED: ['PRINTED', 'Mark printed'], PRINTED: ['MOUNTED', 'Mark mounted'] };
const r = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const fmt = (d) => dayjs(d).format('D MMM YY');

export function ReprintsTab({ o, onChanged, openNew, setOpenNew }) {
  const { user } = useAuth();
  const [own, setOwn] = useState(false);
  const open = openNew ?? own;
  const setOpen = setOpenNew ?? setOwn;
  const [err, setErr] = useState('');
  const list = o.reprints || [];
  const canEdit = can(user, 'editBooking');
  const billOf = (rp) => (o.invoices || []).find((i) => i.status !== 'CANCELLED'
    && (i.reprintId === rp.id || (Array.isArray(i.lines) && i.lines.some((x) => x.kind === 'REPRINT' && x.reprintId === rp.id))));

  async function act(rp, status) {
    setErr('');
    try { await api.post(`/reprints/${rp.id}/status`, { status }); onChanged(); } catch (e) { setErr(e.response?.data?.error || 'Could not update'); }
  }
  async function billNow(rp) {
    setErr('');
    try { await api.post(`/reprints/${rp.id}/bill`, {}); onChanged(); } catch (e) { setErr(e.response?.data?.error || 'Could not raise the bill'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-slate-600 flex-1">
          {list.length ? `${list.length} reprint${list.length === 1 ? '' : 's'} · charged ${r(list.filter((x) => !['CANCELLED', 'REJECTED'].includes(x.status)).reduce((s, x) => s + x.charge, 0))} · partner cost ${r(list.filter((x) => !['CANCELLED', 'REJECTED', 'REQUESTED'].includes(x.status)).reduce((s, x) => s + x.cost, 0))}` : 'No reprints yet.'}
        </div>
        {canEdit && !['QUOTATION', 'CANCELLED'].includes(o.status) && (
          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setOpen(true)}><Plus size={16} /> New reprint</button>
        )}
      </div>
      {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
      {list.map((rp) => {
        const bill = billOf(rp);
        const lines = Array.isArray(rp.lines) ? rp.lines : [];
        return (
          <div key={rp.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Printer size={16} className="text-slate-400" />
              <span className="font-semibold text-slate-800">{rp.reprintNo}</span>
              <span className={`badge ${STATUS_STYLE[rp.status] || ''}`}>{rp.status.toLowerCase()}</span>
              <span className="text-xs text-slate-500">{fmt(rp.reprintDate)} · {rp.reason.replace(/_/g, ' ').toLowerCase()}{rp.note ? ` — ${rp.note}` : ''}</span>
              <span className="flex-1" />
              <span className="text-xs text-slate-500">{rp.chargeTo === 'FREE' ? 'Free (we bear it)' : `Client pays ${r(rp.charge)} + GST · ${rp.billing === 'SEPARATE' ? 'separate bill' : 'next bill'}`}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-[11px] uppercase text-slate-400"><tr><th className="text-left py-1">Site</th><th className="text-right py-1">Prints</th><th className="text-left py-1 px-2">Material</th><th className="text-right py-1">Printing</th><th className="text-right py-1">Mounting</th><th className="text-right py-1">Partner cost</th></tr></thead>
                <tbody>{lines.map((l) => (
                  <tr key={l.bookingId} className="border-t border-slate-100">
                    <td className="py-1.5"><span className="font-medium">{l.code}</span> <span className="text-slate-500">{l.location}</span></td>
                    <td className="py-1.5 text-right">{l.prints}</td><td className="py-1.5 px-2 text-slate-600">{l.material || '—'}</td>
                    <td className="py-1.5 text-right"><Money value={l.printCharge} /></td><td className="py-1.5 text-right"><Money value={l.mountCharge} /></td><td className="py-1.5 text-right"><Money value={l.cost} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-slate-500">Partner: {rp.printingPartner?.name || '—'} · by {rp.createdByName || '—'}</span>
              {bill && <Link className="text-brand-light underline" to={`/invoices/${bill.id}`}>On bill {bill.invoiceNo}</Link>}
              {!bill && rp.chargeTo === 'CLIENT' && ['APPROVED', 'PRINTED', 'MOUNTED'].includes(rp.status) && (
                <span className="text-amber-700">{rp.billing === 'NEXT_BILL' ? 'Goes on the next bill' : 'Not billed'}</span>
              )}
              <span className="flex-1" />
              {rp.status === 'REQUESTED' && <span className="text-amber-700">Awaiting Manager/Admin approval</span>}
              {canEdit && NEXT[rp.status] && <button className="btn-ghost text-xs py-1" onClick={() => act(rp, NEXT[rp.status][0])}>{NEXT[rp.status][1]}</button>}
              {!bill && rp.chargeTo === 'CLIENT' && ['APPROVED', 'PRINTED', 'MOUNTED'].includes(rp.status) && can(user, 'generateInvoice') && (
                <button className="btn-ghost text-xs py-1" onClick={() => billNow(rp)}>Bill now (separate)</button>
              )}
              {canEdit && !bill && !['CANCELLED', 'REJECTED'].includes(rp.status) && (
                <button className="text-xs text-red-600 underline" onClick={() => act(rp, 'CANCELLED')}>Cancel reprint</button>
              )}
            </div>
            {Array.isArray(rp.history) && rp.history.length > 0 && (
              <div className="mt-2 text-[11px] text-slate-400">{rp.history.map((h) => `${h.status.toLowerCase()} ${dayjs(h.at).format('D MMM, h:mm A')}${h.by ? ` by ${h.by}` : ''}`).join(' → ')}</div>
            )}
          </div>
        );
      })}
      {open && <NewReprintDialog o={o} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); }} />}
    </div>
  );
}

function Box({ title, children, right }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 min-w-0">
      <div className="flex items-center justify-between mb-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>{right}</div>
      {children}
    </div>
  );
}

function NewReprintDialog({ o, onClose, onDone }) {
  const { user } = useAuth();
  const direct = user.role === 'MANAGER' || user.role === 'SUPER_ADMIN';
  const [s, setS] = useState(null);
  const [partners, setPartners] = useState([]);
  const [rows, setRows] = useState({}); // bookingId → { on, prints, material, printCharge, mountCharge, cost }
  const [form, setForm] = useState({ date: dayjs().format('YYYY-MM-DD'), reason: 'STORM', note: '', chargeTo: 'CLIENT', billing: 'NEXT_BILL', partnerId: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get(`/reprints/order/${o.id}/setup`).then(({ data }) => {
      setS(data);
      setForm((f) => ({ ...f, partnerId: data.partnerId ? String(data.partnerId) : '', billing: data.canBillNext ? 'NEXT_BILL' : 'SEPARATE' }));
      setRows(Object.fromEntries(data.sites.map((x) => [x.bookingId, { on: false, prints: '1', material: x.material || '', printCharge: String(x.printCharge || 0), mountCharge: String(x.mountCharge || 0), cost: '' }])));
    }).catch((e) => setErr(e.response?.data?.error || 'Could not load the sites'));
    api.get('/printing-partners').then((res) => setPartners(res.data.filter((p) => p.active))).catch(() => {});
  }, [o.id]);
  const partner = partners.find((p) => String(p.id) === form.partnerId);
  const rateOf = (name) => {
    const m = (partner?.materials || []).find((x) => x.name === name);
    return m?.costPerSqft > 0 ? m.costPerSqft : partner?.ratePerSqft > 0 ? partner.ratePerSqft : 0;
  };
  const free = form.chargeTo === 'FREE';
  const picked = useMemo(() => (s?.sites || []).filter((x) => rows[x.bookingId]?.on).map((x) => {
    const v = rows[x.bookingId];
    const prints = Math.max(0, Number(v.prints) || 0);
    const auto = Math.round(prints * (x.sqft || 0) * rateOf(v.material));
    const cost = v.cost !== '' ? Math.max(0, Number(v.cost) || 0) : auto;
    return { ...x, ...v, prints, auto, costN: cost, pc: free ? 0 : Number(v.printCharge) || 0, mc: free ? 0 : Number(v.mountCharge) || 0 };
  }), [s, rows, partner, free]); // eslint-disable-line
  const charge = picked.reduce((a, x) => a + x.pc + x.mc, 0);
  const cost = picked.reduce((a, x) => a + x.costN, 0);
  const setRow = (id, k, v) => setRows((rs) => ({ ...rs, [id]: { ...rs[id], [k]: v } }));
  const setAll = (k, v) => setRows((rs) => Object.fromEntries(Object.entries(rs).map(([id, x]) => [id, x.on ? { ...x, [k]: v } : x])));

  async function save() {
    setErr('');
    if (!picked.length) return setErr('Tick at least one site.');
    setBusy(true);
    try {
      await api.post(`/reprints/order/${o.id}`, {
        ...form, partnerId: form.partnerId ? Number(form.partnerId) : null,
        sites: picked.map((x) => ({ bookingId: x.bookingId, prints: x.prints, material: x.material || null, printCharge: x.pc, mountCharge: x.mc, cost: rows[x.bookingId].cost === '' ? undefined : x.costN })),
      });
      onDone();
    } catch (e) { setErr(e.response?.data?.error || 'Could not save the reprint'); } finally { setBusy(false); }
  }

  const label = free ? (direct ? 'Save free reprint' : 'Send for approval') : form.billing === 'SEPARATE' ? 'Save & raise bill' : 'Save (goes on next bill)';
  return (
    <DetailDialog open onClose={onClose} title={`${o.orderNo} · new reprint`}
      headline={<span>{free ? 'Free' : r(charge)} <span className="text-base font-normal text-slate-500">{free ? '' : '+ GST to the client'} · partner cost {r(cost)} · {picked.length} site{picked.length === 1 ? '' : 's'}</span></span>}
      explain={`${s?.client || ''} · tick the sites to reprint. Client-paid reprints are added to the campaign and billed; free ones need Manager/Admin approval.`}
      footer={(
        <div className="flex flex-wrap items-center gap-2">
          {err && <span className="text-sm text-red-600 mr-auto">{err}</span>}
          <button className="btn-ghost ml-auto" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !s} onClick={save}>{busy ? 'Saving…' : label}</button>
        </div>
      )}>
      {!s ? (err ? <div className="text-sm text-red-600">{err}</div> : <Spinner />) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 min-w-0">
            <Box title={`Sites (${s.sites.length})`} right={picked.length > 1 && (
              <span className="text-[11px] text-slate-500">Set on ticked:
                <select className="input py-0.5 text-xs w-auto inline-block ml-1" value="" onChange={(e) => e.target.value && setAll('material', e.target.value)}>
                  <option value="">material…</option>
                  {(partner?.materials || []).filter((m) => m.active).map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </span>
            )}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="text-[11px] uppercase text-slate-400">
                    <tr><th className="py-1 w-6" /><th className="text-left py-1">Site</th><th className="text-left py-1">Prints</th><th className="text-left py-1">Material</th>
                      {!free && <><th className="text-left py-1">Printing ₹</th><th className="text-left py-1">Mounting ₹</th></>}
                      <th className="text-left py-1">Partner cost ₹</th></tr>
                  </thead>
                  <tbody>{s.sites.map((x) => {
                    const v = rows[x.bookingId] || {};
                    const p = picked.find((y) => y.bookingId === x.bookingId);
                    return (
                      <tr key={x.bookingId} className={`border-t border-slate-100 ${v.on ? '' : 'opacity-60'}`}>
                        <td className="py-1.5"><input type="checkbox" checked={!!v.on} onChange={(e) => setRow(x.bookingId, 'on', e.target.checked)} /></td>
                        <td className="py-1.5 pr-2"><div className="font-medium">{x.code}</div><div className="text-xs text-slate-500 truncate max-w-[220px]">{x.location} · {x.type?.toLowerCase()} · {x.size ? `${x.size} · ` : ''}{x.sqft} sqft</div></td>
                        <td className="py-1.5 pr-2"><input type="number" min="0" className="input py-1 text-xs w-16" disabled={!v.on} value={v.prints} onChange={(e) => setRow(x.bookingId, 'prints', e.target.value)} /></td>
                        <td className="py-1.5 pr-2">
                          <select className="input py-1 text-xs w-36" disabled={!v.on || !partner} value={v.material} onChange={(e) => setRow(x.bookingId, 'material', e.target.value)}>
                            <option value="">{partner ? 'None' : 'Pick a partner'}</option>
                            {(partner?.materials || []).filter((m) => m.active || m.name === v.material).map((m) => <option key={m.id} value={m.name}>{m.name}{m.costPerSqft ? ` · ₹${m.costPerSqft}` : ''}</option>)}
                          </select>
                        </td>
                        {!free && <>
                          <td className="py-1.5 pr-2"><input type="number" min="0" className="input py-1 text-xs w-24" disabled={!v.on} value={v.printCharge} onChange={(e) => setRow(x.bookingId, 'printCharge', e.target.value)} /></td>
                          <td className="py-1.5 pr-2"><input type="number" min="0" className="input py-1 text-xs w-24" disabled={!v.on} value={v.mountCharge} onChange={(e) => setRow(x.bookingId, 'mountCharge', e.target.value)} /></td>
                        </>}
                        <td className="py-1.5"><input type="number" min="0" className="input py-1 text-xs w-24" disabled={!v.on} placeholder={p ? `auto ${p.auto}` : ''} value={v.cost} onChange={(e) => setRow(x.bookingId, 'cost', e.target.value)} /></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Partner cost is worked out as prints × the site's sqft × the material's ₹/sqft — type an amount to override. Mounting covers remounting the new flex.</p>
            </Box>
          </div>
          <div className="space-y-4">
            <Box title="Reprint">
              <div className="space-y-3">
                <label className="block"><span className="label">Date</span><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
                <label className="block"><span className="label">Reason</span>
                  <select className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                    {Object.entries(s.reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="block"><span className="label">Note</span><textarea className="input h-16" placeholder="e.g. Flex torn in Sunday's storm" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
                <label className="block"><span className="label">Printing partner</span>
                  <select className="input" value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
                    <option value="">None (printed ourselves)</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
            </Box>
            <Box title="Who pays">
              <div className="space-y-2">
                {[['CLIENT', 'Client pays', 'Printing + mounting added to the campaign and billed'], ['FREE', 'Free — we bear it', direct ? 'Only the partner cost; saved directly (Manager/Admin)' : 'Only the partner cost; needs Manager/Admin approval']].map(([k, l, d]) => (
                  <button type="button" key={k} onClick={() => setForm({ ...form, chargeTo: k })}
                    className={`w-full rounded-lg border p-2.5 text-left ${form.chargeTo === k ? 'border-brand bg-brand/5' : 'border-slate-200'}`}>
                    <div className="text-sm font-medium">{l}</div><div className="text-xs text-slate-500">{d}</div>
                  </button>
                ))}
                {!free && (
                  <div className="pt-1">
                    <div className="label">Bill it</div>
                    {[['NEXT_BILL', 'On the next bill', s.canBillNext ? 'Added to whichever bill is raised next' : 'Not possible — every day of the campaign is already billed'], ['SEPARATE', 'Separate bill now', 'A reprint bill is raised straight away']].map(([k, l, d]) => (
                      <label key={k} className={`flex items-start gap-2 py-1 ${k === 'NEXT_BILL' && !s.canBillNext ? 'opacity-50' : ''}`}>
                        <input type="radio" className="mt-1" disabled={k === 'NEXT_BILL' && !s.canBillNext} checked={form.billing === k} onChange={() => setForm({ ...form, billing: k })} />
                        <span><span className="text-sm">{l}</span><span className="block text-xs text-slate-500">{d}</span></span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </Box>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Client charge</span><b>{free ? '—' : `${r(charge)} + GST`}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Partner cost</span><b>{r(cost)}</b></div>
              {!free && <div className="flex justify-between"><span className="text-slate-500">Margin</span><b className={charge - cost < 0 ? 'text-red-600' : 'text-emerald-700'}>{r(charge - cost)}</b></div>}
            </div>
          </div>
        </div>
      )}
    </DetailDialog>
  );
}
