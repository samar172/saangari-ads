import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../api';
import { useAuth, can } from '../auth';
import { Modal, Spinner, Badge } from '../components/ui';

export default function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmToggle, setConfirmToggle] = useState(null); // user whose access is being changed
  const { user } = useAuth();

  function load() { setLoading(true); api.get('/users').then((r) => setUsers(r.data)).finally(() => setLoading(false)); }
  useEffect(load, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Users</h1>
        {can(user, 'manageUsers') && <button className="btn-accent flex items-center gap-1.5" onClick={() => navigate('/users/new')}><Plus size={16} /> Add User</button>}
      </div>
      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Email</th><th className="px-4 py-2 text-left">Role</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{u.name}</td>
                  <td className="px-4 py-2 text-slate-500">{u.email}</td>
                  <td className="px-4 py-2">{u.role}</td>
                  <td className="px-4 py-2">{u.active ? <Badge status="LIVE">Active</Badge> : <Badge status="CANCELLED">Disabled</Badge>}</td>
                  <td className="px-4 py-2 text-right space-x-3">
                    {can(user, 'manageUsers') && <button className="text-brand underline text-xs" onClick={() => navigate(`/users/${u.id}/edit`)}>Edit</button>}
                    <button className="text-brand-light underline text-xs" onClick={() => setConfirmToggle(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmToggle && <ConfirmToggle target={confirmToggle} onClose={() => setConfirmToggle(null)} onDone={() => { setConfirmToggle(null); load(); }} />}
    </div>
  );
}

// Enabling/disabling a user is a sensitive change, so it's gated behind the
// acting admin re-entering their own password (verified server-side).
function ConfirmToggle({ target, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const disabling = target.active;

  async function submit() {
    setBusy(true); setErr('');
    try { await api.patch(`/users/${target.id}`, { active: !target.active, confirmPassword: password }); onDone(); }
    catch (e) { setErr(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`${disabling ? 'Disable' : 'Enable'} ${target.name}`}>
      <p className="text-sm text-slate-600">
        {disabling
          ? `${target.name} will no longer be able to sign in.`
          : `${target.name} will be able to sign in again.`}
      </p>
      <label className="label mt-4">Enter your password to confirm</label>
      <input className="input" type="password" value={password} autoFocus
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && password) submit(); }} />
      {err && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="flex justify-end gap-3 mt-5">
        <button className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
        <button className={disabling ? 'btn-danger' : 'btn-primary'} disabled={busy || !password} onClick={submit}>
          {busy ? 'Saving…' : (disabling ? 'Disable user' : 'Enable user')}
        </button>
      </div>
    </Modal>
  );
}
