import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, X, Download, ArrowRightLeft } from 'lucide-react';
import api, { downloadFile } from '../api';
import { useCompany } from '../CompanyContext';
import { Money, Spinner } from '../components/ui';
import { AddSitePicker } from './NewBooking';

// New / edit quotation. Sites come from Inventory (searchable picker, rate and
// printing + mounting pre-filled from the site, all editable); free-text lines
// are allowed too. Saving keeps it in the Quotations list — no site is held —
// and the Word letter downloads in the team's letterhead format.
export default function QuotationForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [q, setQ] = useState(null); // the saved quotation when editing
  const [form, setForm] = useState({ clientId: '', clientName: '', clientCompany: '', address: '', contact: '', quoteDate: new Date().toISOString().slice(0, 10), paymentTerms: 'ADVANCE', notes: '' });
  const [lines, setLines] = useState([]); // { siteId?, code?, name, type?, months, rate, pm }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get('/clients').then((r) => setClients(r.data)).catch(() => {});
    api.get('/sites').then((r) => setSites(r.data.filter((s) => s.active !== false))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!editing) return;
    api.get(`/quotations/${id}`).then((r) => {
      const x = r.data;
      setQ(x);
      setForm({
        clientId: x.clientId || '', clientName: x.clientName || '', clientCompany: x.clientCompany || '', address: x.address || '',
        contact: x.contact || '', quoteDate: x.quoteDate.slice(0, 10), paymentTerms: x.paymentTerms || 'ADVANCE', notes: x.notes || '',
      });
      setLines(x.lines || []);
    }).catch(() => navigate('/quotations'));
  }, [id]); // eslint-disable-line

  // Picking a saved client fills the addressee block (still editable).
  function pickClient(cid) {
    const c = clients.find((x) => String(x.id) === String(cid));
    setForm((f) => ({
      ...f, clientId: cid,
      ...(c ? { clientName: c.name || '', clientCompany: c.company || '', address: c.address || '', contact: c.phone || '' } : {}),
    }));
  }

  // Business Setup → rates & quotation defaults for this business.
  const settings = activeCompany?.settings || {};
  useEffect(() => {
    if (editing) return;
    const pt = settings.quotation?.paymentTerms || settings.booking?.paymentTerms;
    if (pt) setForm((f) => ({ ...f, paymentTerms: pt }));
  }, [activeCompany?.id]); // eslint-disable-line
  // P&M per site: Business Setup's printing + mounting for the media type, else Inventory.
  const pmOf = (s) => {
    const r = settings.mediaRates?.[s.type];
    const print = r?.print > 0 ? r.print : (s.printingCost || 0);
    const mount = r?.mount > 0 ? r.mount : (s.mountingCost || 0);
    return Math.round(print + mount);
  };

  const siteById = useMemo(() => Object.fromEntries(sites.map((s) => [s.id, s])), [sites]);
  const offered = sites.filter((s) => !lines.some((l) => l.siteId === s.id));
  function addSites(ids) {
    setLines((ls) => [...ls, ...ids.map((sid) => {
      const s = siteById[Number(sid)];
      return {
        siteId: s.id, code: s.code, type: s.type, name: s.billName || s.location, months: 1,
        rate: Math.round(s.monthlyRate || 0), pm: pmOf(s),
      };
    })]);
  }
  const updateLine = (i, k, v) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const applyToAll = (k, v) => setLines((ls) => ls.map((l) => ({ ...l, [k]: v })));

  const rent = lines.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.months) || 1), 0);
  const pm = lines.reduce((s, l) => s + (Number(l.pm) || 0), 0);
  const gst = activeCompany?.gstHidden ? 0 : Math.round((rent + pm) * 0.18);

  const fileBase = (no) => `Quotation-${no.replace(/\//g, '-')}`;
  // fmt: 'docx' | 'pdf' | null (save only)
  async function save(andDownload) {
    setErr('');
    if (!form.clientName.trim()) return setErr('Addressee name is required (e.g. "Mr. Rajeev Ji").');
    if (!lines.length) return setErr('Add at least one site or line.');
    if (lines.some((l) => !String(l.name || '').trim())) return setErr('Every line needs a name.');
    setBusy(true);
    try {
      const body = { ...form, companyId: q?.companyId || activeCompany?.id, lines };
      const { data } = editing ? await api.put(`/quotations/${id}`, body) : await api.post('/quotations', body);
      if (andDownload) await downloadFile(`/quotations/${data.id}/${andDownload}`, `${fileBase(data.quoteNo)}.${andDownload}`);
      navigate(`/quotations/${data.id}`, { replace: true });
      setQ(data);
    } catch (e) { setErr(e.response?.data?.error || 'Could not save the quotation'); }
    finally { setBusy(false); }
  }

  if (editing && !q) return <Spinner />;
  const locked = q?.status === 'CONVERTED';

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/quotations')}>← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{editing ? q.quoteNo : 'New Quotation'}</h1>
          <p className="text-sm text-slate-500">{activeCompany?.name} · saved quotations don't hold any site</p>
        </div>
        <div className="flex-1" />
        {editing && (
          <>
            <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => downloadFile(`/quotations/${id}/docx`, `${fileBase(q.quoteNo)}.docx`)}><Download size={16} /> Word</button>
            <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => downloadFile(`/quotations/${id}/pdf`, `${fileBase(q.quoteNo)}.pdf`)}><Download size={16} /> PDF</button>
            {!locked && <button className="btn-accent text-sm flex items-center gap-1.5" onClick={() => navigate(`/new-booking?fromQuote=${id}`)}><ArrowRightLeft size={16} /> Convert to booking</button>}
          </>
        )}
      </div>

      {locked && <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">Converted into a booking{q.orderId ? <> — <button className="underline" onClick={() => navigate(`/orders/${q.orderId}`)}>open campaign</button></> : ''}. It can't be edited.</div>}
      {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 space-y-3">
            <div className="text-sm font-semibold text-slate-700">To</div>
            <select className="input" value={form.clientId} disabled={locked} onChange={(e) => pickClient(e.target.value)}>
              <option value="">New / one-off client (type below)</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}{c.company ? ` (${c.name})` : ''} — {c.phone}</option>)}
            </select>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label">Addressee</label><input className="input" disabled={locked} value={form.clientName} onChange={(e) => set('clientName', e.target.value)} placeholder="Mr. Rajeev Ji" /></div>
              <div><label className="label">Organisation</label><input className="input" disabled={locked} value={form.clientCompany} onChange={(e) => set('clientCompany', e.target.value)} placeholder="Pink Model School" /></div>
              <div className="sm:col-span-2"><label className="label">Address / City (one line per row)</label><textarea className="input h-16" disabled={locked} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Bikaner" /></div>
              <div><label className="label">Contact (not printed)</label><input className="input" disabled={locked} value={form.contact} onChange={(e) => set('contact', e.target.value)} /></div>
              <div><label className="label">Quotation date</label><input type="date" className="input" disabled={locked} value={form.quoteDate} onChange={(e) => set('quoteDate', e.target.value)} /></div>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Sites ({lines.length})</div>
              {!locked && (
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost text-sm py-1.5" onClick={() => setLines((ls) => [...ls, { name: '', months: 1, rate: '', pm: 0 }])}>+ Free line</button>
                  <AddSitePicker sites={offered} onPickMultiple={addSites} />
                </div>
              )}
            </div>
            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">Add sites from Inventory, or a free line</div>
            ) : (
              <div className="space-y-2">
                {lines.map((l, i) => {
                  const s = l.siteId ? siteById[l.siteId] : null;
                  return (
                    <div key={i} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-slate-500">{l.code ? <><b className="text-slate-800">{l.code}</b> · {l.type}{s && s.status !== 'AVAILABLE' ? <span className="ml-1 badge bg-amber-100 text-amber-800 text-[10px]">{s.status.toLowerCase()} now</span> : ''}</> : 'Free line'}</div>
                        {!locked && <button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600"><X size={16} /></button>}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-[2fr_0.7fr_1fr_1fr] gap-2 mt-1">
                        <div className="col-span-2 sm:col-span-1"><div className="text-[10px] text-slate-400 mb-0.5">Name on the letter</div><input className="input py-1 text-xs" disabled={locked} value={l.name} onChange={(e) => updateLine(i, 'name', e.target.value)} /></div>
                        <div><div className="text-[10px] text-slate-400 mb-0.5 flex justify-between">Months{lines.length > 1 && !locked && <button type="button" className="text-brand" onClick={() => applyToAll('months', l.months)}>→ all</button>}</div><input type="number" min="1" className="input py-1 text-xs" disabled={locked} value={l.months} onChange={(e) => updateLine(i, 'months', e.target.value)} /></div>
                        <div><div className="text-[10px] text-slate-400 mb-0.5 flex justify-between">Rate / month ₹{lines.length > 1 && !locked && <button type="button" className="text-brand" onClick={() => applyToAll('rate', l.rate)}>→ all</button>}</div><input type="number" min="0" className="input py-1 text-xs" disabled={locked} value={l.rate} onChange={(e) => updateLine(i, 'rate', e.target.value)} /></div>
                        <div><div className="text-[10px] text-slate-400 mb-0.5">Print + mount ₹</div><input type="number" min="0" className="input py-1 text-xs" disabled={locked} value={l.pm} onChange={(e) => updateLine(i, 'pm', e.target.value)} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card p-5 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Payment terms (printed)</label>
                <select className="input" disabled={locked} value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)}>
                  <option value="ADVANCE">Advance basis</option>
                  <option value="POSTPAID">Monthly basis</option>
                </select>
              </div>
            </div>
            <div><label className="label">Internal notes (not printed)</label><textarea className="input h-16" disabled={locked} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
          </div>
        </div>

        <div>
          <div className="card p-5 space-y-2 sticky top-4">
            <div className="text-sm font-semibold text-slate-700 mb-1">Quotation value</div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Site rent</span><Money value={rent} /></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Printing & mounting</span><Money value={pm} /></div>
            {gst > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">GST 18%</span><Money value={gst} /></div>}
            <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><Money value={rent + pm + gst} /></div>
            <p className="text-[11px] text-slate-400">The letter shows each site's monthly rate{gst ? ' + GST' : ''}; printing & mounting go in its Terms.</p>
            {!locked && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-primary w-full flex items-center justify-center gap-1.5" disabled={busy} onClick={() => save('docx')}><Download size={16} /> {busy ? 'Saving…' : 'Save & Word'}</button>
                  <button className="btn-primary w-full flex items-center justify-center gap-1.5" disabled={busy} onClick={() => save('pdf')}><Download size={16} /> {busy ? 'Saving…' : 'Save & PDF'}</button>
                </div>
                <button className="btn-ghost w-full" disabled={busy} onClick={() => save(false)}><Plus size={16} className="inline" /> Save only</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
