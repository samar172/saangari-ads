import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { X, CheckSquare, Plus, FileText, Download, MapPin, RefreshCw, Camera, Pencil, Check, Building2, Presentation } from 'lucide-react';
import { Badge, Money, Modal, Spinner } from '../components/ui';

const STATUS_FILTERS = ['AVAILABLE', 'BOOKED', 'TENTATIVE', 'HOLD', 'MAINTENANCE'];

const TILE_COLORS = {
  AVAILABLE: 'bg-emerald-500 hover:bg-emerald-600 ring-emerald-300',
  BOOKED: 'bg-red-500 hover:bg-red-600 ring-red-300',
  TENTATIVE: 'bg-amber-500 hover:bg-amber-600 ring-amber-300',
  HOLD: 'bg-indigo-500 hover:bg-indigo-600 ring-indigo-300',
  MAINTENANCE: 'bg-slate-400 hover:bg-slate-500 ring-slate-300',
};

// Status-filter chips, colour-matched to the tiles: a coloured dot + coloured
// outline when off, filled with that colour when ticked. (Full literal class
// strings so Tailwind keeps them.)
const STATUS_CHIP = {
  AVAILABLE:   { dot: 'bg-emerald-500', on: 'bg-emerald-500 border-emerald-500 text-white', off: 'border-emerald-300 text-emerald-700 hover:border-emerald-500' },
  BOOKED:      { dot: 'bg-red-500',     on: 'bg-red-500 border-red-500 text-white',         off: 'border-red-300 text-red-700 hover:border-red-500' },
  TENTATIVE:   { dot: 'bg-amber-500',   on: 'bg-amber-500 border-amber-500 text-white',     off: 'border-amber-300 text-amber-700 hover:border-amber-500' },
  HOLD:        { dot: 'bg-indigo-500',  on: 'bg-indigo-500 border-indigo-500 text-white',   off: 'border-indigo-300 text-indigo-700 hover:border-indigo-500' },
  MAINTENANCE: { dot: 'bg-slate-400',   on: 'bg-slate-500 border-slate-500 text-white',     off: 'border-slate-300 text-slate-600 hover:border-slate-500' },
};

export default function Inventory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState({});
  const [mediaTypes, setMediaTypes] = useState([]);
  const [type, setType] = useState('');
  const [zone, setZone] = useState('');
  // Which statuses to show. Empty set = show everything.
  const [statusSel, setStatusSel] = useState([]);
  // Date-window filters (days from today). '' = off.
  const [startWithin, setStartWithin] = useState('');
  const [endWithin, setEndWithin] = useState('');
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null); // { site, rect }
  const detailCache = useRef({});
  const [detail, setDetail] = useState(null);
  const hoverTimer = useRef(null);
  const currentHoverId = useRef(null);

  // Multi-select: tiles become checkboxes and the action bar takes them to a booking.
  // Keep {id, code} so the basket still renders after switching type or zone.
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState([]);

  useEffect(() => { api.get('/sites/summary').then((r) => setSummary(r.data)); }, []);

  // Media types are admin-managed; the tabs and the default selection follow the
  // active list rather than a hardcoded set.
  useEffect(() => {
    api.get('/media-types').then((r) => {
      setMediaTypes(r.data);
      setType((t) => (t && r.data.some((m) => m.code === t) ? t : (r.data[0]?.code || '')));
    });
  }, []);
  const typeLabels = Object.fromEntries(mediaTypes.map((m) => [m.code, m.label]));

  // Fetch by type only and filter the zone client-side. Fetching with the zone
  // applied server-side would shrink `sites` to that one zone, which in turn
  // collapsed the zone dropdown to only the selected zone — so you couldn't
  // switch straight from one zone to another without going via "All zones".
  useEffect(() => {
    setLoading(true);
    api.get('/sites', { params: { type } })
      .then((r) => setSites(r.data))
      .finally(() => setLoading(false));
  }, [type]);

  function onTileClick(site) {
    if (!selectMode) return setSelected(site);
    setPicked((p) => (p.some((x) => x.id === site.id) ? p.filter((x) => x.id !== site.id) : [...p, { id: site.id, code: site.code }]));
  }

  function startSelecting() {
    setSelectMode((on) => {
      if (on) setPicked([]); // leaving select mode clears the basket
      return !on;
    });
  }

  const goBook = (mode) => navigate(`/new-booking?siteIds=${picked.map((p) => p.id).join(',')}${mode ? `&mode=${mode}` : ''}`);

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

  function refresh() {
    api.get('/sites', { params: { type } }).then((r) => setSites(r.data));
    api.get('/sites/summary').then((r) => setSummary(r.data));
  }
  const toggleStatus = (st) =>
    setStatusSel((sel) => (sel.includes(st) ? sel.filter((x) => x !== st) : [...sel, st]));

  const zones = [...new Set(sites.map((s) => s.zone))].sort();
  const zoneFiltered = zone ? sites.filter((s) => s.zone === zone) : sites;
  const counts = zoneFiltered.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {});

  // Date-window filters read the site's live/upcoming bookings: "starting within
  // N days" catches campaigns about to begin; "ending within N days" catches
  // sites about to free up.
  const HOLDING = ['TENTATIVE', 'CONFIRMED', 'LIVE'];
  const today = dayjs().startOf('day');
  function passesWindows(s) {
    if (startWithin === '' && endWithin === '') return true;
    const active = (s.bookings || []).filter((b) => HOLDING.includes(b.status));
    let ok = false;
    if (startWithin !== '') {
      const n = Number(startWithin);
      ok = ok || active.some((b) => { const d = dayjs(b.startDate).diff(today, 'day'); return d >= 0 && d <= n; });
    }
    if (endWithin !== '') {
      const n = Number(endWithin);
      ok = ok || active.some((b) => { const d = dayjs(b.endDate).diff(today, 'day'); return d >= 0 && d <= n; });
    }
    return ok;
  }
  const visible = zoneFiltered
    .filter((s) => (statusSel.length === 0 ? true : statusSel.includes(s.status)))
    .filter(passesWindows);

  // Build an export URL for the chosen combination, then download as PDF or PPT.
  function runExport(mode, format) {
    const ids = picked.map((p) => p.id).join(',');
    const qs = new URLSearchParams();
    if (mode === 'vacant' || mode === 'vacant_selected') { qs.set('status', 'AVAILABLE'); if (type) qs.set('type', type); }
    if (mode === 'booked') { qs.set('status', 'BOOKED'); if (type) qs.set('type', type); }
    if ((mode === 'selected' || mode === 'vacant_selected')) {
      if (!ids) { alert('Select some sites first (use "Select sites").'); return; }
      qs.set('siteIds', ids);
    }
    const path = format === 'ppt' ? '/exports/sites/pptx' : '/exports/availability/pdf';
    downloadFile(`${path}?${qs.toString()}`, format === 'ppt' ? 'Site-Availability.pptx' : 'Site-Availability.pdf');
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Dashboard</h1>
          <p className="text-sm text-slate-500">
            Bikaner — {visible.length} sites in view · {selectMode ? 'click tiles to select them' : 'hover a tile for details'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user, 'createBooking') && (
            <button className={`flex items-center gap-1.5 ${selectMode ? 'btn-primary' : 'btn-ghost'}`} onClick={startSelecting}>
              {selectMode ? <><X size={16} /> Done selecting</> : <><CheckSquare size={16} /> Select sites</>}
            </button>
          )}
          {can(user, 'exportInventory') && (
            <ExportMenu picked={picked} onExport={runExport}
              onExcel={() => downloadFile(`/exports/inventory/excel?type=${type}`, 'inventory.xlsx')} />
          )}
        </div>
      </div>

      {/* Category tabs — "All" first, then each media type */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setType('')}
          className={`rounded-lg px-4 py-2 text-sm font-medium border transition ${type === '' ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200 hover:border-brand'}`}>
          All media <span className="opacity-70">({mediaTypes.reduce((a, m) => a + (summary[m.code]?.total || 0), 0)})</span>
        </button>
        {mediaTypes.map((m) => (
          <button key={m.code} onClick={() => setType(m.code)}
            className={`rounded-lg px-4 py-2 text-sm font-medium border transition ${type === m.code ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200 hover:border-brand'}`}>
            {m.label} <span className="opacity-70">({summary[m.code]?.total || 0})</span>
          </button>
        ))}
      </div>

      {/* Filters + legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        <select className="input w-auto" value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">All zones</option>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        {/* Status checkboxes — none ticked shows all */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          {STATUS_FILTERS.map((st) => {
            const c = STATUS_CHIP[st];
            const active = statusSel.includes(st);
            return (
              <label key={st} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 cursor-pointer transition ${active ? c.on : c.off}`}>
                <input type="checkbox" className="hidden" checked={active} onChange={() => toggleStatus(st)} />
                <span className={`h-2 w-2 rounded-full ${active ? 'bg-white/90' : c.dot}`} />
                {st.charAt(0) + st.slice(1).toLowerCase()} ({counts[st] || 0})
              </label>
            );
          })}
        </div>
        {/* Date windows */}
        <label className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          Starting in ≤
          <input type="number" min="0" className="input w-16 py-1 font-normal text-slate-700" placeholder="7" value={startWithin} onChange={(e) => setStartWithin(e.target.value)} />
          days
        </label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          Ending in ≤
          <input type="number" min="0" className="input w-16 py-1 font-normal text-slate-700" placeholder="15" value={endWithin} onChange={(e) => setEndWithin(e.target.value)} />
          days
        </label>
        {(statusSel.length > 0 || startWithin !== '' || endWithin !== '') && (
          <button className="text-xs text-slate-400 underline" onClick={() => { setStatusSel([]); setStartWithin(''); setEndWithin(''); }}>Clear filters</button>
        )}
      </div>

      {loading ? <Spinner /> : (
        <>
          {visible.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-400 mb-2">No sites match these filters</div>
          )}
          <div className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 ${picked.length ? 'pb-20' : ''}`}>
            {visible.map((s) => {
              const isPicked = picked.some((p) => p.id === s.id);
              return (
                <button key={s.id} onClick={() => onTileClick(s)}
                  onMouseEnter={(e) => onEnter(s, e)} onMouseLeave={onLeave}
                  className={`relative aspect-square rounded-lg text-white p-1.5 flex flex-col justify-between text-left transition hover:ring-2 hover:ring-offset-1 ${TILE_COLORS[s.status]} ${isPicked ? 'ring-2 ring-offset-2 ring-brand' : 'ring-0'}`}>
                  {selectMode && (
                    <span className={`absolute top-1 right-1 h-4 w-4 rounded border flex items-center justify-center text-[10px] font-bold ${isPicked ? 'bg-white text-brand border-white' : 'border-white/70 bg-black/10'}`}>
                      {isPicked ? '✓' : ''}
                    </span>
                  )}
                  <span className="font-bold text-xs">{s.code}</span>
                  <span className="text-[9px] leading-tight opacity-90 line-clamp-2">{s.location}</span>
                  <span className="text-[9px] font-semibold uppercase opacity-80">{s.status}</span>
                </button>
              );
            })}
            {/* Add-site tile sits at the end of the grid, where the sites run out. */}
            {can(user, 'manageSites') && !selectMode && (
              <button onClick={() => setAddOpen(true)} title="Add a new site"
                className="aspect-square rounded-lg border-2 border-dashed border-slate-300 text-slate-400 flex flex-col items-center justify-center gap-1 transition hover:border-brand hover:text-brand hover:bg-brand/5">
                <Plus size={22} />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Add site</span>
              </button>
            )}
          </div>
        </>
      )}

      {hover && !selectMode && <HoverCard hover={hover} detail={detail} />}

      {/* lg:left-60 clears the docked sidebar; on phones it is off-canvas so the bar spans full width */}
      {picked.length > 0 && (
        <div className="fixed bottom-0 left-0 lg:left-60 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 py-3 shadow-2xl">
          <div className="mx-auto max-w-7xl flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-800">
              {picked.length} site{picked.length !== 1 ? 's' : ''} selected
            </span>
            <span className="text-xs text-slate-400 truncate max-w-md">{picked.map((p) => p.code).join(', ')}</span>
            <div className="flex-1" />
            <button className="btn-ghost text-sm" onClick={() => setPicked([])}>Clear</button>
            <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => goBook('quotation')}><FileText size={14} /> Quotation</button>
            <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => goBook()}><Plus size={14} /> Book {picked.length} site{picked.length !== 1 ? 's' : ''}</button>
          </div>
        </div>
      )}

      <SiteDetail site={selected} mediaTypes={mediaTypes} onClose={() => setSelected(null)} onChanged={refresh} />
      {addOpen && (
        <AddSiteModal mediaTypes={mediaTypes} defaultType={type} onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); refresh(); }} />
      )}
    </div>
  );
}

// Compact export control: pick a combination (vacant / booked / selected / mix)
// then download it as PDF or PPT. Excel is a straight passthrough.
function ExportMenu({ picked, onExport, onExcel }) {
  const [mode, setMode] = useState('vacant');
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1">
      <select className="input w-auto py-1 text-sm border-0 focus:ring-0" value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="vacant">Vacant</option>
        <option value="booked">Booked</option>
        <option value="selected">Selected ({picked.length})</option>
        <option value="vacant_selected">Vacant + Selected</option>
      </select>
      <button className="btn-ghost text-xs flex items-center gap-1" title="Export PDF" onClick={() => onExport(mode, 'pdf')}><Download size={14} /> PDF</button>
      <button className="btn-ghost text-xs flex items-center gap-1" title="Export PPT" onClick={() => onExport(mode, 'ppt')}><Presentation size={14} /> PPT</button>
      <span className="w-px h-4 bg-slate-200" />
      <button className="btn-ghost text-xs flex items-center gap-1" title="Export Excel" onClick={onExcel}><Download size={14} /> Excel</button>
    </div>
  );
}

// Create a brand-new site from the inventory dashboard.
const EMPTY_NEW = { code: '', type: '', location: '', zone: '', city: '', light: 'NL', width: '', height: '', sqft: '', monthlyRate: '', dayRate: '', printingCost: '', mountingCost: '', latitude: '', longitude: '', status: 'AVAILABLE' };
function AddSiteModal({ mediaTypes = [], defaultType, onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY_NEW, type: defaultType || mediaTypes[0]?.code || '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setErr('');
    if (!form.code || !form.zone || !form.city || !form.location || !form.type)
      return setErr('Code, media type, location, zone and city are required.');
    setSaving(true);
    try { await api.post('/sites', form); onSaved(); }
    catch (e) { setErr(e.response?.data?.error || 'Failed to create site'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title="Add Site" wide>
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
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Create Site'}</button>
      </div>
    </Modal>
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
            <div className="text-center flex flex-col items-center">
              <MapPin size={32} className="mb-1" />
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
          <div className="mt-2 text-[11px] text-emerald-600 font-medium flex items-center gap-1"><Check size={12} /> Available for booking</div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return <span className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${color}`} /> {label}</span>;
}

const EMPTY_EDIT = { type: '', location: '', zone: '', city: '', light: '', width: '', height: '', sqft: '', monthlyRate: '', dayRate: '', printingCost: '', mountingCost: '', latitude: '', longitude: '', status: 'AVAILABLE' };

function SiteDetail({ site, mediaTypes = [], onClose, onChanged }) {
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

  async function toggleHold() {
    setSaving(true); setErr('');
    const held = full.status === 'HOLD';
    try {
      if (held) await api.post(`/sites/${site.id}/release`);
      else await api.post(`/sites/${site.id}/hold`, {});
      await load(); onChanged && onChanged();
    } catch (e) { setErr(e.response?.data?.error || 'Could not update hold'); }
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
                    <button className="btn-accent flex-1" disabled={full.status === 'HOLD'} onClick={() => navigate(`/new-booking?siteId=${site.id}`)}>Book this site</button>
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
