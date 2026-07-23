import { useEffect, useState } from 'react';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { Download, Plus, Pencil } from 'lucide-react';
import { Money, Modal, Spinner, Badge } from '../components/ui';

const EMPTY_CLIENT = {
  name: '', phone: '', email: '', company: '', gstNumber: '',
  taxCategory: 'NON_GST', state: 'Rajasthan', address: '', categoryId: '',
};

export default function Clients() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null); // 'new' | client object

  function load() {
    setLoading(true);
    api.get('/clients', { params: { q: q || undefined } }).then((r) => setClients(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { api.get('/categories').then((r) => setCategories(r.data)); }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clients</h1>
          <p className="text-sm text-slate-500">Each client is filed under a category — their bookings inherit it</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-full sm:w-64" placeholder="Search name / phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-accent text-sm flex items-center gap-1.5 shrink-0" onClick={() => setEditing('new')}>
            <Plus size={16} /> New Client
          </button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Phone</th>
                <th className="px-4 py-2 text-left">Company</th>
                <th className="px-4 py-2 text-left">Tax</th>
                <th className="px-4 py-2 text-right">Orders</th>
                <th className="px-4 py-2 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} onClick={() => setOpenId(c.id)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">
                    {c.category
                      ? <span className="badge bg-teal-100 text-teal-800">{c.category.name}</span>
                      : <span className="text-slate-300">Uncategorised</span>}
                  </td>
                  <td className="px-4 py-2">{c.phone}</td>
                  <td className="px-4 py-2 text-slate-500">{c.company || '—'}</td>
                  <td className="px-4 py-2">{c.taxCategory === 'GST' ? <Badge status="LIVE">GST</Badge> : <span className="text-slate-400">Non-GST</span>}</td>
                  <td className="px-4 py-2 text-right">{c._count?.orders ?? 0}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="text-slate-400 hover:text-brand p-1"
                      onClick={(e) => { e.stopPropagation(); setEditing(c); }}
                      aria-label={`Edit ${c.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-400">No clients</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ClientForm
          client={editing === 'new' ? null : editing}
          categories={categories}
          canEdit={editing === 'new' || can(user, 'manageLedger') || can(user, 'manageCategories')}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {openId && <ClientDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// Create or edit a client. Category is the point of this form: it decides which
// bucket every future booking for this client lands in.
function ClientForm({ client, categories, canEdit, onClose, onSaved }) {
  const [form, setForm] = useState(() => (client
    ? {
        name: client.name || '', phone: client.phone || '', email: client.email || '',
        company: client.company || '', gstNumber: client.gstNumber || '',
        taxCategory: client.taxCategory || 'NON_GST', state: client.state || 'Rajasthan',
        address: client.address || '', categoryId: client.categoryId ? String(client.categoryId) : '',
      }
    : EMPTY_CLIENT));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) { setErr('Name and phone are required'); return; }
    setSaving(true); setErr('');
    try {
      if (client) await api.patch(`/clients/${client.id}`, form);
      else await api.post('/clients', form);
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not save client');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={client ? `Edit ${client.name}` : 'New Client'} wide>
      {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
      {!canEdit && client && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          Your role may not be allowed to save changes to an existing client.
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Name *</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label">Phone * (unique)</label>
          <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Category</label>
          <select className="input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Every booking for this client is filed under this category. Manage the list in Business Setup → Client Categories.
          </p>
        </div>
        <div>
          <label className="label">Company</label>
          <input className="input" value={form.company} onChange={(e) => set('company', e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label className="label">Tax Category</label>
          <select className="input" value={form.taxCategory} onChange={(e) => set('taxCategory', e.target.value)}>
            <option value="NON_GST">Non-GST</option>
            <option value="GST">GST</option>
          </select>
        </div>
        <div>
          <label className="label">GSTIN</label>
          <input className="input" value={form.gstNumber} onChange={(e) => set('gstNumber', e.target.value)} />
        </div>
        <div>
          <label className="label">State</label>
          <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} />
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Client'}</button>
      </div>
    </Modal>
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
            <Info k="Category" v={c.category?.name || <span className="text-slate-400">Uncategorised</span>} />
            <Info k="Tax" v={c.taxCategory} />
            <Info k="Balance" v={<span className={c.balance > 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}><Money value={c.balance} /></span>} />
          </div>

          {can(user, 'exportInventory') && (
            <button className="btn-accent flex items-center gap-1.5 w-fit" onClick={() => downloadFile(`/exports/client/${id}/pptx`, `${c.name}_proposal.pptx`)}>
              <Download size={16} /> Download PPTX Proposal
            </button>
          )}

          <div>
            <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Orders ({c.orders.length})</div>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
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
                  <button className="btn-ghost py-1 flex items-center gap-1" onClick={addPayment}><Plus size={14} /> Record payment</button>
                </div>
              )}
            </div>
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
      )}
    </Modal>
  );
}

function Info({ k, v }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{k}</div><div className="font-medium text-slate-800">{v}</div></div>;
}
