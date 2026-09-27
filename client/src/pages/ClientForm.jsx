import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth, can } from '../auth';
import { Spinner } from '../components/ui';

const EMPTY_CLIENT = {
  name: '', phone: '', email: '', company: '', gstNumber: '',
  taxCategory: 'NON_GST', state: 'Rajasthan', address: '', categoryId: '',
};

// Create or edit a client on its own page. Category is the point of this form:
// it decides which bucket every future booking for this client lands in.
export default function ClientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = !!id;
  const canEdit = !isEdit || can(user, 'manageLedger') || can(user, 'manageCategories');

  const [form, setForm] = useState(EMPTY_CLIENT);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { api.get('/categories').then((r) => setCategories(r.data)); }, []);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    api.get(`/clients/${id}`).then((r) => {
      const c = r.data;
      setForm({
        name: c.name || '', phone: c.phone || '', email: c.email || '',
        company: c.company || '', gstNumber: c.gstNumber || '',
        taxCategory: c.taxCategory || 'NON_GST', state: c.state || 'Rajasthan',
        address: c.address || '', categoryId: c.categoryId ? String(c.categoryId) : '',
      });
    }).catch(() => navigate('/clients')).finally(() => setLoading(false));
  }, [id, isEdit, navigate]);

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) { setErr('Name and phone are required'); return; }
    setSaving(true); setErr('');
    try {
      let savedId = id;
      if (isEdit) await api.patch(`/clients/${id}`, form);
      else { const r = await api.post('/clients', form); savedId = r.data.id; }
      navigate(`/clients/${savedId}`);
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not save client');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate(isEdit ? `/clients/${id}` : '/clients')}>← Back</button>
        <h1 className="text-2xl font-bold text-slate-800">{isEdit ? `Edit ${form.name || 'Client'}` : 'New Client'}</h1>
      </div>

      <div className="card p-6 max-w-3xl">
        {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
        {!canEdit && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            Your role may not be allowed to save changes to an existing client.
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label">Phone * (unique)</label>
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Category</label>
            <select className="input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Uncategorised</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Every booking for this client is filed under this category. Manage the list in Business Setup → Client Categories.
            </p>
          </div>
          <div>
            <label className="label">Company</label>
            <input className="input" value={form.company} onChange={(e) => set('company', e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div>
            <label className="label">Tax Category</label>
            <select className="input" value={form.taxCategory} onChange={(e) => set('taxCategory', e.target.value)}>
              <option value="NON_GST">Non-GST</option>
              <option value="GST">GST</option>
            </select>
          </div>
          <div>
            <label className="label">GSTIN</label>
            <input className="input" value={form.gstNumber} onChange={(e) => set('gstNumber', e.target.value)} />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} />
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-ghost" onClick={() => navigate(isEdit ? `/clients/${id}` : '/clients')}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Client'}</button>
        </div>
      </div>
    </div>
  );
}
