import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { ArrowLeft } from 'lucide-react';

const EMPTY_NEW = { code: '', type: '', location: '', zone: '', city: '', light: 'NL', width: '', height: '', sqft: '', monthlyRate: '', dayRate: '', printingCost: '', mountingCost: '', latitude: '', longitude: '', status: 'AVAILABLE' };

// Create a new site — a route page at /inventory/new (was the AddSiteModal).
export default function SiteForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mediaTypes, setMediaTypes] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_NEW, type: params.get('type') || '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get('/media-types').then((r) => {
      setMediaTypes(r.data);
      // Default the media type to the incoming ?type= or the first one.
      setForm((f) => ({ ...f, type: f.type || r.data[0]?.code || '' }));
    }).catch(() => {});
  }, []);

  async function save() {
    setErr('');
    if (!form.code || !form.zone || !form.city || !form.location || !form.type)
      return setErr('Code, media type, location, zone and city are required.');
    setSaving(true);
    try {
      const { data } = await api.post('/sites', form);
      navigate(data?.id ? `/inventory/${data.id}` : '/');
    } catch (e) { setErr(e.response?.data?.error || 'Failed to create site'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Back</button>
        <h1 className="text-2xl font-bold text-slate-800">Add Site</h1>
      </div>

      <div className="card p-5 max-w-3xl">
        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Site Code"><input className="input" placeholder="e.g. U-201" value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
          <Field label="Media Type">
            <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="">Select…</option>
              {mediaTypes.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Location" span><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="Zone"><input className="input" value={form.zone} onChange={(e) => set('zone', e.target.value)} /></Field>
          <Field label="City"><input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="Width (ft)"><input type="number" className="input" value={form.width} onChange={(e) => set('width', e.target.value)} /></Field>
          <Field label="Height (ft)"><input type="number" className="input" value={form.height} onChange={(e) => set('height', e.target.value)} /></Field>
          <Field label="Sq.ft (blank = auto)"><input type="number" className="input" value={form.sqft} onChange={(e) => set('sqft', e.target.value)} /></Field>
          <Field label="Lighting"><input className="input" placeholder="NL / FL / BL" value={form.light} onChange={(e) => set('light', e.target.value)} /></Field>
          <Field label="Monthly Rate (₹)"><input type="number" className="input" value={form.monthlyRate} onChange={(e) => set('monthlyRate', e.target.value)} /></Field>
          <Field label="Day Rate (₹, loose media)"><input type="number" className="input" placeholder="blank = monthly ÷ 30" value={form.dayRate} onChange={(e) => set('dayRate', e.target.value)} /></Field>
          <Field label="Printing Cost (₹)"><input type="number" className="input" value={form.printingCost} onChange={(e) => set('printingCost', e.target.value)} /></Field>
          <Field label="Mounting Cost (₹)"><input type="number" className="input" value={form.mountingCost} onChange={(e) => set('mountingCost', e.target.value)} /></Field>
          <Field label="Latitude"><input type="number" className="input" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} /></Field>
          <Field label="Longitude"><input type="number" className="input" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Create Site'}</button>
        </div>
      </div>
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
