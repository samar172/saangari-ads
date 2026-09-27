import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import api, { downloadFile } from '../api';
import { useAuth, can } from '../auth';
import { useCompany } from '../CompanyContext';
import { Badge, Money, Spinner } from '../components/ui';

export default function Invoices() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  function load() {
    setLoading(true);
    api.get('/invoices', { params: { companyId: activeCompany?.id } }).then((r) => setInvoices(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, [activeCompany]);

  async function markPaid(id) { await api.post(`/invoices/${id}/mark-paid`); load(); }

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? invoices.filter((i) => [i.invoiceNo, i.client.company, i.client.name, i.order?.orderNo]
        .filter(Boolean).join(' ').toLowerCase().includes(needle))
    : invoices;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-full sm:w-64" placeholder="Search company / invoice…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost flex items-center gap-1.5" onClick={() => downloadFile(`/exports/invoices/excel${activeCompany?.id ? `?companyId=${activeCompany.id}` : ''}`, 'invoices.xlsx')}><Download size={16} /> Export Excel</button>
          {can(user, 'generateInvoice') && <button className="btn-accent flex items-center gap-1.5" onClick={() => navigate('/invoices/new')}><Plus size={16} /> Generate Invoice</button>}
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Invoice No</th>
                <th className="px-4 py-2 text-left">Client</th>
                <th className="px-4 py-2 text-left">Order / Sites</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-left">Due</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} onClick={() => navigate(`/invoices/${i.id}`)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2 font-medium">{i.invoiceNo}</td>
                  <td className="px-4 py-2">
                    <span className="font-medium text-slate-800">{i.client.company || i.client.name}</span>
                    {i.client.company && <div className="text-[11px] text-slate-400">{i.client.name}</div>}
                  </td>
                  <td className="px-4 py-2">{i.order?.orderNo}<div className="text-xs text-slate-400">{(i.order?.items || []).map((it) => it.site.code).join(', ')}</div></td>
                  <td className="px-4 py-2">{i.taxCategory === 'GST' ? <Badge status="LIVE">{i.interState ? 'IGST' : 'CGST+SGST'}</Badge> : <span className="text-slate-400">Non-GST</span>}</td>
                  <td className="px-4 py-2 text-right font-medium"><Money value={i.total} /></td>
                  <td className="px-4 py-2 text-xs text-slate-500">{i.dueDate ? new Date(i.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-4 py-2"><Badge status={i.status} /></td>
                  <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    <button className="text-brand-light underline text-xs" onClick={(e) => { e.stopPropagation(); downloadFile(`/invoices/${i.id}/pdf`, `${i.invoiceNo}.pdf`); }}>PDF</button>
                    {can(user, 'generateInvoice') && i.status !== 'PAID' && (
                      <button className="text-emerald-600 underline text-xs" onClick={(e) => { e.stopPropagation(); markPaid(i.id); }}>Mark paid</button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="8" className="px-4 py-10 text-center text-slate-400">{invoices.length === 0 ? 'No invoices yet' : 'No matching invoices'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
