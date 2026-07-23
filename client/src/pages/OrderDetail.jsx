import { Fragment, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tag, Download, Receipt, FileText, StopCircle, ArrowRightLeft, Camera, MapPin, Image as ImageIcon, Newspaper, Banknote, Check } from 'lucide-react';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { Badge, Money, Spinner } from '../components/ui';

const PHASES = ['START', 'MID', 'END'];
const KINDS = [['GPS', <><MapPin size={14} className="inline mr-1" /> GPS</>], ['NORMAL', <><ImageIcon size={14} className="inline mr-1" /> Normal</>], ['NEWSPAPER', <><Newspaper size={14} className="inline mr-1" /> Newspaper</>]];
const TDS_RATES = [1, 2, 5, 10];

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [o, setO] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);

  function load() { api.get(`/orders/${id}`).then((r) => setO(r.data)).catch(() => navigate('/orders')); }
  useEffect(load, [id, navigate]);

  async function changeStatus(s) {
    setBusy(true);
    try { await api.post(`/orders/${id}/status`, { status: s }); load(); }
    finally { setBusy(false); }
  }

  if (!o) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/orders')}>← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{o.orderNo}</h1>
          <p className="text-sm text-slate-500">{o.client.name}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-4">
          <Badge status={o.status} />
          {o.items[0]?.type === 'LOOSE' && <span className="badge bg-purple-100 text-purple-800">Loose</span>}
          {o.category && <span className="badge bg-teal-100 text-teal-800 flex items-center gap-1"><Tag size={12} /> {o.category.name}</span>}
          <span className="badge bg-slate-100 text-slate-700">{o.taxCategory === 'GST' ? (o.interState ? 'IGST' : 'CGST+SGST') : 'Non-GST'}</span>
          <span className={`badge ${o.paymentTerms === 'POSTPAID' ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>
            {o.paymentTerms === 'POSTPAID' ? 'Postpaid' : 'Advance'}
          </span>
        </div>
        <div className="flex-1" />
        <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => downloadFile(`/orders/${id}/quotation.pdf`, `Quotation-${o.orderNo}.pdf`)}><Download size={16} /> Quotation PDF</button>
      </div>

      <div className="card">
        <OrderTabs o={o} user={user} busy={busy} changeStatus={changeStatus} onChanged={load} tab={tab} setTab={setTab} />
      </div>
    </div>
  );
}

// The tabbed body of an order. Exported so the orders list can expand a row into
// the exact same panel — one implementation, so the two can never drift apart.
export function OrderTabs({ o, user, busy, changeStatus, onChanged, tab, setTab, compact }) {
  return (
    <>
      <div className={`flex gap-1 overflow-x-auto border-b border-slate-200 px-2 pt-2 bg-slate-50/50 ${compact ? '' : 'rounded-t-xl'}`}>
        {[['overview', 'Overview'], ['sites', `Sites (${o.items.length})`], ['payments', 'Payments']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`shrink-0 px-4 ${compact ? 'py-2 text-xs' : 'py-3 text-sm'} font-medium border-b-2 -mb-px transition ${tab === k ? 'border-brand text-brand bg-white rounded-t-lg' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>
        ))}
      </div>

      <div className={compact ? 'p-4' : 'p-6'}>
        {tab === 'overview' && <Overview o={o} user={user} busy={busy} changeStatus={changeStatus} />}
        {tab === 'sites' && (
          <div className="space-y-4">
            {o.items.map((it) => <LineCard key={it.id} order={o} line={it} onChanged={onChanged} />)}
          </div>
        )}
        {tab === 'payments' && <Payments o={o} user={user} onChanged={onChanged} />}
      </div>
    </>
  );
}

function Overview({ o, user, busy, changeStatus }) {
  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div>
        <dl className="space-y-3 text-sm">
          <Row k="Booking Date">{new Date(o.bookingDate).toLocaleDateString('en-IN')}</Row>
          {o.category && <Row k="Category">{o.category.name}</Row>}
          {o.description && <Row k="Description">{o.description}</Row>}
          <Row k="Client">{o.client.name} · {o.client.phone}</Row>
          {o.printingPartner && <Row k="Printing Partner">{o.printingPartner.name}</Row>}
          <Row k="Monitoring">{o.monitoring ? [o.monitorStart && 'Start', o.monitorMid && 'Mid', o.monitorEnd && 'End'].filter(Boolean).join(' · ') || 'Yes' : 'No'}</Row>
          <Row k="Created by">{o.createdBy.name}</Row>
        </dl>

        {o.invoices?.length > 0 && (
          <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm flex items-center gap-2">
            <Receipt size={16} className="text-emerald-600" />
            <span>Invoiced: {o.invoices.map((i) => i.invoiceNo).join(', ')}</span>
          </div>
        )}

        {can(user, 'changeBookingStatus') && (
          <div className="mt-6 flex flex-wrap gap-2">
            {o.status === 'QUOTATION' && <button className="btn-primary" disabled={busy} onClick={() => changeStatus('CONFIRMED')}>Confirm order</button>}
            {['CONFIRMED', 'LIVE'].includes(o.status) && <button className="btn-ghost" disabled={busy} onClick={() => changeStatus('COMPLETED')}>Mark completed</button>}
            {!['CANCELLED', 'COMPLETED'].includes(o.status) && <button className="btn-danger" disabled={busy} onClick={() => changeStatus('CANCELLED')}>Cancel</button>}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 p-5 bg-slate-50">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">Commercials</div>
        <dl className="space-y-2 text-sm">
          <Row k="Rental"><Money value={o.rentalSubtotal} /></Row>
          {o.printingTotal > 0 && <Row k={`Printing (${o.noOfPrints})`}><Money value={o.printingTotal} /></Row>}
          {o.mountingCost > 0 && <Row k="Mounting"><Money value={o.mountingCost} /></Row>}
          {o.addOnTotal > 0 && <Row k="Add-ons"><Money value={o.addOnTotal} /></Row>}
          {o.discountAmount > 0 && <Row k={`Discount (${o.discountPct}%)`}><span className="text-red-600">−<Money value={o.discountAmount} /></span></Row>}
          <Row k="Taxable"><Money value={o.taxableAmount} /></Row>
          {o.cgst > 0 && <Row k="CGST 9%"><Money value={o.cgst} /></Row>}
          {o.sgst > 0 && <Row k="SGST 9%"><Money value={o.sgst} /></Row>}
          {o.igst > 0 && <Row k="IGST 18%"><Money value={o.igst} /></Row>}
          <div className="flex justify-between border-t border-slate-300 pt-3 mt-2 text-base font-bold text-brand">
            <span>{o.receivable ? 'Grand Total' : 'Quoted Value'}</span><Money value={o.grandTotal} />
          </div>
          {/* A quotation owes nothing until it is confirmed, so no paid/balance rows. */}
          {o.receivable ? (
            <>
              <div className="flex justify-between text-emerald-700 font-medium mt-2"><span>Paid</span><Money value={o.amountPaid} /></div>
              <div className="flex justify-between font-bold text-red-600 mt-2"><span>Balance Due</span><Money value={o.balanceDue} /></div>
            </>
          ) : (
            <div className="mt-2 text-xs text-slate-500">
              {o.status === 'QUOTATION'
                ? 'Not yet a receivable — confirm the quotation to bill and collect against it.'
                : 'This order is cancelled; nothing is due.'}
            </div>
          )}
        </dl>
        {o.addOns?.length > 0 && (
          <div className="mt-4 text-xs text-slate-500 space-y-1">
            {o.addOns.map((a) => <div key={a.id} className="flex justify-between"><span>{a.label}</span><Money value={a.amount} /></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function LineCard({ order, line, onChanged }) {
  const { user } = useAuth();
  const [panel, setPanel] = useState(null);
  const finished = ['COMPLETED', 'CANCELLED', 'STOPPED'].includes(line.status);
  const canOperate = can(user, 'shiftOrStopBooking') && !finished;

  return (
    <div className="rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <span className="font-semibold text-slate-800 text-base">{line.bookingNo} · {line.site.code}</span>
          <span className="text-sm text-slate-500"> — {line.site.location}</span>
        </div>
        <Badge status={line.status} />
      </div>
      <div className="text-sm text-slate-600 font-medium">
        {new Date(line.startDate).toLocaleDateString('en-IN')} – {new Date(line.endDate).toLocaleDateString('en-IN')} ({line.days}d) · <Money value={line.subtotal} />
      </div>

      {line.displayNotes && (
        <div className="mt-3 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600 flex gap-2 items-start">
          <FileText size={16} className="text-slate-400 mt-0.5 shrink-0" />
          <span>{line.displayNotes}</span>
        </div>
      )}
      {line.status === 'STOPPED' && (
        <div className="mt-3 rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-800 flex gap-2 items-start">
          <StopCircle size={16} className="text-orange-500 mt-0.5 shrink-0" />
          <span>
            Stopped on {new Date(line.stoppedAt).toLocaleDateString('en-IN')}
            {line.stopReason ? ` — ${line.stopReason}` : ''} · billed {line.days} day{line.days === 1 ? '' : 's'}
          </span>
        </div>
      )}
      {line.shifts?.length > 0 && (
        <div className="mt-3 space-y-2">
          {line.shifts.map((s) => (
            <div key={s.id} className="rounded-md bg-sky-50 border border-sky-200 px-3 py-2 text-sm text-sky-800 flex gap-2 items-start">
              <ArrowRightLeft size={16} className="text-sky-500 mt-0.5 shrink-0" />
              <span>
                Shifted {s.fromSite.code} → {s.toSite.code} on {new Date(s.shiftedAt).toLocaleDateString('en-IN')} by {s.by.name}
                {s.reason ? ` — ${s.reason}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {(canOperate || can(user, 'createBooking')) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {can(user, 'createBooking') && !finished && (
            <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => setPanel(panel === 'notes' ? null : 'notes')}><FileText size={14} /> Display notes</button>
          )}
          {canOperate && <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => setPanel(panel === 'shift' ? null : 'shift')}><ArrowRightLeft size={14} /> Shift site</button>}
          {canOperate && <button className="btn-ghost text-sm text-orange-700 flex items-center gap-1.5" onClick={() => setPanel(panel === 'stop' ? null : 'stop')}><StopCircle size={14} /> Stop now</button>}
        </div>
      )}

      {panel && (
        <LinePanel
          panel={panel} order={order} line={line}
          onDone={() => { setPanel(null); onChanged(); }}
          onCancel={() => setPanel(null)}
        />
      )}

      <div className="mt-5 border-t border-slate-100 pt-5">
        <PhotoSection booking={line} monitoring={order.monitoring} onUploaded={onChanged} />
      </div>
    </div>
  );
}

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
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
      {err && <div className="text-sm text-red-600">{err}</div>}

      {panel === 'notes' && (
        <>
          <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><FileText size={16} /> Display notes — printed on the quotation and invoice</div>
          <textarea className="input text-sm" rows="2" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Facing the highway exit — client wants it lit after 7pm" />
          <div className="flex gap-2">
            <button className="btn-primary py-1.5 text-sm flex items-center gap-1.5" disabled={busy} onClick={() => run(() => api.patch(base, { displayNotes: notes }))}>
              {busy ? 'Saving…' : <><Check size={16} /> Save notes</>}
            </button>
            <button className="btn-ghost py-1.5 text-sm" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}

      {panel === 'shift' && (
        <>
          <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ArrowRightLeft size={16} /> Shift {line.site.code} to another site — same dates, same price</div>
          <select className="input text-sm py-2" value={toSiteId} onChange={(e) => setToSiteId(e.target.value)}>
            <option value="">Choose a vacant site…</option>
            {sites.filter((s) => s.id !== line.siteId).map((s) => (
              <option key={s.id} value={s.id}>{s.code} — {s.location}</option>
            ))}
          </select>
          <input className="input text-sm py-2" placeholder="Reason (e.g. permission revoked)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary py-1.5 text-sm flex items-center gap-1.5" disabled={busy || !toSiteId}
              onClick={() => run(() => api.post(`${base}/shift`, { toSiteId: Number(toSiteId), reason }))}>
              {busy ? 'Shifting…' : <><ArrowRightLeft size={16} /> Shift site</>}
            </button>
            <button className="btn-ghost py-1.5 text-sm" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}

      {panel === 'stop' && (
        <>
          <div className="text-sm font-semibold text-orange-800 flex items-center gap-1.5"><StopCircle size={16} /> Stop this display immediately</div>
          <p className="text-sm text-slate-600">
            Ends the campaign today, frees {line.site.code}, and re-prices the order so only the days actually displayed are billed. This cannot be undone.
          </p>
          <input className="input text-sm py-2" placeholder="Reason (e.g. client asked to pull it down)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-danger py-1.5 text-sm flex items-center gap-1.5" disabled={busy} onClick={() => run(() => api.post(`${base}/stop`, { reason }))}>
              {busy ? 'Stopping…' : <><StopCircle size={16} /> Stop and re-price</>}
            </button>
            <button className="btn-ghost py-1.5 text-sm" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

function PhotoSection({ booking, monitoring, onUploaded }) {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState({ phase: null, kind: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const at = (ph, k) => booking.photos.find((p) => p.phase === ph && p.kind === k);
  const have = booking.photos.length;

  function triggerUpload(phase, kind) {
    if (!can(user, 'uploadPhoto')) return;
    setUploadTarget({ phase, kind });
    if (fileInputRef.current) fileInputRef.current.click();
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file || !uploadTarget.phase || !uploadTarget.kind) return;

    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('bookingId', booking.id);
    fd.append('phase', uploadTarget.phase);
    fd.append('kind', uploadTarget.kind);
    try {
      const pos = await new Promise((res) => navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 3000 }));
      if (pos) { fd.append('latitude', pos.coords.latitude); fd.append('longitude', pos.coords.longitude); }
    } catch {}
    try {
      await api.post('/photos', fd);
      e.target.value = null; // reset input
      setUploadTarget({ phase: null, kind: null });
      onUploaded();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Upload failed');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Monitoring proofs
          {!monitoring && <span className="ml-2 font-normal normal-case text-slate-400">· monitoring off, proofs optional</span>}
        </div>
        <div className={`text-xs font-medium ${have === 9 ? 'text-emerald-600' : 'text-slate-400'}`}>{have}/9 uploaded</div>
      </div>
      
      {err && <div className="text-sm text-red-600 mb-2">{err}</div>}
      
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileSelect} 
      />

      <div className={`grid grid-cols-[68px_repeat(3,minmax(0,1fr))] sm:grid-cols-[100px_repeat(3,minmax(0,1fr))] gap-2 mb-4 max-w-2xl ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
        <div />
        {PHASES.map((ph) => <div key={ph} className="text-xs font-semibold text-slate-500 text-center">{ph}</div>)}
        {KINDS.map(([k, label]) => (
          <Fragment key={k}>
            <div className="text-xs text-slate-500 self-center">{label}</div>
            {PHASES.map((ph) => {
              const p = at(ph, k);
              return (
                <div key={ph}>
                  {p ? (
                    <div className="relative group cursor-pointer" onClick={() => triggerUpload(ph, k)}>
                      <img src={p.filePath} alt={`${ph} ${k}`} className="rounded-lg border border-slate-200 aspect-square object-cover w-full transition group-hover:opacity-50" />
                      {can(user, 'uploadPhoto') && (
                        <div className="absolute inset-0 hidden group-hover:flex items-center justify-center pointer-events-none">
                          <div className="bg-black/60 rounded-full p-2 text-white shadow-lg backdrop-blur-sm">
                            <Camera size={20} />
                          </div>
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400 truncate mt-1 text-center flex items-center justify-center gap-0.5">
                        {new Date(p.takenAt).toLocaleDateString('en-IN')}{p.latitude ? <MapPin size={10} className="text-emerald-500" /> : ''}
                      </div>
                    </div>
                  ) : (
                    <div 
                      onClick={() => triggerUpload(ph, k)}
                      className={`rounded-lg border border-dashed aspect-square flex flex-col items-center justify-center text-sm transition ${
                        can(user, 'uploadPhoto') 
                          ? 'border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-400 cursor-pointer hover:text-slate-600' 
                          : 'border-slate-200 bg-slate-50 text-slate-300'
                      }`}
                    >
                      {can(user, 'uploadPhoto') ? <Camera size={20} className="mb-1 opacity-50" /> : '—'}
                    </div>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {!can(user, 'uploadPhoto') && (
        <p className="text-sm text-slate-400 mt-2">Only Ops uploads monitoring photos. A phase reminder clears once all 3 proofs are in.</p>
      )}
      {busy && <div className="text-sm text-brand-accent animate-pulse">Uploading photo...</div>}
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
    <div className="grid md:grid-cols-2 gap-8">
      <div>
        <div className="flex justify-between text-base mb-2">
          <span className="text-slate-500">{o.receivable ? 'Grand Total' : 'Quoted Value'}</span>
          <span className="font-semibold"><Money value={o.grandTotal} /></span>
        </div>
        {o.receivable ? (
          <>
            <div className="flex justify-between text-base mb-2"><span className="text-slate-500">Paid</span><span className="text-emerald-700 font-semibold"><Money value={o.amountPaid} /></span></div>
            <div className="flex justify-between text-base mb-5 border-t border-slate-200 pt-3"><span className="text-slate-500">Balance Due</span><span className="text-red-600 font-bold"><Money value={o.balanceDue} /></span></div>
          </>
        ) : (
          <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            {o.status === 'QUOTATION'
              ? 'Payments cannot be collected against a quotation. Confirm it first — otherwise the credit lands on the client’s ledger with nothing owed against it.'
              : 'This order is cancelled; no payment can be recorded.'}
          </div>
        )}

        {o.payments.length === 0 ? <div className="text-sm text-slate-400">No payments recorded.</div> : (
          <div className="space-y-3">
            {o.payments.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 p-4 bg-white shadow-sm">
                <div className="font-semibold text-base mb-1">
                  <Money value={p.amount} />
                  <span className="badge bg-slate-100 text-slate-600 ml-2">{p.mode}</span>
                  {p.tdsApplicable && <span className="badge bg-indigo-100 text-indigo-800 ml-2">TDS {p.tdsPct}%</span>}
                </div>
                {p.tdsApplicable && (
                  <div className="text-sm text-indigo-700 mb-2">
                    <Money value={p.tdsAmount} /> deducted at source · <Money value={p.netReceived} /> received in bank
                  </div>
                )}
                <div className="text-xs text-slate-500">{new Date(p.receivedAt).toLocaleDateString('en-IN')} · {p.recordedBy?.name}{p.reference ? ` · Ref: ${p.reference}` : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {can(user, 'recordPayment') && o.balanceDue > 0 && (
        <form onSubmit={record} className="rounded-xl border border-slate-200 p-5 bg-slate-50 h-fit space-y-4">
          <div className="text-base font-semibold text-slate-800">Record payment received</div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <div>
            <label className="label">Amount settled against this order</label>
            <input type="number" min="1" className="input" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <div>
            <label className="label">Payment Mode</label>
            <select className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              {['CASH', 'UPI', 'BANK', 'CHEQUE', 'CARD'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.tdsApplicable} onChange={(e) => setForm({ ...form, tdsApplicable: e.target.checked })} />
              TDS applicable on this payment
            </label>
            {form.tdsApplicable && (
              <>
                <select className="input py-2 text-sm" value={form.tdsPct} onChange={(e) => setForm({ ...form, tdsPct: e.target.value })}>
                  {TDS_RATES.map((r) => <option key={r} value={r}>{r}% TDS</option>)}
                </select>
                <div className="text-sm text-slate-600 space-y-1">
                  <div className="flex justify-between"><span>TDS deducted</span><span className="text-indigo-700 font-medium">−<Money value={tds} /></span></div>
                  <div className="flex justify-between border-t border-slate-100 pt-1 mt-1"><span>Net received in bank</span><span className="font-bold text-slate-800"><Money value={gross - tds} /></span></div>
                  <p className="text-xs text-slate-500 pt-2 leading-tight">The order is still credited the full <Money value={gross} /> — the client remits the TDS on your behalf.</p>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="label">Reference / txn no. (optional)</label>
            <input className="input" placeholder="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <button className="btn-primary w-full py-2 flex justify-center items-center gap-1.5" disabled={busy || gross <= 0}>{busy ? 'Saving…' : <><Banknote size={18} /> Record payment</>}</button>
        </form>
      )}
    </div>
  );
}

function Row({ k, children }) {
  return <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800 text-right">{children}</dd></div>;
}
