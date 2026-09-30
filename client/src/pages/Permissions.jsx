import { useEffect, useState } from 'react';
import { ShieldCheck, Save, Check } from 'lucide-react';
import api from '../api';
import { useAuth } from '../auth';
import { Spinner } from '../components/ui';

const ROLE_LABEL = { SALES: 'Sales', MANAGER: 'Manager', OPS: 'Ops', FINANCE: 'Finance' };
const ACTION_LABEL = { view: 'View', add: 'Add', edit: 'Edit', delete: 'Delete' };

// Super-admin editor for the RBAC matrix. Roles as tabs; each tab is a
// module × action grid of checkboxes. Saving PUTs the whole matrix for that role.
export default function Permissions() {
  const { user, refreshPermissions } = useAuth();
  const [meta, setMeta] = useState(null); // { modules, roles, actions, matrices }
  const [draft, setDraft] = useState({}); // { role: { module: { action: bool } } }
  const [role, setRole] = useState('SALES');
  const [saving, setSaving] = useState(false);
  const [savedRole, setSavedRole] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/permissions')
      .then(({ data }) => {
        setMeta(data);
        setDraft(structuredClone(data.matrices));
        setRole(data.roles[0]);
      })
      .catch((e) => setError(e.response?.data?.error || 'Could not load permissions'));
  }, []);

  if (user?.role !== 'SUPER_ADMIN') {
    return <div className="card p-6 text-slate-600">Only the Super Admin can manage permissions.</div>;
  }
  if (error) return <div className="card p-6 text-red-600">{error}</div>;
  if (!meta) return <Spinner />;

  const toggle = (moduleKey, action) => {
    setDraft((d) => ({
      ...d,
      [role]: { ...d[role], [moduleKey]: { ...d[role][moduleKey], [action]: !d[role][moduleKey][action] } },
    }));
    setSavedRole(null);
  };

  const setAllForModule = (moduleKey, actions, value) => {
    setDraft((d) => {
      const next = { ...d[role][moduleKey] };
      for (const a of actions) next[a] = value;
      return { ...d, [role]: { ...d[role], [moduleKey]: next } };
    });
    setSavedRole(null);
  };

  async function save() {
    setSaving(true); setError('');
    try {
      const { data } = await api.put(`/permissions/${role}`, { permissions: draft[role] });
      setDraft((d) => ({ ...d, [role]: data.matrix }));
      setSavedRole(role);
      // If the admin edited their own effective view somehow, keep the client fresh.
      refreshPermissions && (await api.get('/auth/me').then(({ data: me }) => refreshPermissions(me.permissions)).catch(() => {}));
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="text-brand" size={22} />
        <h1 className="text-2xl font-bold text-slate-800">Permissions</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Choose what each role can do. Super Admin always has full access. Changes take effect the next time a user's session refreshes.
      </p>

      {/* Role tabs */}
      <div className="flex flex-wrap gap-1 mb-4 rounded-lg bg-slate-100 p-1 w-fit">
        {meta.roles.map((r) => (
          <button
            key={r}
            onClick={() => { setRole(r); setSavedRole(null); }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${role === r ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {ROLE_LABEL[r] || r}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left border-b border-slate-200">Module</th>
              {meta.actions.map((a) => (
                <th key={a} className="px-3 py-3 text-center border-b border-slate-200 w-20">{ACTION_LABEL[a] || a}</th>
              ))}
              <th className="px-3 py-3 text-center border-b border-slate-200 w-16">All</th>
            </tr>
          </thead>
          <tbody>
            {meta.modules.map((m) => {
              const row = draft[role]?.[m.key] || {};
              const allOn = m.actions.every((a) => row[a]);
              return (
                <tr key={m.key} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{m.label}</td>
                  {meta.actions.map((a) => (
                    <td key={a} className="px-3 py-2.5 text-center">
                      {m.actions.includes(a) ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--brand,#9E2015)] cursor-pointer"
                          checked={!!row[a]}
                          onChange={() => toggle(m.key, a)}
                        />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center">
                    <button
                      className="text-xs text-brand hover:underline"
                      onClick={() => setAllForModule(m.key, m.actions, !allOn)}
                    >
                      {allOn ? 'Clear' : 'All'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary flex items-center gap-1.5" onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving…' : `Save ${ROLE_LABEL[role] || role}`}
        </button>
        {savedRole === role && (
          <span className="flex items-center gap-1 text-sm text-emerald-600"><Check size={16} /> Saved</span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
