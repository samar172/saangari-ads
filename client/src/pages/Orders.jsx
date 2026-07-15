import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { Badge, Money, Modal, Spinner } from '../components/ui';

const STATUS_FILTERS = ['', 'QUOTATION', 'CONFIRMED', 'LIVE', 'COMPLETED', 'CANCELLED'];

// Each monitoring day needs all three proofs
const PHASES = ['START', 'MID', 'END'];
const KINDS = [['GPS', '📍 GPS'], ['NORMAL', '🖼 Normal'], ['NEWSPAPER', '📰 Newspaper']];
const TDS_RATES = [1, 2, 5, 10];

export default function Orders() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(params.get('highlight') ? Number(params.get('highlight')) : null);

  function load() {
    setLoading(true);
    api.get('/orders', { params: { status: status || undefined } })
      .then((r) => setOrders(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, [status]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
          <p className="text-sm text-slate-500">{user.role === 'SALES' ? 'Your orders & quotations' : 'All orders & quotations'}</p>
        </div>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Order</th>
                <th className="px-4 py-2 text-left">Client</th>
                <th className="px-4 py-2 text-left">Sites</th>
                <th className="px-4 py-2 text-right">Grand Total</th>
                <th className="px-4 py-2 text-right">Balance</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">📷</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const photos = o.items.reduce((n, it) => n + it.photos.length, 0);
                return (
                  <tr key={o.id} onClick={() => setOpenId(o.id)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td className="px-4 py-2 font-medium">{o.orderNo}<div className="text-xs text-slate-400">{new Date(o.bookingDate).toLocaleDateString('en-IN')}</div></td>
                    <td className="px-4 py-2">{o.client.name}</td>
                    <td className="px-4 py-2">
                      <span className="badge bg-slate-100 text-slate-700">{o.items.length} site{o.items.length !== 1 ? 's' : ''}</span>
                      <div className="text-xs text-slate-400 truncate max-w-[160px]">{o.items.map((i) => i.site.code).join(', ')}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-medium"><Money value={o.grandTotal} /></td>
                    <td className="px-4 py-2 text-right">{o.balanceDue > 0 ? <span className="text-red-600 font-medium"><Money value={o.balanceDue} /></span> : <span className="text-emerald-600">Paid</span>}</td>
                    <td className="px-4 py-2"><Badge status={o.status} /></td>
                    <td className="px-4 py-2">{photos > 0 ? `📷 ${photos}` : <span className="text-slate-300">—</span>}</td>
                  </tr>
                );
              })}
              {orders.length === 0 && <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-400">No orders yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {openId && <OrderDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function OrderDetail({ id, onClose, onChanged }) {
  const { user } = useAuth();
  const [o, setO] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);

  function load() { api.get(`/orders/${id}`).then((r) => setO(r.data)); }
  useEffect(load, [id]);

  async function changeStatus(s) {
    setBusy(true);
    try { await api.post(`/orders/${id}/status`, { status: s }); load(); onChanged(); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={o ? `${o.orderNo} — ${o.client.name}` : 'Order'} wide>
      {!o ? <Spinner /> : (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge status={o.status} />
            {o.items[0]?.type === 'LOOSE' && <span className="badge bg-purple-100 text-purple-800">Loose</span>}
            {o.category && <span className="badge bg-teal-100 text-teal-800">🏷️ {o.category.name}</span>}
            <span className="badge bg-slate-100 text-slate-700">{o.taxCategory === 'GST' ? (o.interState ? 'IGST' : 'CGST+SGST') : 'Non-GST'}</span>
            <div className="flex-1" />
            <button className="btn-ghost text-xs" onClick={() => downloadFile(`/orders/${id}/quotation.pdf`, `Quotation-${o.orderNo}.pdf`)}>⬇ Quotation PDF</button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-200 mb-4">
            {[['overview', 'Overview'], ['sites', `Sites (${o.items.length})`], ['payments', `Payments`]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === k ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>
            ))}
          </div>

          {tab === 'overview' && <Overview o={o} user={user} busy={busy} changeStatus={changeStatus} />}
          {tab === 'sites' && (
            <div className="space-y-4">
              {o.items.map((it) => <LineCard key={it.id} order={o} line={it} onChanged={() => { load(); onChanged(); }} />)}
            </div>
          )}
          {tab === 'payments' && <Payments o={o} user={user} onChanged={() => { load(); onChanged(); }} />}
        </div>
      )}
    </Modal>
  );
}

function Overview({ o, user, busy, changeStatus }) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <dl className="space-y-2 text-sm">
          <Row k="Booking Date">{new Date(o.bookingDate).toLocaleDateString('en-IN')}</Row>
          {o.category && <Row k="Category">{o.category.name}</Row>}
          {o.description && <Row k="Description">{o.description}</Row>}
          <Row k="Client">{o.client.name} · {o.client.phone}</Row>
          {o.printingPartner && <Row k="Printing Partner">{o.printingPartner.name}</Row>}
          <Row k="Monitoring">{o.monitoring ? [o.monitorStart && 'Start', o.monitorMid && 'Mid', o.monitorEnd && 'End'].filter(Boolean).join(' · ') || 'Yes' : 'No'}</Row>
          <Row k="Created by">{o.createdBy.name}</Row>
        </dl>

        {o.invoices?.length > 0 && (
          <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-sm">🧾 Invoiced: {o.invoices.map((i) => i.invoiceNo).join(', ')}</div>
        )}

        {can(user, 'changeBookingStatus') && (
          <div className="mt-4 flex flex-wrap gap-2">
            {o.status === 'QUOTATION' && <button className="btn-primary" disabled={busy} onClick={() => changeStatus('CONFIRMED')}>Confirm order</button>}
            {['CONFIRMED', 'LIVE'].includes(o.status) && <button className="btn-ghost" disabled={busy} onClick={() => changeStatus('COMPLETED')}>Mark completed</button>}
            {!['CANCELLED', 'COMPLETED'].includes(o.status) && <button className="btn-danger" disabled={busy} onClick={() => changeStatus('CANCELLED')}>Cancel</button>}
          </div>
        )}
      </div>

      <div className="card p-4 bg-slate-50">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Commercials</div>
        <dl className="space-y-1.5 text-sm">
          <Row k="Rental"><Money value={o.rentalSubtotal} /></Row>
          {o.printingTotal > 0 && <Row k={`Printing (${o.noOfPrints})`}><Money value={o.printingTotal} /></Row>}
          {o.mountingCost > 0 && <Row k="Mounting"><Money value={o.mountingCost} /></Row>}
          {o.addOnTotal > 0 && <Row k="Add-ons"><Money value={o.addOnTotal} /></Row>}
          {o.discountAmount > 0 && <Row k={`Discount (${o.discountPct}%)`}>−<Money value={o.discountAmount} /></Row>}
          <Row k="Taxable"><Money value={o.taxableAmount} /></Row>
          {o.cgst > 0 && <Row k="CGST 9%"><Money value={o.cgst} /></Row>}
          {o.sgst > 0 && <Row k="SGST 9%"><Money value={o.sgst} /></Row>}
          {o.igst > 0 && <Row k="IGST 18%"><Money value={o.igst} /></Row>}
          <div className="flex justify-between border-t border-slate-300 pt-2 mt-1 font-bold text-brand"><span>Grand Total</span><Money value={o.grandTotal} /></div>
          <div className="flex justify-between text-emerald-700"><span>Paid</span><Money value={o.amountPaid} /></div>
          <div className="flex justify-between font-semibold text-red-600"><span>Balance Due</span><Money value={o.balanceDue} /></div>
        </dl>
        {o.addOns?.length > 0 && (
          <div className="mt-3 text-xs text-slate-500">
            {o.addOns.map((a) => <div key={a.id} className="flex justify-between"><span>{a.label}</span><Money value={a.amount} /></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function LineCard({ order, line, onChanged }) {
  const { user } = useAuth();
  const [panel, setPanel] = useState(null); // 'notes' | 'shift' | 'stop'
  const finished = ['COMPLETED', 'CANCELLED', 'STOPPED'].includes(line.status);
  const canOperate = can(user, 'shiftOrStopBooking') && !finished;

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <span className="font-semibold text-slate-800">{line.bookingNo} · {line.site.code}</span>
          <span className="text-xs text-slate-400"> — {line.site.location}</span>
        </div>
        <Badge status={line.status} />
      </div>
      <div className="text-xs text-slate-500">
        {new Date(line.startDate).toLocaleDateString('en-IN')} – {new Date(line.endDate).toLocaleDateString('en-IN')} ({line.days}d) · <Money value={line.subtotal} />
      </div>

      {line.displayNotes && (
        <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs text-slate-600">
          📝 {line.displayNotes}
        </div>
      )}
      {line.status === 'STOPPED' && (
        <div className="mt-2 rounded-md bg-orange-50 border border-orange-200 px-2 py-1.5 text-xs text-orange-800">
          ⏹ Stopped on {new Date(line.stoppedAt).toLocaleDateString('en-IN')}
          {line.stopReason ? ` — ${line.stopReason}` : ''} · billed {line.days} day{line.days === 1 ? '' : 's'}
        </div>
      )}
      {line.shifts?.length > 0 && (
        <div className="mt-2 space-y-1">
          {line.shifts.map((s) => (
            <div key={s.id} className="rounded-md bg-sky-50 border border-sky-200 px-2 py-1.5 text-xs text-sky-800">
              ↪ Shifted {s.fromSite.code} → {s.toSite.code} on {new Date(s.shiftedAt).toLocaleDateString('en-IN')} by {s.by.name}
              {s.reason ? ` — ${s.reason}` : ''}
            </div>
          ))}
        </div>
      )}

      {(canOperate || can(user, 'createBooking')) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {can(user, 'createBooking') && !finished && (
            <button className="btn-ghost text-xs" onClick={() => setPanel(panel === 'notes' ? null : 'notes')}>📝 Display notes</button>
          )}
          {canOperate && <button className="btn-ghost text-xs" onClick={() => setPanel(panel === 'shift' ? null : 'shift')}>↪ Shift site</button>}
          {canOperate && <button className="btn-ghost text-xs text-orange-700" onClick={() => setPanel(panel === 'stop' ? null : 'stop')}>⏹ Stop now</button>}
        </div>
      )}

      {panel && (
        <LinePanel
          panel={panel} order={order} line={line}
          onDone={() => { setPanel(null); onChanged(); }}
          onCancel={() => setPanel(null)}
        />
      )}

      <div className="mt-3 border-t border-slate-100 pt-3">
        <PhotoSection booking={line} monitoring={order.monitoring} onUploaded={onChanged} />
      </div>
    </div>
  );
}

// The three per-line operations: edit notes, shift to another site, stop today.
function LinePanel({ panel, order, line, onDone, onCancel }) {
  const [notes, setNotes] = useState(line.displayNotes || '');
  const [reason, setReason] = useState('');
  const [toSiteId, setToSiteId] = useState('');
  const [sites, setSites] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (panel === 'shift') api.get('/sites', { params: { status: 'AVAILABLE' } }).then((r) => setSites(r.data));
  }, [panel]);

  async function run(fn) {
    setBusy(true); setErr('');
    try { await fn(); onDone(); }
    catch (e) { setErr(e.response?.data?.error || 'Action failed'); }
    finally { setBusy(false); }
  }

  const base = `/orders/${order.id}/items/${line.id}`;

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      {err && <div className="text-xs text-red-600">{err}</div>}

      {panel === 'notes' && (
        <>
          <div className="text-xs font-semibold text-slate-700">Display notes — printed on the quotation and invoice</div>
          <textarea className="input text-xs" rows="2" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Facing the highway exit — client wants it lit after 7pm" />
          <div className="flex gap-2">
            <button className="btn-primary py-1 text-xs" disabled={busy} onClick={() => run(() => api.patch(base, { displayNotes: notes }))}>
              {busy ? 'Saving…' : '✓ Save notes'}
            </button>
            <button className="btn-ghost py-1 text-xs" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}

      {panel === 'shift' && (
        <>
          <div className="text-xs font-semibold text-slate-700">Shift {line.site.code} to another site — same dates, same price</div>
          <select className="input text-xs py-1" value={toSiteId} onChange={(e) => setToSiteId(e.target.value)}>
            <option value="">Choose a vacant site…</option>
            {sites.filter((s) => s.id !== line.siteId).map((s) => (
              <option key={s.id} value={s.id}>{s.code} — {s.location}</option>
            ))}
          </select>
          <input className="input text-xs py-1" placeholder="Reason (e.g. permission revoked)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary py-1 text-xs" disabled={busy || !toSiteId}
              onClick={() => run(() => api.post(`${base}/shift`, { toSiteId: Number(toSiteId), reason }))}>
              {busy ? 'Shifting…' : '↪ Shift site'}
            </button>
            <button className="btn-ghost py-1 text-xs" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}

      {panel === 'stop' && (
        <>
          <div className="text-xs font-semibold text-orange-800">Stop this display immediately</div>
          <p className="text-xs text-slate-600">
            Ends the campaign today, frees {line.site.code}, and re-prices the order so only the days actually displayed are billed. This cannot be undone.
          </p>
          <input className="input text-xs py-1" placeholder="Reason (e.g. client asked to pull it down)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-danger py-1 text-xs" disabled={busy} onClick={() => run(() => api.post(`${base}/stop`, { reason }))}>
              {busy ? 'Stopping…' : '⏹ Stop and re-price'}
            </button>
            <button className="btn-ghost py-1 text-xs" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

// 3 phases × 3 proof kinds = the 9 photos a monitored line needs
function PhotoSection({ booking, monitoring, onUploaded }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('START');
  const [kind, setKind] = useState('GPS');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const at = (ph, k) => booking.photos.find((p) => p.phase === ph && p.kind === k);
  const have = booking.photos.length;

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('bookingId', booking.id);
    fd.append('phase', phase);
    fd.append('kind', kind);
    try {
      const pos = await new Promise((res) => navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 3000 }));
      if (pos) { fd.append('latitude', pos.coords.latitude); fd.append('longitude', pos.coords.longitude); }
    } catch {}
    try {
      await api.post('/photos', fd);
      setFile(null);
      e.target.reset();
      onUploaded();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Upload failed');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Monitoring proofs
          {!monitoring && <span className="ml-1.5 font-normal normal-case text-slate-400">· monitoring off, proofs optional</span>}
        </div>
        <div className={`text-[10px] font-medium ${have === 9 ? 'text-emerald-600' : 'text-slate-400'}`}>{have}/9 uploaded</div>
      </div>

      <div className="grid grid-cols-[84px_repeat(3,minmax(0,1fr))] gap-1.5 mb-3 max-w-md">
        <div />
        {PHASES.map((ph) => <div key={ph} className="text-[10px] font-semibold text-slate-500 text-center">{ph}</div>)}
        {KINDS.map(([k, label]) => (
          <Fragment key={k}>
            <div className="text-[10px] text-slate-500 self-center">{label}</div>
            {PHASES.map((ph) => {
              const p = at(ph, k);
              return (
                <div key={ph}>
                  {p ? (
                    <a href={p.filePath} target="_blank" rel="noreferrer" title={`${ph} · ${k}`}>
                      <img src={p.filePath} alt={`${ph} ${k}`} className="rounded border border-slate-200 aspect-square object-cover w-full" />
                      <div className="text-[9px] text-slate-400 truncate">{new Date(p.takenAt).toLocaleDateString('en-IN')}{p.latitude ? ' 📍' : ''}</div>
                    </a>
                  ) : (
                    <div className="rounded border border-dashed border-slate-300 aspect-square flex items-center justify-center text-slate-300 text-xs">—</div>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {can(user, 'uploadPhoto') ? (
        <form onSubmit={upload} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 p-2">
          {err && <div className="text-xs text-red-600 w-full">{err}</div>}
          <select className="input w-auto py-1 text-xs" value={phase} onChange={(e) => setPhase(e.target.value)}>
            {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input w-auto py-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input type="file" accept="image/*" capture="environment" className="input flex-1 py-1 text-xs" onChange={(e) => setFile(e.target.files[0])} />
          <button className="btn-primary py-1 text-xs" disabled={busy || !file}>{busy ? '…' : '📷 Upload'}</button>
          {at(phase, kind) && <div className="text-[10px] text-amber-600 w-full">A {kind} photo already exists for {phase} — uploading replaces it.</div>}
        </form>
      ) : (
        <p className="text-xs text-slate-400">Only Ops uploads monitoring photos. A phase reminder clears once all 3 proofs are in.</p>
      )}
    </div>
  );
}

function Payments({ o, user, onChanged }) {
  const [form, setForm] = useState({ amount: '', mode: 'CASH', reference: '', tdsApplicable: false, tdsPct: 2 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const gross = Number(form.amount) || 0;
  const tds = form.tdsApplicable ? Math.round(gross * Number(form.tdsPct) / 100) : 0;

  async function record(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api.post(`/orders/${o.id}/payments`, {
        amount: gross, mode: form.mode, reference: form.reference,
        tdsApplicable: form.tdsApplicable, tdsPct: form.tdsApplicable ? Number(form.tdsPct) : 0,
      });
      setForm({ amount: '', mode: 'CASH', reference: '', tdsApplicable: false, tdsPct: 2 });
      onChanged();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Failed to record payment');
    } finally { setBusy(false); }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">Grand Total</span><span className="font-semibold"><Money value={o.grandTotal} /></span></div>
        <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">Paid</span><span className="text-emerald-700 font-semibold"><Money value={o.amountPaid} /></span></div>
        <div className="flex justify-between text-sm mb-4 border-t border-slate-200 pt-2"><span className="text-slate-500">Balance Due</span><span className="text-red-600 font-bold"><Money value={o.balanceDue} /></span></div>

        {o.payments.length === 0 ? <div className="text-sm text-slate-400">No payments recorded.</div> : (
          <div className="space-y-2">
            {o.payments.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                <div className="font-medium">
                  <Money value={p.amount} />
                  <span className="badge bg-slate-100 text-slate-600 ml-1">{p.mode}</span>
                  {p.tdsApplicable && <span className="badge bg-indigo-100 text-indigo-800 ml-1">TDS {p.tdsPct}%</span>}
                </div>
                {p.tdsApplicable && (
                  <div className="text-xs text-indigo-700">
                    <Money value={p.tdsAmount} /> deducted at source · <Money value={p.netReceived} /> received in bank
                  </div>
                )}
                <div className="text-xs text-slate-400">{new Date(p.receivedAt).toLocaleDateString('en-IN')} · {p.recordedBy?.name}{p.reference ? ` · ${p.reference}` : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {can(user, 'recordPayment') && o.balanceDue > 0 && (
        <form onSubmit={record} className="card p-4 bg-slate-50 h-fit space-y-3">
          <div className="text-sm font-semibold text-slate-700">Record payment received</div>
          {err && <div className="text-xs text-red-600">{err}</div>}
          <div>
            <label className="label">Amount settled against this order</label>
            <input type="number" min="1" className="input" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <select className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            {['CASH', 'UPI', 'BANK', 'CHEQUE', 'CARD'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.tdsApplicable} onChange={(e) => setForm({ ...form, tdsApplicable: e.target.checked })} />
              TDS applicable on this payment
            </label>
            {form.tdsApplicable && (
              <>
                <select className="input py-1 text-sm" value={form.tdsPct} onChange={(e) => setForm({ ...form, tdsPct: e.target.value })}>
                  {TDS_RATES.map((r) => <option key={r} value={r}>{r}% TDS</option>)}
                </select>
                <div className="text-xs text-slate-600 space-y-0.5">
                  <div className="flex justify-between"><span>TDS deducted</span><span className="text-indigo-700 font-medium">−<Money value={tds} /></span></div>
                  <div className="flex justify-between border-t border-slate-100 pt-0.5"><span>Net received in bank</span><span className="font-semibold"><Money value={gross - tds} /></span></div>
                  <p className="text-[11px] text-slate-400 pt-1">The order is still credited the full <Money value={gross} /> — the client remits the TDS on your behalf.</p>
                </div>
              </>
            )}
          </div>

          <input className="input" placeholder="Reference / txn no. (optional)" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          <button className="btn-primary w-full" disabled={busy || gross <= 0}>{busy ? 'Saving…' : '💰 Record payment'}</button>
        </form>
      )}
    </div>
  );
}

function Row({ k, children }) {
  return <div className="flex justify-between gap-4 border-b border-slate-100 pb-1.5"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800 text-right">{children}</dd></div>;
}
