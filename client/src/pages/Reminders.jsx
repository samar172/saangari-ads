import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Spinner } from '../components/ui';

const PHASE_LABEL = { START: 'Start-date photo', MID: 'Mid-date photo', END: 'End-date photo' };

export default function Reminders() {
  const navigate = useNavigate();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('due'); // due | all

  function load() {
    setLoading(true);
    api.get('/reminders', { params: { scope: scope === 'due' ? 'due' : undefined } })
      .then((r) => setReminders(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, [scope]);

  async function markDone(id) {
    await api.post(`/reminders/${id}/done`);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Monitoring Reminders</h1>
          <p className="text-sm text-slate-500">Upload the monitoring photo on each phase's date</p>
        </div>
        <div className="flex gap-2">
          {[['due', 'Due & overdue'], ['all', 'All upcoming']].map(([k, l]) => (
            <button key={k} onClick={() => setScope(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition ${scope === k ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200'}`}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : reminders.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">🎉 Nothing {scope === 'due' ? 'due right now' : 'pending'}.</div>
      ) : (
        <div className="space-y-2">
          {reminders.map((r) => (
            <div key={r.id} className={`card p-4 flex items-center gap-4 ${r.overdue ? 'border-l-4 border-l-red-500' : r.dueToday ? 'border-l-4 border-l-amber-500' : ''}`}>
              <div className="text-2xl">{r.overdue ? '⚠️' : '🔔'}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800">{PHASE_LABEL[r.phase]} — {r.order.orderNo}</div>
                <div className="text-sm text-slate-500">
                  {r.order.client.name} · {r.order.items.map((i) => i.site.code).join(', ')}
                </div>
                <div className={`text-xs mt-0.5 ${r.overdue ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                  Due {new Date(r.dueDate).toLocaleDateString('en-IN')}{r.overdue ? ' · OVERDUE' : r.dueToday ? ' · Today' : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" onClick={() => navigate(`/orders?highlight=${r.order.id}`)}>Open order</button>
                <button className="btn-ghost text-xs" onClick={() => markDone(r.id)}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
