import { Fragment, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Camera, ChevronRight, ChevronDown, ExternalLink, Download, SlidersHorizontal } from 'lucide-react';
import api, { downloadFile } from '../api';
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

// Every column the admin can turn on. `always` columns can't be hidden. The
// order here is the render order; `cell(o, ctx)` returns the cell content.
const COLUMNS = [
  { key: 'order', label: 'Order', always: true, align: 'left',
    cell: (o) => (
      <>
        {o.orderNo}
        <div className="text-xs text-slate-400 font-normal pl-[22px]">{new Date(o.bookingDate).toLocaleDateString('en-IN')}</div>
      </>
    ) },
  { key: 'client', label: 'Client', align: 'left', cell: (o) => <span className="font-medium text-slate-800">{o.client.name}</span> },
  { key: 'category', label: 'Category', align: 'left', cell: (o) => o.category ? <span className="badge bg-teal-100 text-teal-800">{o.category.name}</span> : <span className="text-slate-300">—</span> },
  { key: 'business', label: 'Business', align: 'left', cell: (o) => <span className="text-slate-500">{o.company?.name || '—'}</span> },
  { key: 'sites', label: 'Sites', align: 'left',
    cell: (o) => (
      <>
        <span className="badge bg-slate-100 text-slate-700 font-medium">{o.items.length} site{o.items.length !== 1 ? 's' : ''}</span>
        <div className="text-[11px] text-slate-400 truncate max-w-[160px] mt-1">{o.items.map((i) => i.site.code).join(', ')}</div>
      </>
    ) },
  { key: 'start', label: 'Start', align: 'left', cell: (o) => <span className="whitespace-nowrap text-slate-600">{fmt(displayPeriod(o.items).start)}</span> },
  { key: 'end', label: 'End', align: 'left', cell: (o) => <span className="whitespace-nowrap text-slate-600">{fmt(displayPeriod(o.items).end)}</span> },
  { key: 'total', label: 'Grand Total', align: 'right', cell: (o) => <span className="font-semibold text-slate-700"><Money value={o.grandTotal} /></span> },
  { key: 'paid', label: 'Paid', align: 'right', cell: (o) => o.receivable ? <span className="text-emerald-600"><Money value={o.amountPaid} /></span> : <span className="text-slate-300">—</span> },
  { key: 'balance', label: 'Balance', align: 'right',
    cell: (o) => !o.receivable ? <span className="text-slate-300">—</span>
      : o.balanceDue > 0 ? <span className="text-red-600 font-medium"><Money value={o.balanceDue} /></span>
        : <span className="text-emerald-600">Paid</span> },
  { key: 'terms', label: 'Terms', align: 'left', cell: (o) => (
    <span className={`text-[11px] font-semibold uppercase ${o.paymentTerms === 'POSTPAID' ? 'text-orange-600' : 'text-emerald-600'}`}>
      {o.paymentTerms === 'POSTPAID' ? 'Postpaid' : 'Advance'}
    </span>
  ) },
  { key: 'status', label: 'Status', align: 'left', cell: (o) => <Badge status={o.status} /> },
  { key: 'photos', label: 'Photos', align: 'left',
    cell: (o) => {
      const n = o.items.reduce((a, it) => a + it.photos.length, 0);
      return n > 0 ? <span className="flex items-center gap-1"><Camera size={14} className="text-slate-500" /> {n}</span> : <span className="text-slate-300">—</span>;
    } },
];

const DEFAULT_VISIBLE = ['order', 'client', 'sites', 'start', 'end', 'total', 'balance', 'terms', 'status', 'photos'];
const STORAGE_KEY = 'orders.columns.v1';

function loadVisible() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (e) { /* ignore */ }
  return DEFAULT_VISIBLE;
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
  // Admin-chosen visible columns, persisted so the choice survives reloads.
  const [visible, setVisible] = useState(loadVisible);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(visible)); }, [visible]);
  const cols = COLUMNS.filter((c) => c.always || visible.includes(c.key));

  function exportExcel() {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    else if (!isQuotations) p.set('excludeStatus', 'QUOTATION');
    if (activeCompany?.id) p.set('companyId', activeCompany.id);
    downloadFile(`/exports/orders/excel?${p.toString()}`, isQuotations ? 'quotations.xlsx' : 'campaigns.xlsx');
  }

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
        <div className="flex flex-wrap items-center gap-2">
          {!isQuotations && (
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FILTERS.filter(s => s !== 'QUOTATION').map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
            </select>
          )}
          <ColumnPicker visible={visible} setVisible={setVisible} />
          <button className="btn-accent text-sm flex items-center gap-1.5" onClick={exportExcel}><Download size={16} /> Export Excel</button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className={`px-4 py-3 border-b border-slate-200 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {c.key === 'total' && isQuotations ? 'Quoted Value' : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const open = expandedId === o.id;
                return (
                  <Fragment key={o.id}>
                    <tr
                      onClick={() => setExpandedId(open ? null : o.id)}
                      className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition ${open ? 'bg-slate-50' : ''}`}
                    >
                      {cols.map((c) => (
                        <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.key === 'order' ? 'font-medium text-brand' : ''}`}>
                          {c.key === 'order' && (
                            <span className="mr-1.5 text-slate-400 align-middle">
                              {open ? <ChevronDown size={14} className="inline" /> : <ChevronRight size={14} className="inline" />}
                            </span>
                          )}
                          {c.cell(o)}
                        </td>
                      ))}
                    </tr>
                    {open && (
                      <tr className="border-b border-slate-200 bg-slate-50/60">
                        <td colSpan={cols.length} className="px-3 py-3">
                          <ExpandedOrder id={o.id} onGo={() => navigate(`/orders/${o.id}`)} onChangedList={load} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {orders.length === 0 && <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-slate-400">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Dropdown of checkboxes controlling which columns show. Closes on outside click.
function ColumnPicker({ visible, setVisible }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggle = (key) => setVisible((v) => v.includes(key) ? v.filter((k) => k !== key) : [...v, key]);

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={16} /> Columns
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white shadow-xl p-2">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Show columns</div>
          <div className="max-h-72 overflow-y-auto">
            {COLUMNS.map((c) => (
              <label key={c.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${c.always ? 'opacity-50' : 'hover:bg-slate-50 cursor-pointer'}`}>
                <input
                  type="checkbox"
                  disabled={c.always}
                  checked={c.always || visible.includes(c.key)}
                  onChange={() => toggle(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>
          <button className="w-full mt-1 text-xs text-brand hover:underline py-1" onClick={() => setVisible(DEFAULT_VISIBLE)}>Reset to default</button>
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
