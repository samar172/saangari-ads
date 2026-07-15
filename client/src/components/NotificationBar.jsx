import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCircle, Camera, Banknote, ListTodo, Plus, Trash2, Check } from 'lucide-react';
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

export default function NotificationBar({ onCount }) {
  const navigate = useNavigate();
  const [data, setData] = useState({ counts: { critical: 0, pending: 0, info: 0, total: 0 }, items: [] });
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('alerts'); // 'alerts' | 'notes'
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
        // Prevent closing the whole sidebar if just leaving an input, but close it on plain esc
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

  const { counts, items } = data;

  function go(item) {
    setOpen(false);
    navigate(`/orders?highlight=${item.orderId}`);
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
    // optimistic update
    setNotes(n => n.map(x => x.id === id ? { ...x, isDone } : x));
    try {
      await api.patch(`/notes/${id}`, { isDone });
    } catch (err) {
      // revert on fail
      setNotes(n => n.map(x => x.id === id ? { ...x, isDone: !isDone } : x));
    }
  }

  async function deleteNote(id) {
    setNotes(n => n.filter(x => x.id !== id));
    try {
      await api.delete(`/notes/${id}`);
    } catch (err) {
      api.get('/notes').then(r => setNotes(r.data)); // reload on fail
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
              <div className="flex gap-1 bg-slate-200/50 p-1 rounded-lg">
                <button 
                  onClick={() => setTab('alerts')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition flex items-center gap-1.5 ${tab === 'alerts' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Bell size={14} /> Alerts
                  {counts.total > 0 && <span className="ml-1 rounded-full bg-red-100 text-red-600 px-1.5 py-0.5 text-[10px] leading-none">{counts.total}</span>}
                </button>
                <button 
                  onClick={() => setTab('notes')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition flex items-center gap-1.5 ${tab === 'notes' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <ListTodo size={14} /> Notes
                </button>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200 transition shrink-0"><X size={20} /></button>
            </div>
            
            {tab === 'alerts' && (
              <>
                {counts.total === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500 flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center"><CheckCircle size={24} /></div>
                    Nothing needs attention right now.
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 p-3 border-b border-slate-100 bg-white shrink-0">
                      {ORDER.map((s) => counts[s] > 0 && (
                        <span key={s} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${SEVERITY[s].chip} ${SEVERITY[s].text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY[s].dot}`} />
                          {counts[s]} {SEVERITY[s].label}
                        </span>
                      ))}
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
                      {items.map((item) => {
                        const sev = SEVERITY[item.severity];
                        return (
                          <button key={item.id} onClick={() => go(item)}
                            className="w-full text-left px-4 py-4 hover:bg-slate-50 flex items-start gap-3 transition">
                            <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${sev.dot}`} />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5 mb-1">
                                {item.kind === 'PAYMENT' ? <Banknote size={14} className="text-slate-400" /> : <Camera size={14} className="text-slate-400" />}
                                <span className="truncate">{item.title}</span>
                              </div>
                              <div className="text-xs text-slate-500 leading-tight">{item.detail}</div>
                            </div>
                            <span className={`text-xs font-medium shrink-0 ${sev.text} whitespace-nowrap`}>{when(item)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === 'notes' && (
              <div className="flex flex-col h-full overflow-hidden bg-white">
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
