import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Download, Edit3, Send } from 'lucide-react';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { Badge, Money, Spinner, Modal } from '../components/ui';

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);

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
          <p className="text-sm text-slate-500">{invoice.client.company || invoice.client.name}</p>
        </div>
        <div className="flex gap-2 ml-4">
          <Badge status={invoice.status} />
          <span className="badge bg-slate-100 text-slate-700">{invoice.taxCategory === 'GST' ? (invoice.interState ? 'IGST' : 'CGST+SGST') : 'Non-GST'}</span>
        </div>
        <div className="flex-1" />
        <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setSendOpen(true)}>
          <Send size={16} /> Send Bill
        </button>
        <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => downloadFile(`/invoices/${id}/pdf`, `Invoice-${invoice.invoiceNo}.pdf`)}>
          <Download size={16} /> Invoice PDF
        </button>
      </div>

      {sendOpen && <SendBillModal invoice={invoice} onClose={() => setSendOpen(false)} onSent={load} />}

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <div className="card p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Invoice Details</h2>
            <dl className="space-y-3 text-sm">
              <Row k="Date Issued">{new Date(invoice.issuedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Row>
              <Row k="Due Date">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : '—'}</Row>
              <Row k="Order Number">{invoice.order?.orderNo}</Row>
              <Row k="Client">{invoice.client.company || invoice.client.name}{invoice.client.company ? ` · ${invoice.client.name}` : ''} · {invoice.client.phone}</Row>
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
                <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={() => navigate(`/invoices/${id}/edit`)}>
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

    </div>
  );
}

function Row({ k, children }) {
  return <div className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800 text-right">{children}</dd></div>;
}

// Indian numbers are stored with or without the country code; wa.me wants 91XXXXXXXXXX.
const waDigits = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d.replace(/^0+/, ''); };

// Share the bill over WhatsApp or email. The message is opened pre-addressed
// (wa.me / mailto) and a person presses send — we only log that it went out.
function SendBillModal({ invoice, onClose, onSent }) {
  const client = invoice.client;
  const contacts = client.contacts || [];
  // Recipients: the flagged bills-to contact leads, then the rest, then the client itself.
  const options = [
    ...contacts.map((c) => ({ id: `c${c.id}`, label: `${c.name}${c.role ? ` · ${c.role}` : ''}${c.billsTo ? ' · Bills to' : ''}`, phone: c.phone, email: c.email })),
    { id: 'client', label: `${client.company || client.name} (client)`, phone: client.phone, email: client.email },
  ];
  const [sel, setSel] = useState(options[0]?.id || 'client');
  const chosen = options.find((o) => o.id === sel) || options[options.length - 1];

  const amount = `₹${Number(invoice.total || 0).toLocaleString('en-IN')}`;
  const due = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : null;
  const text = [
    `Dear ${client.company || client.name},`,
    `Please find the bill ${invoice.invoiceNo} for ${amount}${due ? `, due by ${due}` : ''}.`,
    `Order ${invoice.order?.orderNo || ''}`.trim(),
    `— ${invoice.company?.name || 'Saangari Ads'}`,
  ].filter(Boolean).join('\n');

  function logShare(channel) {
    const toContact = channel === 'EMAIL' ? chosen?.email : chosen?.phone;
    api.post(`/invoices/${invoice.id}/share`, { channel, toName: chosen?.label, toContact })
      .then(() => onSent?.()).catch(() => {});
    // Also record in the WhatsApp outbox log so the invoice flips to "Sent" there.
    api.post('/whatsapp/log', { kind: 'INVOICE', entityType: 'invoice', entityId: invoice.id, channel, toName: chosen?.label, toNumber: toContact, label: invoice.invoiceNo }).catch(() => {});
  }

  function sendWhatsApp() {
    if (!chosen?.phone) return;
    window.open(`https://wa.me/${waDigits(chosen.phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    logShare('WHATSAPP');
    onClose();
  }
  function sendEmail() {
    if (!chosen?.email) return;
    const subject = `Bill ${invoice.invoiceNo} — ${invoice.company?.name || 'Saangari Ads'}`;
    window.location.href = `mailto:${chosen.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    logShare('EMAIL');
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Send bill ${invoice.invoiceNo}`}>
      <div className="space-y-4">
        <div>
          <label className="label">Send to</label>
          <select className="input" value={sel} onChange={(e) => setSel(e.target.value)}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <div className="text-xs text-slate-500 mt-1">
            {chosen?.phone ? `📞 ${chosen.phone}` : 'no phone'} · {chosen?.email ? `✉ ${chosen.email}` : 'no email'}
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 whitespace-pre-wrap">{text}</div>
        <p className="text-[11px] text-slate-400 leading-tight">The message opens ready-addressed — you press send. Attach the invoice PDF in WhatsApp/email if you want it included; download it from the invoice screen first.</p>

        <div className="flex gap-2">
          <button className="btn-primary flex-1 flex items-center justify-center gap-1.5" disabled={!chosen?.phone} onClick={sendWhatsApp}>
            <Send size={16} /> WhatsApp
          </button>
          <button className="btn-ghost flex-1" disabled={!chosen?.email} onClick={sendEmail}>Email</button>
        </div>
      </div>
    </Modal>
  );
}

