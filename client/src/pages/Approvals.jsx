import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight } from 'lucide-react';
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

// Group requests by their createdAt calendar day, newest day first.
function groupByDay(requests) {
  const groups = new Map();
  for (const r of requests) {
    const d = new Date(r.createdAt);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD, sortable
    const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key).items.push(r);
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

export default function Approvals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isReviewer = user.role === 'MANAGER' || user.role === 'SUPER_ADMIN';
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('PENDING');

  useEffect(() => {
    setLoading(true);
    api.get('/approvals', { params: filter ? { status: filter } : {} })
      .then((r) => setRequests(r.data))
      .finally(() => setLoading(false));
  }, [filter]);

  const days = groupByDay(requests);

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

      {loading ? <Spinner /> : requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-400">No requests</div>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <div key={day.key}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{day.label}</div>
              <div className="card divide-y divide-slate-100">
                {day.items.map((r) => (
                  <button key={r.id} onClick={() => navigate('/approvals/' + r.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{ACTION_LABEL[r.action] || r.action}</span>
                        <span className={`badge text-[10px] ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                      </div>
                      <div className="text-sm text-slate-600 truncate">{r.label || `${r.entityType} #${r.entityId ?? ''}`}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock size={11} /> {new Date(r.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {' · by '}{r.requestedBy?.name}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
