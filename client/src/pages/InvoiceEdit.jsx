import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import api from '../api';
import { Spinner } from '../components/ui';

// Full-page invoice edit (was EditPricingModal). Edits pricing (discount,
// printing, mounting, add-ons), issue + due dates. Recomputes order totals and
// the client's ledger on save.
export default function InvoiceEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [form, setForm] = useState(null);
  const [addOns, setAddOns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get(`/invoices/${id}`).then((r) => {
      const inv = r.data; const o = inv.order;
      setInvoice(inv);
      setForm({
        discountPct: o.discountPct || 0,
        printingTotal: o.printingTotal || 0,
        mountingCost: o.mountingCost || 0,
        discountRemarks: o.discountRemarks || '',
        dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '',
        issuedAt: inv.issuedAt ? inv.issuedAt.slice(0, 10) : '',
      });
      setAddOns(o.addOns?.map((a) => ({ label: a.label, amount: a.amount, id: Math.random() })) || []);
    }).catch(() => navigate('/invoices'));
  }, [id, navigate]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api.patch(`/invoices/${id}/commercials`, { ...form, addOns: addOns.filter((a) => a.label.trim()) });
      navigate(`/invoices/${id}`);
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Failed to update pricing');
    } finally { setBusy(false); }
  }

  if (!invoice || !form) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate(`/invoices/${id}`)}>← Back</button>
        <h1 className="text-2xl font-bold text-slate-800">Edit Invoice {invoice.invoiceNo}</h1>
      </div>

      <form onSubmit={submit} className="card p-5 space-y-4 max-w-3xl">
        {err && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{err}</div>}

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Discount %</label>
            <input type="number" step="any" min="0" max="100" className="input" value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} />
          </div>
          <div>
            <label className="label">Discount Remarks</label>
            <input className="input" value={form.discountRemarks} onChange={(e) => setForm({ ...form, discountRemarks: e.target.value })} placeholder="e.g. Agency Commission" />
          </div>
          <div>
            <label className="label">Total Printing Cost</label>
            <input type="number" min="0" className="input" value={form.printingTotal} onChange={(e) => setForm({ ...form, printingTotal: e.target.value })} />
          </div>
          <div>
            <label className="label">Total Mounting Cost</label>
            <input type="number" min="0" className="input" value={form.mountingCost} onChange={(e) => setForm({ ...form, mountingCost: e.target.value })} />
          </div>
          <div>
            <label className="label">Issue Date</label>
            <input type="date" className="input" value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} />
          </div>
          <div>
            <label className="label">Due Date</label>
            <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>

        <div>
          <div className="label flex justify-between items-center mb-2">
            <span>Add-ons</span>
            <button type="button" className="text-brand text-xs font-medium" onClick={() => setAddOns([...addOns, { label: '', amount: '', id: Math.random() }])}>+ Add item</button>
          </div>
          <div className="space-y-2">
            {addOns.map((a, i) => (
              <div key={a.id} className="flex gap-2 items-center">
                <input className="input flex-1" placeholder="Description (e.g. Electricity)" value={a.label} onChange={(e) => { const copy = [...addOns]; copy[i].label = e.target.value; setAddOns(copy); }} />
                <input type="number" className="input w-32" placeholder="Amount" value={a.amount} onChange={(e) => { const copy = [...addOns]; copy[i].amount = e.target.value; setAddOns(copy); }} />
                <button type="button" className="text-red-500 hover:text-red-700" onClick={() => setAddOns(addOns.filter((x) => x.id !== a.id))}><X size={16} /></button>
              </div>
            ))}
            {addOns.length === 0 && <div className="text-xs text-slate-400">No add-ons applied.</div>}
          </div>
        </div>

        <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded border border-slate-100">
          Note: Modifying these values will recalculate the underlying order totals and adjust the client's ledger balance automatically.
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
          <button type="button" className="btn-ghost" onClick={() => navigate(`/invoices/${id}`)}>Cancel</button>
          <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={busy}>{busy ? 'Saving…' : <><Check size={16} /> Save Changes</>}</button>
        </div>
      </form>
    </div>
  );
}
