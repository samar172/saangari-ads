import { useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import api from '../api';
import { useAuth, can } from '../auth';
import { Spinner } from '../components/ui';

export default function Categories() {
  const { user } = useAuth();
  const editable = can(user, 'manageCategories');
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function load() {
    setLoading(true);
    api.get('/categories', { params: { all: true } }).then((r) => setCats(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try {
      await api.post('/categories', { name, sortOrder: cats.length });
      setName('');
      load();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Could not add category');
    } finally { setBusy(false); }
  }

  async function toggle(c) {
    setErr('');
    try { await api.patch(`/categories/${c.id}`, { active: !c.active }); load(); }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not update'); }
  }

  async function rename(c) {
    const next = window.prompt('Rename category', c.name);
    if (!next || next === c.name) return;
    setErr('');
    try { await api.patch(`/categories/${c.id}`, { name: next }); load(); }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not rename'); }
  }

  async function remove(c) {
    const used = c._count?.orders || 0;
    const msg = used
      ? `${c.name} is used by ${used} order${used === 1 ? '' : 's'}, so it will be deactivated rather than deleted. Continue?`
      : `Delete "${c.name}"?`;
    if (!window.confirm(msg)) return;
    setErr('');
    try { await api.delete(`/categories/${c.id}`); load(); }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not delete'); }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Booking Categories</h1>
        <p className="text-sm text-slate-500">The dropdown shown on the booking form. Deactivated categories stay on past orders.</p>
      </div>

      {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

      {editable && (
        <form onSubmit={add} className="card p-4 mb-5 flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[220px]" placeholder="New category — e.g. Hospitality" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary flex items-center gap-1.5" disabled={busy || !name.trim()}>{busy ? 'Adding…' : <><Plus size={16} /> Add category</>}</button>
        </form>
      )}

      {loading ? <Spinner /> : (
        <div className="card divide-y divide-slate-100">
          {cats.length === 0 && <div className="p-10 text-center text-slate-400">No categories yet</div>}
          {cats.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`h-2 w-2 rounded-full ${c.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${c.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{c.name}</div>
                <div className="text-xs text-slate-400">{c._count?.orders || 0} order{(c._count?.orders || 0) === 1 ? '' : 's'}</div>
              </div>
              {editable && (
                <div className="flex gap-1">
                  <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => rename(c)}><Pencil size={12} /> Rename</button>
                  <button className="btn-ghost text-xs" onClick={() => toggle(c)}>{c.active ? 'Deactivate' : 'Reactivate'}</button>
                  <button className="btn-ghost text-xs text-red-600" onClick={() => remove(c)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
