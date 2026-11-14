import { useEffect } from 'react';

// Bank account + client PO for a new bill. GST bills print the chosen account
// under "Company's Bank Details" and the PO under PAN; Non-GST bills print
// neither, so the block is hidden for them. `value` = { bankAccountId, poNumber, poDate }.
export default function BillExtras({ plan, taxCategory, value, onChange }) {
  const accounts = plan?.bankAccounts || [];
  const set = (k, v) => onChange({ ...value, [k]: v });

  // Start on the default account (last used for this client).
  useEffect(() => {
    if (plan && value.bankAccountId == null && plan.defaultBankId != null) onChange({ ...value, bankAccountId: plan.defaultBankId });
  }, [plan]); // eslint-disable-line

  if (taxCategory !== 'GST') return null;
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <div className="sm:col-span-3">
        <label className="label">Bank account on the bill</label>
        {accounts.length ? (
          <select className="input" value={value.bankAccountId ?? ''} onChange={(e) => set('bankAccountId', e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} · A/C {a.accountNo}{a.branchIfsc ? ` · ${a.branchIfsc}` : ''}</option>)}
          </select>
        ) : (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No bank account saved for this business — add one under Business Setup so it prints on the bill.</div>
        )}
      </div>
      <div className="sm:col-span-2">
        <label className="label">Client PO No. (optional)</label>
        <input className="input" value={value.poNumber || ''} onChange={(e) => set('poNumber', e.target.value)} placeholder="e.g. 27SG-PO000025284" />
      </div>
      <div>
        <label className="label">PO date</label>
        <input type="date" className="input" value={value.poDate || ''} onChange={(e) => set('poDate', e.target.value)} />
      </div>
    </div>
  );
}
