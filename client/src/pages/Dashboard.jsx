import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  PlusSquare, Banknote, Receipt, FileText, TrendingUp, TrendingDown,
  AlertTriangle, Activity, ShieldCheck, ChevronRight,
} from 'lucide-react';
import api from '../api';
import { useAuth, can } from '../auth';
import { useCompany } from '../CompanyContext';
import { Money, Spinner, StatTile } from '../components/ui';

// Financial-year start (1 Apr) — mirrors Reports.jsx.
const fyStart = () => (dayjs().month() >= 3 ? dayjs().month(3) : dayjs().subtract(1, 'year').month(3)).date(1);

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

const SEV_DOT = { critical: 'bg-red-500', pending: 'bg-amber-500', info: 'bg-sky-500' };

export default function Dashboard() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const cid = activeCompany?.id;

  const [overview, setOverview] = useState(null);
  const [notif, setNotif] = useState({ items: [], counts: {} });
  const [pendingApprovals, setPendingApprovals] = useState(null);

  const from = fyStart().format('YYYY-MM-DD');
  const to = dayjs().format('YYYY-MM-DD');
  const isReviewer = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    api.get('/reports/overview', { params: { companyId: cid, from, to } })
      .then((r) => setOverview(r.data)).catch(() => setOverview(null));
    api.get('/notifications').then((r) => setNotif(r.data)).catch(() => setNotif({ items: [], counts: {} }));
    if (isReviewer) {
      api.get('/approvals', { params: { status: 'PENDING' } })
        .then((r) => setPendingApprovals(Array.isArray(r.data) ? r.data.length : 0))
        .catch(() => setPendingApprovals(null));
    }
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = notif.items || [];
  const attention = items.filter((i) => i.severity === 'critical' || i.severity === 'pending').slice(0, 6);
  const recent = items.filter((i) => i.category === 'ACTIVITY').slice(0, 6);

  const goItem = (i) => {
    if (i.category === 'INVOICE' && i.invoiceId) navigate(`/invoices/${i.invoiceId}`);
    else if (i.orderId) navigate(`/orders?highlight=${i.orderId}`);
  };

  const actions = [
    { label: 'New Booking', to: '/new-booking', icon: PlusSquare, show: can(user, 'createBooking') },
    { label: 'Record Payment', to: '/payments/record', icon: Banknote, show: can(user, 'recordPayment') },
    { label: 'Generate Invoice', to: '/invoices/new', icon: Receipt, show: can(user, 'generateInvoice') },
    { label: 'New Quotation', to: '/quotations/new', icon: FileText, show: can(user, 'createBooking') },
  ].filter((a) => a.show);

  const hi = (user?.name || '').split(' ')[0];

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {hi ? `Welcome back, ${hi}. ` : ''}Here’s where things stand{activeCompany ? ` for ${activeCompany.name}` : ''} — FY {fyStart().format('YYYY')}–{dayjs(to).format('YY')}.
        </p>
      </div>

      {/* Quick actions */}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {actions.map((a) => (
            <button key={a.to} onClick={() => navigate(a.to)} className="btn-primary text-sm flex items-center gap-1.5">
              <a.icon size={16} /> {a.label}
            </button>
          ))}
        </div>
      )}

      {!overview ? <Spinner /> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatTile label="Booked Value" value={<Money value={overview.bookedValue} />} accent="text-emerald-600"
            sub={<span className="flex items-center gap-1.5">FY, incl. GST <Delta curr={overview.bookedValue} prev={overview.prev?.bookedValue} /></span>} />
          <StatTile label="Collected" value={<Money value={overview.paidRevenue} />} accent="text-emerald-600"
            sub={<Delta curr={overview.paidRevenue} prev={overview.prev?.paidRevenue} />} />
          <StatTile label="Outstanding" value={<Money value={overview.outstanding} />} accent="text-red-600" />
          <StatTile label="Occupancy" value={`${overview.occupancy}%`} accent="text-brand" sub={`${overview.siteStatus?.BOOKED || 0}/${overview.siteCount} booked`} />
          <StatTile label="Quotation Pipeline" value={<Money value={overview.quotationValue || 0} />} accent="text-amber-600" sub={`${overview.quotationCount || 0} open`} />
          <StatTile label="Orders" value={overview.totalOrders}
            sub={<span className="flex items-center gap-1.5">FY <Delta curr={overview.totalOrders} prev={overview.prev?.totalOrders} /></span>} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Needs attention */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-slate-800 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> Needs attention</div>
            {isReviewer && pendingApprovals > 0 && (
              <button onClick={() => navigate('/approvals')} className="text-xs text-brand hover:underline flex items-center gap-1">
                <ShieldCheck size={13} /> {pendingApprovals} approval{pendingApprovals !== 1 ? 's' : ''}
              </button>
            )}
          </div>
          {attention.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">All clear — nothing overdue or pending.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {attention.map((i) => (
                <button key={i.id} onClick={() => goItem(i)} className="w-full text-left py-2.5 flex items-start gap-3 hover:bg-slate-50 rounded-lg px-2 -mx-2 transition">
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${SEV_DOT[i.severity] || SEV_DOT.info}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{i.title}</div>
                    <div className="text-xs text-slate-500 truncate">{i.detail}</div>
                  </div>
                  <ChevronRight size={15} className="text-slate-300 mt-1 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <div className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><Activity size={16} className="text-sky-500" /> Recent activity</div>
          {recent.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">No recent activity.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recent.map((i) => (
                <button key={i.id} onClick={() => goItem(i)} className="w-full text-left py-2.5 flex items-start gap-3 hover:bg-slate-50 rounded-lg px-2 -mx-2 transition">
                  <span className="mt-1.5 h-2 w-2 rounded-full shrink-0 bg-slate-300" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{i.title}</div>
                    <div className="text-xs text-slate-500 truncate">{i.detail}</div>
                  </div>
                  {i.dueDate && <span className="text-[11px] text-slate-400 mt-1 whitespace-nowrap">{dayjs(i.dueDate).format('D MMM')}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
