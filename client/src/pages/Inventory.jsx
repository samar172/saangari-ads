import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { Badge, Money, Modal, Spinner } from '../components/ui';

const TYPE_LABELS = { UNIPOLE: 'Unipole', GANTRY: 'Gantry', KIOSK: 'Kiosk', HOARDING: 'Hoarding' };
const TILE_COLORS = {
  AVAILABLE: 'bg-emerald-500 hover:bg-emerald-600 ring-emerald-300',
  BOOKED: 'bg-red-500 hover:bg-red-600 ring-red-300',
  TENTATIVE: 'bg-amber-500 hover:bg-amber-600 ring-amber-300',
  MAINTENANCE: 'bg-slate-400 hover:bg-slate-500 ring-slate-300',
};

export default function Inventory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState({});
  const [type, setType] = useState('UNIPOLE');
  const [zone, setZone] = useState('');
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null); // { site, rect }
  const detailCache = useRef({});
  const [detail, setDetail] = useState(null);
  const hoverTimer = useRef(null);
  const currentHoverId = useRef(null);

  useEffect(() => { api.get('/sites/summary').then((r) => setSummary(r.data)); }, []);

  useEffect(() => {
    setLoading(true);
    api.get('/sites', { params: { type, zone: zone || undefined } })
      .then((r) => setSites(r.data))
      .finally(() => setLoading(false));
  }, [type, zone]);

  function onEnter(site, e) {
    clearTimeout(hoverTimer.current); // cancel any pending close so moving between tiles doesn't flicker
    currentHoverId.current = site.id;
    const rect = e.currentTarget.getBoundingClientRect();
    setHover({ site, rect });
    setDetail(detailCache.current[site.id] || null);
    if (!detailCache.current[site.id]) {
      api.get(`/sites/${site.id}`).then((r) => {
        detailCache.current[site.id] = r.data;
        // only apply if the user is still hovering this same tile
        if (currentHoverId.current === site.id) setDetail(r.data);
      }).catch(() => {});
    }
  }
  function onLeave() {
    clearTimeout(hoverTimer.current);
    currentHoverId.current = null;
    hoverTimer.current = setTimeout(() => { setHover(null); setDetail(null); }, 120);
  }

  const zones = [...new Set(sites.map((s) => s.zone))].sort();
  const counts = sites.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {});

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Dashboard</h1>
          <p className="text-sm text-slate-500">Bikaner — {sites.length} sites in view · hover a tile for details</p>
        </div>
        <div className="flex gap-2">
          {can(user, 'createBooking') && <button className="btn-accent" onClick={() => navigate('/new-booking')}>➕ New Booking</button>}
          {can(user, 'exportInventory') && (
            <button className="btn-ghost" onClick={() => downloadFile(`/exports/inventory/excel?type=${type}`, 'inventory.xlsx')}>⬇ Export Excel</button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.keys(TYPE_LABELS).map((t) => {
          const info = summary[t];
          if (!info) return null;
          return (
            <button key={t} onClick={() => setType(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium border transition ${type === t ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200 hover:border-brand'}`}>
              {TYPE_LABELS[t]} <span className="opacity-70">({info.total})</span>
            </button>
          );
        })}
      </div>

      {/* Filters + legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <select className="input w-auto" value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">All zones</option>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <Legend color="bg-emerald-500" label={`Available (${counts.AVAILABLE || 0})`} />
          <Legend color="bg-red-500" label={`Booked (${counts.BOOKED || 0})`} />
          <Legend color="bg-amber-500" label={`Tentative (${counts.TENTATIVE || 0})`} />
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
          {sites.map((s) => (
            <button key={s.id} onClick={() => setSelected(s)}
              onMouseEnter={(e) => onEnter(s, e)} onMouseLeave={onLeave}
              className={`aspect-square rounded-lg text-white p-1.5 flex flex-col justify-between text-left transition ring-0 hover:ring-2 hover:ring-offset-1 ${TILE_COLORS[s.status]}`}>
              <span className="font-bold text-xs">{s.code}</span>
              <span className="text-[9px] leading-tight opacity-90 line-clamp-2">{s.location}</span>
              <span className="text-[9px] font-semibold uppercase opacity-80">{s.status}</span>
            </button>
          ))}
        </div>
      )}

      {hover && <HoverCard hover={hover} detail={detail} />}

      <SiteDetail site={selected} onClose={() => setSelected(null)} onChanged={() => {
        api.get('/sites', { params: { type, zone: zone || undefined } }).then((r) => setSites(r.data));
      }} />
    </div>
  );
}

// Floating popover positioned next to the hovered tile
function HoverCard({ hover, detail }) {
  const { site, rect } = hover;
  const W = 288;
  const vw = window.innerWidth;
  const left = rect.right + W + 16 < vw ? rect.right + 8 : Math.max(8, rect.left - W - 8);
  let top = rect.top;
  const style = { position: 'fixed', left, top, width: W, zIndex: 60 };
  // keep on screen vertically
  if (top + 340 > window.innerHeight) style.top = Math.max(8, window.innerHeight - 348);

  const active = detail?.bookings?.find((b) => ['CONFIRMED', 'LIVE', 'TENTATIVE'].includes(b.status));
  const photo = detail?.bookings?.flatMap((b) => b.photos || [])[0];
  const img = detail?.imageUrl || photo?.filePath;

  return (
    <div style={style} className="rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden pointer-events-none animate-[fadeIn_.1s_ease-out]">
      <div className="h-28 bg-slate-100 relative">
        {img ? (
          <img src={img} className="w-full h-full object-cover" alt={site.code} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand to-brand-light text-white">
            <div className="text-center">
              <div className="text-3xl">📍</div>
              <div className="text-xs opacity-80">No photo yet</div>
            </div>
          </div>
        )}
        <span className="absolute top-2 left-2"><Badge status={site.status} /></span>
      </div>
      <div className="p-3">
        <div className="font-bold text-slate-800">{site.code} <span className="font-normal text-slate-400 text-sm">· {site.type}</span></div>
        <div className="text-xs text-slate-500 mb-2">{site.location}</div>
        <dl className="text-xs space-y-1">
          <div className="flex justify-between"><dt className="text-slate-400">Zone</dt><dd className="text-slate-700">{site.zone} · {site.city}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Size</dt><dd className="text-slate-700">{site.width}×{site.height} ft</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Monthly</dt><dd className="text-slate-700"><Money value={site.monthlyRate} /></dd></div>
        </dl>
        {!detail ? (
          <div className="mt-2 text-[11px] text-slate-300">Loading booking…</div>
        ) : active ? (
          <div className="mt-2 rounded-lg bg-brand/5 border border-brand/20 p-2">
            <div className="text-[10px] font-semibold uppercase text-brand">Active Booking</div>
            <div className="text-xs font-medium text-slate-800">{active.order?.client?.name}</div>
            <div className="text-[11px] text-slate-500">{active.order?.orderNo} · {new Date(active.startDate).toLocaleDateString('en-IN')}–{new Date(active.endDate).toLocaleDateString('en-IN')}</div>
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-emerald-600 font-medium">✓ Available for booking</div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return <span className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${color}`} /> {label}</span>;
}

const EMPTY_EDIT = { location: '', zone: '', city: '', light: '', width: '', height: '', sqft: '', monthlyRate: '', printingCost: '', mountingCost: '', latitude: '', longitude: '', status: 'AVAILABLE' };

function SiteDetail({ site, onClose, onChanged }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [full, setFull] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function load() { return api.get(`/sites/${site.id}`).then((r) => setFull(r.data)); }
  useEffect(() => {
    if (site) { setFull(null); setEditing(false); setErr(''); api.get(`/sites/${site.id}`).then((r) => setFull(r.data)); }
  }, [site]);

  function startEdit() {
    setForm({
      location: full.location ?? '', zone: full.zone ?? '', city: full.city ?? '', light: full.light ?? '',
      width: full.width ?? '', height: full.height ?? '', sqft: full.sqft ?? '', monthlyRate: full.monthlyRate ?? '',
      printingCost: full.printingCost ?? '', mountingCost: full.mountingCost ?? '',
      latitude: full.latitude ?? '', longitude: full.longitude ?? '', status: full.status ?? 'AVAILABLE',
    });
    setErr(''); setEditing(true);
  }

  async function save() {
    setSaving(true); setErr('');
    try { await api.patch(`/sites/${site.id}`, form); await load(); setEditing(false); onChanged && onChanged(); }
    catch (e) { setErr(e.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function uploadImage(file) {
    if (!file) return;
    setSaving(true); setErr('');
    const fd = new FormData(); fd.append('image', file);
    try { await api.post(`/sites/${site.id}/image`, fd); await load(); onChanged && onChanged(); }
    catch (e) { setErr(e.response?.data?.error || 'Image upload failed'); }
    finally { setSaving(false); }
  }

  if (!site) return null;
  const active = full?.bookings?.find((b) => ['CONFIRMED', 'LIVE', 'TENTATIVE'].includes(b.status));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open={!!site} onClose={onClose} title={`${site.code} — ${site.type}`} wide>
      {!full ? <Spinner /> : (
        <div>
          {/* Image header */}
          <div className="relative h-40 rounded-lg overflow-hidden mb-4 bg-slate-100">
            {full.imageUrl ? (
              <img src={full.imageUrl} alt={full.code} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand to-brand-light text-white">
                <div className="text-center"><div className="text-4xl">📍</div><div className="text-xs opacity-80">No site photo</div></div>
              </div>
            )}
            {can(user, 'manageSites') && (
              <label className="absolute bottom-2 right-2 btn-ghost text-xs cursor-pointer">
                {full.imageUrl ? '🔄 Replace photo' : '📷 Add photo'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e.target.files[0])} />
              </label>
            )}
          </div>

          {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

          {editing ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Location" span><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
              <Field label="Zone"><input className="input" value={form.zone} onChange={(e) => set('zone', e.target.value)} /></Field>
              <Field label="City"><input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
              <Field label="Width (ft)"><input type="number" className="input" value={form.width} onChange={(e) => set('width', e.target.value)} /></Field>
              <Field label="Height (ft)"><input type="number" className="input" value={form.height} onChange={(e) => set('height', e.target.value)} /></Field>
              <Field label="Sq.ft (blank = auto)"><input type="number" className="input" value={form.sqft} onChange={(e) => set('sqft', e.target.value)} /></Field>
              <Field label="Lighting"><input className="input" placeholder="NL / FL / BL" value={form.light} onChange={(e) => set('light', e.target.value)} /></Field>
              <Field label="Monthly Rate (₹)"><input type="number" className="input" value={form.monthlyRate} onChange={(e) => set('monthlyRate', e.target.value)} /></Field>
              <Field label="Printing Cost (₹)"><input type="number" className="input" value={form.printingCost} onChange={(e) => set('printingCost', e.target.value)} /></Field>
              <Field label="Mounting Cost (₹)"><input type="number" className="input" value={form.mountingCost} onChange={(e) => set('mountingCost', e.target.value)} /></Field>
              <Field label="Latitude"><input type="number" className="input" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} /></Field>
              <Field label="Longitude"><input type="number" className="input" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} /></Field>
              <Field label="Status">
                <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {['AVAILABLE', 'TENTATIVE', 'BOOKED', 'MAINTENANCE'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2 flex gap-2 mt-1">
                <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : '✓ Save changes'}</button>
                <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Site Details</div>
                  {can(user, 'manageSites') && <button className="btn-ghost text-xs" onClick={startEdit}>✏️ Edit</button>}
                </div>
                <dl className="space-y-2 text-sm">
                  <Row k="Status"><Badge status={full.status} /></Row>
                  <Row k="Location">{full.location}</Row>
                  <Row k="Zone / City">{full.zone} · {full.city}</Row>
                  <Row k="Size">{full.width} × {full.height} ft ({full.sqft} sq.ft)</Row>
                  <Row k="Lighting">{full.light}</Row>
                  <Row k="Monthly Rate"><Money value={full.monthlyRate} /> {full.gstOnRate && <span className="text-xs text-slate-400">+GST</span>}</Row>
                  <Row k="Day Rate"><Money value={Math.round(full.monthlyRate / 30)} /></Row>
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
                {can(user, 'createBooking') && (
                  <button className="btn-accent mt-4 w-full" onClick={() => navigate(`/new-booking?siteId=${site.id}`)}>Book this site</button>
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
    </Modal>
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
