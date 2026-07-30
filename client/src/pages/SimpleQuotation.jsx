import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Download } from 'lucide-react';
import { downloadPost } from '../api';
import { useCompany } from '../CompanyContext';

// A short, no-mapping quotation: just the client's details and free rate lines
// that can span any number of months. It prints a PDF — nothing is booked or
// reserved, so it never touches inventory.
export default function SimpleQuotation() {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const [form, setForm] = useState({ clientName: '', clientCompany: '', address: '', contact: '', notes: '' });
  const [lines, setLines] = useState([{ description: '', months: 1, rate: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const setLine = (i, k, v) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((ls) => [...ls, { description: '', months: 1, rate: '' }]);
  const removeLine = (i) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const total = lines.reduce((s, l) => s + (Number(l.months) || 0) * (Number(l.rate) || 0), 0);

  async function download() {
    setErr('');
    if (!form.clientName.trim()) return setErr('Client name is required');
    if (!lines.some((l) => l.description || l.rate)) return setErr('Add at least one line');
    setBusy(true);
    try {
      await downloadPost('/exports/quotation/simple', {
        companyName: activeCompany?.legalName || activeCompany?.name,
        ...form, lines,
      }, `Quotation-${form.clientName}.pdf`);
    } catch (e) { setErr('Could not generate the quotation PDF'); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quick Quotation</h1>
          <p className="text-sm text-slate-500">A simple proposal PDF — no site mapping, nothing booked.</p>
        </div>
      </div>

      {err && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Client Name *"><input className="input" value={form.clientName} onChange={(e) => set('clientName', e.target.value)} /></Field>
          <Field label="Company Name"><input className="input" value={form.clientCompany} onChange={(e) => set('clientCompany', e.target.value)} /></Field>
          <Field label="Contact No."><input className="input" value={form.contact} onChange={(e) => set('contact', e.target.value)} /></Field>
          <Field label="Address"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-700">Sites / Rate Lines</div>
            <button type="button" className="text-xs text-brand-light font-medium flex items-center gap-1" onClick={addLine}><Plus size={14} /> Add line</button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input className="input flex-1 min-w-0" placeholder="Site / description (e.g. Unipole near Station)" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} />
                <input type="number" min="1" className="input w-20 shrink-0" placeholder="Months" value={l.months} onChange={(e) => setLine(i, 'months', e.target.value)} />
                <input type="number" min="0" className="input w-28 shrink-0" placeholder="Rate/mo" value={l.rate} onChange={(e) => setLine(i, 'rate', e.target.value)} />
                <button type="button" className="text-slate-400 hover:text-red-600 px-1" onClick={() => removeLine(i)}><X size={16} /></button>
              </div>
            ))}
          </div>
          <div className="text-right text-sm font-semibold text-slate-800 mt-2">Total: ₹{total.toLocaleString('en-IN')}</div>
        </div>

        <Field label="Notes / Terms"><textarea className="input h-24 resize-y" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Rates exclusive of printing & mounting. 50% advance." /></Field>

        <div className="flex justify-end">
          <button className="btn-primary flex items-center gap-1.5" disabled={busy} onClick={download}><Download size={16} /> {busy ? 'Generating…' : 'Download Quotation PDF'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
