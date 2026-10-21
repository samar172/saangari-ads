import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import api from '../api';

// An invoice is editable for 24 hours after it is generated, then locks. Paid
// and cancelled invoices are always locked. Mirrors server utils/invoicing.js.
export function lockInfo(inv, now = Date.now()) {
  if (!inv) return { editable: false, text: '' };
  if (inv.status === 'CANCELLED') return { editable: false, text: 'Cancelled' };
  if (inv.status === 'PAID') return { editable: false, text: 'Locked · paid' };
  if (!inv.editableUntil) return { editable: false, text: 'Locked' };
  const ms = new Date(inv.editableUntil).getTime() - now;
  if (ms <= 0) return { editable: false, text: 'Locked' };
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return { editable: true, text: `Editable · ${h ? `${h}h ` : ''}${m}m left` };
}

export function LockBadge({ invoice }) {
  const l = lockInfo(invoice);
  if (invoice.status === 'CANCELLED') return null; // the status badge already says so
  return l.editable
    ? <span className="badge bg-emerald-50 text-emerald-700 inline-flex items-center gap-1" title={`Editable until ${new Date(invoice.editableUntil).toLocaleString('en-IN')}`}><Unlock size={11} /> {l.text}</span>
    : <span className="badge bg-slate-100 text-slate-600 inline-flex items-center gap-1"><Lock size={11} /> {l.text}</span>;
}

// Cancel a wrong bill. Manager / Super Admin cancel straight away; anyone else
// files a CANCEL_INVOICE request for a Manager/Admin to approve. A reason is
// always required — it is printed on the cancelled bill and kept in the log.
export function CancelInvoiceForm({ invoice, isReviewer, onDone, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!reason.trim()) return setErr('Please give a reason.');
    setBusy(true); setErr('');
    try {
      if (isReviewer) {
        await api.post(`/invoices/${invoice.id}/cancel`, { reason: reason.trim() });
      } else {
        await api.post('/approvals', {
          action: 'CANCEL_INVOICE', entityType: 'invoice', entityId: invoice.id,
          label: `${invoice.invoiceNo} · cancel invoice`, reason: reason.trim(),
        });
      }
      onDone?.(isReviewer ? 'cancelled' : 'requested');
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not cancel the invoice');
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 space-y-2">
      <div className="text-sm font-semibold text-red-800">{isReviewer ? `Cancel ${invoice.invoiceNo}` : `Request cancellation of ${invoice.invoiceNo}`}</div>
      <p className="text-xs text-red-700/80">
        The bill stays on record marked CANCELLED, its amount is reversed in the client's ledger, and you can then generate a fresh invoice.
        {!isReviewer && ' A Manager/Admin must approve this.'}
      </p>
      <textarea className="input h-16 text-sm" placeholder="Reason (e.g. wrong rate on U-009, wrong GSTIN)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {err && <div className="text-xs text-red-700">{err}</div>}
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-ghost text-xs" onClick={onClose}>Keep invoice</button>
        <button type="button" className="btn-danger text-xs" disabled={busy} onClick={submit}>
          {busy ? 'Working…' : isReviewer ? 'Cancel invoice' : 'Send request'}
        </button>
      </div>
    </div>
  );
}
