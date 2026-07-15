import { useEffect, useState } from 'react';
import { Download, ChevronDown, ChevronRight } from 'lucide-react';
import dayjs from 'dayjs';
import api, { downloadFile } from '../api';
import { useCompany } from '../CompanyContext';
import { Money, Spinner } from '../components/ui';

export default function Payments() {
  const { activeCompany } = useCompany();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [expandedDate, setExpandedDate] = useState(null);

  function load() {
    setLoading(true);
    api.get('/payments/datewise', { params: { companyId: activeCompany?.id, from, to } })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }
  useEffect(load, [activeCompany, from, to]);

  const totals = data.reduce(
    (acc, d) => ({
      count: acc.count + d.count,
      gross: acc.gross + d.totalGross,
      tds: acc.tds + d.totalTds,
      net: acc.net + d.totalNet,
    }),
    { count: 0, gross: 0, tds: 0, net: 0 }
  );

  function exportExcel() {
    const params = new URLSearchParams();
    if (activeCompany?.id) params.set('companyId', activeCompany.id);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    downloadFile(`/payments/export/excel?${params.toString()}`, 'payments.xlsx');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Payments</h1>
          <p className="text-sm text-slate-500">
            {activeCompany ? `${activeCompany.name} — ` : ''}Date-wise payment received
          </p>
        </div>
        <button className="btn-accent text-sm flex items-center gap-1.5" onClick={exportExcel}><Download size={16} /> Export Excel</button>
      </div>

      {/* Date range filter */}
      <div className="card p-4 mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs py-1.5" onClick={() => { setFrom(dayjs().startOf('month').format('YYYY-MM-DD')); setTo(dayjs().format('YYYY-MM-DD')); }}>This month</button>
            <button className="btn-ghost text-xs py-1.5" onClick={() => { setFrom(dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')); setTo(dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')); }}>Last month</button>
            <button className="btn-ghost text-xs py-1.5" onClick={() => { setFrom(dayjs().startOf('year').format('YYYY-MM-DD')); setTo(dayjs().format('YYYY-MM-DD')); }}>This year</button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SummaryTile label="Total Payments" value={totals.count} />
        <SummaryTile label="Gross Collected" value={<Money value={totals.gross} />} accent="text-emerald-600" />
        <SummaryTile label="TDS Deducted" value={<Money value={totals.tds} />} accent="text-indigo-600" />
        <SummaryTile label="Net Received" value={<Money value={totals.net} />} accent="text-brand" />
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-right">Payments</th>
                <th className="px-4 py-2 text-right">Gross Amount</th>
                <th className="px-4 py-2 text-right">TDS</th>
                <th className="px-4 py-2 text-right">Net Received</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <DateRow
                  key={d.date}
                  day={d}
                  expanded={expandedDate === d.date}
                  onToggle={() => setExpandedDate(expandedDate === d.date ? null : d.date)}
                />
              ))}
              {data.length === 0 && (
                <tr><td colSpan="5" className="px-4 py-10 text-center text-slate-400">No payments in this date range</td></tr>
              )}
            </tbody>
            {data.length > 0 && (
              <tfoot className="bg-slate-50 font-semibold text-sm">
                <tr>
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right">{totals.count}</td>
                  <td className="px-4 py-2 text-right"><Money value={totals.gross} /></td>
                  <td className="px-4 py-2 text-right text-indigo-600"><Money value={totals.tds} /></td>
                  <td className="px-4 py-2 text-right text-brand"><Money value={totals.net} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

function DateRow({ day, expanded, onToggle }) {
  return (
    <>
      <tr
        className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-2 font-medium">
          <span className="mr-1.5 text-slate-400">{expanded ? <ChevronDown size={14} className="inline" /> : <ChevronRight size={14} className="inline" />}</span>
          {new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </td>
        <td className="px-4 py-2 text-right">{day.count}</td>
        <td className="px-4 py-2 text-right font-medium"><Money value={day.totalGross} /></td>
        <td className="px-4 py-2 text-right text-indigo-600">{day.totalTds > 0 ? <Money value={day.totalTds} /> : '—'}</td>
        <td className="px-4 py-2 text-right font-medium"><Money value={day.totalNet} /></td>
      </tr>
      {expanded && day.payments.map((p) => (
        <tr key={p.id} className="bg-slate-50/80 border-t border-slate-100">
          <td className="px-4 py-1.5 pl-10 text-xs text-slate-600">
            {p.client.name}
            <span className="text-slate-400 ml-1">· {p.order.orderNo}</span>
          </td>
          <td className="px-4 py-1.5 text-right text-xs">
            <span className="badge bg-slate-100 text-slate-600 text-[10px]">{p.mode}</span>
          </td>
          <td className="px-4 py-1.5 text-right text-xs"><Money value={p.amount} /></td>
          <td className="px-4 py-1.5 text-right text-xs text-indigo-600">
            {p.tdsApplicable ? <><Money value={p.tdsAmount} /> <span className="text-[10px]">({p.tdsPct}%)</span></> : '—'}
          </td>
          <td className="px-4 py-1.5 text-right text-xs"><Money value={p.netReceived || p.amount} /></td>
        </tr>
      ))}
    </>
  );
}

function SummaryTile({ label, value, accent = 'text-slate-800' }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
    </div>
  );
}
