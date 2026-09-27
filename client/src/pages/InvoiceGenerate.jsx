import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../api';

// Full-page "Generate Invoice" flow (was a modal on the Invoices list). Pick a
// confirmed/live order not yet invoiced, set a due date, and raise the bill.
export default function InvoiceGenerate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState(params.get('orderId') || '');
  const [dueDate, setDueDate] = useState('');
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState(''); // soft photo-gate → offer "invoice anyway"
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Confirmed/live orders not yet invoiced
    api.get('/orders').then((r) => setOrders(r.data.filter((o) => ['CONFIRMED', 'LIVE', 'COMPLETED'].includes(o.status) && o.invoices.length === 0)));
  }, []);

  const selectedOrder = orders.find((o) => String(o.id) === String(orderId));

  async function submit(force) {
    setBusy(true); setErr(''); if (force) setWarn('');
    try {
      const { data } = await api.post('/invoices', {
        orderId: Number(orderId),
        force: !!force,
        dueDate: dueDate || undefined,
      });
      navigate(data?.id ? `/invoices/${data.id}` : '/invoices');
    } catch (e) {
      const d = e.response?.data;
      if (e.response?.status === 422 && d?.canForce) setWarn(d.error || 'Proof-of-display missing.');
      else setErr(d?.error || 'Failed');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/invoices')}>← Back</button>
        <h1 className="text-2xl font-bold text-slate-800">Generate Invoice</h1>
      </div>

      <div className="card p-5 max-w-xl">
        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
        <label className="label">Order (confirmed/live, not yet invoiced)</label>
        <select className="input" value={orderId} onChange={(e) => { setOrderId(e.target.value); setWarn(''); }}>
          <option value="">Select order…</option>
          {orders.map((o) => {
            const photos = o.items.reduce((n, it) => n + it.photos.length, 0);
            return <option key={o.id} value={o.id}>{o.orderNo} — {o.client.company || o.client.name} — {o.items.length} site(s) {photos === 0 ? '(no photo!)' : ''}</option>;
          })}
        </select>

        <div className="mt-3">
          <label className="label">Due date</label>
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <p className="text-[11px] text-slate-400 mt-1">Blank = last working day of this month. The invoice follows the campaign's tax{selectedOrder ? ` (${selectedOrder.taxCategory === 'GST' ? 'GST' : 'Non-GST'})` : ''} — to bill in cash, settle the campaign in cash first.</p>
        </div>

        {warn ? (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            {warn}
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost text-xs" onClick={() => setWarn('')}>Cancel</button>
              <button className="btn-primary text-xs" disabled={busy} onClick={() => submit(true)}>{busy ? 'Generating…' : 'Invoice anyway'}</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mt-3">A monitoring photo (proof-of-display) is recommended before invoicing — you'll be asked to confirm if it's missing.</p>
            <button className="btn-primary w-full mt-3 flex items-center justify-center gap-1.5" disabled={busy || !orderId} onClick={() => submit(false)}><Plus size={16} /> {busy ? 'Generating…' : 'Generate'}</button>
          </>
        )}
      </div>
    </div>
  );
}
