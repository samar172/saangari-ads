import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { Download, Plus, Pencil } from 'lucide-react';
import { Money, Spinner, Badge } from '../components/ui';

const RECEIVABLE_STATUSES = ['CONFIRMED', 'LIVE', 'COMPLETED'];

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [pay, setPay] = useState('');
  const [payOrderId, setPayOrderId] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState('');

  function load() { api.get(`/clients/${id}`).then((r) => setC(r.data)).catch(() => navigate('/clients')); }
  useEffect(load, [id]);

  // Orders that still owe money — the payment can be applied to one so it shows
  // on the order/invoice, or left "General" as an on-account advance.
  const orderBalance = (o) => Math.round((o.grandTotal || 0) - (o.payments || []).reduce((s, p) => s + p.amount, 0));
  const openOrders = (c?.orders || []).filter((o) => RECEIVABLE_STATUSES.includes(o.status) && orderBalance(o) > 0);
  // Default to the single open order if there's exactly one.
  useEffect(() => { setPayOrderId(openOrders.length === 1 ? String(openOrders[0].id) : ''); }, [c]);

  async function addPayment() {
    const amt = Number(pay);
    if (!(amt > 0)) { setPayErr('Enter a valid amount'); return; }
    setPayBusy(true); setPayErr('');
    try {
      if (payOrderId) {
        // Against an order → a real payment that shows on the order/invoice and
        // reduces its balance (not just a bare ledger credit).
        await api.post(`/orders/${payOrderId}/payments`, { amount: amt, mode: 'CASH' });
      } else {
        await api.post(`/clients/${id}/payments`, { amount: amt, narration: 'Payment received' });
      }
      setPay(''); load();
    } catch (e) { setPayErr(e.response?.data?.error || 'Could not record payment'); }
    finally { setPayBusy(false); }
  }

  if (!c) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/clients')}>← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{c.company || c.name}</h1>
          {c.company && <p className="text-sm text-slate-500">{c.name}</p>}
        </div>
        <div className="flex-1" />
        <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => navigate(`/clients/${id}/edit`)}><Pencil size={16} /> Edit</button>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Info k="Phone" v={c.phone} />
          <Info k="Category" v={c.category?.name || <span className="text-slate-400">Uncategorised</span>} />
          <Info k="Tax" v={c.taxCategory} />
          <Info k="Balance" v={<span className={`font-bold ${c.balance > 0 ? 'text-red-600' : c.balance < 0 ? 'text-emerald-600' : 'text-slate-500'}`}><Money value={Math.abs(c.balance)} />{c.balance < 0 ? ' Cr' : c.balance > 0 ? ' Dr' : ''}</span>} />
        </div>

        {can(user, 'exportInventory') && (
          <button className="btn-accent flex items-center gap-1.5 w-fit" onClick={() => downloadFile(`/exports/client/${id}/pptx`, `${c.name}_proposal.pptx`)}>
            <Download size={16} /> Download PPTX Proposal
          </button>
        )}

        <div className="card p-4">
          <ClientContacts client={c} onChanged={load} />
        </div>

        <div>
          <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Orders ({c.orders.length})</div>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr><th className="px-3 py-2 text-left">No</th><th className="px-3 py-2 text-left">Sites</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Total</th></tr>
              </thead>
              <tbody>
                {c.orders.map((o) => (
                  <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
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
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-xs font-semibold uppercase text-slate-500">Ledger</div>
            {can(user, 'manageLedger') && (
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto py-1 text-sm" value={payOrderId} onChange={(e) => setPayOrderId(e.target.value)}>
                  <option value="">General (on-account)</option>
                  {openOrders.map((o) => (
                    <option key={o.id} value={o.id}>{o.orderNo} · bal ₹{Math.max(0, orderBalance(o)).toLocaleString('en-IN')}</option>
                  ))}
                </select>
                <input className="input w-28 py-1" placeholder="Amount" value={pay} onChange={(e) => setPay(e.target.value)} />
                <button className="btn-ghost py-1 flex items-center gap-1" disabled={payBusy} onClick={addPayment}><Plus size={14} /> {payBusy ? 'Saving…' : 'Record payment'}</button>
              </div>
            )}
          </div>
          {payErr && <div className="mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-700">{payErr}</div>}
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
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
    </div>
  );
}

function Info({ k, v }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{k}</div><div className="font-medium text-slate-800">{v}</div></div>;
}

// Named contacts for a client (owner, accounts, coordinator). The one flagged
// "Bills to" is the default recipient when an invoice is sent over WhatsApp/email.
const blankContact = { name: '', role: '', phone: '', email: '', billsTo: false };
function ClientContacts({ client, onChanged }) {
  const [form, setForm] = useState(blankContact);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const contacts = client.contacts || [];

  function edit(ct) { setForm({ name: ct.name || '', role: ct.role || '', phone: ct.phone || '', email: ct.email || '', billsTo: !!ct.billsTo }); setEditId(ct.id); setShowForm(true); setErr(''); }
  function addNew() { setForm(blankContact); setEditId(null); setShowForm(true); setErr(''); }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required'); return; }
    if (!form.phone.trim() && !form.email.trim()) { setErr('Add a phone or an email'); return; }
    setBusy(true); setErr('');
    try {
      if (editId) await api.patch(`/clients/contacts/${editId}`, form);
      else await api.post(`/clients/${client.id}/contacts`, form);
      setShowForm(false); setForm(blankContact); setEditId(null);
      await onChanged();
    } catch (e2) { setErr(e2.response?.data?.error || 'Could not save contact'); }
    finally { setBusy(false); }
  }

  async function remove(cid) { await api.delete(`/clients/contacts/${cid}`); await onChanged(); }
  async function makeBillsTo(cid) { await api.patch(`/clients/contacts/${cid}`, { billsTo: true }); await onChanged(); }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase text-slate-500">Contacts ({contacts.length})</div>
        <button className="text-xs text-brand hover:underline" onClick={addNew}>+ Add contact</button>
      </div>

      {contacts.length === 0 && !showForm && (
        <div className="text-xs text-slate-400 mb-2">No named contacts. Add one and mark who bills go to — falls back to the client's own phone/email ({client.phone}{client.email ? ` · ${client.email}` : ''}).</div>
      )}

      <div className="space-y-1.5">
        {contacts.map((ct) => (
          <div key={ct.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="min-w-0 text-sm">
              <span className="font-medium text-slate-800">{ct.name}</span>
              {ct.role && <span className="text-xs text-slate-500 ml-1.5">· {ct.role}</span>}
              {ct.billsTo && <span className="badge bg-emerald-100 text-emerald-700 ml-2 text-[10px]">Bills to</span>}
              <div className="text-xs text-slate-500">{[ct.phone, ct.email].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-xs">
              {!ct.billsTo && <button className="text-slate-400 hover:text-emerald-600" onClick={() => makeBillsTo(ct.id)} title="Make this the bill recipient">Set bills-to</button>}
              <button className="text-brand hover:underline" onClick={() => edit(ct)}>Edit</button>
              <button className="text-slate-400 hover:text-red-600" onClick={() => remove(ct.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={save} className="mt-2 rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="input py-1.5 text-sm" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input py-1.5 text-sm" placeholder="Role (e.g. Accounts)" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            <input className="input py-1.5 text-sm" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="input py-1.5 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.billsTo} onChange={(e) => setForm({ ...form, billsTo: e.target.checked })} /> Bills are sent to this contact
          </label>
          {err && <div className="text-xs text-red-600">{err}</div>}
          <div className="flex gap-2">
            <button className="btn-primary text-sm py-1.5" disabled={busy}>{busy ? 'Saving…' : (editId ? 'Save contact' : 'Add contact')}</button>
            <button type="button" className="btn-ghost text-sm py-1.5" onClick={() => { setShowForm(false); setEditId(null); setForm(blankContact); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
