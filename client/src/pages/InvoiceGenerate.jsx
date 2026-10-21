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
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    // Confirmed/live orders with something left to bill: never invoiced, or on
    // a monthly/quarterly cycle (the billing plan below says which period is next).
    api.get('/orders').then((r) => setOrders(r.data.filter((o) => ['CONFIRMED', 'LIVE', 'COMPLETED'].includes(o.status)
      && (o.billingCycle || !o.invoices.some((i) => i.status !== 'CANCELLED')))));
  }, []);

  useEffect(() => {
    setPlan(null);
    if (orderId) api.get(`/orders/${orderId}/billing-plan`).then((r) => setPlan(r.data)).catch(() => setPlan(null));
  }, [orderId]);

  const selectedOrder = orders.find((o) => String(o.id) === String(orderId));
  const next = plan?.next;
  const gst = (t) => (selectedOrder?.taxCategory === 'GST' ? Math.round(t * 0.18) : 0);

  async function submit(force) {
    setBusy(true); setErr(''); if (force) setWarn('');
    try {
      const { data } = await api.post('/invoices', {
        orderId: Number(orderId),
        force: !!force,
        periodIndex: next?.index,
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
        <label className="label">Order (confirmed/live, with an unbilled period)</label>
        <select className="input" value={orderId} onChange={(e) => { setOrderId(e.target.value); setWarn(''); }}>
          <option value="">Select order…</option>
          {orders.map((o) => {
            const photos = o.items.reduce((n, it) => n + it.photos.length, 0);
            return <option key={o.id} value={o.id}>{o.orderNo} — {o.client.company || o.client.name} — {o.items.length} site(s) {photos === 0 ? '(no photo!)' : ''}</option>;
          })}
        </select>

        {plan && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${next ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            {next ? (
              <>
                <b>{next.label || 'Full campaign'}</b>: {new Date(next.periodStart).toLocaleDateString('en-IN')} → {new Date(next.periodEnd).toLocaleDateString('en-IN')}
                {' · '}₹{(next.draft.taxable + gst(next.draft.taxable)).toLocaleString('en-IN')}{selectedOrder?.taxCategory === 'GST' ? ' incl. GST' : ''}
              </>
            ) : 'Every billing period of this campaign is already invoiced.'}
          </div>
        )}

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
            <button className="btn-primary w-full mt-3 flex items-center justify-center gap-1.5" disabled={busy || !orderId || (plan && !next)} onClick={() => submit(false)}><Plus size={16} /> {busy ? 'Generating…' : 'Generate'}</button>
          </>
        )}
      </div>
    </div>
  );
}
