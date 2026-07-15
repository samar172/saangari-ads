import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { useCompany } from '../CompanyContext';
import { Badge, Money, Modal, Spinner } from '../components/ui';

export default function Invoices() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);

  function load() {
    setLoading(true);
    api.get('/invoices', { params: { companyId: activeCompany?.id } }).then((r) => setInvoices(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, [activeCompany]);

  async function markPaid(id) { await api.post(`/invoices/${id}/mark-paid`); load(); }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
        {can(user, 'generateInvoice') && <button className="btn-accent flex items-center gap-1.5" onClick={() => setGenOpen(true)}><Plus size={16} /> Generate Invoice</button>}
      </div>
      {loading ? <Spinner /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Invoice No</th>
                <th className="px-4 py-2 text-left">Client</th>
                <th className="px-4 py-2 text-left">Order / Sites</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} onClick={() => navigate(`/invoices/${i.id}`)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2 font-medium">{i.invoiceNo}</td>
                  <td className="px-4 py-2">{i.client.name}</td>
                  <td className="px-4 py-2">{i.order?.orderNo}<div className="text-xs text-slate-400">{(i.order?.items || []).map((it) => it.site.code).join(', ')}</div></td>
                  <td className="px-4 py-2">{i.taxCategory === 'GST' ? <Badge status="LIVE">{i.interState ? 'IGST' : 'CGST+SGST'}</Badge> : <span className="text-slate-400">Non-GST</span>}</td>
                  <td className="px-4 py-2 text-right font-medium"><Money value={i.total} /></td>
                  <td className="px-4 py-2"><Badge status={i.status} /></td>
                  <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    <button className="text-brand-light underline text-xs" onClick={(e) => { e.stopPropagation(); downloadFile(`/invoices/${i.id}/pdf`, `${i.invoiceNo}.pdf`); }}>PDF</button>
                    {can(user, 'generateInvoice') && i.status !== 'PAID' && (
                      <button className="text-emerald-600 underline text-xs" onClick={(e) => { e.stopPropagation(); markPaid(i.id); }}>Mark paid</button>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-400">No invoices yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {genOpen && <GenerateModal onClose={() => setGenOpen(false)} onDone={() => { setGenOpen(false); load(); }} />}
    </div>
  );
}

function GenerateModal({ onClose, onDone }) {
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Confirmed/live orders not yet invoiced
    api.get('/orders').then((r) => setOrders(r.data.filter((o) => ['CONFIRMED', 'LIVE', 'COMPLETED'].includes(o.status) && o.invoices.length === 0)));
  }, []);

  async function submit() {
    setBusy(true); setErr('');
    try { await api.post('/invoices', { orderId: Number(orderId) }); onDone(); }
    catch (e) { setErr(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Generate Invoice">
      {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
      <label className="label">Order (confirmed/live, not yet invoiced)</label>
      <select className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
        <option value="">Select order…</option>
        {orders.map((o) => {
          const photos = o.items.reduce((n, it) => n + it.photos.length, 0);
          return <option key={o.id} value={o.id}>{o.orderNo} — {o.client.name} — {o.items.length} site(s) {photos === 0 ? '(no photo!)' : ''}</option>;
        })}
      </select>
      <p className="text-xs text-slate-500 mt-2">Invoice generation is blocked until a monitoring photo is uploaded (proof-of-display).</p>
      <button className="btn-primary w-full mt-4" disabled={busy || !orderId} onClick={submit}>{busy ? 'Generating…' : 'Generate'}</button>
    </Modal>
  );
}
