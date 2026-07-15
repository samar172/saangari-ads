import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Download, Edit3, Trash2, Check, X } from 'lucide-react';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { Badge, Money, Spinner, Modal } from '../components/ui';

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  function load() {
    api.get(`/invoices/${id}`).then((r) => setInvoice(r.data)).catch(() => navigate('/invoices'));
  }
  useEffect(load, [id, navigate]);

  if (!invoice) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/invoices')}>← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{invoice.invoiceNo}</h1>
          <p className="text-sm text-slate-500">{invoice.client.name}</p>
        </div>
        <div className="flex gap-2 ml-4">
          <Badge status={invoice.status} />
          <span className="badge bg-slate-100 text-slate-700">{invoice.taxCategory === 'GST' ? (invoice.interState ? 'IGST' : 'CGST+SGST') : 'Non-GST'}</span>
        </div>
        <div className="flex-1" />
        <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => downloadFile(`/invoices/${id}/pdf`, `Invoice-${invoice.invoiceNo}.pdf`)}>
          <Download size={16} /> Invoice PDF
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <div className="card p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Invoice Details</h2>
            <dl className="space-y-3 text-sm">
              <Row k="Date Issued">{new Date(invoice.issuedAt).toLocaleDateString('en-IN')}</Row>
              <Row k="Order Number">{invoice.order?.orderNo}</Row>
              <Row k="Client">{invoice.client.name} · {invoice.client.phone}</Row>
              <Row k="Company">{invoice.company.name}</Row>
              <Row k="Place of Supply">{invoice.order?.placeOfSupply || 'Rajasthan'}</Row>
            </dl>
          </div>
          
          <div className="card p-5 mt-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Line Items</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="px-3 py-2">Site</th>
                    <th className="px-3 py-2">Dates</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.order?.items?.map(it => (
                    <tr key={it.id}>
                      <td className="px-3 py-2">{it.site.code}</td>
                      <td className="px-3 py-2">{new Date(it.startDate).toLocaleDateString('en-IN')} – {new Date(it.endDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-3 py-2 text-right"><Money value={it.subtotal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-xl border border-slate-200 p-5 bg-slate-50 relative">
            <div className="flex justify-between items-center mb-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Commercials</div>
              {can(user, 'generateInvoice') && invoice.status !== 'PAID' && (
                <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => setEditOpen(true)}>
                  <Edit3 size={14} /> Edit Pricing
                </button>
              )}
            </div>

            <dl className="space-y-2 text-sm">
              <Row k="Rental Subtotal"><Money value={invoice.order?.rentalSubtotal} /></Row>
              {invoice.order?.printingTotal > 0 && <Row k="Printing Cost"><Money value={invoice.order.printingTotal} /></Row>}
              {invoice.order?.mountingCost > 0 && <Row k="Mounting Cost"><Money value={invoice.order.mountingCost} /></Row>}
              {invoice.order?.addOnTotal > 0 && <Row k="Add-ons"><Money value={invoice.order.addOnTotal} /></Row>}
              
              {invoice.order?.addOns?.map(a => (
                <div key={a.id} className="text-xs text-slate-400 pl-4 flex justify-between">
                  <span>↳ {a.label}</span>
                  <Money value={a.amount} />
                </div>
              ))}

              {invoice.order?.discountAmount > 0 && <Row k={`Discount (${invoice.order.discountPct}%)`}><span className="text-red-600">−<Money value={invoice.order.discountAmount} /></span></Row>}
              <Row k="Taxable Amount"><Money value={invoice.amount} /></Row>
              {invoice.cgst > 0 && <Row k="CGST 9%"><Money value={invoice.cgst} /></Row>}
              {invoice.sgst > 0 && <Row k="SGST 9%"><Money value={invoice.sgst} /></Row>}
              {invoice.igst > 0 && <Row k="IGST 18%"><Money value={invoice.igst} /></Row>}
              <div className="flex justify-between border-t border-slate-300 pt-3 mt-2 text-base font-bold text-brand">
                <span>Grand Total</span>
                <Money value={invoice.total} />
              </div>
            </dl>
          </div>
        </div>
      </div>

      {editOpen && <EditPricingModal invoice={invoice} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} />}
    </div>
  );
}

function Row({ k, children }) {
  return <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800 text-right">{children}</dd></div>;
}

function EditPricingModal({ invoice, onClose, onSaved }) {
  const o = invoice.order;
  const [form, setForm] = useState({
    discountPct: o.discountPct || 0,
    printingTotal: o.printingTotal || 0,
    mountingCost: o.mountingCost || 0,
    discountRemarks: o.discountRemarks || ''
  });
  
  const [addOns, setAddOns] = useState(o.addOns?.map(a => ({ label: a.label, amount: a.amount, id: Math.random() })) || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api.patch(`/invoices/${invoice.id}/commercials`, {
        ...form,
        addOns: addOns.filter(a => a.label.trim())
      });
      onSaved();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Failed to update pricing');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit Invoice Pricing" wide>
      <form onSubmit={submit} className="space-y-4">
        {err && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{err}</div>}
        
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Discount %</label>
            <input type="number" step="any" min="0" max="100" className="input" value={form.discountPct} onChange={e => setForm({...form, discountPct: e.target.value})} />
          </div>
          <div>
            <label className="label">Discount Remarks</label>
            <input className="input" value={form.discountRemarks} onChange={e => setForm({...form, discountRemarks: e.target.value})} placeholder="e.g. Agency Commission" />
          </div>
          <div>
            <label className="label">Total Printing Cost</label>
            <input type="number" min="0" className="input" value={form.printingTotal} onChange={e => setForm({...form, printingTotal: e.target.value})} />
          </div>
          <div>
            <label className="label">Total Mounting Cost</label>
            <input type="number" min="0" className="input" value={form.mountingCost} onChange={e => setForm({...form, mountingCost: e.target.value})} />
          </div>
        </div>

        <div>
          <div className="label flex justify-between items-center mb-2">
            <span>Add-ons</span>
            <button type="button" className="text-brand text-xs font-medium" onClick={() => setAddOns([...addOns, { label: '', amount: '', id: Math.random() }])}>
              + Add item
            </button>
          </div>
          <div className="space-y-2">
            {addOns.map((a, i) => (
              <div key={a.id} className="flex gap-2 items-center">
                <input className="input flex-1" placeholder="Description (e.g. Electricity)" value={a.label} onChange={e => {
                  const copy = [...addOns];
                  copy[i].label = e.target.value;
                  setAddOns(copy);
                }} />
                <input type="number" className="input w-32" placeholder="Amount" value={a.amount} onChange={e => {
                  const copy = [...addOns];
                  copy[i].amount = e.target.value;
                  setAddOns(copy);
                }} />
                <button type="button" className="text-red-500 hover:text-red-700" onClick={() => {
                  setAddOns(addOns.filter(x => x.id !== a.id));
                }}>
                  <X size={16} />
                </button>
              </div>
            ))}
            {addOns.length === 0 && <div className="text-xs text-slate-400">No add-ons applied.</div>}
          </div>
        </div>

        <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded border border-slate-100">
          Note: Modifying these values will recalculate the underlying order totals and adjust the client's ledger balance automatically.
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={busy}>
            {busy ? 'Saving…' : <><Check size={16} /> Save Changes</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
