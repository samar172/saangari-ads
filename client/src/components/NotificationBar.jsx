import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const SEVERITY = {
  critical: { dot: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-50 border-red-200', label: 'Critical' },
  pending: { dot: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-50 border-amber-200', label: 'Pending' },
  info: { dot: 'bg-sky-500', text: 'text-sky-700', chip: 'bg-sky-50 border-sky-200', label: 'Non-critical' },
};
const ORDER = ['critical', 'pending', 'info'];

const when = (item) => {
  if (item.kind === 'PAYMENT') return item.ageDays === 0 ? 'today' : `${item.ageDays}d outstanding`;
  const due = new Date(item.dueDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((due.setHours(0, 0, 0, 0) - today) / 864e5);
  if (days === 0) return 'due today';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `in ${days}d`;
};

// Always-visible strip summarising what needs attention, on every page.
export default function NotificationBar({ onCount }) {
  const navigate = useNavigate();
  const [data, setData] = useState({ counts: { critical: 0, pending: 0, info: 0, total: 0 }, items: [] });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.get('/notifications').then((r) => {
      if (!alive) return;
      setData(r.data);
      onCount?.(r.data.counts.critical + r.data.counts.pending);
    }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [onCount]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const { counts, items } = data;

  function go(item) {
    setOpen(false);
    navigate(`/orders?highlight=${item.orderId}`);
  }

  if (counts.total === 0) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 flex items-center gap-2">
        <span>✓</span> Nothing needs attention — no pending monitoring or payments.
      </div>
    );
  }

  return (
    <div className="relative mb-4" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm flex items-center gap-4 hover:border-slate-300 transition text-left"
      >
        <span className="text-lg">🔔</span>
        <div className="flex flex-wrap items-center gap-2">
          {ORDER.map((s) => counts[s] > 0 && (
            <span key={s} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${SEVERITY[s].chip} ${SEVERITY[s].text}`}>
              <span className={`h-2 w-2 rounded-full ${SEVERITY[s].dot}`} />
              {counts[s]} {SEVERITY[s].label}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-xs text-slate-400">{open ? 'Hide' : 'View all'} ▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {items.map((item) => {
              const sev = SEVERITY[item.severity];
              return (
                <button key={item.id} onClick={() => go(item)}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${sev.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">
                      {item.kind === 'PAYMENT' ? '💰' : '📷'} {item.title}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{item.detail}</div>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${sev.text}`}>{when(item)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
