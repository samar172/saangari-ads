import { useEffect, useState } from 'react';
import api from '../api';
import { Money, Spinner, StatTile } from '../components/ui';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#1e3a8a', '#f59e0b', '#059669', '#7c3aed', '#dc2626'];

export default function Reports() {
  const [overview, setOverview] = useState(null);
  const [period, setPeriod] = useState('month');
  const [series, setSeries] = useState([]);
  const [topClients, setTopClients] = useState([]);

  useEffect(() => {
    api.get('/reports/overview').then((r) => setOverview(r.data));
    api.get('/reports/top-clients').then((r) => setTopClients(r.data));
  }, []);
  useEffect(() => { api.get('/reports/timeseries', { params: { period } }).then((r) => setSeries(r.data)); }, [period]);

  if (!overview) return <Spinner />;

  const revByType = Object.entries(overview.revenueByType).map(([name, value]) => ({ name, value }));
  const bookingsByType = Object.entries(overview.bookingsByType).map(([name, value]) => ({ name, value }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Reports & Analytics</h1>
      <p className="text-sm text-slate-500 mb-5">Company performance overview</p>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <StatTile label="Occupancy" value={`${overview.occupancy}%`} accent="text-brand" sub={`${overview.siteStatus.BOOKED || 0}/${overview.siteCount} booked`} />
        <StatTile label="Total Revenue" value={<Money value={overview.totalRevenue} />} accent="text-emerald-600" />
        <StatTile label="Collected" value={<Money value={overview.paidRevenue} />} accent="text-emerald-600" />
        <StatTile label="Outstanding" value={<Money value={overview.outstanding} />} accent="text-red-600" />
        <StatTile label="Total Bookings" value={overview.totalBookings} />
        <StatTile label="Clients" value={overview.totalClients} sub={`${overview.repeatClients} repeat`} />
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
          <h2 className="font-semibold text-slate-700 mb-3">Revenue by Category</h2>
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
            <thead className="text-xs text-slate-500 uppercase"><tr><th className="text-left py-1">Client</th><th className="text-right">Bookings</th><th className="text-right">Revenue</th></tr></thead>
            <tbody>
              {topClients.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="py-1.5 font-medium">{c.name}</td>
                  <td className="py-1.5 text-right">{c.bookings}</td>
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
