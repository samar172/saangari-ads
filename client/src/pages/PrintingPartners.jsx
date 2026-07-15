import { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Phone, Mail, MapPin } from 'lucide-react';
import { useAuth, can } from '../auth';
import { Modal, Spinner } from '../components/ui';

const empty = { name: '', contact: '', phone: '', email: '', address: '', ratePerSqft: '', notes: '' };

export default function PrintingPartners() {
  const { user } = useAuth();
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function load() { setLoading(true); api.get('/printing-partners').then((r) => setPartners(r.data)).finally(() => setLoading(false)); }
  useEffect(load, []);

  function openNew() { setForm(empty); setEditId(null); setErr(''); setOpen(true); }
  function openEdit(p) { setForm({ ...empty, ...p, ratePerSqft: p.ratePerSqft || '' }); setEditId(p.id); setErr(''); setOpen(true); }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (editId) await api.patch(`/printing-partners/${editId}`, form);
      else await api.post('/printing-partners', form);
      setOpen(false); load();
    } catch (e2) { setErr(e2.response?.data?.error || 'Failed to save'); }
    finally { setBusy(false); }
  }

  async function toggleActive(p) {
    await api.patch(`/printing-partners/${p.id}`, { active: !p.active });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Printing Partners</h1>
          <p className="text-sm text-slate-500">Vendors used for flex printing &amp; mounting</p>
        </div>
        {can(user, 'managePartners') && <button className="btn-accent flex items-center gap-1.5" onClick={openNew}><Plus size={16} /> Add Partner</button>}
      </div>

      {loading ? <Spinner /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map((p) => (
            <div key={p.id} className={`card p-4 ${!p.active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="font-semibold text-slate-800">{p.name}</div>
                {p.ratePerSqft > 0 && <span className="badge bg-brand/10 text-brand">₹{p.ratePerSqft}/sqft</span>}
              </div>
              {p.contact && <div className="text-sm text-slate-600 mt-1">{p.contact}</div>}
              {p.phone && <div className="text-sm text-slate-500">📞 {p.phone}</div>}
              {p.email && <div className="text-sm text-slate-500">✉ {p.email}</div>}
              {p.address && <div className="text-xs text-slate-400 mt-1">{p.address}</div>}
              <div className="text-xs text-slate-400 mt-2">{p._count?.orders || 0} order(s)</div>
              {can(user, 'managePartners') && (
                <div className="flex gap-2 mt-3">
                  <button className="btn-ghost text-xs" onClick={() => openEdit(p)}>Edit</button>
                  <button className="btn-ghost text-xs" onClick={() => toggleActive(p)}>{p.active ? 'Deactivate' : 'Activate'}</button>
                </div>
              )}
            </div>
          ))}
          {partners.length === 0 && <div className="text-slate-400 text-sm">No printing partners yet.</div>}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Partner' : 'New Printing Partner'}>
        <form onSubmit={save} className="space-y-3">
          {err && <div className="text-sm text-red-600">{err}</div>}
          <input className="input" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Contact person" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input type="number" className="input" placeholder="Rate per sq.ft (₹)" value={form.ratePerSqft} onChange={(e) => setForm({ ...form, ratePerSqft: e.target.value })} />
          <input className="input" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save Partner'}</button>
        </form>
      </Modal>
    </div>
  );
}
