import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../api';
import { Money } from '../components/ui';
import { tdsAmountOf } from '../lib/tds';

// Same rates offered on the order detail payment form.
const TDS_RATES = [1, 2, 5, 10];

// Full-page "Record Payment" flow (client search → pick pending order →
// amount/mode/date/reference/TDS). Replaces the old modal on the Payments page.
export default function PaymentRecord() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState([]);
  const [client, setClient] = useState(null);
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('CASH');
  const [reference, setReference] = useState('');
  const [receivedAt, setReceivedAt] = useState(dayjs().format('YYYY-MM-DD'));
  const [tdsApplicable, setTdsApplicable] = useState(false);
  const [tdsPct, setTdsPct] = useState(TDS_RATES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // TDS only exists where GST applies. Companies with GST hidden (e.g. the
  // non-GST entity) never deduct TDS, so hide the option for their orders.
  const selectedOrder = orders.find((o) => String(o.id) === String(orderId));
  const tdsAllowed = !!selectedOrder && !selectedOrder.company?.gstHidden;

  // Mirrors the server: TDS is withheld from the gross on its pre-GST value, but
  // the order is still credited the full gross — the client remits it on our behalf.
  const gross = Number(amount) || 0;
  const tds = tdsApplicable ? tdsAmountOf(gross, tdsPct, selectedOrder?.taxCategory === 'GST') : 0;

  // If the chosen order belongs to a non-GST entity, clear any TDS toggle so a
  // stale checkbox can't send TDS the server would (rightly) reject/ignore.
  useEffect(() => { if (!tdsAllowed && tdsApplicable) setTdsApplicable(false); }, [tdsAllowed, tdsApplicable]);

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
        amount, mode, reference: reference || undefined, receivedAt: receivedAt || undefined,
        tdsApplicable, tdsPct: tdsApplicable ? Number(tdsPct) : 0,
      });
      navigate('/payments');
    } catch (e2) {
      // Surface server rejections (e.g. paying against a quotation) instead of
      // navigating away as though it had saved.
      setErr(e2.response?.data?.error || 'Could not record this payment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/payments')}><ArrowLeft size={16} /> Back</button>
        <h1 className="text-2xl font-bold text-slate-800">Record Payment</h1>
      </div>

      <form onSubmit={submit} className="card p-6 w-full max-w-md">
        <div className="space-y-4">
          {!client ? (
            <div>
              <label className="label">Search Client</label>
              <input type="text" className="input" placeholder="Name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
              {clients.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                  {clients.map((c) => (
                    <div key={c.id} className="p-2 border-b last:border-b-0 border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => { setClient(c); setSearch(''); }}>
                      <div className="font-medium text-sm">{c.company || c.name}</div>
                      <div className="text-xs text-slate-500">{c.company ? `${c.name} · ` : ''}{c.phone}</div>
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
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                <div className="font-medium text-slate-800">{client.company || client.name}</div>
                <div className="text-xs text-slate-500">{client.company ? `${client.name} · ` : ''}{client.phone}</div>
              </div>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Payment date</label>
                  <input type="date" className="input" max={dayjs().format('YYYY-MM-DD')} value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
                </div>
                <div>
                  <label className="label">Reference (optional)</label>
                  <input className="input" placeholder="UTR / cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              </div>

              {tdsAllowed && (
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
              )}
            </>
          )}

          {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" className="btn-ghost" onClick={() => navigate('/payments')}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !orderId || !amount}>Save Payment</button>
        </div>
      </form>
    </div>
  );
}
