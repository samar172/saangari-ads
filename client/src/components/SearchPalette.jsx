import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, User, ClipboardList, Receipt, MapPin } from 'lucide-react';
import api from '../api';

const EMPTY = { clients: [], orders: [], invoices: [], sites: [] };
const LABELS = { client: 'Clients', order: 'Campaigns', invoice: 'Invoices', site: 'Sites' };

// App-wide command palette. Opens on Cmd/Ctrl+K or a window 'open-search' event
// (so a header button can trigger it). Searches clients, campaigns, invoices and
// sites; arrow keys + Enter to open, click to open, Esc/backdrop to close.
export default function SearchPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); } };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-search', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-search', onOpen); };
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setRes(EMPTY); setActive(0); setTimeout(() => inputRef.current?.focus(), 40); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setRes(EMPTY); return; }
      setLoading(true);
      api.get('/search', { params: { q } }).then((r) => setRes(r.data)).catch(() => setRes(EMPTY)).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  // Flatten (in group order) for keyboard navigation.
  const items = [
    ...res.clients.map((c) => ({ type: 'client', id: c.id, primary: c.company || c.name, secondary: [c.company ? c.name : null, c.phone].filter(Boolean).join(' · '), route: `/clients/${c.id}`, Icon: User })),
    ...res.orders.map((o) => ({ type: 'order', id: o.id, primary: o.orderNo, secondary: [o.client, o.status].filter(Boolean).join(' · '), route: `/orders/${o.id}`, Icon: ClipboardList })),
    ...res.invoices.map((i) => ({ type: 'invoice', id: i.id, primary: i.invoiceNo, secondary: `${i.client} · ₹${Number(i.total || 0).toLocaleString('en-IN')}`, route: `/invoices/${i.id}`, Icon: Receipt })),
    ...res.sites.map((s) => ({ type: 'site', id: s.id, primary: s.code, secondary: [s.location, s.zone].filter(Boolean).join(' · '), route: `/inventory/${s.id}`, Icon: MapPin })),
  ];

  function go(item) { if (!item) return; setOpen(false); navigate(item.route); }

  function onKeyDown(e) {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
  }

  if (!open) return null;
  const short = q.trim().length < 2;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/40 flex items-start justify-center pt-24 px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 border-b border-slate-100">
          <Search size={18} className="text-slate-400" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search clients, campaigns, invoices, sites…" className="flex-1 py-3.5 text-sm outline-none bg-transparent" />
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {short ? (
            <div className="p-8 text-center text-sm text-slate-400">Type to search…</div>
          ) : loading && items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Searching…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No results for “{q}”.</div>
          ) : (
            items.map((it, i) => {
              const showHeader = i === 0 || items[i - 1].type !== it.type;
              const Icon = it.Icon;
              return (
                <div key={it.type + it.id}>
                  {showHeader && <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{LABELS[it.type]}</div>}
                  <button onMouseEnter={() => setActive(i)} onClick={() => go(it)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition ${i === active ? 'bg-brand/5' : 'hover:bg-slate-50'}`}>
                    <Icon size={16} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{it.primary}</div>
                      {it.secondary && <div className="text-xs text-slate-500 truncate">{it.secondary}</div>}
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 flex gap-3">
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
