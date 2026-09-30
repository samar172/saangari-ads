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
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'SALES', pin: '', hasPin: false });
  const [clearPin, setClearPin] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!editing) return;
    api.get('/users').then((r) => {
      const u = r.data.find((x) => String(x.id) === String(id));
      if (u) setForm({ name: u.name || '', email: u.email || '', phone: u.phone || '', password: '', role: u.role || 'SALES', pin: '', hasPin: !!u.hasPin });
    }).finally(() => setLoading(false));
  }, [id, editing]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const pin = form.pin.trim();
    if (pin && !/^\d{4}$/.test(pin)) { setErr('Login PIN must be exactly 4 digits.'); return; }
    if (pin && !form.phone.trim()) { setErr('A phone number is required to set a login PIN.'); return; }
    setBusy(true);
    try {
      if (editing) {
        const payload = { name: form.name, phone: form.phone, role: form.role };
        if (form.password.trim()) payload.password = form.password.trim();
        if (clearPin) payload.pin = '';
        else if (pin) payload.pin = pin;
        await api.patch(`/users/${id}`, payload);
      } else {
        const payload = { name: form.name, email: form.email.trim().toLowerCase(), phone: form.phone, role: form.role, password: form.password.trim() };
        if (pin) payload.pin = pin;
        await api.post('/users', payload);
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
            <label className="label">Login PIN</label>
            <input
              className="input"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder={editing && form.hasPin ? '••••' : '4-digit PIN'}
              value={form.pin}
              disabled={clearPin}
              onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <div className="text-[11px] text-slate-400 mt-1">Lets this user log in with their phone number + PIN.</div>
            {editing && form.hasPin && !clearPin && (
              <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                <span>PIN is set — leave blank to keep, or type a new 4-digit PIN to change it.</span>
                <button type="button" className="text-brand underline" onClick={() => { setClearPin(true); set('pin', ''); }}>Clear PIN</button>
              </div>
            )}
            {clearPin && (
              <div className="text-[11px] text-amber-600 mt-1 flex flex-wrap items-center gap-2">
                <span>PIN will be cleared when you save.</span>
                <button type="button" className="text-brand underline" onClick={() => setClearPin(false)}>Undo</button>
              </div>
            )}
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
