import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, X, Clock } from 'lucide-react';
import api from '../api';
import { useAuth } from '../auth';
import { Spinner } from '../components/ui';

const ACTION_LABEL = {
  DELETE_ORDER: 'Delete campaign',
  CANCEL_ORDER: 'Cancel campaign',
  DELETE_INVOICE: 'Delete invoice',
  SETTLE_CASH: 'Settle in cash (Non-GST)',
  DISABLE_USER: 'Disable user',
  EDIT_PAYMENT: 'Edit payment',
  OTHER: 'Other',
};

const STATUS_STYLE = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
};

const fmtDateTime = (v) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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
    // There's no single-GET endpoint — fetch all and find the matching request.
    api.get('/approvals')
      .then((r) => {
        const found = (r.data || []).find((x) => String(x.id) === String(id));
        if (found) setReq(found); else setNotFound(true);
      })
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

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <div className="card p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Request</h2>
            <dl className="space-y-3 text-sm">
              <Row k="Action">{ACTION_LABEL[req.action] || req.action}</Row>
              <Row k="Entity">{req.entityType}{req.entityId != null ? ` #${req.entityId}` : ''}</Row>
              <Row k="Label">{req.label || '—'}</Row>
              <Row k="Reason">{req.reason ? `“${req.reason}”` : '—'}</Row>
              <Row k="Requested by">{req.requestedBy?.name || '—'}{req.requestedBy?.role ? ` · ${req.requestedBy.role}` : ''}</Row>
              <Row k="Requested at"><span className="flex items-center justify-end gap-1"><Clock size={13} /> {fmtDateTime(req.createdAt)}</span></Row>
            </dl>
          </div>

          <div className="card p-5 mt-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Details</h2>
            <PayloadView payload={req.payload} />
          </div>
        </div>

        <div>
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

function Row({ k, children }) {
  return <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800 text-right">{children}</dd></div>;
}
