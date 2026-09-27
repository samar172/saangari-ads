import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Plus, ChevronRight } from 'lucide-react';
import { useAuth, can } from '../auth';
import { Spinner } from '../components/ui';

// List of printing partners. Cards navigate to the full-page detail; add/edit
// open the full-page form.
export default function PrintingPartners() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() { setLoading(true); api.get('/printing-partners').then((r) => setPartners(r.data)).finally(() => setLoading(false)); }
  useEffect(load, []);

  async function toggleActive(p) {
    await api.patch(`/printing-partners/${p.id}`, { active: !p.active });
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Printing Partners</h1>
          <p className="text-sm text-slate-500">Vendors used for flex printing &amp; mounting — tap a partner for their print history</p>
        </div>
        {can(user, 'managePartners') && <button className="btn-accent flex items-center gap-1.5" onClick={() => navigate('/printing-partners/new')}><Plus size={16} /> Add Partner</button>}
      </div>

      {loading ? <Spinner /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/printing-partners/${p.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/printing-partners/${p.id}`); } }}
              className={`card p-4 cursor-pointer transition hover:border-brand/40 hover:shadow-md ${!p.active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-slate-800">{p.name}</div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.ratePerSqft > 0 && <span className="badge bg-brand/10 text-brand">₹{p.ratePerSqft}/sqft</span>}
                  <ChevronRight size={16} className="text-slate-300" />
                </div>
              </div>
              {p.contact && <div className="text-sm text-slate-600 mt-1">{p.contact}</div>}
              {p.phone && <div className="text-sm text-slate-500">📞 {p.phone}</div>}
              {p.email && <div className="text-sm text-slate-500 truncate">✉ {p.email}</div>}
              {p.address && <div className="text-xs text-slate-400 mt-1">{p.address}</div>}
              <div className="text-xs text-slate-400 mt-2">{p._count?.orders || 0} order(s)</div>
              {can(user, 'managePartners') && (
                <div className="flex gap-2 mt-3">
                  {/* These sit inside a clickable card, so stop the click bubbling up. */}
                  <button className="btn-ghost text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/printing-partners/${p.id}/edit`); }}>Edit</button>
                  <button className="btn-ghost text-xs" onClick={(e) => { e.stopPropagation(); toggleActive(p); }}>{p.active ? 'Deactivate' : 'Activate'}</button>
                </div>
              )}
            </div>
          ))}
          {partners.length === 0 && <div className="text-slate-400 text-sm">No printing partners yet.</div>}
        </div>
      )}
    </div>
  );
}
