import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, X, ExternalLink, ArrowUp, ArrowDown, ImageOff, MapPin } from 'lucide-react';
import dayjs from 'dayjs';
import api, { downloadFile } from '../api';
import { useCompany } from '../CompanyContext';
import { Money, Spinner, Badge } from '../components/ui';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const COLORS = ['#1e3a8a', '#f59e0b', '#059669', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#65a30d'];
// Financial-year presets, matching Reports / Booking Analysis / Accounts.
const fyRange = (y) => ({ label: `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`, from: () => dayjs(`${y}-04-01`), to: () => dayjs(`${y + 1}-03-31`) });
const RANGES = {
  MONTH: { label: 'This month', from: () => dayjs().startOf('month'), to: () => dayjs() },
  FY_2025: fyRange(2025),
  FY_2026: fyRange(2026),
  ALL: { label: 'All time', from: () => null, to: () => null },
};
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const compact = (n) => (n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${Math.round(n / 1e3)}k` : `₹${n}`);

// Full-page site-wise / inventory analytics: every site ranked by revenue and
// bookings, with zone/type charts, rich filters, and a photo drawer per site.
export default function InventoryReport() {
  const navigate = useNavigate();
  const { companies, activeCompany } = useCompany();
  const [companyId, setCompanyId] = useState(activeCompany?.id ? String(activeCompany.id) : '');
  const [rangeKey, setRangeKey] = useState('FY_2026');
  const [zone, setZone] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [bookedOnly, setBookedOnly] = useState(false);
  const [sort, setSort] = useState({ key: 'revenue', dir: 'desc' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // site row opened in the drawer

  useEffect(() => { setCompanyId(activeCompany?.id ? String(activeCompany.id) : ''); }, [activeCompany]);

  // Resolve the selected FY/period preset into from/to for the API.
  const r = RANGES[rangeKey];
  const from = r.from() ? r.from().format('YYYY-MM-DD') : '';
  const to = r.to() ? r.to().format('YYYY-MM-DD') : '';

  function load() {
    setLoading(true);
    api.get('/reports/site-wise', {
      params: {
        companyId: companyId || undefined, from: from || undefined, to: to || undefined,
        zone: zone || undefined, type: type || undefined, q: q.trim() || undefined,
        bookedOnly: bookedOnly || undefined,
      },
    }).then((r) => setData(r.data)).finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [companyId, rangeKey, zone, type, bookedOnly]);
  // Search is debounced on Enter / blur to avoid a request per keystroke.

  const filters = data?.filters || { zones: [], types: [] };
  const sites = data?.sites || [];

  const sorted = useMemo(() => {
    const rows = [...sites];
    const { key, dir } = sort;
    rows.sort((a, b) => {
      let av = a[key], bv = b[key];
      if (typeof av === 'string') { av = av || ''; bv = bv || ''; return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
      return dir === 'asc' ? (av - bv) : (bv - av);
    });
    return rows;
  }, [sites, sort]);

  const topSites = useMemo(() => [...sites].sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    .map((s) => ({ name: s.code, revenue: s.revenue })), [sites]);

  function toggleSort(key) {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  }
  const SortHead = ({ k, label, align = 'right' }) => (
    <th className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer select-none hover:text-slate-700`} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">{label}{sort.key === k && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</span>
    </th>
  );

  function exportExcel() {
    const p = new URLSearchParams();
    if (companyId) p.set('companyId', companyId);
    if (from) p.set('from', from); if (to) p.set('to', to);
    if (zone) p.set('zone', zone); if (type) p.set('type', type);
    if (q.trim()) p.set('q', q.trim());
    if (bookedOnly) p.set('bookedOnly', 'true');
    downloadFile(`/exports/site-wise/excel?${p.toString()}`, 'site-wise-report.xlsx');
  }

  const s = data?.summary;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Site-wise Report</h1>
          <p className="text-sm text-slate-500">Revenue, bookings & utilisation per inventory site</p>
        </div>
        <button className="btn-accent text-sm flex items-center gap-1.5" onClick={exportExcel}><Download size={16} /> Export Excel</button>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Business</label>
            <select className="input w-auto" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">All businesses</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Zone</label>
            <select className="input w-auto" value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">All zones</option>
              {filters.zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Media type</label>
            <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {filters.types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Period</label>
            <select className="input w-auto" value={rangeKey} onChange={(e) => setRangeKey(e.target.value)}>
              {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Search site</label>
            <input className="input w-48" placeholder="Code / location…" value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()} onBlur={load} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 pb-2 cursor-pointer">
            <input type="checkbox" checked={bookedOnly} onChange={(e) => setBookedOnly(e.target.checked)} /> Booked only
          </label>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <Tile label="Sites" value={`${s?.bookedSites ?? 0}/${s?.siteCount ?? 0}`} sub="booked / shown" />
            <Tile label="Revenue (ex-GST)" value={<Money value={s?.totalRevenue} />} accent="text-emerald-600" />
            <Tile label="Bookings" value={s?.totalBookings ?? 0} />
            <Tile label="Days booked" value={(s?.totalDays ?? 0).toLocaleString('en-IN')} />
            <Tile label="Avg / booked site" value={<Money value={s?.bookedSites ? Math.round(s.totalRevenue / s.bookedSites) : 0} />} />
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-3 gap-5 mb-5">
            <div className="card p-5">
              <h2 className="font-semibold text-slate-700 mb-3">Revenue by Zone</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.byZone}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="zone" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={compact} width={48} />
                  <Tooltip formatter={(v) => inr(v)} />
                  <Bar dataKey="revenue" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-5">
              <h2 className="font-semibold text-slate-700 mb-3">Revenue by Media Type</h2>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data.byType} dataKey="revenue" nameKey="label" cx="50%" cy="50%" outerRadius={85} label={(e) => e.label}>
                    {data.byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => inr(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-5">
              <h2 className="font-semibold text-slate-700 mb-3">Top 10 Sites by Revenue</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topSites} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis type="number" fontSize={11} tickFormatter={compact} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={54} />
                  <Tooltip formatter={(v) => inr(v)} />
                  <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-semibold text-slate-700">All sites</h2>
              <span className="text-xs text-slate-400">{sorted.length} site{sorted.length !== 1 ? 's' : ''} · click a row for details & photo</span>
            </div>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <SortHead k="code" label="Site" align="left" />
                  <SortHead k="typeLabel" label="Type" align="left" />
                  <SortHead k="zone" label="Zone" align="left" />
                  <SortHead k="bookings" label="Bookings" />
                  <SortHead k="days" label="Days" />
                  <SortHead k="revenue" label="Revenue (ex-GST)" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((site, i) => (
                  <tr key={site.siteId} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(site)}>
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-brand">{site.code}</span>
                      <div className="text-[11px] text-slate-400 truncate max-w-[280px]">{site.location || site.city || '—'}</div>
                    </td>
                    <td className="px-3 py-2"><span className="badge bg-teal-100 text-teal-800">{site.typeLabel}</span></td>
                    <td className="px-3 py-2 text-slate-600">{site.zone || '—'}</td>
                    <td className="px-3 py-2 text-right">{site.bookings || <span className="text-slate-300">0</span>}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{site.days || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{site.revenue ? <Money value={site.revenue} /> : <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
                {sorted.length === 0 && <tr><td colSpan="7" className="px-4 py-12 text-center text-slate-400">No sites match these filters</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && <SiteDrawer site={selected} onClose={() => setSelected(null)} onOpen={() => navigate(`/inventory/${selected.siteId}`)} />}
    </div>
  );
}

function Tile({ label, value, sub, accent = 'text-slate-800' }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// Right slide-over: site photo, meta, in-range stats, and recent booking history
// (fetched on demand from the site detail endpoint).
function SiteDrawer({ site, onClose, onOpen }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get(`/sites/${site.siteId}`).then((r) => { if (alive) setDetail(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, [site.siteId]);

  const bookings = detail?.bookings || [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <div className="font-bold text-slate-800">{site.code}</div>
            <div className="text-xs text-slate-500">{site.typeLabel} · {site.zone || '—'}</div>
          </div>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Photo */}
        <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
          {site.imageUrl
            ? <img src={site.imageUrl} alt={site.code} className="w-full h-full object-cover" />
            : <div className="text-slate-400 flex flex-col items-center gap-1 text-sm"><ImageOff size={28} /> No photo</div>}
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 text-sm text-slate-600">
            <MapPin size={15} className="mt-0.5 text-slate-400 shrink-0" />
            <span>{site.location || '—'}{site.city ? `, ${site.city}` : ''}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Revenue" value={<Money value={site.revenue} />} />
            <MiniStat label="Bookings" value={site.bookings} />
            <MiniStat label="Days" value={site.days} />
          </div>
          {site.monthlyRate > 0 && (
            <div className="text-xs text-slate-500">Card rate: <span className="font-medium text-slate-700"><Money value={site.monthlyRate} />/month</span></div>
          )}

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Booking history</div>
            {!detail ? <Spinner /> : bookings.length === 0 ? (
              <div className="text-sm text-slate-400 py-3">No bookings recorded.</div>
            ) : (
              <div className="space-y-2">
                {bookings.slice(0, 20).map((b) => (
                  <div key={b.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700 truncate">{b.order?.client?.name || '—'}</span>
                      <Badge status={b.status} />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {b.order?.orderNo} · {b.startDate ? dayjs(b.startDate).format('DD MMM YY') : '—'} → {b.endDate ? dayjs(b.endDate).format('DD MMM YY') : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="btn-ghost text-sm flex items-center gap-1.5 w-full justify-center" onClick={onOpen}>
            <ExternalLink size={14} /> Open full site page
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 text-center">
      <div className="text-[10px] uppercase text-slate-400">{label}</div>
      <div className="font-semibold text-slate-700 text-sm mt-0.5">{value}</div>
    </div>
  );
}
