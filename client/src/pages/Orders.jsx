import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Camera } from 'lucide-react';
import api from '../api';
import { useAuth } from '../auth';
import { useCompany } from '../CompanyContext';
import { Badge, Money, Spinner } from '../components/ui';

const STATUS_FILTERS = ['', 'QUOTATION', 'CONFIRMED', 'LIVE', 'COMPLETED', 'CANCELLED'];

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

  useEffect(() => {
    setStatus(isQuotations ? 'QUOTATION' : '');
  }, [isQuotations]);

  function load() {
    setLoading(true);
    api.get('/orders', { params: { status: status || undefined, companyId: activeCompany?.id } })
      .then((r) => setOrders(r.data)).finally(() => setLoading(false));
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
      <div className="flex items-center justify-between mb-5">
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
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left border-b border-slate-200">Order</th>
                <th className="px-4 py-3 text-left border-b border-slate-200">Client</th>
                <th className="px-4 py-3 text-left border-b border-slate-200">Sites</th>
                <th className="px-4 py-3 text-right border-b border-slate-200">Grand Total</th>
                <th className="px-4 py-3 text-right border-b border-slate-200">Balance</th>
                <th className="px-4 py-3 text-left border-b border-slate-200">Status</th>
                <th className="px-4 py-3 text-left border-b border-slate-200"><Camera size={16} className="text-slate-400" /></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const photos = o.items.reduce((n, it) => n + it.photos.length, 0);
                return (
                  <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition">
                    <td className="px-4 py-3 font-medium text-brand">{o.orderNo}<div className="text-xs text-slate-400 font-normal">{new Date(o.bookingDate).toLocaleDateString('en-IN')}</div></td>
                    <td className="px-4 py-3 font-medium text-slate-800">{o.client.name}</td>
                    <td className="px-4 py-3">
                      <span className="badge bg-slate-100 text-slate-700 font-medium">{o.items.length} site{o.items.length !== 1 ? 's' : ''}</span>
                      <div className="text-[11px] text-slate-400 truncate max-w-[160px] mt-1">{o.items.map((i) => i.site.code).join(', ')}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700"><Money value={o.grandTotal} /></td>
                    <td className="px-4 py-3 text-right font-medium">{o.balanceDue > 0 ? <span className="text-red-600"><Money value={o.balanceDue} /></span> : <span className="text-emerald-600">Paid</span>}</td>
                    <td className="px-4 py-3"><Badge status={o.status} /></td>
                    <td className="px-4 py-3">{photos > 0 ? <span className="flex items-center gap-1"><Camera size={14} className="text-slate-500" /> {photos}</span> : <span className="text-slate-300">—</span>}</td>
                  </tr>
                );
              })}
              {orders.length === 0 && <tr><td colSpan="7" className="px-4 py-12 text-center text-slate-400">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
