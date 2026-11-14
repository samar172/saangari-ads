import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api from '../api';
import { useCompany } from '../CompanyContext';
import { Spinner } from '../components/ui';
import RatesSetup, { withSettingDefaults } from '../components/RatesSetup';

const EMPTY = {
  code: '', name: '', legalName: '', gstin: '', pan: '',
  address: '', phone: '', email: '',
  gstMandatory: false, gstHidden: false,
  brandColor: '', termsAndConditions: '',
  bankAccounts: [],
  settings: withSettingDefaults(null),
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
  // Bill header image (uploaded straight away, separate from the form save).
  const [header, setHeader] = useState({ url: null, busy: false, err: '' });

  async function uploadHeader(file) {
    if (!file) return;
    setHeader((h) => ({ ...h, busy: true, err: '' }));
    const fd = new FormData(); fd.append('image', file);
    try { const { data } = await api.post(`/companies/${id}/bill-header`, fd); setHeader({ url: data.billHeaderUrl, busy: false, err: '' }); }
    catch (e) { setHeader((h) => ({ ...h, busy: false, err: e.response?.data?.error || 'Upload failed' })); }
  }
  async function removeHeader() {
    setHeader((h) => ({ ...h, busy: true, err: '' }));
    try { await api.delete(`/companies/${id}/bill-header`); setHeader({ url: null, busy: false, err: '' }); }
    catch (e) { setHeader((h) => ({ ...h, busy: false, err: e.response?.data?.error || 'Could not remove' })); }
  }

  useEffect(() => {
    if (!editing) return;
    api.get('/companies').then((r) => {
      const c = r.data.find((x) => String(x.id) === String(id));
      if (c) setHeader({ url: c.billHeaderUrl || null, busy: false, err: '' });
      if (c) setForm({
        code: c.code || '', name: c.name || '', legalName: c.legalName || '',
        gstin: c.gstin || '', pan: c.pan || '', address: c.address || '',
        phone: c.phone || '', email: c.email || '',
        gstMandatory: !!c.gstMandatory, gstHidden: !!c.gstHidden,
        brandColor: c.brandColor || '', termsAndConditions: c.termsAndConditions || '',
        // Several accounts can be printed on bills; an older single account
        // becomes the first entry.
        bankAccounts: Array.isArray(c.bankAccounts) && c.bankAccounts.length ? c.bankAccounts
          : (c.bankAccountNo ? [{ id: 'legacy', label: c.bankName || '', bankName: c.bankName || '', accountNo: c.bankAccountNo, branchIfsc: c.bankBranchIfsc || '' }] : []),
        settings: withSettingDefaults(c.settings),
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
            <Field label="Address (printed as 'Bill From' — one line per row)" span>
              <textarea className="input h-20 resize-y" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
          </div>

          {editing && (
            <div className="card p-4 bg-slate-50 border-slate-200">
              <div className="font-semibold text-slate-800 text-sm mb-1">Bill Header</div>
              <div className="text-xs text-slate-500 mb-3">
                Printed at the top of this business's bills (Excel and PDF). PNG or JPG, wide like a letterhead banner.
                {!header.url && (form.gstMandatory ? ' Until you upload one, GST bills use the Saangari letterhead.' : ' Until you upload one, bills keep a blank band at the top.')}
              </div>
              {header.url
                ? <img src={header.url} alt="Bill header" className="w-full max-h-32 object-contain rounded border border-slate-200 bg-white" />
                : <div className="rounded border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-400">{form.gstMandatory ? 'Using the default Saangari letterhead' : 'No header'}</div>}
              <div className="flex flex-wrap gap-2 mt-3">
                <label className={`btn-ghost text-xs cursor-pointer ${header.busy ? 'opacity-50 pointer-events-none' : ''}`}>
                  {header.busy ? 'Working…' : header.url ? 'Replace header' : 'Upload header'}
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { uploadHeader(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {header.url && <button type="button" className="btn-ghost text-xs text-red-600" disabled={header.busy} onClick={removeHeader}>Remove</button>}
              </div>
              {header.err && <div className="text-xs text-red-600 mt-2">{header.err}</div>}
            </div>
          )}

          <div className="card p-4 bg-slate-50 border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-slate-800 text-sm">Bank Accounts</div>
              <button type="button" className="text-xs text-brand-light font-medium"
                onClick={() => set('bankAccounts', [...form.bankAccounts, { id: '', label: '', bankName: '', accountNo: '', branchIfsc: '' }])}>+ Add account</button>
            </div>
            <div className="text-xs text-slate-500 mb-3">Printed on GST bills under "Company's Bank Details". When there is more than one, you pick the account on each bill.</div>
            {form.bankAccounts.length === 0 && <div className="text-xs text-slate-400">No bank account yet.</div>}
            <div className="space-y-3">
              {form.bankAccounts.map((a, i) => {
                const upd = (k, v) => set('bankAccounts', form.bankAccounts.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
                return (
                  <div key={i} className="grid sm:grid-cols-[1fr_1fr_1.3fr_auto] gap-2 items-end">
                    <Field label="Bank Name"><input className="input" value={a.bankName} onChange={(e) => upd('bankName', e.target.value)} placeholder="ICICI Bank" /></Field>
                    <Field label="A/C No."><input className="input" value={a.accountNo} onChange={(e) => upd('accountNo', e.target.value)} /></Field>
                    <Field label="Branch & IFSC"><input className="input" value={a.branchIfsc} onChange={(e) => upd('branchIfsc', e.target.value)} placeholder="ICIC0006701 (Rau Bichwal)" /></Field>
                    <button type="button" className="text-slate-400 hover:text-red-600 px-2 pb-2" title="Remove"
                      onClick={() => set('bankAccounts', form.bankAccounts.filter((_, j) => j !== i))}>&times;</button>
                  </div>
                );
              })}
            </div>
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
            <div className="text-sm font-semibold text-slate-800 mb-2">Rates &amp; defaults</div>
            <RatesSetup value={form.settings} onChange={(v) => set('settings', v)} gstLocked={form.gstMandatory || form.gstHidden} />
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
