import { useEffect, useState } from 'react';
import { Download, ChevronDown, ChevronRight, PlusSquare } from 'lucide-react';
import dayjs from 'dayjs';
import api, { downloadFile } from '../api';
import { useCompany } from '../CompanyContext';
import { Money, Spinner } from '../components/ui';

// Same rates offered on the order detail payment form.
const TDS_RATES = [1, 2, 5, 10];

export default function Payments() {
  const { activeCompany, companies } = useCompany();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [expandedDate, setExpandedDate] = useState(null);
  const [modal, setModal] = useState(false);
  // '' means every company. A payment belongs to its order's company, so money
  // collected against another entity's order is invisible while scoped — which
  // looks exactly like a missing payment. Make the scope explicit and switchable.
  const [companyId, setCompanyId] = useState(activeCompany?.id ? String(activeCompany.id) : '');

  useEffect(() => { setCompanyId(activeCompany?.id ? String(activeCompany.id) : ''); }, [activeCompany]);

  function load() {
    setLoading(true);
    api.get('/payments/datewise', { params: { companyId: companyId || undefined, from, to } })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }
  useEffect(load, [companyId, from, to]);

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
    if (companyId) params.set('companyId', companyId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    downloadFile(`/payments/export/excel?${params.toString()}`, 'payments.xlsx');
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Payments</h1>
          <p className="text-sm text-slate-500">
            Date-wise payment received — {companyId
              ? (companies.find((c) => String(c.id) === companyId)?.name || 'selected business')
              : 'all businesses'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setModal(true)}><PlusSquare size={16} /> Record Payment</button>
          <button className="btn-accent text-sm flex items-center gap-1.5" onClick={exportExcel}><Download size={16} /> Export Excel</button>
        </div>
      </div>

      {/* Company + date range filter */}
      <div className="card p-4 mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">Business</label>
            <select className="input w-auto" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">All businesses</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost text-xs py-1.5" onClick={() => { const t = dayjs().format('YYYY-MM-DD'); setFrom(t); setTo(t); }}>Today</button>
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
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
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
                  showCompany={!companyId}
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
      
      {modal && <RecordPaymentModal onClose={() => setModal(false)} onSaved={load} />}
    </div>
  );
}

function DateRow({ day, expanded, onToggle, showCompany }) {
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
            {/* Which entity the money landed in — only ambiguous when unscoped. */}
            {showCompany && p.company && (
              <span className="badge bg-slate-100 text-slate-500 text-[10px] ml-1.5">{p.company.name}</span>
            )}
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

function RecordPaymentModal({ onClose, onSaved }) {
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState([]);
  const [client, setClient] = useState(null);
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('CASH');
  const [reference, setReference] = useState('');
  const [tdsApplicable, setTdsApplicable] = useState(false);
  const [tdsPct, setTdsPct] = useState(TDS_RATES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Mirrors the server: TDS is withheld from the gross, but the order is still
  // credited the full gross — the client remits the deduction on our behalf.
  const gross = Number(amount) || 0;
  const tds = tdsApplicable ? Math.round(gross * (Number(tdsPct) || 0) / 100) : 0;

  useEffect(() => {
    if (search.length > 1 && !client) {
      api.get(`/clients?q=${search}`).then((r) => setClients(r.data));
    } else {
      setClients([]);
    }
  }, [search, client]);

  useEffect(() => {
    if (client) {
      api.get('/orders', { params: { clientId: client.id } }).then((r) => {
        setOrders(r.data.filter((o) => o.balanceDue > 0));
      });
    }
  }, [client]);

  async function submit(e) {
    e.preventDefault();
    if (!orderId || !amount) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/orders/${orderId}/payments`, {
        amount, mode, reference: reference || undefined,
        tdsApplicable, tdsPct: tdsApplicable ? Number(tdsPct) : 0,
      });
      onSaved();
      onClose();
    } catch (e2) {
      // Surface server rejections (e.g. paying against a quotation) instead of
      // closing the modal as though it had saved.
      setErr(e2.response?.data?.error || 'Could not record this payment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md my-auto">
        <h2 className="text-xl font-bold mb-4">Record Payment</h2>
        
        <div className="space-y-4">
          {!client ? (
            <div>
              <label className="label">Search Client</label>
              <input type="text" className="input" placeholder="Name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
              {clients.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                  {clients.map((c) => (
                    <div key={c.id} className="p-2 border-b last:border-b-0 border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => { setClient(c); setSearch(''); }}>
                      <div className="font-medium text-sm">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.phone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="label mb-0">Client</label>
                <button type="button" className="text-xs text-brand hover:underline" onClick={() => { setClient(null); setOrderId(''); }}>Change</button>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">{client.name} ({client.phone})</div>
            </div>
          )}

          {client && (
            <div>
              <label className="label">Pending Order</label>
              <select className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)} required>
                <option value="">Select an order...</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>{o.orderNo} (Balance: ₹{o.balanceDue})</option>
                ))}
              </select>
              {orders.length === 0 && <div className="text-xs text-red-500 mt-1">No pending orders found.</div>}
            </div>
          )}

          {orderId && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Amount (gross)</label>
                  <input type="number" className="input" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Mode</label>
                  <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                    {['CASH', 'UPI', 'BANK', 'CHEQUE', 'CARD'].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Reference (optional)</label>
                <input className="input" placeholder="UTR / cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={tdsApplicable} onChange={(e) => setTdsApplicable(e.target.checked)} />
                  TDS applicable on this payment
                </label>
                {tdsApplicable && (
                  <>
                    <select className="input py-2 text-sm" value={tdsPct} onChange={(e) => setTdsPct(e.target.value)}>
                      {TDS_RATES.map((r) => <option key={r} value={r}>{r}% TDS</option>)}
                    </select>
                    <div className="text-sm text-slate-600 space-y-1">
                      <div className="flex justify-between"><span>TDS deducted</span><span className="text-indigo-700 font-medium">−<Money value={tds} /></span></div>
                      <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span>Net received in bank</span><span className="font-bold text-slate-800"><Money value={gross - tds} /></span></div>
                      <p className="text-xs text-slate-500 pt-1 leading-tight">
                        The order is still credited the full <Money value={gross} /> — the client remits the TDS on your behalf.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !orderId || !amount}>Save Payment</button>
        </div>
      </form>
    </div>
  );
}
