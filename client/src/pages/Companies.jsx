import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api';
import { useAuth, can } from '../auth';
import { useCompany } from '../CompanyContext';
import { Modal, Spinner } from '../components/ui';

const EMPTY = {
  code: '', name: '', legalName: '', gstin: '', pan: '',
  address: '', phone: '', email: '',
  gstMandatory: false, gstHidden: false,
  termsAndConditions: ''
};

export default function Companies() {
  const { user } = useAuth();
  const { setActiveCompany } = useCompany();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function load() {
    setLoading(true);
    api.get('/companies').then((r) => setCompanies(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  function startCreate() {
    setForm(EMPTY);
    setEditing('new');
    setErr('');
  }

  function startEdit(c) {
    setForm({
      code: c.code || '', name: c.name || '', legalName: c.legalName || '',
      gstin: c.gstin || '', pan: c.pan || '', address: c.address || '',
      phone: c.phone || '', email: c.email || '',
      gstMandatory: !!c.gstMandatory, gstHidden: !!c.gstHidden,
      termsAndConditions: c.termsAndConditions || ''
    });
    setEditing(c.id);
    setErr('');
  }

  async function save() {
    setSaving(true);
    setErr('');
    try {
      if (editing === 'new') {
        await api.post('/companies', form);
      } else {
        const { code, ...rest } = form; // Don't send code on update
        await api.patch(`/companies/${editing}`, rest);
      }
      setEditing(null);
      await load();
      // Reload active company in context in case it was edited
      const r = await api.get('/companies');
      const saved = localStorage.getItem('activeCompanyId');
      if (saved) setActiveCompany(r.data.find(c => c.id === Number(saved)) || r.data[0]);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Business Setup</h1>
          <p className="text-sm text-slate-500">Manage business entities, GST, and terms & conditions</p>
        </div>
        {can(user, 'manageCompanies') && <button className="btn-accent text-sm flex items-center gap-1.5" onClick={startCreate}><Plus size={16} /> New Business</button>}
      </div>

      {loading ? <Spinner /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => (
            <div key={c.id} className="card p-5 hover:border-brand/30 transition cursor-pointer" onClick={() => startEdit(c)}>
              <div className="flex items-start justify-between mb-2">
                <div className="font-bold text-lg text-slate-800">{c.name}</div>
                <div className="text-xs uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-semibold">{c.code}</div>
              </div>
              <div className="text-sm text-slate-600 mb-4">{c.legalName || 'No legal name set'}</div>
              <div className="space-y-1 text-xs text-slate-500 mb-4">
                {c.gstin && <div>GSTIN: <span className="font-medium text-slate-700">{c.gstin}</span></div>}
                {c.pan && <div>PAN: <span className="font-medium text-slate-700">{c.pan}</span></div>}
              </div>
              <div className="flex gap-2">
                {c.gstMandatory && <span className="badge bg-blue-50 text-blue-700 text-[10px]">GST Mandatory</span>}
                {c.gstHidden && <span className="badge bg-amber-50 text-amber-700 text-[10px]">GST Hidden</span>}
                {c.termsAndConditions && <span className="badge bg-emerald-50 text-emerald-700 text-[10px]">T&C Configured</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New Business Entity' : 'Edit Business Entity'} wide>
        {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
        
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            {editing === 'new' && (
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

          <div>
            <label className="label">Terms & Conditions (Appended to Quotations)</label>
            <textarea 
              className="input h-40 resize-y" 
              value={form.termsAndConditions} 
              onChange={(e) => set('termsAndConditions', e.target.value)}
              placeholder="1. 50% advance payment required.&#10;2. Prices are exclusive of printing and mounting.&#10;3. Subject to Bikaner jurisdiction."
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Business'}</button>
        </div>
      </Modal>
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
