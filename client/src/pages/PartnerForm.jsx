import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth, can } from '../auth';
import { Spinner } from '../components/ui';
import { MaterialsPanel } from './PartnerDetail';

const empty = { name: '', contact: '', phone: '', email: '', address: '', gstin: '', machines: '', ratePerSqft: '', notes: '' };

// Create / edit a printing partner (full page). On edit, its materials can be
// managed inline. Routes: /printing-partners/new and /printing-partners/:id/edit.
export default function PartnerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const editing = !!id;
  const [form, setForm] = useState(empty);
  const [partner, setPartner] = useState(null); // full record (for MaterialsPanel) when editing
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function reload() {
    return api.get(`/printing-partners/${id}`).then((r) => {
      setPartner(r.data);
      setForm({ ...empty, ...r.data, ratePerSqft: r.data.ratePerSqft || '' });
    });
  }
  useEffect(() => {
    if (editing) reload().catch(() => navigate('/printing-partners')).finally(() => setLoading(false));
  }, [id]);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (editing) { await api.patch(`/printing-partners/${id}`, form); navigate(`/printing-partners/${id}`); }
      else { const r = await api.post('/printing-partners', form); navigate(`/printing-partners/${r.data.id}`); }
    } catch (e2) { setErr(e2.response?.data?.error || 'Failed to save'); setBusy(false); }
  }

  if (!can(user, 'managePartners')) return <div className="text-sm text-slate-500">You don't have permission to manage printing partners.</div>;
  if (loading) return <Spinner />;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate(editing ? `/printing-partners/${id}` : '/printing-partners')}>← Back</button>
        <h1 className="text-2xl font-bold text-slate-800">{editing ? 'Edit Partner' : 'New Printing Partner'}</h1>
      </div>

      <form onSubmit={save} className="card p-5 space-y-3">
        {err && <div className="text-sm text-red-600">{err}</div>}
        <input className="input" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="Contact person" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          <input className="input" placeholder="Machines / equipment" value={form.machines} onChange={(e) => setForm({ ...form, machines: e.target.value })} />
        </div>
        <div>
          <input type="number" className="input" placeholder="Default cost rate per sq.ft (₹)" value={form.ratePerSqft} onChange={(e) => setForm({ ...form, ratePerSqft: e.target.value })} />
          <div className="text-[11px] text-slate-400 mt-1">Fallback ₹/sqft we pay this partner. Per-material rates below override it (White Base ₹5.5, Black Base ₹7.5).</div>
        </div>
        <input className="input" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save Partner'}</button>
      </form>

      {/* Materials: manageable once the partner exists. */}
      <div className="mt-4">
        {editing && partner ? (
          <MaterialsPanel partner={partner} editable onChanged={reload} />
        ) : (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-500">
            Save the partner first, then reopen <span className="font-medium text-slate-600">Edit</span> to add its printing materials &amp; rates.
          </div>
        )}
      </div>
    </div>
  );
}
