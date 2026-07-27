import { useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import api from '../api';
import { useAuth, can } from '../auth';
import { Spinner } from './ui';

// Site media types (unipole, gantry, kiosk, hoarding, digital…). Each site is
// tagged with one, and the Inventory tabs are driven by this list — so a new
// medium can be introduced any time without a code change. The `code` is what
// sites store, so it is fixed once created; only the label/order/active change.
export default function MediaTypeManager() {
  const { user } = useAuth();
  const editable = can(user, 'manageCategories');
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function load() {
    setLoading(true);
    api.get('/media-types', { params: { all: true } }).then((r) => setTypes(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function add(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true); setErr('');
    try {
      // Default the code from the label if the user didn't type one.
      const finalCode = (code.trim() || label.trim()).toUpperCase().replace(/\s+/g, '_');
      await api.post('/media-types', { code: finalCode, label: label.trim(), sortOrder: types.length });
      setLabel(''); setCode('');
      load();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Could not add media type');
    } finally { setBusy(false); }
  }

  async function toggle(t) {
    setErr('');
    try { await api.patch(`/media-types/${t.id}`, { active: !t.active }); load(); }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not update'); }
  }

  async function rename(t) {
    const next = window.prompt('Rename media type (display label)', t.label);
    if (!next || next === t.label) return;
    setErr('');
    try { await api.patch(`/media-types/${t.id}`, { label: next }); load(); }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not rename'); }
  }

  async function remove(t) {
    const msg = t.siteCount
      ? `${t.label} is used by ${t.siteCount} site(s), so it will be deactivated rather than deleted. Continue?`
      : `Delete "${t.label}"?`;
    if (!window.confirm(msg)) return;
    setErr('');
    try { await api.delete(`/media-types/${t.id}`); load(); }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not delete'); }
  }

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-bold text-slate-800">Media Types</h2>
        <p className="text-sm text-slate-500">
          Drives the Inventory category tabs. Add gantry, digital or any new medium here.
          The code is fixed once created; deactivated types stay on existing sites.
        </p>
      </div>

      {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

      {editable && (
        <form onSubmit={add} className="card p-4 mb-4 flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[200px]" placeholder="New media type — e.g. Digital Screen" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input w-40" placeholder="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-primary flex items-center gap-1.5" disabled={busy || !label.trim()}>{busy ? 'Adding…' : <><Plus size={16} /> Add type</>}</button>
        </form>
      )}

      {loading ? <Spinner /> : (
        <div className="card divide-y divide-slate-100">
          {types.length === 0 && <div className="p-10 text-center text-slate-400">No media types yet</div>}
          {types.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className={`h-2 w-2 rounded-full shrink-0 ${t.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${t.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{t.label} <span className="text-xs font-normal text-slate-400">· {t.code}</span></div>
                <div className="text-xs text-slate-400">{t.siteCount || 0} site{(t.siteCount || 0) === 1 ? '' : 's'}</div>
              </div>
              {editable && (
                <div className="flex flex-wrap gap-1">
                  <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => rename(t)}><Pencil size={12} /> Rename</button>
                  <button className="btn-ghost text-xs" onClick={() => toggle(t)}>{t.active ? 'Deactivate' : 'Reactivate'}</button>
                  <button className="btn-ghost text-xs text-red-600" onClick={() => remove(t)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
