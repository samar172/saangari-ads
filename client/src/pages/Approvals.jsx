import { useEffect, useState } from 'react';
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

export default function Approvals() {
  const { user } = useAuth();
  const isReviewer = user.role === 'MANAGER' || user.role === 'SUPER_ADMIN';
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('PENDING');
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');

  function load() {
    setLoading(true);
    api.get('/approvals', { params: filter ? { status: filter } : {} })
      .then((r) => setRequests(r.data))
      .finally(() => setLoading(false));
  }
  useEffect(load, [filter]);

  async function act(id, kind) {
    setBusyId(id); setErr('');
    try { await api.post(`/approvals/${id}/${kind}`); load(); }
    catch (e) { setErr(e.response?.data?.error || 'Action failed'); }
    finally { setBusyId(null); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Approvals</h1>
          <p className="text-sm text-slate-500">
            {isReviewer ? 'Review and approve sensitive requests from the team.' : 'Your requests and their status.'}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 p-1">
          {['PENDING', 'APPROVED', 'REJECTED', ''].map((s) => (
            <button key={s || 'ALL'} onClick={() => setFilter(s)}
              className={`px-3 py-1 text-sm rounded-md ${filter === s ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All'}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

      {loading ? <Spinner /> : requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-400">No requests</div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{ACTION_LABEL[r.action] || r.action}</span>
                  <span className={`badge text-[10px] ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                </div>
                <div className="text-sm text-slate-600">{r.label || `${r.entityType} #${r.entityId ?? ''}`}</div>
                {r.reason && <div className="text-xs text-slate-400 mt-0.5">“{r.reason}”</div>}
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                  <Clock size={11} /> {new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · by '}{r.requestedBy?.name}
                  {r.reviewedBy && ` · reviewed by ${r.reviewedBy.name}`}
                </div>
              </div>
              {isReviewer && r.status === 'PENDING' && (
                <div className="flex gap-2">
                  <button className="btn-primary text-xs flex items-center gap-1" disabled={busyId === r.id} onClick={() => act(r.id, 'approve')}><Check size={14} /> Approve</button>
                  <button className="btn-ghost text-xs flex items-center gap-1 text-red-600" disabled={busyId === r.id} onClick={() => act(r.id, 'reject')}><X size={14} /> Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
