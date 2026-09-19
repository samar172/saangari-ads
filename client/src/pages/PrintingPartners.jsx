import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { downloadFile } from '../api';
import { Plus, ChevronRight, Download, Send } from 'lucide-react';
import { useAuth, can } from '../auth';
import { Modal, Spinner, Badge, Money, StatTile } from '../components/ui';

// Indian numbers are stored with or without the country code; wa.me wants 91XXXXXXXXXX.
const waDigits = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d.replace(/^0+/, ''); };

const empty = { name: '', contact: '', phone: '', email: '', address: '', gstin: '', machines: '', ratePerSqft: '', notes: '' };

// Only these statuses were actually printed — mirror the server's COUNTED set so
// the per-month subtotals match the all-time totals.
const COUNTED = ['CONFIRMED', 'LIVE', 'COMPLETED'];
const monthKey = (d) => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (key) => { const [y, m] = key.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); };

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

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Partner' : 'New Printing Partner'} wide>
        <form onSubmit={save} className="space-y-3">
          {err && <div className="text-sm text-red-600">{err}</div>}
          <input className="input" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Contact person" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            <input className="input" placeholder="Machines / equipment" value={form.machines} onChange={(e) => setForm({ ...form, machines: e.target.value })} />
          </div>
          <div>
            <input type="number" className="input" placeholder="Default cost rate per sq.ft (₹)" value={form.ratePerSqft} onChange={(e) => setForm({ ...form, ratePerSqft: e.target.value })} />
            <div className="text-[11px] text-slate-400 mt-1">Fallback ₹/sqft we pay this partner. Per-material rates below override it (White Base ₹5.5, Black Base ₹7.5).</div>
          </div>
          <input className="input" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save Partner'}</button>
        </form>

        {/* Materials: manageable right here in the edit flow. New partners must be saved first. */}
        <div className="mt-4 border-t border-slate-200 pt-4">
          {editId ? (
            <MaterialsPanel
              partner={partners.find((p) => p.id === editId) || form}
              editable={can(user, 'managePartners')}
              onChanged={load}
            />
          ) : (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-500">
              Save the partner first, then reopen <span className="font-medium text-slate-600">Edit</span> to add its printing materials &amp; rates.
            </div>
          )}
        </div>
      </Modal>

      {detailId && <PartnerDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// Everything this partner has printed: totals up top, then one row per order
// with the print count, rate and the sites those prints were for.
function PartnerDetail({ id, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [monthFilter, setMonthFilter] = useState('');

  function reload() { return api.get(`/printing-partners/${id}`).then((r) => setP(r.data)); }
  useEffect(() => { reload(); }, [id]);

  // Group this partner's print jobs by the month they were booked in (jobs come
  // back already sorted newest-first, so months come out newest-first too). Each
  // group carries counted-only subtotals so the client gets a month-wise record.
  const jobs = p?.jobs || [];
  const months = [...new Set(jobs.map((j) => monthKey(j.bookingDate)))];
  const groups = months
    .filter((mk) => !monthFilter || mk === monthFilter)
    .map((mk) => {
      const mJobs = jobs.filter((j) => monthKey(j.bookingDate) === mk);
      const counted = mJobs.filter((j) => COUNTED.includes(j.status));
      return {
        key: mk,
        label: monthLabel(mk),
        jobs: mJobs,
        orders: counted.length,
        prints: counted.reduce((s, j) => s + (j.noOfPrints || 0), 0),
        value: Math.round(counted.reduce((s, j) => s + (j.printingTotal || 0), 0)),
        cost: Math.round(counted.reduce((s, j) => s + (j.printCost || 0), 0)),
        margin: Math.round(counted.reduce((s, j) => s + (j.printMargin || 0), 0)),
        sqft: Math.round(counted.reduce((s, j) => s + j.totalSqft, 0) * 100) / 100,
      };
    });

  return (
    <Modal open onClose={onClose} title={p?.name || 'Printing Partner'} wide>
      {!p ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {p.contact && <span>{p.contact}</span>}
            {p.phone && <span>📞 {p.phone}</span>}
            {p.email && <span>✉ {p.email}</span>}
            {p.gstin && <span>GSTIN: {p.gstin}</span>}
            {p.machines && <span>🖨 {p.machines}</span>}
            {p.ratePerSqft > 0 && <span className="badge bg-brand/10 text-brand">₹{p.ratePerSqft}/sqft</span>}
            {!p.active && <span className="badge bg-slate-200 text-slate-600">Inactive</span>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Prints" value={p.summary.totalPrints} sub={`across ${p.summary.countedOrders} order${p.summary.countedOrders === 1 ? '' : 's'}`} />
            <StatTile label="Printing Value" value={<Money value={p.summary.totalPrintingValue} />} sub={p.summary.avgRatePerPrint ? `≈ ₹${p.summary.avgRatePerPrint}/print` : '—'} accent="text-brand" />
            <StatTile label="Total Area" value={`${p.summary.totalSqft.toLocaleString('en-IN')} sqft`} sub={`${p.summary.totalSites} site${p.summary.totalSites === 1 ? '' : 's'}`} />
            <StatTile label="All Orders" value={p.summary.totalOrders} sub="incl. quotations & cancelled" />
          </div>

          {/* Printing P&L — what we charge clients vs what we pay this partner. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Printing Charged" value={<Money value={p.summary.totalPrintingValue} />} sub="billed to clients" />
            <StatTile label="Partner Cost" value={<Money value={p.summary.totalPrintCost} />} sub="what you pay them" />
            <StatTile label="Printing Margin" value={<Money value={p.summary.printingMargin} />} sub="charged − cost" accent={p.summary.printingMargin >= 0 ? 'text-emerald-600' : 'text-red-600'} />
            <StatTile label="Balance Owed" value={<Money value={p.summary.balanceOwed} />} sub={`paid ₹${(p.summary.totalPaid || 0).toLocaleString('en-IN')}`} accent={p.summary.balanceOwed > 0 ? 'text-red-600' : 'text-slate-700'} />
          </div>

          <div className="text-xs text-slate-400">
            Totals count confirmed, live and completed orders only — quotations and cancelled orders are listed but never printed.
          </div>

          <PartnerPayments partner={p} editable={can(user, 'managePartners')} onChanged={reload} />

          <PartnerStatement partner={p} />

          <MaterialsPanel partner={p} editable={can(user, 'managePartners')} onChanged={reload} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-700">Print history — month wise</div>
            {months.length > 0 && (
              <select className="input w-auto py-1 text-sm" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
                <option value="">All months</option>
                {months.map((mk) => <option key={mk} value={mk}>{monthLabel(mk)}</option>)}
              </select>
            )}
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
                  <th className="px-3 py-2 text-right">Charged</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2 text-right">Margin</th>
                  <th className="px-3 py-2 text-right">Sqft</th>
                  <th className="px-3 py-2 text-right">Sites</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr className="bg-slate-100/70 border-t border-slate-200">
                      <td colSpan="4" className="px-3 py-1.5 font-semibold text-slate-700">
                        {g.label}
                        <span className="text-xs font-normal text-slate-400"> · {g.orders} counted / {g.jobs.length} order{g.jobs.length === 1 ? '' : 's'}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold">{g.prints}</td>
                      <td />
                      <td className="px-3 py-1.5 text-right font-semibold"><Money value={g.value} /></td>
                      <td className="px-3 py-1.5 text-right font-semibold text-slate-600"><Money value={g.cost} /></td>
                      <td className={`px-3 py-1.5 text-right font-semibold ${g.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}><Money value={g.margin} /></td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{g.sqft || '—'}</td>
                      <td />
                    </tr>
                    {g.jobs.map((j) => (
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
                      <td className="px-3 py-2 text-right text-slate-600">{j.printCost ? <Money value={j.printCost} /> : '—'}</td>
                      <td className={`px-3 py-2 text-right font-medium ${(j.printMargin || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(j.printingTotal || j.printCost) ? <Money value={j.printMargin} /> : '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{j.totalSqft || '—'}</td>
                      <td className="px-3 py-2 text-right text-brand underline decoration-dotted">{j.sites.length}</td>
                    </tr>
                    {expanded === j.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan="11" className="px-3 py-3">
                          {j.description && <div className="text-xs text-slate-500 mb-2">{j.description}</div>}
                          <div className="text-xs text-slate-500 mb-2">
                            Partner cost: <b className="text-slate-700"><Money value={j.printCost} /></b>
                            {j.costNote && j.costSource !== 'none' && <span className="text-slate-400"> · {j.costSource === 'entered' ? 'entered manually' : `basis ${j.costNote}`}</span>}
                            {j.costSource === 'none' && <span className="text-amber-600"> · no cost basis yet — set ₹/sqft on the partner or enter it on the order</span>}
                            {' · '}Margin <b className={(j.printMargin || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}><Money value={j.printMargin} /></b>
                          </div>
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
                  </Fragment>
                ))}
                {p.jobs.length === 0 && (
                  <tr><td colSpan="11" className="px-3 py-10 text-center text-slate-400">No print jobs routed to this partner yet</td></tr>
                )}
                {p.jobs.length > 0 && groups.length === 0 && (
                  <tr><td colSpan="11" className="px-3 py-10 text-center text-slate-400">No print jobs in this month</td></tr>
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

// Account-based statement: the running ledger (jobs as debits, payments as
// credits) plus a PDF download and a WhatsApp/email send to the partner.
function PartnerStatement({ partner }) {
  const ledger = partner.ledger || [];
  const owed = partner.summary?.balanceOwed || 0;

  const statementText = () => {
    const lines = [
      `Statement of account — ${partner.name}`,
      `As on ${new Date().toLocaleDateString('en-IN')}`,
      `Total billed: ₹${(partner.summary?.totalPrintCost || 0).toLocaleString('en-IN')}`,
      `Paid: ₹${(partner.summary?.totalPaid || 0).toLocaleString('en-IN')}`,
      `Balance payable: ₹${owed.toLocaleString('en-IN')}`,
      `— Saangri Advertising`,
    ];
    return lines.join('\n');
  };

  function share(channel) {
    const to = channel === 'EMAIL' ? partner.email : partner.phone;
    if (!to) return;
    if (channel === 'EMAIL') {
      window.location.href = `mailto:${partner.email}?subject=${encodeURIComponent(`Statement of account — Saangri Advertising`)}&body=${encodeURIComponent(statementText())}`;
    } else {
      window.open(`https://wa.me/${waDigits(partner.phone)}?text=${encodeURIComponent(statementText())}`, '_blank', 'noopener');
    }
    api.post(`/printing-partners/${partner.id}/statement/share`, { channel: channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP', toContact: to }).catch(() => {});
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm font-semibold text-slate-700">Statement of account</div>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => downloadFile(`/printing-partners/${partner.id}/statement/pdf`, `Statement-${partner.name}.pdf`)}>
            <Download size={14} /> PDF
          </button>
          <button className="btn-ghost text-xs flex items-center gap-1.5" disabled={!partner.phone} onClick={() => share('WHATSAPP')}>
            <Send size={14} /> WhatsApp
          </button>
          <button className="btn-ghost text-xs" disabled={!partner.email} onClick={() => share('EMAIL')}>Email</button>
        </div>
      </div>

      {ledger.length === 0 ? (
        <div className="text-xs text-slate-400">No ledger entries yet — job costs and payments will appear here.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Particulars</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-3 py-1.5">{r.particulars}</td>
                  <td className="px-3 py-1.5 text-right text-slate-700">{r.debit ? <Money value={r.debit} /> : '—'}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-700">{r.credit ? <Money value={r.credit} /> : '—'}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{<Money value={r.balance} />}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan="4">Balance payable</td>
                <td className={`px-3 py-2 text-right ${owed > 0 ? 'text-red-600' : 'text-emerald-600'}`}><Money value={owed} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// Payments WE make to this partner, settling the printing payable. The balance
// (job cost − payments) is shown in the P&L tiles above.
function PartnerPayments({ partner, editable, onChanged }) {
  const today = new Date().toISOString().slice(0, 10);
  const blank = { amount: '', mode: 'BANK', paidAt: today, reference: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const payments = partner.payments || [];

  async function record(e) {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) { setErr('Enter an amount'); return; }
    setBusy(true); setErr('');
    try {
      await api.post(`/printing-partners/${partner.id}/payments`, {
        amount: Number(form.amount), mode: form.mode, paidAt: form.paidAt || undefined, reference: form.reference || undefined,
      });
      setForm(blank);
      await onChanged();
    } catch (e2) { setErr(e2.response?.data?.error || 'Could not record payment'); }
    finally { setBusy(false); }
  }

  async function remove(pid) {
    await api.delete(`/printing-partners/payments/${pid}`);
    await onChanged();
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-slate-700">Payments to this partner</div>
        <div className="text-xs text-slate-500">Owed <span className={`font-semibold ${partner.summary.balanceOwed > 0 ? 'text-red-600' : 'text-slate-700'}`}><Money value={partner.summary.balanceOwed} /></span></div>
      </div>

      {payments.length === 0 ? (
        <div className="text-xs text-slate-400 mb-3">No payments recorded to this partner yet.</div>
      ) : (
        <div className="space-y-1.5 mb-3">
          {payments.map((pay) => (
            <div key={pay.id} className="flex items-center justify-between gap-2 text-sm rounded-lg bg-slate-50 border border-slate-100 px-3 py-1.5">
              <div className="min-w-0">
                <span className="font-medium text-slate-800"><Money value={pay.amount} /></span>
                <span className="badge bg-slate-100 text-slate-600 ml-2 text-[10px]">{pay.mode}</span>
                <span className="text-xs text-slate-500 ml-2">{new Date(pay.paidAt).toLocaleDateString('en-IN')}{pay.reference ? ` · ${pay.reference}` : ''}{pay.recordedBy?.name ? ` · ${pay.recordedBy.name}` : ''}</span>
              </div>
              {editable && <button className="text-xs text-slate-400 hover:text-red-600 shrink-0" onClick={() => remove(pay.id)}>Delete</button>}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <form onSubmit={record} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[10px] text-slate-400 mb-0.5">Amount ₹</div>
            <input type="number" min="1" className="input py-1.5 text-sm" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">Mode</div>
            <select className="input py-1.5 text-sm" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              {['CASH', 'UPI', 'BANK', 'CHEQUE', 'CARD'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">Date</div>
            <input type="date" max={today} className="input py-1.5 text-sm" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">Reference</div>
            <input className="input py-1.5 text-sm" placeholder="UTR / cheque" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-5">
            {err && <div className="text-xs text-red-600 mb-1">{err}</div>}
            <button className="btn-primary text-sm py-1.5" disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
          </div>
        </form>
      )}
    </div>
  );
}

// Materials this partner prints (flex, pamphlet, brochure, white back…), each
// with its own rate. These feed the material dropdown on the booking form.
function MaterialsPanel({ partner, editable, onChanged }) {
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [costPerSqft, setCostPerSqft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const materials = partner.materials || [];

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/printing-partners/${partner.id}/materials`, { name: name.trim(), rate: Number(rate) || 0, costPerSqft: Number(costPerSqft) || 0 });
      setName(''); setRate(''); setCostPerSqft(''); onChanged();
    } catch (e2) { setErr(e2.response?.data?.error || 'Could not add material'); }
    finally { setBusy(false); }
  }
  async function edit(m) {
    const charge = window.prompt(`Customer charge for "${m.name}" (₹ per print)`, m.rate);
    if (charge === null) return;
    const cost = window.prompt(`Partner COST for "${m.name}" (₹ per sqft)`, m.costPerSqft || 0);
    if (cost === null) return;
    try { await api.patch(`/printing-partners/materials/${m.id}`, { rate: Number(charge) || 0, costPerSqft: Number(cost) || 0 }); onChanged(); }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not update'); }
  }
  async function remove(m) {
    if (!window.confirm(`Delete material "${m.name}"?`)) return;
    try { await api.delete(`/printing-partners/materials/${m.id}`); onChanged(); }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not delete'); }
  }

  return (
    <div className="card p-4">
      <div className="text-sm font-semibold text-slate-800 mb-1">Materials &amp; Rates</div>
      <div className="text-[11px] text-slate-400 mb-2">Charge = what the client pays (per print). Cost = what the partner charges you (per sqft).</div>
      {err && <div className="mb-2 text-sm text-red-600">{err}</div>}
      {materials.length === 0 ? (
        <div className="text-xs text-slate-400 mb-3">No materials yet. Add flex, pamphlet, white base, black base, etc.</div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {materials.map((m) => (
            <div key={m.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 text-sm ${m.active ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}>
              <span className="font-medium text-slate-700">{m.name}</span>
              <span className="text-brand">charge ₹{m.rate}</span>
              <span className={m.costPerSqft > 0 ? 'text-slate-600' : 'text-amber-600'}>cost ₹{m.costPerSqft || 0}/sqft</span>
              {editable && (
                <>
                  <button className="text-xs text-slate-400 hover:text-slate-700" onClick={() => edit(m)}>edit</button>
                  <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => remove(m)}>×</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {editable && (
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[140px]" placeholder="Material — e.g. White Base" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="number" className="input w-28" placeholder="Charge ₹" value={rate} onChange={(e) => setRate(e.target.value)} />
          <input type="number" step="0.01" className="input w-28" placeholder="Cost ₹/sqft" value={costPerSqft} onChange={(e) => setCostPerSqft(e.target.value)} />
          <button className="btn-primary text-sm" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add'}</button>
        </form>
      )}
    </div>
  );
}
