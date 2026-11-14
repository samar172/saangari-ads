import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, ArrowRightLeft } from 'lucide-react';
import api, { downloadFile } from '../api';
import { useCompany } from '../CompanyContext';
import { Money, Spinner } from '../components/ui';

const STATUS_STYLE = { OPEN: 'bg-amber-100 text-amber-800', CONVERTED: 'bg-emerald-100 text-emerald-800', LOST: 'bg-slate-100 text-slate-500' };
const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// Saved quotations (Word letters). They hold no sites; "Convert" opens New
// Booking pre-filled. Campaigns saved as a quotation from New Booking (which
// do hold their sites) are listed underneath.
export default function Quotations() {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const [list, setList] = useState(null);
  const [held, setHeld] = useState([]);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  function load() {
    api.get('/quotations', { params: { companyId: activeCompany?.id, status: status || undefined } }).then((r) => setList(r.data)).catch(() => setList([]));
    api.get('/orders', { params: { status: 'QUOTATION', companyId: activeCompany?.id } }).then((r) => setHeld(r.data)).catch(() => setHeld([]));
  }
  useEffect(load, [activeCompany, status]); // eslint-disable-line

  async function setStatusOf(x, s) {
    await api.post(`/quotations/${x.id}/status`, { status: s });
    load();
  }

  const needle = q.trim().toLowerCase();
  const rows = (list || []).filter((x) => !needle || [x.quoteNo, x.clientName, x.clientCompany, ...(x.lines || []).map((l) => `${l.code || ''} ${l.name}`)].join(' ').toLowerCase().includes(needle));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quotations</h1>
          <p className="text-sm text-slate-500">Quotation letters — no site is held until converted into a booking</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-full sm:w-56" placeholder="Search no. / client / site…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option><option value="OPEN">Open</option><option value="CONVERTED">Converted</option><option value="LOST">Lost</option>
          </select>
          <button className="btn-accent text-sm flex items-center gap-1.5" onClick={() => navigate('/quotations/new')}><Plus size={16} /> New Quotation</button>
        </div>
      </div>

      {!list ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Quotation</th>
                <th className="px-4 py-3 text-left">To</th>
                <th className="px-4 py-3 text-left">Sites</th>
                <th className="px-4 py-3 text-right">Value (ex-GST)</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/quotations/${x.id}`)}>
                  <td className="px-4 py-3"><div className="font-medium text-brand">{x.quoteNo}</div><div className="text-xs text-slate-400">{fmt(x.quoteDate)} · {x.createdBy?.name}</div></td>
                  <td className="px-4 py-3"><div className="font-medium text-slate-800">{x.clientCompany || x.clientName}</div>{x.clientCompany && <div className="text-xs text-slate-400">{x.clientName}</div>}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[260px] truncate">{x.lines.length} · {x.lines.map((l) => l.code || l.name).join(', ')}</td>
                  <td className="px-4 py-3 text-right font-medium"><Money value={x.value} /></td>
                  <td className="px-4 py-3"><span className={`badge ${STATUS_STYLE[x.status]}`}>{x.status.toLowerCase()}</span></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-2" onClick={(e) => e.stopPropagation()}>
                    <button className="text-brand-light underline text-xs" onClick={() => downloadFile(`/quotations/${x.id}/docx`, `Quotation-${x.quoteNo.replace(/\//g, '-')}.docx`)}><Download size={12} className="inline" /> Word</button>
                    {x.status === 'OPEN' && <button className="text-emerald-700 underline text-xs" onClick={() => navigate(`/new-booking?fromQuote=${x.id}`)}><ArrowRightLeft size={12} className="inline" /> Convert</button>}
                    {x.status === 'OPEN' && <button className="text-slate-500 underline text-xs" onClick={() => setStatusOf(x, 'LOST')}>Mark lost</button>}
                    {x.status === 'LOST' && <button className="text-slate-500 underline text-xs" onClick={() => setStatusOf(x, 'OPEN')}>Reopen</button>}
                    {x.status === 'CONVERTED' && x.orderId && <button className="text-slate-600 underline text-xs" onClick={() => navigate(`/orders/${x.orderId}`)}>Open campaign</button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No quotations yet — create one with “New Quotation”.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {held.length > 0 && (
        <div className="mt-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Bookings saved as quotation (sites held)</div>
          <div className="card divide-y divide-slate-100">
            {held.map((o) => (
              <button key={o.id} className="w-full text-left px-4 py-2.5 flex flex-wrap items-center gap-3 hover:bg-slate-50" onClick={() => navigate(`/orders/${o.id}`)}>
                <span className="font-medium text-brand">{o.orderNo}</span>
                <span className="text-slate-700">{o.client.company || o.client.name}</span>
                <span className="text-xs text-slate-400">{o.items.length} site(s)</span>
                <span className="flex-1" />
                <Money value={o.grandTotal} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
