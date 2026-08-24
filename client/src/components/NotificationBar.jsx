import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCircle, Camera, Banknote, ListTodo, Plus, Trash2, Check, Megaphone, FileText, Activity } from 'lucide-react';
import api from '../api';

const SEVERITY = {
  critical: { dot: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-50 border-red-200', label: 'Critical' },
  pending: { dot: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-50 border-amber-200', label: 'Pending' },
  info: { dot: 'bg-sky-500', text: 'text-sky-700', chip: 'bg-sky-50 border-sky-200', label: 'Non-critical' },
};

// The four notification categories, in tab order. `attention` counts only the
// severities worth a red badge (critical + pending).
const CATEGORY_TABS = [
  { key: 'CAMPAIGN', label: 'Campaign', icon: Megaphone },
  { key: 'INVOICE', label: 'Invoice', icon: FileText },
  { key: 'PAYMENT', label: 'Payments', icon: Banknote },
  { key: 'MONITORING', label: 'Photos', icon: Camera },
  { key: 'ACTIVITY', label: 'Activity', icon: Activity },
];
const ICON_FOR = { CAMPAIGN: Megaphone, INVOICE: FileText, PAYMENT: Banknote, MONITORING: Camera, ACTIVITY: Activity };

const when = (item) => {
  // Activity items are a log of things that already happened — always "N ago".
  if (item.category === 'ACTIVITY') {
    const then = new Date(item.dueDate); then.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((today - then) / 864e5);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
  }
  if (item.kind === 'PAYMENT') return item.ageDays === 0 ? 'today' : `${item.ageDays}d outstanding`;
  if (item.ageDays != null) return item.ageDays === 0 ? 'today' : `${item.ageDays}d ago`;
  const due = new Date(item.dueDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((due.setHours(0, 0, 0, 0) - today) / 864e5);
  if (days === 0) return 'due today';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `in ${days}d`;
};

export default function NotificationBar({ onCount }) {
  const navigate = useNavigate();
  const [data, setData] = useState({ counts: { critical: 0, pending: 0, info: 0, total: 0 }, byCategory: {}, items: [] });
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('CAMPAIGN'); // one of CATEGORY_TABS keys, or 'notes'
  const ref = useRef(null);

  // Notes state
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

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
    if (open && tab === 'notes') {
      api.get('/notes').then(r => setNotes(r.data)).catch(() => {});
    }
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        if (document.activeElement?.tagName === 'INPUT') {
          document.activeElement.blur();
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const { counts, byCategory, items } = data;
  const catItems = items.filter((i) => i.category === tab);
  const attentionOf = (cat) => (byCategory?.[cat]?.critical || 0) + (byCategory?.[cat]?.pending || 0);

  function go(item) {
    setOpen(false);
    if (item.category === 'INVOICE' && item.invoiceId) navigate(`/invoices/${item.invoiceId}`);
    else if (item.orderId) navigate(`/orders?highlight=${item.orderId}`);
  }

  async function addNote(e) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const { data: created } = await api.post('/notes', { content: newNote });
      setNotes(n => [created, ...n]);
      setNewNote('');
    } catch (err) {
      console.error(err);
    } finally {
      setAddingNote(false);
    }
  }

  async function toggleNote(id, isDone) {
    setNotes(n => n.map(x => x.id === id ? { ...x, isDone } : x));
    try {
      await api.patch(`/notes/${id}`, { isDone });
    } catch (err) {
      setNotes(n => n.map(x => x.id === id ? { ...x, isDone: !isDone } : x));
    }
  }

  async function deleteNote(id) {
    setNotes(n => n.filter(x => x.id !== id));
    try {
      await api.delete(`/notes/${id}`);
    } catch (err) {
      api.get('/notes').then(r => setNotes(r.data));
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-full hover:bg-slate-100 text-slate-600 transition">
        <Bell size={20} />
        {counts.total > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_2px_white]"></span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 z-40" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 transform transition-transform" ref={ref}>
            <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="font-semibold text-slate-800 flex items-center gap-2"><Bell size={16} /> Notifications</div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200 transition shrink-0"><X size={20} /></button>
            </div>

            {/* Category tab bar (Campaign / Invoice / Payments / Photos) + Notes */}
            <div className="flex gap-1 px-2 py-2 border-b border-slate-100 bg-white overflow-x-auto shrink-0">
              {CATEGORY_TABS.map(({ key, label, icon: Icon }) => {
                const att = attentionOf(key);
                const total = byCategory?.[key]?.total || 0;
                const active = tab === key;
                return (
                  <button key={key} onClick={() => setTab(key)}
                    className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition shrink-0 relative ${active ? 'bg-brand text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                    <Icon size={16} />
                    {label}
                    {/* Activity is a log, not a to-do — no count badge for it. */}
                    {total > 0 && key !== 'ACTIVITY' && (
                      <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] leading-4 text-center ${att > 0 ? 'bg-red-500 text-white' : active ? 'bg-white text-brand' : 'bg-slate-200 text-slate-600'}`}>{total}</span>
                    )}
                  </button>
                );
              })}
              <button onClick={() => setTab('notes')}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition shrink-0 ${tab === 'notes' ? 'bg-brand text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                <ListTodo size={16} />
                Notes
              </button>
            </div>

            {tab !== 'notes' && (
              <div className="flex-1 overflow-y-auto bg-white">
                {catItems.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center"><CheckCircle size={24} /></div>
                    Nothing here right now.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {catItems.map((item) => {
                      const sev = SEVERITY[item.severity] || SEVERITY.info;
                      const Icon = ICON_FOR[item.category] || Bell;
                      return (
                        <button key={item.id} onClick={() => go(item)}
                          className="w-full text-left px-4 py-4 hover:bg-slate-50 flex items-start gap-3 transition">
                          <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${sev.dot}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5 mb-1">
                              <Icon size={14} className="text-slate-400 shrink-0" />
                              <span className="truncate">{item.title}</span>
                            </div>
                            <div className="text-xs text-slate-500 leading-tight">{item.detail}</div>
                          </div>
                          <span className={`text-xs font-medium shrink-0 ${sev.text} whitespace-nowrap`}>{when(item)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === 'notes' && (
              <div className="flex flex-col flex-1 overflow-hidden bg-white">
                <form onSubmit={addNote} className="p-3 border-b border-slate-100 shrink-0 flex gap-2">
                  <input
                    type="text"
                    className="input py-1.5 text-sm flex-1"
                    placeholder="Type a new reminder..."
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                  />
                  <button type="submit" disabled={addingNote || !newNote.trim()} className="btn-primary py-1.5 px-3">
                    <Plus size={16} />
                  </button>
                </form>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {notes.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-400">
                      You have no personal notes.
                    </div>
                  ) : (
                    notes.map(note => (
                      <div key={note.id} className={`group flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition ${note.isDone ? 'opacity-50' : ''}`}>
                        <button
                          onClick={() => toggleNote(note.id, !note.isDone)}
                          className={`mt-0.5 shrink-0 h-4 w-4 rounded border flex items-center justify-center transition ${note.isDone ? 'bg-brand border-brand text-white' : 'border-slate-300 text-transparent hover:border-brand'}`}
                        >
                          <Check size={12} />
                        </button>
                        <div className={`flex-1 text-sm ${note.isDone ? 'line-through text-slate-500' : 'text-slate-700'}`}>
                          {note.content}
                        </div>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="shrink-0 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
