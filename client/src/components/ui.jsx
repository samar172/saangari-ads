import { useEffect } from 'react';

const STATUS_COLORS = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  BOOKED: 'bg-red-100 text-red-800 border-red-300',
  TENTATIVE: 'bg-amber-100 text-amber-800 border-amber-300',
  MAINTENANCE: 'bg-slate-200 text-slate-700 border-slate-300',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  LIVE: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-slate-100 text-slate-700',
  CANCELLED: 'bg-red-100 text-red-800',
  WAITLIST: 'bg-purple-100 text-purple-800',
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT: 'bg-blue-100 text-blue-800',
  PAID: 'bg-emerald-100 text-emerald-800',
};

export function Badge({ status, children }) {
  return <span className={`badge ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-700'}`}>{children || status}</span>;
}

export function Money({ value }) {
  return <>₹{Number(value || 0).toLocaleString('en-IN')}</>;
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} mt-10`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="flex justify-center p-10"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" /></div>;
}

export function StatTile({ label, value, sub, accent }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent || 'text-slate-800'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
