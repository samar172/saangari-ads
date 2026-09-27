import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api from '../api';
import { Spinner } from '../components/ui';

const ROLES = ['SALES', 'MANAGER', 'OPS', 'FINANCE', 'SUPER_ADMIN'];

// Full-page create/edit user form (replaces the Add User modal). On edit the
// email is read-only (login identity); password is optional (blank = unchanged).
export default function UserForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = !!id;
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'SALES' });
  const [loading, setLoading] = useState(editing);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!editing) return;
    api.get('/users').then((r) => {
      const u = r.data.find((x) => String(x.id) === String(id));
      if (u) setForm({ name: u.name || '', email: u.email || '', phone: u.phone || '', password: '', role: u.role || 'SALES' });
    }).finally(() => setLoading(false));
  }, [id, editing]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (editing) {
        const payload = { name: form.name, phone: form.phone, role: form.role };
        if (form.password.trim()) payload.password = form.password.trim();
        await api.patch(`/users/${id}`, payload);
      } else {
        await api.post('/users', { ...form, email: form.email.trim().toLowerCase(), password: form.password.trim() });
      }
      navigate('/users');
    } catch (e2) { setErr(e2.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button className="btn-ghost" onClick={() => navigate('/users')}><ArrowLeft size={16} /> Back</button>
        <h1 className="text-2xl font-bold text-slate-800">{editing ? 'Edit User' : 'Add User'}</h1>
      </div>
      <form onSubmit={submit} className="card p-6 w-full max-w-md">
        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
        <div className="space-y-3">
          <div><label className="label">Name</label><input className="input" autoComplete="off" value={form.name} onChange={(e) => set('name', e.target.value)} required /></div>
          <div>
            <label className="label">Email</label>
            <input className="input" autoComplete="off" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={editing} required />
            {editing && <div className="text-[11px] text-slate-400 mt-1">Login email can't be changed.</div>}
          </div>
          <div><label className="label">Phone</label><input className="input" autoComplete="off" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div>
            <label className="label">{editing ? 'New password (leave blank to keep)' : 'Password'}</label>
            <input className="input" type="text" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} required={!editing} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" className="btn-ghost" onClick={() => navigate('/users')}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create')}</button>
        </div>
      </form>
    </div>
  );
}
