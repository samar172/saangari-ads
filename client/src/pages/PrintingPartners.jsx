import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Plus, ChevronRight } from 'lucide-react';
import { useAuth, can } from '../auth';
import { Modal, Spinner, Badge, Money, StatTile } from '../components/ui';

const empty = { name: '', contact: '', phone: '', email: '', address: '', ratePerSqft: '', notes: '' };

export default function PrintingPartners() {
  const { user } = useAuth();
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [detailId, setDetailId] = useState(null);

  function load() { setLoading(true); api.get('/printing-partners').then((r) => setPartners(r.data)).finally(() => setLoading(false)); }
  useEffect(load, []);

  function openNew() { setForm(empty); setEditId(null); setErr(''); setOpen(true); }
  function openEdit(p) { setForm({ ...empty, ...p, ratePerSqft: p.ratePerSqft || '' }); setEditId(p.id); setErr(''); setOpen(true); }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (editId) await api.patch(`/printing-partners/${editId}`, form);
      else await api.post('/printing-partners', form);
      setOpen(false); load();
    } catch (e2) { setErr(e2.response?.data?.error || 'Failed to save'); }
    finally { setBusy(false); }
  }

  async function toggleActive(p) {
    await api.patch(`/printing-partners/${p.id}`, { active: !p.active });
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Printing Partners</h1>
          <p className="text-sm text-slate-500">Vendors used for flex printing &amp; mounting — tap a partner for their print history</p>
        </div>
        {can(user, 'managePartners') && <button className="btn-accent flex items-center gap-1.5" onClick={openNew}><Plus size={16} /> Add Partner</button>}
      </div>

      {loading ? <Spinner /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map((p) => (
            <div
              key={p.id}
              onClick={() => setDetailId(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(p.id); } }}
              className={`card p-4 cursor-pointer transition hover:border-brand/40 hover:shadow-md ${!p.active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-slate-800">{p.name}</div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.ratePerSqft > 0 && <span className="badge bg-brand/10 text-brand">₹{p.ratePerSqft}/sqft</span>}
                  <ChevronRight size={16} className="text-slate-300" />
                </div>
              </div>
              {p.contact && <div className="text-sm text-slate-600 mt-1">{p.contact}</div>}
              {p.phone && <div className="text-sm text-slate-500">📞 {p.phone}</div>}
              {p.email && <div className="text-sm text-slate-500 truncate">✉ {p.email}</div>}
              {p.address && <div className="text-xs text-slate-400 mt-1">{p.address}</div>}
              <div className="text-xs text-slate-400 mt-2">{p._count?.orders || 0} order(s)</div>
              {can(user, 'managePartners') && (
                <div className="flex gap-2 mt-3">
                  {/* These sit inside a clickable card, so stop the click bubbling up. */}
                  <button className="btn-ghost text-xs" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>Edit</button>
                  <button className="btn-ghost text-xs" onClick={(e) => { e.stopPropagation(); toggleActive(p); }}>{p.active ? 'Deactivate' : 'Activate'}</button>
                </div>
              )}
            </div>
          ))}
          {partners.length === 0 && <div className="text-slate-400 text-sm">No printing partners yet.</div>}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Partner' : 'New Printing Partner'}>
        <form onSubmit={save} className="space-y-3">
          {err && <div className="text-sm text-red-600">{err}</div>}
          <input className="input" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Contact person" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input type="number" className="input" placeholder="Rate per sq.ft (₹)" value={form.ratePerSqft} onChange={(e) => setForm({ ...form, ratePerSqft: e.target.value })} />
          <input className="input" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save Partner'}</button>
        </form>
      </Modal>

      {detailId && <PartnerDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// Everything this partner has printed: totals up top, then one row per order
// with the print count, rate and the sites those prints were for.
function PartnerDetail({ id, onClose }) {
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { api.get(`/printing-partners/${id}`).then((r) => setP(r.data)); }, [id]);

  return (
    <Modal open onClose={onClose} title={p?.name || 'Printing Partner'} wide>
      {!p ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {p.contact && <span>{p.contact}</span>}
            {p.phone && <span>📞 {p.phone}</span>}
            {p.email && <span>✉ {p.email}</span>}
            {p.ratePerSqft > 0 && <span className="badge bg-brand/10 text-brand">₹{p.ratePerSqft}/sqft</span>}
            {!p.active && <span className="badge bg-slate-200 text-slate-600">Inactive</span>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Prints" value={p.summary.totalPrints} sub={`across ${p.summary.countedOrders} order${p.summary.countedOrders === 1 ? '' : 's'}`} />
            <StatTile label="Printing Value" value={<Money value={p.summary.totalPrintingValue} />} sub={p.summary.avgRatePerPrint ? `≈ ₹${p.summary.avgRatePerPrint}/print` : '—'} accent="text-brand" />
            <StatTile label="Total Area" value={`${p.summary.totalSqft.toLocaleString('en-IN')} sqft`} sub={`${p.summary.totalSites} site${p.summary.totalSites === 1 ? '' : 's'}`} />
            <StatTile label="All Orders" value={p.summary.totalOrders} sub="incl. quotations & cancelled" />
          </div>

          <div className="text-xs text-slate-400">
            Totals count confirmed, live and completed orders only — quotations and cancelled orders are listed but never printed.
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Order</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Prints</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-right">Sqft</th>
                  <th className="px-3 py-2 text-right">Sites</th>
                </tr>
              </thead>
              <tbody>
                {p.jobs.map((j) => (
                  <Fragment key={j.id}>
                    <tr
                      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpanded(expanded === j.id ? null : j.id)}
                    >
                      <td className="px-3 py-2 font-medium text-slate-800">{j.orderNo}</td>
                      <td className="px-3 py-2">{j.client?.name}</td>
                      <td className="px-3 py-2 text-slate-500">{new Date(j.bookingDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-3 py-2"><Badge status={j.status} /></td>
                      <td className="px-3 py-2 text-right font-medium">{j.noOfPrints || 0}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{j.printRate ? <Money value={j.printRate} /> : '—'}</td>
                      <td className="px-3 py-2 text-right font-medium"><Money value={j.printingTotal} /></td>
                      <td className="px-3 py-2 text-right text-slate-500">{j.totalSqft || '—'}</td>
                      <td className="px-3 py-2 text-right text-brand underline decoration-dotted">{j.sites.length}</td>
                    </tr>
                    {expanded === j.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan="9" className="px-3 py-3">
                          {j.description && <div className="text-xs text-slate-500 mb-2">{j.description}</div>}
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {j.sites.map((s, i) => (
                              <div key={i} className="rounded-lg border border-slate-200 bg-white p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-slate-800">{s.code}</span>
                                  <span className="text-[11px] text-slate-500">{s.size ? `${s.size} · ` : ''}{s.sqft} sqft</span>
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">{s.location}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(s.startDate).toLocaleDateString('en-IN')} – {new Date(s.endDate).toLocaleDateString('en-IN')}
                                </div>
                              </div>
                            ))}
                            {j.sites.length === 0 && <div className="text-xs text-slate-400">No active sites on this order</div>}
                          </div>
                          <button className="btn-ghost text-xs mt-3" onClick={(e) => { e.stopPropagation(); navigate(`/orders/${j.id}`); }}>
                            Open {j.orderNo} →
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {p.jobs.length === 0 && (
                  <tr><td colSpan="9" className="px-3 py-10 text-center text-slate-400">No print jobs routed to this partner yet</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {p.notes && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
              <span className="text-xs uppercase tracking-wide text-slate-400">Notes</span>
              <div>{p.notes}</div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
