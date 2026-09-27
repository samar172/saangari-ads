import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth, can } from '../auth';
import { Badge, Money, Spinner } from '../components/ui';
import { MapPin, RefreshCw, Camera, Pencil, Check, ArrowLeft } from 'lucide-react';

const EMPTY_EDIT = { type: '', location: '', zone: '', city: '', light: '', width: '', height: '', sqft: '', monthlyRate: '', dayRate: '', printingCost: '', mountingCost: '', latitude: '', longitude: '', status: 'AVAILABLE' };

// Full site view + inline edit — a route page at /inventory/:id (was a modal on
// the inventory grid). Keeps edit, image upload, hold/release, bookings, photos.
export default function SiteDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [full, setFull] = useState(null);
  const [mediaTypes, setMediaTypes] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function load() { return api.get(`/sites/${id}`).then((r) => setFull(r.data)); }
  useEffect(() => { setFull(null); setEditing(false); setErr(''); load().catch(() => navigate('/')); }, [id]);
  useEffect(() => { api.get('/media-types').then((r) => setMediaTypes(r.data)).catch(() => {}); }, []);

  function startEdit() {
    setForm({
      type: full.type ?? '',
      location: full.location ?? '', zone: full.zone ?? '', city: full.city ?? '', light: full.light ?? '',
      width: full.width ?? '', height: full.height ?? '', sqft: full.sqft ?? '', monthlyRate: full.monthlyRate ?? '',
      dayRate: full.dayRate ?? '',
      printingCost: full.printingCost ?? '', mountingCost: full.mountingCost ?? '',
      latitude: full.latitude ?? '', longitude: full.longitude ?? '', status: full.status ?? 'AVAILABLE',
    });
    setErr(''); setEditing(true);
  }

  async function save() {
    setSaving(true); setErr('');
    try { await api.patch(`/sites/${id}`, form); await load(); setEditing(false); }
    catch (e) { setErr(e.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function uploadImage(file) {
    if (!file) return;
    setSaving(true); setErr('');
    const fd = new FormData(); fd.append('image', file);
    try { await api.post(`/sites/${id}/image`, fd); await load(); }
    catch (e) { setErr(e.response?.data?.error || 'Image upload failed'); }
    finally { setSaving(false); }
  }

  async function toggleHold() {
    setSaving(true); setErr('');
    const held = full.status === 'HOLD';
    try {
      if (held) await api.post(`/sites/${id}/release`);
      else await api.post(`/sites/${id}/hold`, {});
      await load();
    } catch (e) { setErr(e.response?.data?.error || 'Could not update hold'); }
    finally { setSaving(false); }
  }

  const active = full?.bookings?.find((b) => ['CONFIRMED', 'LIVE', 'TENTATIVE'].includes(b.status));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/')}><ArrowLeft size={16} /> Back</button>
        <h1 className="text-2xl font-bold text-slate-800">{full ? `${full.code} — ${full.type}` : 'Site'}</h1>
      </div>

      {!full ? <Spinner /> : (
        <div className="card p-5">
          {/* Image header */}
          <div className="relative h-40 rounded-lg overflow-hidden mb-4 bg-slate-100">
            {full.imageUrl ? (
              <img src={full.imageUrl} alt={full.code} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand to-brand-light text-white">
                <div className="text-center flex flex-col items-center">
                  <MapPin size={36} className="mb-1" />
                  <div className="text-xs opacity-80">No site photo</div>
                </div>
              </div>
            )}
            {can(user, 'manageSites') && (
              <label className="absolute bottom-2 right-2 btn-ghost text-xs cursor-pointer flex items-center gap-1.5 bg-white/90 hover:bg-white text-slate-800 shadow-sm border border-slate-200">
                {full.imageUrl ? <><RefreshCw size={14} /> Replace photo</> : <><Camera size={14} /> Add photo</>}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e.target.files[0])} />
              </label>
            )}
          </div>

          {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

          {editing ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Media Type">
                <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
                  {!mediaTypes.some((m) => m.code === form.type) && form.type && <option value={form.type}>{form.type}</option>}
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
              <Field label="Status">
                <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {['AVAILABLE', 'TENTATIVE', 'BOOKED', 'HOLD', 'MAINTENANCE'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2 flex gap-2 mt-1">
                <button className="btn-primary flex items-center gap-1.5" disabled={saving} onClick={save}>{saving ? 'Saving…' : <><Check size={16} /> Save changes</>}</button>
                <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Site Details</div>
                  {can(user, 'manageSites') && <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={startEdit}><Pencil size={12} /> Edit</button>}
                </div>
                <dl className="space-y-2 text-sm">
                  <Row k="Status"><Badge status={full.status} /></Row>
                  <Row k="Location">{full.location}</Row>
                  <Row k="Zone / City">{full.zone} · {full.city}</Row>
                  <Row k="Size">{full.width} × {full.height} ft ({full.sqft} sq.ft)</Row>
                  <Row k="Lighting">{full.light}</Row>
                  <Row k="Monthly Rate"><Money value={full.monthlyRate} /> {full.gstOnRate && <span className="text-xs text-slate-400">+GST</span>}</Row>
                  <Row k="Day Rate"><Money value={full.dayRate > 0 ? full.dayRate : Math.round(full.monthlyRate / 30)} />{full.dayRate > 0 && <span className="text-xs text-slate-400"> · loose</span>}</Row>
                  <Row k="Coordinates">
                    {full.latitude ? (
                      <a className="text-brand-light underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${full.latitude},${full.longitude}`}>{full.latitude}, {full.longitude}</a>
                    ) : '—'}
                  </Row>
                </dl>
                {active && (
                  <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
                    <div className="font-semibold text-slate-700">Current Booking</div>
                    <div>{active.order?.client?.name} · {active.order?.orderNo}</div>
                    <div className="text-slate-500 text-xs">
                      {new Date(active.startDate).toLocaleDateString('en-IN')} – {new Date(active.endDate).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                )}
                {full.status === 'HOLD' && (
                  <div className="mt-4 rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-800">
                    On hold{full.holdUntil ? ` until ${new Date(full.holdUntil).toLocaleDateString('en-IN')}` : ''}{full.holdNote ? ` · ${full.holdNote}` : ''}
                  </div>
                )}
                {can(user, 'createBooking') && (
                  <div className="mt-4 flex gap-2">
                    <button className="btn-accent flex-1" disabled={full.status === 'HOLD'} onClick={() => navigate(`/new-booking?siteId=${id}`)}>Book this site</button>
                    {['AVAILABLE', 'HOLD'].includes(full.status) && (
                      <button className={`flex-1 ${full.status === 'HOLD' ? 'btn-primary' : 'btn-ghost'}`} disabled={saving} onClick={toggleHold}>
                        {full.status === 'HOLD' ? 'Release hold' : 'Put on hold'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Monitoring Photos</div>
                {full.bookings.flatMap((b) => b.photos).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No photos uploaded yet</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {full.bookings.flatMap((b) => b.photos).map((p) => (
                      <a key={p.id} href={p.filePath} target="_blank" rel="noreferrer" className="block">
                        <img src={p.filePath} alt={p.phase} className="rounded-lg border border-slate-200 aspect-video object-cover w-full" />
                        <div className="text-[10px] text-slate-500 mt-0.5">{p.phase} · {new Date(p.takenAt).toLocaleDateString('en-IN')}</div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
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

function Row({ k, children }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-1.5">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium text-slate-800 text-right">{children}</dd>
    </div>
  );
}
