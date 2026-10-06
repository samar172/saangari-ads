import { useEffect, useState } from 'react';
import { Download, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import dayjs from 'dayjs';
import api, { downloadFile } from '../api';
import { useCompany } from '../CompanyContext';
import { Money, Spinner, StatTile } from '../components/ui';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#1e3a8a', '#f59e0b', '#059669', '#7c3aed', '#dc2626'];

// Financial-year start (1 Apr) for the current year.
const fyStart = () => (dayjs().month() >= 3 ? dayjs().month(3) : dayjs().subtract(1, 'year').month(3)).date(1);
// An Indian financial year (1 Apr Y → 31 Mar Y+1) as a range preset.
const fyRange = (y) => ({ label: `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`, from: () => dayjs(`${y}-04-01`), to: () => dayjs(`${y + 1}-03-31`) });
// Date-range presets for the whole dashboard: quick presets + explicit FYs.
const RANGES = {
  MONTH: { label: 'This month', from: () => dayjs().startOf('month'), to: () => dayjs() },
  FY_2025: fyRange(2025),
  FY_2026: fyRange(2026),
  ALL: { label: 'All time', from: () => null, to: () => null },
};

// Percentage-change badge vs the previous equal-length period.
function Delta({ curr, prev }) {
  if (prev == null || prev === 0) return null;
  const pct = Math.round(((curr - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return <span className="text-[11px] text-slate-400">0%</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(pct)}%
    </span>
  );
}

export default function Reports() {
  const { companies, activeCompany } = useCompany();
  // Default to the globally active company, or 'ALL' if none
  const [localCid, setLocalCid] = useState(activeCompany?.id || 'ALL');
  const [overview, setOverview] = useState(null);
  const [period, setPeriod] = useState('month');
  const [series, setSeries] = useState([]);
  const [topClients, setTopClients] = useState([]);
  const [expandedCat, setExpandedCat] = useState(null);
  const [rangeKey, setRangeKey] = useState('FY_2026');
  const [profit, setProfit] = useState(null);
  const [receivables, setReceivables] = useState(null);

  // If localCid is 'ALL', we don't send companyId to the API
  const cid = localCid === 'ALL' ? undefined : localCid;
  const r = RANGES[rangeKey];
  const from = r.from() ? r.from().format('YYYY-MM-DD') : undefined;
  const to = r.to() ? r.to().format('YYYY-MM-DD') : undefined;
  const rangeParams = { companyId: cid, from, to };

  // Sync if activeCompany changes and we haven't explicitly set to 'ALL'
  useEffect(() => {
    if (activeCompany && localCid !== 'ALL' && localCid !== activeCompany.id) {
      setLocalCid(activeCompany.id);
    }
  }, [activeCompany]);

  useEffect(() => {
    api.get('/reports/overview', { params: rangeParams }).then((r) => setOverview(r.data));
    api.get('/reports/top-clients', { params: rangeParams }).then((r) => setTopClients(r.data));
    api.get('/reports/profitability', { params: rangeParams }).then((r) => setProfit(r.data)).catch(() => setProfit(null));
    api.get('/reports/receivables', { params: { companyId: cid } }).then((r) => setReceivables(r.data)).catch(() => setReceivables(null));
  }, [cid, from, to]);
  useEffect(() => { api.get('/reports/timeseries', { params: { period, ...rangeParams } }).then((r) => setSeries(r.data)); }, [period, cid, from, to]);

  if (!overview) return <Spinner />;

  const revByType = Object.entries(overview.revenueByType).map(([name, value]) => ({ name, value }));
  const bookingsByType = Object.entries(overview.bookingsByType).map(([name, value]) => ({ name, value }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Reports & Analytics</h1>
          <p className="text-sm text-slate-500">{localCid === 'ALL' ? 'Combined performance across all companies' : `${companies.find(c => c.id === Number(localCid))?.name} — Company performance overview`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto py-1.5" value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} title="Date range">
            {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select
            className="input w-auto py-1.5"
            value={localCid}
            onChange={(e) => setLocalCid(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
          >
            <option value="ALL">All Companies (Combined)</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn-accent text-sm flex items-center gap-1.5" onClick={() => downloadFile(`/exports/reports/excel${cid ? `?companyId=${cid}` : ''}`, 'reports.xlsx')}>
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        <StatTile label="Occupancy" value={`${overview.occupancy}%`} accent="text-brand" sub={`${overview.siteStatus.BOOKED || 0}/${overview.siteCount} booked`} />
        <StatTile label="Booked Value" value={<Money value={overview.bookedValue} />} accent="text-emerald-600" sub={<span className="flex items-center gap-1.5">incl. GST <Delta curr={overview.bookedValue} prev={overview.prev?.bookedValue} /></span>} />
        <StatTile label="Collected" value={<Money value={overview.paidRevenue} />} accent="text-emerald-600" sub={<Delta curr={overview.paidRevenue} prev={overview.prev?.paidRevenue} />} />
        <StatTile label="Outstanding" value={<Money value={overview.outstanding} />} accent="text-red-600" />
        {/* Quotations are pipeline, deliberately kept out of booked value. */}
        <StatTile label="Quotation Pipeline" value={<Money value={overview.quotationValue || 0} />} accent="text-amber-600" sub={`${overview.quotationCount || 0} open`} />
        <StatTile label="Orders" value={overview.totalOrders} sub={<span className="flex items-center gap-1.5">{overview.totalBookings} bookings <Delta curr={overview.totalOrders} prev={overview.prev?.totalOrders} /></span>} />
        <StatTile label="Clients" value={overview.totalClients} sub={`${overview.repeatClients} repeat`} />
      </div>

      <div className="card p-4 mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Booked value breakdown</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatTile label="Total Booked" value={<Money value={overview.bookedValue} />} accent="text-emerald-600" sub="incl. GST" />
          <StatTile label="Excluding GST" value={<Money value={overview.bookedExclGst || 0} />} accent="text-slate-700" sub="taxable value" />
          <StatTile label="Rental" value={<Money value={overview.rentalValue || 0} />} accent="text-brand" />
          <StatTile label="Printing" value={<Money value={overview.printingValue || 0} />} accent="text-purple-600" />
          <StatTile label="Mounting" value={<Money value={overview.mountingValue || 0} />} accent="text-amber-600" />
        </div>
      </div>

      {/* Profitability — revenue vs the costs we track (printing paid out) + discounts. */}
      {profit && (
        <div className="card p-4 mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Profitability (ex-GST)</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatTile label="Revenue (ex-GST)" value={<Money value={profit.revenueExGst} />} accent="text-slate-700" />
            <StatTile label="Printing charged" value={<Money value={profit.printingCharged} />} accent="text-purple-600" />
            <StatTile label="Printing cost" value={<Money value={profit.printingCost} />} accent="text-slate-600" sub="paid to partners" />
            <StatTile label="Printing margin" value={<Money value={profit.printingMargin} />} accent={profit.printingMargin >= 0 ? 'text-emerald-600' : 'text-red-600'} />
            <StatTile label="Discounts given" value={<Money value={profit.discounts} />} accent="text-amber-600" />
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Contribution (revenue − printing cost): <b className="text-slate-600"><Money value={profit.contribution} /></b>. Rental &amp; mounting vendor costs aren't tracked, so this is an upper bound, not net profit.</p>
          {profit.byCategory?.length > 0 && (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 uppercase"><tr><th className="text-left py-1">Category</th><th className="text-right py-1">Revenue</th><th className="text-right py-1">Printing margin</th></tr></thead>
                <tbody>
                  {profit.byCategory.map((c) => (
                    <tr key={c.category} className="border-t border-slate-100">
                      <td className="py-1.5">{c.category}</td>
                      <td className="py-1.5 text-right"><Money value={c.revenue} /></td>
                      <td className={`py-1.5 text-right ${c.printingMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}><Money value={c.printingMargin} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Accounts-receivable aging + DSO (as of today, across all periods). */}
      {receivables && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Receivables aging (as of today)</div>
            <div className="text-xs text-slate-500">DSO <span className="font-semibold text-slate-700">{receivables.dso} days</span></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <StatTile label="Outstanding" value={<Money value={receivables.totalOutstanding} />} accent="text-red-600" sub={`${receivables.overdueCount} overdue`} />
            <StatTile label="Not due" value={<Money value={receivables.buckets.current} />} accent="text-slate-600" />
            <StatTile label="1–30 d" value={<Money value={receivables.buckets.d1_30} />} accent="text-amber-600" />
            <StatTile label="31–60 d" value={<Money value={receivables.buckets.d31_60} />} accent="text-orange-600" />
            <StatTile label="61–90 d" value={<Money value={receivables.buckets.d61_90} />} accent="text-red-500" />
            <StatTile label="90+ d" value={<Money value={receivables.buckets.d90plus} />} accent="text-red-700" />
          </div>
          {receivables.overdue?.length > 0 && (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 uppercase"><tr><th className="text-left py-1">Overdue campaign</th><th className="text-left py-1">Client</th><th className="text-right py-1">Days</th><th className="text-right py-1">Outstanding</th></tr></thead>
                <tbody>
                  {receivables.overdue.slice(0, 10).map((o) => (
                    <tr key={o.orderId} className="border-t border-slate-100">
                      <td className="py-1.5">{o.orderNo}</td>
                      <td className="py-1.5 text-slate-600">{o.client}</td>
                      <td className="py-1.5 text-right text-red-600">{o.daysPast}d</td>
                      <td className="py-1.5 text-right font-medium"><Money value={o.outstanding} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatTile label="Top Media Type" value={overview.topCategory || '—'} accent="text-brand" />
        <StatTile label="GST Collected" value={<Money value={overview.gstCollected} />} />
        <StatTile label="CGST + SGST" value={<Money value={overview.cgst + overview.sgst} />} sub="intra-state" />
        <StatTile label="IGST" value={<Money value={overview.igst} />} sub="inter-state" />
        <StatTile label="TDS Deducted" value={<Money value={overview.tdsDeducted || 0} />} accent="text-indigo-600" sub={`${'₹' + Number(overview.netReceived || 0).toLocaleString('en-IN')} net in bank`} />
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-semibold text-slate-700 mb-1">Revenue by Booking Category</h2>
        <p className="text-xs text-slate-400 mb-3">Click a category to see its clients</p>
        {Object.keys(overview.revenueByCategory || {}).length === 0 ? (
          <div className="text-sm text-slate-400">No categorised orders yet.</div>
        ) : (
          <div className="space-y-1">
            {Object.entries(overview.revenueByCategory).sort((a, b) => b[1] - a[1]).map(([name, value], i) => {
              const max = Math.max(...Object.values(overview.revenueByCategory));
              const clients = overview.revenueByCategoryClients?.[name] || [];
              const open = expandedCat === name;
              return (
                <div key={name} className="rounded-lg">
                  <button
                    onClick={() => setExpandedCat(open ? null : name)}
                    className="w-full flex items-center gap-3 py-1.5 px-1 rounded-lg hover:bg-slate-50 transition text-left"
                  >
                    <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
                    <div className="w-28 sm:w-32 shrink-0 text-sm text-slate-600 truncate">{name}</div>
                    <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                    <div className="w-24 sm:w-28 text-right text-sm font-medium text-slate-800"><Money value={value} /></div>
                  </button>
                  {open && (
                    <div className="ml-8 mr-1 mb-2 mt-1 rounded-lg border border-slate-100 bg-slate-50/60 overflow-hidden">
                      {clients.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-400">No clients.</div>
                      ) : clients.map((cl, ci) => (
                        <div key={ci} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm border-b border-slate-100 last:border-0">
                          <span className="text-slate-600 truncate">{cl.name}<span className="text-slate-400 text-xs"> · {cl.orders} order{cl.orders !== 1 ? 's' : ''}</span></span>
                          <span className="font-medium text-slate-700 shrink-0"><Money value={cl.revenue} /></span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">Revenue & Bookings</h2>
            <select className="input w-auto py-1" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="period" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v, n) => n === 'revenue' ? `₹${v.toLocaleString('en-IN')}` : v} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#1e3a8a" strokeWidth={2} />
              <Line type="monotone" dataKey="bookings" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-700 mb-3">Revenue by Media Type</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={revByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name}>
                {revByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-700 mb-3">Bookings by Category</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={bookingsByType}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-700 mb-3">Top Clients by Revenue</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase"><tr><th className="text-left py-1">Client</th><th className="text-right">Orders</th><th className="text-right">Revenue</th></tr></thead>
            <tbody>
              {topClients.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="py-1.5 font-medium">{c.name}</td>
                  <td className="py-1.5 text-right">{c.orders}</td>
                  <td className="py-1.5 text-right font-medium"><Money value={c.revenue} /></td>
                </tr>
              ))}
              {topClients.length === 0 && <tr><td colSpan="3" className="py-6 text-center text-slate-400">No data yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
