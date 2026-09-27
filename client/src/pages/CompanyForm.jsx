import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api from '../api';
import { useCompany } from '../CompanyContext';
import { Spinner } from '../components/ui';

const EMPTY = {
  code: '', name: '', legalName: '', gstin: '', pan: '',
  address: '', phone: '', email: '',
  gstMandatory: false, gstHidden: false,
  brandColor: '', termsAndConditions: '',
};

// Full-page create/edit for a business entity (replaces the Companies modal).
export default function CompanyForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = !!id;
  const { setActiveCompany } = useCompany();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!editing) return;
    api.get('/companies').then((r) => {
      const c = r.data.find((x) => String(x.id) === String(id));
      if (c) setForm({
        code: c.code || '', name: c.name || '', legalName: c.legalName || '',
        gstin: c.gstin || '', pan: c.pan || '', address: c.address || '',
        phone: c.phone || '', email: c.email || '',
        gstMandatory: !!c.gstMandatory, gstHidden: !!c.gstHidden,
        brandColor: c.brandColor || '', termsAndConditions: c.termsAndConditions || '',
      });
    }).finally(() => setLoading(false));
  }, [id, editing]);

  async function save(e) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      if (editing) {
        const { code, ...rest } = form; // Don't send code on update
        await api.patch(`/companies/${id}`, rest);
      } else {
        await api.post('/companies', form);
      }
      // Refresh the active company in context in case it was the one edited.
      const r = await api.get('/companies');
      const saved = localStorage.getItem('activeCompanyId');
      if (saved) setActiveCompany(r.data.find((c) => c.id === Number(saved)) || r.data[0]);
      navigate('/settings/companies');
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/settings/companies')}><ArrowLeft size={16} /> Back</button>
        <h1 className="text-2xl font-bold text-slate-800">{editing ? 'Edit Business Entity' : 'New Business Entity'}</h1>
      </div>

      <form onSubmit={save} className="card p-6 max-w-3xl">
        {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            {!editing && (
              <Field label="System Code (Unique, No spaces)"><input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. SAANGARI_ADS" /></Field>
            )}
            <Field label="Display Name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Legal Name (For Invoices)"><input className="input" value={form.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
            <Field label="GSTIN"><input className="input" value={form.gstin} onChange={(e) => set('gstin', e.target.value)} /></Field>
            <Field label="PAN"><input className="input" value={form.pan} onChange={(e) => set('pan', e.target.value)} /></Field>
            <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Email"><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Address" span><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
          </div>

          <div className="card p-4 bg-slate-50 border-slate-200">
            <div className="font-semibold text-slate-800 text-sm mb-3">Booking Rules</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={form.gstMandatory} onChange={(e) => set('gstMandatory', e.target.checked)} disabled={form.gstHidden} />
                <div>
                  <div className="text-sm font-medium text-slate-700">GST is Mandatory</div>
                  <div className="text-xs text-slate-500">Force 18% GST on all bookings. Hides the Non-GST option.</div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={form.gstHidden} onChange={(e) => set('gstHidden', e.target.checked)} disabled={form.gstMandatory} />
                <div>
                  <div className="text-sm font-medium text-slate-700">Hide GST Option (Non-GST Only)</div>
                  <div className="text-xs text-slate-500">Removes the tax dropdown completely. All bookings are Non-GST.</div>
                </div>
              </label>
            </div>
          </div>

          <div className="card p-4 bg-slate-50 border-slate-200">
            <div className="font-semibold text-slate-800 text-sm mb-1">Sidebar Color</div>
            <div className="text-xs text-slate-500 mb-3">The sidebar uses this color when this business is the active company.</div>
            <div className="flex flex-wrap items-center gap-3">
              <input type="color" className="h-10 w-14 rounded border border-slate-300 cursor-pointer bg-white p-0.5" value={form.brandColor || '#0f172a'} onChange={(e) => set('brandColor', e.target.value)} />
              <input className="input w-36" placeholder="#0f172a" value={form.brandColor} onChange={(e) => set('brandColor', e.target.value)} />
              <div className="flex gap-2">
                {[['#0f172a', 'Blue'], ['#9E2015', 'Maroon'], ['#065f46', 'Green'], ['#1e293b', 'Slate']].map(([hex, label]) => (
                  <button key={hex} type="button" onClick={() => set('brandColor', hex)}
                    className={`h-8 w-8 rounded-full border-2 transition ${form.brandColor?.toLowerCase() === hex.toLowerCase() ? 'border-slate-800 scale-110' : 'border-white shadow'}`}
                    style={{ backgroundColor: hex }} title={label} />
                ))}
              </div>
              {form.brandColor && (
                <button type="button" className="text-xs text-slate-400 underline" onClick={() => set('brandColor', '')}>Reset to default</button>
              )}
            </div>
            <div className="mt-3 h-8 rounded-lg flex items-center px-3 text-white text-xs font-semibold" style={{ backgroundColor: form.brandColor || '#0f172a' }}>
              {form.name || 'Business'} · sidebar preview
            </div>
          </div>

          <div>
            <label className="label">Terms & Conditions (Appended to Quotations)</label>
            <textarea className="input h-40 resize-y" value={form.termsAndConditions} onChange={(e) => set('termsAndConditions', e.target.value)}
              placeholder="1. 50% advance payment required.&#10;2. Prices are exclusive of printing and mounting.&#10;3. Subject to Bikaner jurisdiction." />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={() => navigate('/settings/companies')}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Business'}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, span }) {
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
