import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Plus, Pencil } from 'lucide-react';
import { Spinner, Badge } from '../components/ui';

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('date');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.get('/clients', { params: { q: q || undefined } }).then((r) => setClients(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);

  // Client-side sort — name, category or newest-first. List isn't paginated.
  const clientName = (c) => (c.company || c.name || '').toLowerCase();
  const sortedClients = [...clients].sort((a, b) => {
    if (sort === 'az') return clientName(a).localeCompare(clientName(b));
    if (sort === 'category') return (a.category?.name || '￿').localeCompare(b.category?.name || '￿');
    return new Date(b.createdAt) - new Date(a.createdAt); // date, newest first
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clients</h1>
          <p className="text-sm text-slate-500">Each client is filed under a category — their bookings inherit it</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-full sm:w-64" placeholder="Search name / phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)} title="Sort by">
            <option value="date">Sort: Date</option>
            <option value="az">Sort: A–Z</option>
            <option value="category">Sort: Category</option>
          </select>
          <button className="btn-accent text-sm flex items-center gap-1.5 shrink-0" onClick={() => navigate('/clients/new')}>
            <Plus size={16} /> New Client
          </button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Company</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Owner / Manager</th>
                <th className="px-4 py-2 text-left">Contact</th>
                <th className="px-4 py-2 text-left">GST</th>
                <th className="px-4 py-2 text-left">Tax</th>
                <th className="px-4 py-2 text-right">Orders</th>
                <th className="px-4 py-2 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {sortedClients.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2 font-semibold text-slate-800">{c.company || <span className="font-normal text-slate-400">{c.name}</span>}</td>
                  <td className="px-4 py-2">
                    {c.category
                      ? <span className="badge bg-teal-100 text-teal-800">{c.category.name}</span>
                      : <span className="text-slate-300">Uncategorised</span>}
                  </td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.phone}</td>
                  <td className="px-4 py-2 text-slate-500">{c.gstNumber || '—'}</td>
                  <td className="px-4 py-2">{c.taxCategory === 'GST' ? <Badge status="LIVE">GST</Badge> : <span className="text-slate-400">Non-GST</span>}</td>
                  <td className="px-4 py-2 text-right">{c._count?.orders ?? 0}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="text-slate-400 hover:text-brand p-1"
                      onClick={(e) => { e.stopPropagation(); navigate(`/clients/${c.id}/edit`); }}
                      aria-label={`Edit ${c.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && <tr><td colSpan="8" className="px-4 py-10 text-center text-slate-400">No clients</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
