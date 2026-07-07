import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { Badge, Money, Modal, Spinner } from '../components/ui';

const TYPE_LABELS = { UNIPOLE: 'Unipole', GANTRY: 'Gantry', KIOSK: 'Kiosk', HOARDING: 'Hoarding' };
const TILE_COLORS = {
  AVAILABLE: 'bg-emerald-500 hover:bg-emerald-600',
  BOOKED: 'bg-red-500 hover:bg-red-600',
  TENTATIVE: 'bg-amber-500 hover:bg-amber-600',
  MAINTENANCE: 'bg-slate-400 hover:bg-slate-500',
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

  useEffect(() => { api.get('/sites/summary').then((r) => setSummary(r.data)); }, []);

  useEffect(() => {
    setLoading(true);
    api.get('/sites', { params: { type, zone: zone || undefined } })
      .then((r) => setSites(r.data))
      .finally(() => setLoading(false));
  }, [type, zone]);

  const zones = [...new Set(sites.map((s) => s.zone))].sort();
  const counts = sites.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {});

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Dashboard</h1>
          <p className="text-sm text-slate-500">Bikaner — {sites.length} sites in view</p>
        </div>
        <div className="flex gap-2">
          {can(user, 'createBooking') && (
            <button className="btn-accent" onClick={() => navigate('/new-booking')}>➕ New Booking</button>
          )}
          {can(user, 'exportInventory') && (
            <button className="btn-ghost" onClick={() => downloadFile(`/exports/inventory/excel?type=${type}`, 'inventory.xlsx')}>
              ⬇ Export Excel
            </button>
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
              className={`rounded-lg px-4 py-2 text-sm font-medium border transition ${
                type === t ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200 hover:border-brand'
              }`}>
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
              title={s.location}
              className={`aspect-square rounded-lg text-white p-1.5 flex flex-col justify-between text-left transition ${TILE_COLORS[s.status]}`}>
              <span className="font-bold text-xs">{s.code}</span>
              <span className="text-[9px] leading-tight opacity-90 line-clamp-2">{s.location}</span>
              <span className="text-[9px] font-semibold uppercase opacity-80">{s.status}</span>
            </button>
          ))}
        </div>
      )}

      <SiteDetail site={selected} onClose={() => setSelected(null)} onChanged={() => {
        api.get('/sites', { params: { type, zone: zone || undefined } }).then((r) => setSites(r.data));
      }} />
    </div>
  );
}

function Legend({ color, label }) {
  return <span className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${color}`} /> {label}</span>;
}

function SiteDetail({ site, onClose, onChanged }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [full, setFull] = useState(null);

  useEffect(() => {
    if (site) { setFull(null); api.get(`/sites/${site.id}`).then((r) => setFull(r.data)); }
  }, [site]);

  if (!site) return null;
  const active = full?.bookings?.find((b) => ['CONFIRMED', 'LIVE', 'TENTATIVE'].includes(b.status));

  return (
    <Modal open={!!site} onClose={onClose} title={`${site.code} — ${site.type}`} wide>
      {!full ? <Spinner /> : (
        <div className="grid md:grid-cols-2 gap-5">
          <div>
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
                  <a className="text-brand-light underline" target="_blank" rel="noreferrer"
                    href={`https://maps.google.com/?q=${full.latitude},${full.longitude}`}>
                    {full.latitude}, {full.longitude}
                  </a>
                ) : '—'}
              </Row>
            </dl>
            {active && (
              <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
                <div className="font-semibold text-slate-700">Current Booking</div>
                <div>{active.client.name} · {active.bookingNo}</div>
                <div className="text-slate-500 text-xs">
                  {new Date(active.startDate).toLocaleDateString('en-IN')} – {new Date(active.endDate).toLocaleDateString('en-IN')}
                </div>
              </div>
            )}
            {can(user, 'createBooking') && (
              <button className="btn-accent mt-4 w-full"
                onClick={() => navigate(`/new-booking?siteId=${site.id}`)}>
                Book this site
              </button>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Monitoring Photos</div>
            {full.bookings.flatMap((b) => b.photos).length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                No photos uploaded yet
              </div>
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
    </Modal>
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
