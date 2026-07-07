import { useEffect, useState } from 'react';
import api from '../api';
import { Modal, Spinner, Badge } from '../components/ui';

const ROLES = ['SALES', 'MANAGER', 'OPS', 'FINANCE', 'SUPER_ADMIN'];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  function load() { setLoading(true); api.get('/users').then((r) => setUsers(r.data)).finally(() => setLoading(false)); }
  useEffect(load, []);

  async function toggle(u) { await api.patch(`/users/${u.id}`, { active: !u.active }); load(); }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Users</h1>
        <button className="btn-accent" onClick={() => setOpen(true)}>＋ Add User</button>
      </div>
      {loading ? <Spinner /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
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
                  <td className="px-4 py-2 text-right"><button className="text-brand-light underline text-xs" onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <AddUser onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function AddUser({ onClose, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'SALES' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true); setErr('');
    try { await api.post('/users', form); onDone(); }
    catch (e) { setErr(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Add User">
      {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="space-y-3">
        <input className="input" placeholder="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        <input className="input" placeholder="Email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <input className="input" type="password" placeholder="Password" value={form.password} onChange={(e) => set('password', e.target.value)} />
        <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <button className="btn-primary w-full mt-4" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create'}</button>
    </Modal>
  );
}
