import { Fragment, useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Camera, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import api from '../api';
import { useAuth } from '../auth';
import { useCompany } from '../CompanyContext';
import { Badge, Money, Spinner } from '../components/ui';
import { OrderTabs } from './OrderDetail';

const STATUS_FILTERS = ['', 'QUOTATION', 'CONFIRMED', 'LIVE', 'COMPLETED', 'CANCELLED'];

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—');

// An order spans however long its live lines run: earliest start to latest end.
// Cancelled lines are ignored — they no longer occupy anything.
function displayPeriod(items = []) {
  const live = items.filter((i) => i.status !== 'CANCELLED' && i.startDate && i.endDate);
  if (live.length === 0) return { start: null, end: null };
  return {
    start: live.reduce((a, i) => (new Date(i.startDate) < new Date(a) ? i.startDate : a), live[0].startDate),
    end: live.reduce((a, i) => (new Date(i.endDate) > new Date(a) ? i.endDate : a), live[0].endDate),
  };
}

export default function Orders() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const isQuotations = location.pathname.includes('quotations');
  const [status, setStatus] = useState(isQuotations ? 'QUOTATION' : '');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    setStatus(isQuotations ? 'QUOTATION' : '');
  }, [isQuotations]);

  function load() {
    setLoading(true);
    api.get('/orders', {
      params: {
        status: status || undefined,
        // "All statuses" on Campaigns still means all *bookings* — quotations
        // live on their own tab and must not mix in here.
        excludeStatus: !status && !isQuotations ? 'QUOTATION' : undefined,
        companyId: activeCompany?.id,
      },
    }).then((r) => setOrders(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, [status, activeCompany]);

  // Navigate to highlighted order if present in URL on mount
  useEffect(() => {
    const highlight = params.get('highlight');
    if (highlight) {
      navigate(`/orders/${highlight}`);
    }
  }, [params, navigate]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{isQuotations ? 'Quotations' : 'Campaigns'}</h1>
          <p className="text-sm text-slate-500">{user.role === 'SALES' ? `Your ${isQuotations ? 'quotations' : 'campaigns'}` : `All ${isQuotations ? 'quotations' : 'campaigns'}`}</p>
        </div>
        {!isQuotations && (
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.filter(s => s !== 'QUOTATION').map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        )}
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left border-b border-slate-200">Order</th>
                <th className="px-4 py-3 text-left border-b border-slate-200">Client</th>
                <th className="px-4 py-3 text-left border-b border-slate-200">Sites</th>
                <th className="px-4 py-3 text-left border-b border-slate-200">Start</th>
                <th className="px-4 py-3 text-left border-b border-slate-200">End</th>
                <th className="px-4 py-3 text-right border-b border-slate-200">{isQuotations ? 'Quoted Value' : 'Grand Total'}</th>
                <th className="px-4 py-3 text-right border-b border-slate-200">Balance</th>
                <th className="px-4 py-3 text-left border-b border-slate-200">Status</th>
                <th className="px-4 py-3 text-left border-b border-slate-200"><Camera size={16} className="text-slate-400" /></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const photos = o.items.reduce((n, it) => n + it.photos.length, 0);
                const period = displayPeriod(o.items);
                const open = expandedId === o.id;
                return (
                  <Fragment key={o.id}>
                    <tr
                      onClick={() => setExpandedId(open ? null : o.id)}
                      className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition ${open ? 'bg-slate-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-brand">
                        <span className="mr-1.5 text-slate-400 align-middle">
                          {open ? <ChevronDown size={14} className="inline" /> : <ChevronRight size={14} className="inline" />}
                        </span>
                        {o.orderNo}
                        <div className="text-xs text-slate-400 font-normal pl-[22px]">{new Date(o.bookingDate).toLocaleDateString('en-IN')}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{o.client.name}</td>
                      <td className="px-4 py-3">
                        <span className="badge bg-slate-100 text-slate-700 font-medium">{o.items.length} site{o.items.length !== 1 ? 's' : ''}</span>
                        <div className="text-[11px] text-slate-400 truncate max-w-[160px] mt-1">{o.items.map((i) => i.site.code).join(', ')}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmt(period.start)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmt(period.end)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700"><Money value={o.grandTotal} /></td>
                      <td className="px-4 py-3 text-right font-medium">
                        {/* Nothing is owed on a quotation or a cancelled order, so
                            show neither a red balance nor a misleading "Paid". */}
                        {!o.receivable
                          ? <span className="text-slate-300">—</span>
                          : o.balanceDue > 0
                            ? <span className="text-red-600"><Money value={o.balanceDue} /></span>
                            : <span className="text-emerald-600">Paid</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge status={o.status} />
                        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide">
                          <span className={o.paymentTerms === 'POSTPAID' ? 'text-orange-600' : 'text-emerald-600'}>
                            {o.paymentTerms === 'POSTPAID' ? 'Postpaid' : 'Advance'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{photos > 0 ? <span className="flex items-center gap-1"><Camera size={14} className="text-slate-500" /> {photos}</span> : <span className="text-slate-300">—</span>}</td>
                    </tr>
                    {open && (
                      <tr className="border-b border-slate-200 bg-slate-50/60">
                        <td colSpan="9" className="px-3 py-3">
                          <ExpandedOrder id={o.id} onGo={() => navigate(`/orders/${o.id}`)} onChangedList={load} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {orders.length === 0 && <tr><td colSpan="9" className="px-4 py-12 text-center text-slate-400">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Inline expansion of a row: the full order, fetched on demand, rendered with the
// same tabbed body as the detail page — so operations like shift/stop and
// recording a payment work here too, without leaving the list.
function ExpandedOrder({ id, onGo, onChangedList }) {
  const { user } = useAuth();
  const [o, setO] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);

  function load() { api.get(`/orders/${id}`).then((r) => setO(r.data)).catch(() => setO(false)); }
  useEffect(load, [id]);

  // A change made in here (status, shift, payment) also changes the row above it.
  function reload() { load(); onChangedList?.(); }

  async function changeStatus(s) {
    setBusy(true);
    try { await api.post(`/orders/${id}/status`, { status: s }); reload(); }
    finally { setBusy(false); }
  }

  if (o === false) return <div className="p-4 text-sm text-red-600">Could not load this order.</div>;
  if (!o) return <div className="py-6"><Spinner /></div>;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <span className="font-semibold text-slate-800">{o.orderNo}</span>
        <span className="text-sm text-slate-500">{o.client.name}</span>
        <Badge status={o.status} />
        {o.category && <span className="badge bg-teal-100 text-teal-800">{o.category.name}</span>}
        <div className="flex-1" />
        <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={onGo}>
          <ExternalLink size={13} /> Open full page
        </button>
      </div>
      <OrderTabs
        o={o} user={user} busy={busy} changeStatus={changeStatus}
        onChanged={reload} tab={tab} setTab={setTab} compact
      />
    </div>
  );
}
