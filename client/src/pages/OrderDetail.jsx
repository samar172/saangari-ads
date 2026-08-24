import { Fragment, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tag, Download, Receipt, FileText, StopCircle, ArrowRightLeft, Camera, MapPin, Image as ImageIcon, Newspaper, Banknote, Check, Plus, Trash2, Pencil, ChevronRight } from 'lucide-react';
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [request, setRequest] = useState(null); // { action, label } → approval request modal
  const isReviewer = user.role === 'MANAGER' || user.role === 'SUPER_ADMIN';

  function load() { api.get(`/orders/${id}`).then((r) => setO(r.data)).catch(() => navigate('/orders')); }
  useEffect(load, [id, navigate]);

  async function changeStatus(s) {
    setBusy(true);
    try { await api.post(`/orders/${id}/status`, { status: s }); load(); }
    catch (e) { alert(e.response?.data?.error || 'Could not update the campaign status'); }
    finally { setBusy(false); }
  }

  if (!o) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/orders')}>← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{o.orderNo}</h1>
          <p className="text-sm text-slate-500">{o.client.company ? `${o.client.company} · ${o.client.name}` : o.client.name}</p>
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
        {/* Monitoring proofs as a shareable deck / document */}
        <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => downloadFile(`/exports/orders/${id}/photos.pdf`, `Monitoring-${o.orderNo}.pdf`)}><Camera size={16} /> Photos PDF</button>
        <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => downloadFile(`/exports/orders/${id}/photos.pptx`, `Monitoring-${o.orderNo}.pptx`)}><Camera size={16} /> Photos PPT</button>
        {/* GST campaigns can be flagged to settle in cash — a manager approves it. */}
        {o.taxCategory === 'GST' && o.status !== 'CANCELLED' && (
          <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => setRequest({ action: 'SETTLE_CASH', label: `${o.orderNo} · settle in cash (Non-GST)` })}>
            <Banknote size={16} /> Settle in cash
          </button>
        )}
        {can(user, 'editCampaign') && (
          <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => navigate(`/orders/${id}/edit`)}><Pencil size={16} /> Edit</button>
        )}
        {isReviewer ? (
          <button className="btn-ghost text-sm flex items-center gap-1.5 text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete</button>
        ) : (
          <button className="btn-ghost text-sm flex items-center gap-1.5 text-red-600 hover:bg-red-50" onClick={() => setRequest({ action: 'DELETE_ORDER', label: `${o.orderNo} · ${o.client.name}` })}><Trash2 size={16} /> Request delete</button>
        )}
      </div>

      <div className="card">
        <OrderTabs o={o} user={user} busy={busy} changeStatus={changeStatus} onChanged={load} tab={tab} setTab={setTab} />
      </div>

      {confirmDelete && (
        <DeleteOrderModal order={o} onClose={() => setConfirmDelete(false)} onDeleted={() => navigate('/orders')} />
      )}
      {request && (
        <RequestApprovalModal order={o} request={request} onClose={() => setRequest(null)} onDone={() => { setRequest(null); load(); }} />
      )}
    </div>
  );
}

// Staff can't perform sensitive actions directly — they file a request that a
// manager/admin approves from the Approvals queue.
function RequestApprovalModal({ order, request, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const title = request.action === 'DELETE_ORDER' ? 'Request campaign deletion'
    : request.action === 'CANCEL_ORDER' ? 'Request campaign cancellation'
    : 'Request cash settlement';

  async function submit() {
    setBusy(true); setErr('');
    try {
      await api.post('/approvals', {
        action: request.action, entityType: 'order', entityId: order.id,
        label: request.label, reason,
      });
      setDone(true);
    } catch (e) { setErr(e.response?.data?.error || 'Could not send request'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-auto p-6">
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        {done ? (
          <>
            <p className="text-sm text-emerald-700 mt-2">Request sent. A manager will review it in the Approvals queue.</p>
            <div className="flex justify-end mt-5"><button className="btn-primary" onClick={onDone}>Done</button></div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 mt-2">
              {request.action === 'DELETE_ORDER'
                ? `This asks an admin to delete ${order.orderNo}. Nothing is removed until they approve.`
                : request.action === 'CANCEL_ORDER'
                ? `This asks an admin to cancel ${order.orderNo} and free its sites. Nothing changes until they approve.`
                : `This asks an admin to settle ${order.orderNo} in cash: GST is removed and the campaign moves to the Non-GST business. Nothing changes until they approve.`}
            </p>
            <label className="label mt-4">Reason (optional)</label>
            <textarea className="input h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this needed?" />
            {err && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
            <div className="flex justify-end gap-3 mt-5">
              <button className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send request'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Two-step delete: the user must type the order number to arm the button, so a
// campaign can't be wiped by a stray click. The server still refuses if money
// or invoices exist.
function DeleteOrderModal({ order, onClose, onDeleted }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const armed = text.trim().toUpperCase() === order.orderNo.toUpperCase();

  async function del() {
    setBusy(true); setErr('');
    try {
      await api.delete(`/orders/${order.id}`);
      onDeleted();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not delete this order');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-auto p-6">
        <h2 className="text-lg font-bold text-red-700 flex items-center gap-2"><Trash2 size={18} /> Delete {order.orderNo}?</h2>
        <p className="text-sm text-slate-600 mt-2">
          This permanently removes the campaign, its sites and add-ons, and frees the held sites. This cannot be undone.
          {order.amountPaid > 0 && <span className="block mt-1 text-red-600 font-medium">This order has payments — the server will refuse; cancel it instead.</span>}
        </p>
        <label className="label mt-4">Type <span className="font-mono font-semibold">{order.orderNo}</span> to confirm</label>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder={order.orderNo} />
        {err && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="btn-danger" disabled={busy || !armed} onClick={del}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
        </div>
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
        {[['overview', 'Overview'], ['sites', `Sites (${o.items.length})`], ['monitoring', `Monitoring (${o.items.reduce((a, it) => a + it.photos.length, 0)})`], ['invoices', `Invoices (${o.invoices?.length || 0})`], ['payments', 'Payments']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`shrink-0 px-4 ${compact ? 'py-2 text-xs' : 'py-3 text-sm'} font-medium border-b-2 -mb-px transition ${tab === k ? 'border-brand text-brand bg-white rounded-t-lg' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>
        ))}
      </div>

      <div className={compact ? 'p-4' : 'p-6'}>
        {tab === 'overview' && <Overview o={o} user={user} busy={busy} changeStatus={changeStatus} onChanged={onChanged} />}
        {tab === 'sites' && (
          <div className="space-y-4">
            {o.items.map((it) => <LineCard key={it.id} order={o} line={it} onChanged={onChanged} />)}
          </div>
        )}
        {tab === 'monitoring' && <MonitoringTab o={o} onChanged={onChanged} />}
        {tab === 'invoices' && <InvoicesPanel o={o} user={user} onChanged={onChanged} />}
        {tab === 'payments' && <Payments o={o} user={user} onChanged={onChanged} />}
      </div>
    </>
  );
}

// Add a mid-campaign extra charge (re-print / extra mount / other). Folds into
// the order's add-on total and re-prices tax + grand total on the server.
function AddOnForm({ orderId, onChanged }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('PRINT');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function add() {
    if (!label.trim() || !(Number(amount) > 0)) { setErr('Enter a label and amount'); return; }
    setBusy(true); setErr('');
    try {
      await api.post(`/orders/${orderId}/addons`, { kind, label: label.trim(), amount: Number(amount) });
      setLabel(''); setAmount(''); setOpen(false);
      onChanged && onChanged();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not add this charge');
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button type="button" className="mt-4 text-xs font-medium text-brand hover:underline flex items-center gap-1" onClick={() => setOpen(true)}>
        <Plus size={12} /> Add-on charge (re-print / mount)
      </button>
    );
  }
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="text-xs font-semibold text-slate-600">New add-on charge</div>
      <div className="grid grid-cols-3 gap-2">
        <select className="input py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="PRINT">Print</option>
          <option value="MOUNT">Mount</option>
          <option value="OTHER">Other</option>
        </select>
        <input className="input py-1.5 text-sm col-span-2" placeholder="e.g. new creative re-print" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <input type="number" min="1" className="input py-1.5 text-sm" placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} />
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost text-xs py-1" disabled={busy} onClick={() => { setOpen(false); setErr(''); }}>Cancel</button>
        <button type="button" className="btn-primary text-xs py-1" disabled={busy} onClick={add}>{busy ? 'Adding…' : 'Add charge'}</button>
      </div>
    </div>
  );
}

// Switch a live order between GST and cash (Non-GST) billing — for when a client
// asks at billing time to settle in cash. Re-prices on the server.
function TaxToggle({ order, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toGst = order.taxCategory !== 'GST';

  async function switchTax() {
    // Settling in cash strips GST and moves the campaign to the Non-GST business,
    // so make it a deliberate action.
    if (!toGst && !window.confirm(`Settle ${order.orderNo} in cash?\n\nGST is removed and the campaign — with the money booked against it — moves to your Non-GST business. This can't be done once an invoice exists.`)) return;
    setBusy(true); setErr('');
    try {
      await api.patch(`/orders/${order.id}/tax`, { taxCategory: toGst ? 'GST' : 'NON_GST' });
      onChanged && onChanged();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not change the tax treatment');
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-200">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">Currently billed {order.taxCategory === 'GST' ? 'with GST (18%)' : 'in cash (Non-GST)'}</span>
        <button type="button" className="text-xs font-medium text-brand hover:underline disabled:opacity-50" disabled={busy} onClick={switchTax}>
          {busy ? 'Updating…' : toGst ? 'Apply GST (18%)' : 'Settle in cash (remove GST)'}
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
    </div>
  );
}

function Overview({ o, user, busy, changeStatus, onChanged }) {
  const [cancelReq, setCancelReq] = useState(false);
  const isSales = user.role === 'SALES';

  // Cancelling frees every held site and cannot be undone. Sales must get an
  // approval; everyone else confirms (the "double verification" step) first.
  function onCancel() {
    if (isSales) { setCancelReq(true); return; }
    if (!window.confirm(`Cancel ${o.orderNo}? This frees all its sites and cannot be undone.`)) return;
    if (!window.confirm('Please confirm again — this permanently cancels the campaign.')) return;
    changeStatus('CANCELLED');
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div>
        <dl className="space-y-3 text-sm">
          <Row k="Booking Date">{new Date(o.bookingDate).toLocaleDateString('en-IN')}</Row>
          {o.category && <Row k="Category">{o.category.name}</Row>}
          {o.description && <Row k="Description">{o.description}</Row>}
          <Row k="Client">{o.client.company ? `${o.client.company} · ` : ''}{o.client.name} · {o.client.phone}</Row>
          {o.printingPartner && <Row k="Printing Partner">{o.printingPartner.name}{o.printMaterial ? ` · ${o.printMaterial}` : ''}</Row>}
          <Row k="Monitoring">{o.monitoring ? [o.monitorStart && 'Start', o.monitorMid && 'Mid', o.monitorEnd && 'End'].filter(Boolean).join(' · ') || 'Yes' : 'No'}</Row>
          <Row k="Created by">{o.createdBy.name}</Row>
        </dl>

        {o.invoices?.length > 0 && (() => {
          // Latest invoice drives the "last invoice / due in N days" line.
          const latest = [...o.invoices].sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt))[0];
          const due = latest.dueDate ? new Date(latest.dueDate) : null;
          const daysToDue = due ? Math.ceil((due - new Date()) / 86400000) : null;
          return (
            <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
              <div className="flex items-center gap-2">
                <Receipt size={16} className="text-emerald-600" />
                <span>Invoiced: {o.invoices.map((i) => i.invoiceNo).join(', ')}</span>
              </div>
              <div className="text-xs text-emerald-800/80 mt-1 pl-6">
                Last invoice {new Date(latest.issuedAt).toLocaleDateString('en-IN')}
                {due && <> · due {due.toLocaleDateString('en-IN')} ({daysToDue >= 0 ? `in ${daysToDue} day${daysToDue === 1 ? '' : 's'}` : `${-daysToDue} day${daysToDue === -1 ? '' : 's'} overdue`})</>}
              </div>
            </div>
          );
        })()}

        {can(user, 'changeBookingStatus') && (
          <div className="mt-6 flex flex-wrap gap-2">
            {o.status === 'QUOTATION' && <button className="btn-primary" disabled={busy} onClick={() => changeStatus('CONFIRMED')}>Confirm order</button>}
            {!['CANCELLED', 'COMPLETED'].includes(o.status) && (
              <button className="btn-danger" disabled={busy} onClick={onCancel}>{isSales ? 'Request cancellation' : 'Cancel'}</button>
            )}
          </div>
        )}
        {cancelReq && (
          <RequestApprovalModal
            order={o}
            request={{ action: 'CANCEL_ORDER', label: `${o.orderNo} · ${o.client.name} · cancel campaign` }}
            onClose={() => setCancelReq(false)}
            onDone={() => { setCancelReq(false); onChanged(); }}
          />
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
        {can(user, 'changeBookingStatus') && o.status !== 'CANCELLED' && (
          <AddOnForm orderId={o.id} onChanged={onChanged} />
        )}
        {can(user, 'viewReports') && !['CANCELLED', 'COMPLETED'].includes(o.status) && (
          <TaxToggle order={o} onChanged={onChanged} />
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
                Shifted {s.fromSite.code} → {s.toSite.code} on {new Date(s.shiftedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} by {s.by.name}
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
    </div>
  );
}

// Monitoring proofs, presented one collapsible tile per site so a long campaign
// isn't a wall of photos. A tile shows the site, a thumbnail strip and an X/9
// progress chip; expanding it reveals the full upload/edit grid for that site.
function MonitoringTab({ o, onChanged }) {
  const [openId, setOpenId] = useState(o.items.length === 1 ? o.items[0].id : null);
  return (
    <div className="space-y-2">
      {o.items.map((it) => {
        const n = it.photos.length;
        const open = openId === it.id;
        const complete = n >= 9;
        return (
          <div key={it.id} className="rounded-xl border border-slate-200 overflow-hidden">
            <button onClick={() => setOpenId(open ? null : it.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition text-left">
              <ChevronRight size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800">{it.site.code}</div>
                {it.site.location && <div className="text-xs text-slate-500 truncate">{it.site.location}</div>}
              </div>
              {n > 0 && (
                <div className="hidden sm:flex -space-x-2 shrink-0">
                  {it.photos.slice(0, 3).map((p) => (
                    <img key={p.id} src={p.filePath} alt="" className="h-9 w-9 rounded-md border-2 border-white object-cover shadow-sm" />
                  ))}
                </div>
              )}
              <span className={`text-xs font-medium shrink-0 px-2 py-0.5 rounded-full ${complete ? 'bg-emerald-50 text-emerald-600' : n > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>{n}/9 proofs</span>
            </button>
            {open && (
              <div className="border-t border-slate-100 p-4 bg-slate-50/40">
                <PhotoSection booking={it} monitoring={o.monitoring} onUploaded={onChanged} />
              </div>
            )}
          </div>
        );
      })}
      {o.items.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">No sites on this campaign.</div>}
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

  // Local date (YYYY-MM-DD) for an <input type="date">, avoiding UTC day-shift.
  const toDateInput = (v) => {
    const d = new Date(v);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  // One monitoring date per phase — seeded from any photo already uploaded for it.
  const [phaseDates, setPhaseDates] = useState(() => {
    const d = {};
    for (const ph of PHASES) {
      const p = booking.photos.find((x) => x.phase === ph);
      d[ph] = p ? toDateInput(p.takenAt) : '';
    }
    return d;
  });

  async function setPhaseDate(ph, val) {
    setPhaseDates((d) => ({ ...d, [ph]: val }));
    // If proofs already exist for this phase, back-date them so exports pick it up.
    if (val && booking.photos.some((p) => p.phase === ph)) {
      try { await api.patch('/photos/date', { bookingId: booking.id, phase: ph, takenAt: `${val}T12:00:00` }); onUploaded(); } catch {}
    }
  }

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
    if (phaseDates[uploadTarget.phase]) fd.append('takenAt', `${phaseDates[uploadTarget.phase]}T12:00:00`);
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
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileSelect} 
      />

      <div className={`grid grid-cols-[68px_repeat(3,minmax(0,1fr))] sm:grid-cols-[100px_repeat(3,minmax(0,1fr))] gap-2 mb-4 max-w-2xl ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
        <div />
        {PHASES.map((ph) => (
          <div key={ph} className="text-center">
            <div className="text-xs font-semibold text-slate-500">{ph}</div>
            {can(user, 'uploadPhoto') && (
              <input
                type="date"
                value={phaseDates[ph] || ''}
                onChange={(e) => setPhaseDate(ph, e.target.value)}
                title="Monitoring date for this phase (used on the exported slide)"
                className="mt-1 w-full min-w-0 text-[10px] border border-slate-200 rounded px-1 py-0.5 text-slate-600 cursor-pointer"
              />
            )}
          </div>
        ))}
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

// Per-campaign invoice history + a generate control, so a bill can be raised
// straight from the order it belongs to. Every generated PDF is listed line by
// line; Finance can generate again (e.g. a monthly bill) and download any of them.
function InvoicesPanel({ o, user, onChanged }) {
  const invoices = [...(o.invoices || [])].sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
  const canGenerate = can(user, 'generateInvoice');
  const hasInvoice = invoices.some((i) => i.status !== 'CANCELLED');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState(''); // soft photo-gate → offer "invoice anyway"

  async function markPaid(id) {
    if (busy) return;
    setBusy(true); setErr('');
    try { await api.post(`/invoices/${id}/mark-paid`); onChanged(); }
    catch (e) { setErr(e.response?.data?.error || 'Could not mark this invoice paid'); }
    finally { setBusy(false); }
  }

  async function generate(force) {
    setBusy(true); setErr(''); if (force) setWarn('');
    try {
      await api.post('/invoices', {
        orderId: o.id, force: !!force,
        dueDate: dueDate || undefined,
      });
      setDueDate('');
      onChanged();
    } catch (e) {
      const d = e.response?.data;
      if (e.response?.status === 422 && d?.canForce) setWarn(d.error || 'Proof-of-display missing.');
      else setErr(d?.error || 'Failed to generate invoice');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      {/* Generated PDF history — one row per invoice */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Generated invoices ({invoices.length})</div>
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No invoices generated for this campaign yet.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Invoice No</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Due</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{i.invoiceNo}</td>
                    <td className="px-3 py-2 text-slate-500">{new Date(i.issuedAt).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-2 text-slate-500">{i.dueDate ? new Date(i.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="px-3 py-2">{i.taxCategory === 'GST' ? <Badge status="LIVE">{i.interState ? 'IGST' : 'CGST+SGST'}</Badge> : <span className="text-slate-400">Non-GST</span>}</td>
                    <td className="px-3 py-2 text-right font-medium"><Money value={i.total} /></td>
                    <td className="px-3 py-2"><Badge status={i.status} /></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap space-x-2">
                      <button className="text-brand-light underline text-xs" onClick={() => downloadFile(`/invoices/${i.id}/pdf`, `${i.invoiceNo}.pdf`)}>Download</button>
                      {canGenerate && i.status !== 'PAID' && (
                        <button className="text-emerald-600 underline text-xs" onClick={() => markPaid(i.id)}>Mark paid</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate the campaign's invoice — one per campaign; to re-bill, void the
          existing one; to bill in cash, settle the campaign in cash first. */}
      {canGenerate && (
        !o.receivable ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            {o.status === 'QUOTATION' ? 'Confirm this quotation before invoicing.' : 'This campaign is cancelled — nothing to invoice.'}
          </div>
        ) : hasInvoice ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-500">
            This campaign is already invoiced. To re-issue, void the existing invoice first; to bill it in cash, settle the campaign in cash (Overview) before invoicing.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 p-5 bg-slate-50">
            <div className="flex items-center gap-2 text-base font-semibold text-slate-800 mb-3"><Receipt size={18} /> Generate invoice for {o.orderNo}</div>
            {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
            <div className="sm:max-w-xs">
              <label className="label">Due date</label>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <p className="text-[11px] text-slate-400 mt-1">Blank = last working day of this month. Tax follows the campaign ({o.taxCategory === 'GST' ? 'GST' : 'Non-GST'}).</p>
            </div>
            {warn ? (
              <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                {warn}
                <div className="mt-2 flex gap-2">
                  <button className="btn-ghost text-xs" onClick={() => setWarn('')}>Cancel</button>
                  <button className="btn-primary text-xs" disabled={busy} onClick={() => generate(true)}>{busy ? 'Generating…' : 'Invoice anyway'}</button>
                </div>
              </div>
            ) : (
              <button className="btn-primary mt-3 flex items-center gap-1.5" disabled={busy} onClick={() => generate(false)}>
                <Plus size={16} /> {busy ? 'Generating…' : 'Generate invoice'}
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}

// Edit a recorded payment. A reviewer (manager/admin) saves it directly; anyone
// else files an EDIT_PAYMENT approval that an admin signs off before it applies.
function PaymentEditModal({ order, payment, isReviewer, onClose, onDone }) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [mode, setMode] = useState(payment.mode || 'CASH');
  const [reference, setReference] = useState(payment.reference || '');
  const [tdsApplicable, setTdsApplicable] = useState(!!payment.tdsApplicable);
  const [tdsPct, setTdsPct] = useState(payment.tdsPct || 2);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const gross = Number(amount) || 0;
  const tds = tdsApplicable ? Math.round(gross * (Number(tdsPct) || 0) / 100) : 0;

  async function submit() {
    if (!(gross > 0)) { setErr('Amount must be greater than zero'); return; }
    setBusy(true); setErr('');
    const payload = { amount: gross, mode, reference, tdsApplicable, tdsPct: tdsApplicable ? Number(tdsPct) : 0 };
    try {
      if (isReviewer) {
        await api.patch(`/orders/${order.id}/payments/${payment.id}`, payload);
        onDone();
      } else {
        await api.post('/approvals', {
          action: 'EDIT_PAYMENT', entityType: 'payment', entityId: payment.id,
          label: `${order.orderNo} · edit payment ₹${payment.amount.toLocaleString('en-IN')} → ₹${gross.toLocaleString('en-IN')}`,
          reason, payload,
        });
        setDone(true);
      }
    } catch (e) { setErr(e.response?.data?.error || 'Could not submit the edit'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-auto p-6">
        <h2 className="text-lg font-bold text-slate-800">{isReviewer ? 'Edit payment' : 'Request payment edit'}</h2>
        {done ? (
          <>
            <p className="text-sm text-emerald-700 mt-2">Request sent. A manager will review it in the Approvals queue.</p>
            <div className="flex justify-end mt-5"><button className="btn-primary" onClick={onDone}>Done</button></div>
          </>
        ) : (
          <>
            {!isReviewer && <p className="text-sm text-slate-600 mt-2">Changes take effect only once an admin approves.</p>}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div><label className="label">Amount (₹)</label><input type="number" min="1" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><label className="label">Mode</label><select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>{['CASH', 'UPI', 'BANK', 'CHEQUE', 'CARD'].map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
            </div>
            <div className="mt-3"><label className="label">Reference (optional)</label><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mt-3">
              <input type="checkbox" checked={tdsApplicable} onChange={(e) => setTdsApplicable(e.target.checked)} /> TDS applicable
            </label>
            {tdsApplicable && (
              <div className="mt-2 flex items-center gap-3">
                <select className="input py-2 text-sm w-32" value={tdsPct} onChange={(e) => setTdsPct(e.target.value)}>{[1, 2, 5, 10].map((r) => <option key={r} value={r}>{r}% TDS</option>)}</select>
                <span className="text-xs text-slate-500">−<Money value={tds} /> · net <Money value={gross - tds} /></span>
              </div>
            )}
            {!isReviewer && (
              <div className="mt-3"><label className="label">Reason (optional)</label><textarea className="input h-16" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            )}
            {err && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
            <div className="flex justify-end gap-3 mt-5">
              <button className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (isReviewer ? 'Save changes' : 'Send request')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Payments({ o, user, onChanged }) {
  const [form, setForm] = useState({ amount: '', mode: 'CASH', reference: '', tdsApplicable: false, tdsPct: 2 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editPay, setEditPay] = useState(null); // payment being edited
  const isReviewer = user.role === 'MANAGER' || user.role === 'SUPER_ADMIN';

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
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-500">{new Date(p.receivedAt).toLocaleDateString('en-IN')} · {p.recordedBy?.name}{p.reference ? ` · Ref: ${p.reference}` : ''}</div>
                  {can(user, 'recordPayment') && (
                    <button className="text-xs text-brand hover:underline shrink-0" onClick={() => setEditPay(p)}>
                      {isReviewer ? 'Edit' : 'Request edit'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {editPay && (
          <PaymentEditModal
            order={o} payment={editPay} isReviewer={isReviewer}
            onClose={() => setEditPay(null)}
            onDone={() => { setEditPay(null); onChanged(); }}
          />
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
