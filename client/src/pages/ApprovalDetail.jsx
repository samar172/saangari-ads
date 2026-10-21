import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, X, Clock, ExternalLink, Building2, CalendarClock, MapPin, Printer, Receipt, Camera, FileText } from 'lucide-react';
import api, { downloadFile } from '../api';
import { useAuth } from '../auth';
import { Badge, Money, Spinner } from '../components/ui';

const ACTION_LABEL = {
  DELETE_ORDER: 'Delete campaign',
  CANCEL_ORDER: 'Cancel campaign',
  DELETE_INVOICE: 'Delete invoice',
  SETTLE_CASH: 'Settle in cash (Non-GST)',
  DISABLE_USER: 'Disable user',
  EDIT_PAYMENT: 'Edit payment',
  CONFIRM_ORDER: 'Confirm booking',
  GENERATE_INVOICE: 'Generate invoice',
  CANCEL_INVOICE: 'Cancel invoice',
  OTHER: 'Other',
};

const STATUS_STYLE = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
};

const CYCLE_LABEL = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly' };
const PHASE_LABEL = { START: 'Start', MID: 'Mid', END: 'End' };

const fmtDateTime = (v) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// Turn snake_case / camelCase payload keys into readable labels.
const humanKey = (k) => k
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/^\w/, (c) => c.toUpperCase());

function renderValue(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return <pre className="text-xs bg-slate-50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>;
  return String(v);
}

function PayloadView({ payload }) {
  if (payload === null || payload === undefined) return <div className="text-sm text-slate-400">No additional details.</div>;
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return <pre className="text-xs bg-slate-50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}</pre>;
  }
  const entries = Object.entries(payload);
  if (entries.length === 0) return <div className="text-sm text-slate-400">No additional details.</div>;
  return (
    <dl className="space-y-2 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">{humanKey(k)}</dt>
          <dd className="font-medium text-slate-800 text-right min-w-0">{renderValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ApprovalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isReviewer = user.role === 'MANAGER' || user.role === 'SUPER_ADMIN';

  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/approvals/${id}`)
      .then((r) => setReq(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  async function approve() {
    setBusy(true); setErr('');
    try {
      await api.post(`/approvals/${id}/approve`, {});
      navigate('/approvals');
    } catch (e) {
      setErr(e.response?.data?.error || 'Approve failed');
      setBusy(false);
    }
  }

  async function reject() {
    const reviewNote = window.prompt('Reason for rejecting this request?');
    if (reviewNote === null) return; // cancelled
    setBusy(true); setErr('');
    try {
      await api.post(`/approvals/${id}/reject`, { reviewNote });
      navigate('/approvals');
    } catch (e) {
      setErr(e.response?.data?.error || 'Reject failed');
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  if (notFound || !req) {
    return (
      <div>
        <button className="btn-ghost mb-5" onClick={() => navigate('/approvals')}>← Back</button>
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-400">Request not found</div>
      </div>
    );
  }

  const canReview = isReviewer && req.status === 'PENDING';
  const { order, invoice, payment, user: targetUser } = req.context || {};

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/approvals')}>← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{ACTION_LABEL[req.action] || req.action}</h1>
          <p className="text-sm text-slate-500">{req.label || `${req.entityType} #${req.entityId ?? ''}`}</p>
        </div>
        <div className="flex gap-2 ml-2">
          <span className={`badge ${STATUS_STYLE[req.status] || 'bg-slate-100 text-slate-700'}`}>{req.status}</span>
        </div>
        <div className="flex-1" />
        {order && (
          <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => navigate(`/orders/${order.id}`)}>
            <ExternalLink size={15} /> Open campaign
          </button>
        )}
        {canReview && (
          <div className="flex gap-2">
            <button className="btn-primary text-sm flex items-center gap-1.5" disabled={busy} onClick={approve}>
              <Check size={16} /> Approve
            </button>
            <button className="btn-danger text-sm flex items-center gap-1.5" disabled={busy} onClick={reject}>
              <X size={16} /> Reject
            </button>
          </div>
        )}
      </div>

      {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: what the request is about */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {payment && <PaymentCard payment={payment} payload={req.payload} />}
          {invoice && <InvoiceCard invoice={invoice} />}
          {targetUser && (
            <Section title="User">
              <dl className="space-y-2 text-sm">
                <Row k="Name">{targetUser.name}</Row>
                <Row k="Email">{targetUser.email}</Row>
                <Row k="Role">{targetUser.role}</Row>
                <Row k="Active">{targetUser.active ? 'Yes' : 'No'}</Row>
              </dl>
            </Section>
          )}
          {order ? <CampaignContext o={order} /> : (!payment && !invoice && !targetUser && (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              The record this request is about no longer exists.
            </div>
          ))}
        </div>

        {/* Right: the request + review */}
        <div className="space-y-6">
          <Section title="Request">
            <dl className="space-y-3 text-sm">
              <Row k="Action">{ACTION_LABEL[req.action] || req.action}</Row>
              <Row k="Reason">{req.reason ? `“${req.reason}”` : '—'}</Row>
              <Row k="Requested by">{req.requestedBy?.name || '—'}{req.requestedBy?.role ? ` · ${req.requestedBy.role}` : ''}</Row>
              <Row k="Requested at"><span className="flex items-center justify-end gap-1"><Clock size={13} /> {fmtDateTime(req.createdAt)}</span></Row>
            </dl>
          </Section>

          {req.payload && !payment && (
            <Section title="Details">
              <PayloadView payload={req.payload} />
            </Section>
          )}

          <div className="rounded-xl border border-slate-200 p-5 bg-slate-50">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">Review</div>
            {req.status === 'PENDING' ? (
              <div className="text-sm text-slate-500">
                This request is awaiting review.
                {!isReviewer && <div className="mt-1 text-xs text-slate-400">Only a Manager or Super Admin can approve or reject it.</div>}
              </div>
            ) : (
              <dl className="space-y-3 text-sm">
                <Row k="Decision"><span className={`badge ${STATUS_STYLE[req.status] || 'bg-slate-100 text-slate-700'}`}>{req.status}</span></Row>
                <Row k="Reviewed by">{req.reviewedBy?.name || '—'}</Row>
                <Row k="Reviewed at">{req.reviewedAt ? fmtDateTime(req.reviewedAt) : '—'}</Row>
                <Row k="Review note">{req.reviewNote ? `“${req.reviewNote}”` : '—'}</Row>
              </dl>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Campaign context ────────────────────────────────────────────────────────
// The whole booking the reviewer is signing off: client, campaign notes, sites,
// printing & mounting, schedule, billing cycle and the money.
function CampaignContext({ o }) {
  const c = o.client || {};
  const live = o.items.filter((i) => !['CANCELLED', 'WAITLIST'].includes(i.status));
  const start = live.length ? live.reduce((a, i) => (new Date(i.startDate) < new Date(a) ? i.startDate : a), live[0].startDate) : null;
  const end = live.length ? live.reduce((a, i) => (new Date(i.endDate) > new Date(a) ? i.endDate : a), live[0].endDate) : null;
  const tax = o.taxCategory === 'GST' ? (o.interState ? 'GST · IGST 18% (inter-state)' : 'GST · CGST 9% + SGST 9%') : 'Non-GST';
  const monitoring = o.monitoring ? ['START', 'MID', 'END'].filter((p) => o[`monitor${PHASE_LABEL[p]}`]) : [];

  return (
    <>
      <Section title={<span className="flex items-center gap-2">{o.orderNo} <Badge status={o.status} /></span>}
        right={(
          <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => downloadFile(`/orders/${o.id}/quotation.docx`, `Quotation-${o.orderNo}.docx`)}>
            <FileText size={14} /> Quotation
          </button>
        )}>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row k="Business">{o.company?.name || '—'}</Row>
          <Row k="Category">{o.category?.name || '—'}</Row>
          <Row k="Booked by">{o.createdBy?.name || '—'}</Row>
          <Row k="Booking date">{fmtDate(o.bookingDate)}</Row>
          <Row k="Campaign period">{start ? `${fmtDate(start)} → ${fmtDate(end)}` : '—'}</Row>
          <Row k="Sites">{live.length}{o.items.length !== live.length ? ` (+${o.items.length - live.length} cancelled/waitlist)` : ''}</Row>
        </div>
        {(o.description || o.notes) && (
          <div className="mt-4 space-y-2">
            {o.description && <Note label="Description">{o.description}</Note>}
            {o.notes && <Note label="Notes">{o.notes}</Note>}
          </div>
        )}
      </Section>

      <Section title={<span className="flex items-center gap-2"><Building2 size={16} /> Client</span>}>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row k="Firm">{c.company || '—'}</Row>
          <Row k="Contact person">{c.name || '—'}</Row>
          <Row k="Phone">{c.phone || '—'}</Row>
          <Row k="Email">{c.email || '—'}</Row>
          <Row k="GSTIN">{c.gstNumber || '—'}</Row>
          <Row k="State">{c.state || '—'}</Row>
        </div>
        {c.address && <div className="mt-3"><Note label="Address">{c.address}</Note></div>}
        {c.contacts?.length > 0 && (
          <div className="mt-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Other contacts</div>
            <ul className="space-y-1">
              {c.contacts.map((ct) => (
                <li key={ct.id} className="text-slate-700">
                  {ct.name}{ct.role ? ` · ${ct.role}` : ''}{ct.phone ? ` · ${ct.phone}` : ''}{ct.email ? ` · ${ct.email}` : ''}
                  {ct.billsTo && <span className="badge bg-sky-100 text-sky-800 ml-1.5 text-[10px]">Bills to</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title={<span className="flex items-center gap-2"><MapPin size={16} /> Sites ({o.items.length})</span>} flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Site</th>
                <th className="px-3 py-2 text-left">Location</th>
                <th className="px-3 py-2 text-left">Size</th>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-right">Days</th>
                <th className="px-3 py-2 text-right">Rate/day</th>
                {o.chargesPerSite && <th className="px-3 py-2 text-right">Print + Mount</th>}
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {o.items.map((it) => (
                <tr key={it.id} className={`border-t border-slate-100 align-top ${['CANCELLED', 'WAITLIST'].includes(it.status) ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-medium text-slate-800">{it.site.code}</div>
                    <div className="flex gap-1 mt-0.5">
                      <span className={`badge text-[10px] ${it.type === 'LOOSE' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-600'}`}>{it.type === 'LOOSE' ? 'Loose' : 'Regular'}</span>
                      <Badge status={it.status} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {it.site.location}
                    <div className="text-[11px] text-slate-400">{[it.site.zone, it.site.type, it.site.light].filter(Boolean).join(' · ')}</div>
                    {it.displayNotes && <div className="text-[11px] text-amber-700 mt-0.5">Note: {it.displayNotes}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{it.site.width && it.site.height ? `${it.site.width}×${it.site.height} ft` : '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(it.startDate)} → {fmtDate(it.endDate)}</td>
                  <td className="px-3 py-2 text-right">{it.days}</td>
                  <td className="px-3 py-2 text-right"><Money value={it.dayRate} /></td>
                  {o.chargesPerSite && <td className="px-3 py-2 text-right whitespace-nowrap"><Money value={it.printCharge} /> + <Money value={it.mountCharge} /></td>}
                  <td className="px-3 py-2 text-right font-medium"><Money value={it.subtotal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid md:grid-cols-2 gap-6">
        <Section title={<span className="flex items-center gap-2"><Printer size={16} /> Printing &amp; mounting</span>}>
          <dl className="space-y-2 text-sm">
            <Row k="Printing partner">{o.printingPartner?.name || '—'}</Row>
            <Row k="Material">{o.printMaterial || '—'}</Row>
            <Row k="Charged">{o.chargesPerSite ? 'Per site (see Sites)' : 'Per print'}</Row>
            {!o.chargesPerSite && <Row k="Prints">{o.noOfPrints ? <>{o.noOfPrints} × <Money value={o.printRate} /></> : '—'}</Row>}
            <Row k="Printing (charged)"><Money value={o.printingTotal} /></Row>
            <Row k="Mounting (charged)"><Money value={o.mountingCost} /></Row>
            {(o.printingTotal || o.mountingCost) > 0 && live.length > 0 && (
              <Row k="Per site">
                <Money value={Math.round(((o.printingTotal || 0) + (o.mountingCost || 0)) / (!o.chargesPerSite && o.noOfPrints > 0 ? o.noOfPrints : live.length))} />
              </Row>
            )}
            {o.printRemarks && <Row k="Print remarks">{o.printRemarks}</Row>}
          </dl>
        </Section>

        <Section title={<span className="flex items-center gap-2"><CalendarClock size={16} /> Billing &amp; schedule</span>}>
          <dl className="space-y-2 text-sm">
            <Row k="Payment terms">{o.paymentTerms === 'POSTPAID' ? 'Postpaid' : 'Advance'}</Row>
            <Row k="Billing cycle">{CYCLE_LABEL[o.billingCycle] || 'One-time'}</Row>
            <Row k="Next bill due">{fmtDate(o.nextBillingDate)}</Row>
            <Row k="Tax">{tax}</Row>
            <Row k="Place of supply">{o.placeOfSupply || '—'}</Row>
            <Row k={<span className="flex items-center gap-1"><Camera size={13} /> Monitoring</span>}>
              {monitoring.length ? monitoring.map((p) => PHASE_LABEL[p]).join(' · ') : 'Not planned'}
            </Row>
          </dl>
          {o.reminders?.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Monitoring reminders</div>
              <ul className="text-sm space-y-1">
                {o.reminders.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span className="text-slate-600">{PHASE_LABEL[r.phase] || r.phase} photos</span>
                    <span className={r.done ? 'text-emerald-600' : 'text-slate-700'}>{fmtDate(r.dueDate)}{r.done ? ' ✓' : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      </div>

      <Section title={<span className="flex items-center gap-2"><Receipt size={16} /> Commercials</span>}>
        <div className="grid md:grid-cols-2 gap-x-8">
          <dl className="space-y-2 text-sm">
            <Row k="Site rental"><Money value={o.rentalSubtotal} /></Row>
            {o.printingTotal > 0 && <Row k="Printing"><Money value={o.printingTotal} /></Row>}
            {o.mountingCost > 0 && <Row k="Mounting"><Money value={o.mountingCost} /></Row>}
            {o.addOns?.map((a) => <Row key={a.id} k={`Add-on · ${a.label}`}><Money value={a.amount} /></Row>)}
            {o.discountAmount > 0 && (
              <Row k={`Discount${o.discountFlat > 0 ? ' (flat)' : ` (${o.discountPct}%)`}${o.discountRemarks ? ` · ${o.discountRemarks}` : ''}`}>
                <span className="text-red-600"><Money value={-o.discountAmount} /></span>
              </Row>
            )}
          </dl>
          <dl className="space-y-2 text-sm mt-2 md:mt-0">
            <Row k="Taxable value"><Money value={o.taxableAmount} /></Row>
            {o.igst > 0 && <Row k="IGST 18%"><Money value={o.igst} /></Row>}
            {o.cgst > 0 && <Row k="CGST 9%"><Money value={o.cgst} /></Row>}
            {o.sgst > 0 && <Row k="SGST 9%"><Money value={o.sgst} /></Row>}
            <Row k={<span className="font-semibold text-slate-800">Grand total</span>}><span className="text-base"><Money value={o.grandTotal} /></span></Row>
            <Row k="Received so far"><span className="text-emerald-700"><Money value={o.amountPaid} /></span></Row>
          </dl>
        </div>
        {o.invoices?.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Invoices</div>
            <ul className="text-sm space-y-1">
              {o.invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-700">{i.invoiceNo} · {fmtDate(i.issuedAt)} <Badge status={i.status} /></span>
                  <span className="font-medium"><Money value={i.total} /></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </>
  );
}

function PaymentCard({ payment, payload }) {
  const p = payload || {};
  return (
    <Section title="Payment">
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <Row k="Current amount"><Money value={payment.amount} /></Row>
        <Row k="Mode">{payment.mode}</Row>
        <Row k="Received on">{fmtDate(payment.receivedAt)}</Row>
        <Row k="Reference">{payment.reference || '—'}</Row>
        {payment.tdsAmount > 0 && <Row k="TDS">{payment.tdsPct}% · <Money value={payment.tdsAmount} /></Row>}
        <Row k="Recorded by">{payment.recordedBy?.name || '—'}</Row>
      </div>
      {Object.keys(p).length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Requested change</div>
          <PayloadView payload={p} />
        </div>
      )}
    </Section>
  );
}

function InvoiceCard({ invoice }) {
  return (
    <Section title="Invoice">
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <Row k="Invoice no.">{invoice.invoiceNo}</Row>
        <Row k="Status"><Badge status={invoice.status} /></Row>
        <Row k="Issued">{fmtDate(invoice.issuedAt)}</Row>
        <Row k="Due">{fmtDate(invoice.dueDate)}</Row>
        <Row k="Taxable"><Money value={invoice.amount} /></Row>
        <Row k="Total"><Money value={invoice.total} /></Row>
      </div>
    </Section>
  );
}

function Section({ title, right, children, flush }) {
  return (
    <div className={`card ${flush ? '' : 'p-5'}`}>
      <div className={`flex items-center justify-between gap-3 ${flush ? 'px-5 pt-5 pb-3' : 'mb-4'}`}>
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Note({ label, children }) {
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{label}</div>
      <div className="text-slate-700 whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function Row({ k, children }) {
  return <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800 text-right min-w-0">{children}</dd></div>;
}
