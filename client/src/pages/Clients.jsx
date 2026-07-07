import { useEffect, useState } from 'react';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { Money, Modal, Spinner, Badge } from '../components/ui';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  function load() {
    setLoading(true);
    api.get('/clients', { params: { q: q || undefined } }).then((r) => setClients(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Clients</h1>
        <input className="input w-64" placeholder="Search name / phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? <Spinner /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Phone</th>
                <th className="px-4 py-2 text-left">Company</th>
                <th className="px-4 py-2 text-left">Tax</th>
                <th className="px-4 py-2 text-right">Orders</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} onClick={() => setOpenId(c.id)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">{c.phone}</td>
                  <td className="px-4 py-2 text-slate-500">{c.company || '—'}</td>
                  <td className="px-4 py-2">{c.taxCategory === 'GST' ? <Badge status="LIVE">GST</Badge> : <span className="text-slate-400">Non-GST</span>}</td>
                  <td className="px-4 py-2 text-right">{c._count?.orders ?? 0}</td>
                </tr>
              ))}
              {clients.length === 0 && <tr><td colSpan="5" className="px-4 py-10 text-center text-slate-400">No clients</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {openId && <ClientDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ClientDetail({ id, onClose }) {
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [pay, setPay] = useState('');

  function load() { api.get(`/clients/${id}`).then((r) => setC(r.data)); }
  useEffect(load, [id]);

  async function addPayment() {
    if (!pay) return;
    await api.post(`/clients/${id}/payments`, { amount: Number(pay), narration: 'Payment received' });
    setPay(''); load();
  }

  return (
    <Modal open onClose={onClose} title={c?.name || 'Client'} wide>
      {!c ? <Spinner /> : (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-4 gap-3 text-sm">
            <Info k="Phone" v={c.phone} />
            <Info k="Company" v={c.company || '—'} />
            <Info k="Tax" v={c.taxCategory} />
            <Info k="Balance" v={<span className={c.balance > 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}><Money value={c.balance} /></span>} />
          </div>

          {can(user, 'exportInventory') && (
            <button className="btn-accent" onClick={() => downloadFile(`/exports/client/${id}/pptx`, `${c.name}_proposal.pptx`)}>
              📥 Download PPTX Proposal
            </button>
          )}

          <div>
            <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Orders ({c.orders.length})</div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr><th className="px-3 py-2 text-left">No</th><th className="px-3 py-2 text-left">Sites</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {c.orders.map((o) => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{o.orderNo}</td>
                      <td className="px-3 py-1.5 text-xs">{o.items.map((it) => it.site.code).join(', ')}</td>
                      <td className="px-3 py-1.5"><Badge status={o.status} /></td>
                      <td className="px-3 py-1.5 text-right"><Money value={o.grandTotal} /></td>
                    </tr>
                  ))}
                  {c.orders.length === 0 && <tr><td colSpan="4" className="px-3 py-6 text-center text-slate-400">No orders</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase text-slate-500">Ledger</div>
              {can(user, 'manageLedger') && (
                <div className="flex gap-2">
                  <input className="input w-32 py-1" placeholder="Amount" value={pay} onChange={(e) => setPay(e.target.value)} />
                  <button className="btn-ghost py-1" onClick={addPayment}>+ Record payment</button>
                </div>
              )}
            </div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Narration</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr>
                </thead>
                <tbody>
                  {c.ledger.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{new Date(l.date).toLocaleDateString('en-IN')}</td>
                      <td className="px-3 py-1.5">{l.narration}</td>
                      <td className="px-3 py-1.5 text-right text-red-600">{l.type === 'DEBIT' ? <Money value={l.amount} /> : ''}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-600">{l.type === 'CREDIT' ? <Money value={l.amount} /> : ''}</td>
                    </tr>
                  ))}
                  {c.ledger.length === 0 && <tr><td colSpan="4" className="px-3 py-6 text-center text-slate-400">No entries</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ k, v }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{k}</div><div className="font-medium text-slate-800">{v}</div></div>;
}
