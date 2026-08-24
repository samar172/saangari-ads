import { useEffect, useState } from 'react';
import { Download, ChevronRight } from 'lucide-react';
import api, { downloadFile } from '../api';
import { useCompany } from '../CompanyContext';
import { Money, Spinner, StatTile } from '../components/ui';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#1e3a8a', '#f59e0b', '#059669', '#7c3aed', '#dc2626'];

export default function Reports() {
  const { companies, activeCompany } = useCompany();
  // Default to the globally active company, or 'ALL' if none
  const [localCid, setLocalCid] = useState(activeCompany?.id || 'ALL');
  const [overview, setOverview] = useState(null);
  const [period, setPeriod] = useState('month');
  const [series, setSeries] = useState([]);
  const [topClients, setTopClients] = useState([]);
  const [expandedCat, setExpandedCat] = useState(null);

  // If localCid is 'ALL', we don't send companyId to the API
  const cid = localCid === 'ALL' ? undefined : localCid;

  // Sync if activeCompany changes and we haven't explicitly set to 'ALL'
  useEffect(() => {
    if (activeCompany && localCid !== 'ALL' && localCid !== activeCompany.id) {
      setLocalCid(activeCompany.id);
    }
  }, [activeCompany]);

  useEffect(() => {
    api.get('/reports/overview', { params: { companyId: cid } }).then((r) => setOverview(r.data));
    api.get('/reports/top-clients', { params: { companyId: cid } }).then((r) => setTopClients(r.data));
  }, [cid]);
  useEffect(() => { api.get('/reports/timeseries', { params: { period, companyId: cid } }).then((r) => setSeries(r.data)); }, [period, cid]);

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
        <StatTile label="Booked Value" value={<Money value={overview.bookedValue} />} accent="text-emerald-600" sub="incl. GST · confirmed onward" />
        <StatTile label="Collected" value={<Money value={overview.paidRevenue} />} accent="text-emerald-600" />
        <StatTile label="Outstanding" value={<Money value={overview.outstanding} />} accent="text-red-600" />
        {/* Quotations are pipeline, deliberately kept out of booked value. */}
        <StatTile label="Quotation Pipeline" value={<Money value={overview.quotationValue || 0} />} accent="text-amber-600" sub={`${overview.quotationCount || 0} open`} />
        <StatTile label="Orders" value={overview.totalOrders} sub={`${overview.totalBookings} site bookings`} />
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
