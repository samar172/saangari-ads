import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../api';
import { useAuth, can } from '../auth';
import { Spinner } from '../components/ui';
import CategoryManager from '../components/CategoryManager';
import MediaTypeManager from '../components/MediaTypeManager';

export default function Companies() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('businesses'); // 'businesses' | 'categories' | 'media'

  function load() {
    setLoading(true);
    api.get('/companies').then((r) => setCompanies(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Business Setup</h1>
          <p className="text-sm text-slate-500">Manage business entities, GST, terms & conditions, and client categories</p>
        </div>
        {tab === 'businesses' && can(user, 'manageCompanies') && (
          <button className="btn-accent text-sm flex items-center gap-1.5" onClick={() => navigate('/settings/companies/new')}><Plus size={16} /> New Business</button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-5">
        {[['businesses', 'Businesses'], ['categories', 'Client Categories'], ['media', 'Media Types']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              tab === k ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'categories' && <CategoryManager />}
      {tab === 'media' && <MediaTypeManager />}

      {tab === 'businesses' && (loading ? <Spinner /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => (
            <div key={c.id} className="card p-5 hover:border-brand/30 transition cursor-pointer" onClick={() => navigate(`/settings/companies/${c.id}/edit`)}>
              <div className="flex items-start justify-between mb-2">
                <div className="font-bold text-lg text-slate-800">{c.name}</div>
                <div className="text-xs uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-semibold">{c.code}</div>
              </div>
              <div className="text-sm text-slate-600 mb-4">{c.legalName || 'No legal name set'}</div>
              <div className="space-y-1 text-xs text-slate-500 mb-4">
                {c.gstin && <div>GSTIN: <span className="font-medium text-slate-700">{c.gstin}</span></div>}
                {c.pan && <div>PAN: <span className="font-medium text-slate-700">{c.pan}</span></div>}
              </div>
              <div className="flex gap-2">
                {c.gstMandatory && <span className="badge bg-blue-50 text-blue-700 text-[10px]">GST Mandatory</span>}
                {c.gstHidden && <span className="badge bg-amber-50 text-amber-700 text-[10px]">GST Hidden</span>}
                {c.termsAndConditions && <span className="badge bg-emerald-50 text-emerald-700 text-[10px]">T&C Configured</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
