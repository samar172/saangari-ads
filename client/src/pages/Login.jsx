import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const DEMO = [
  ['Super Admin', 'admin@saangri.com'],
  ['Manager', 'manager@saangri.com'],
  ['Sales', 'sales@saangri.com'],
  ['Ops / Field', 'ops@saangri.com'],
  ['Finance', 'finance@saangri.com'],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@saangri.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-center bg-brand text-white p-12">
        <div className="text-4xl font-bold">SAANGRI</div>
        <div className="text-brand-accent uppercase tracking-widest text-sm mt-1">Advertising CRM</div>
        <p className="mt-6 text-white/80 max-w-sm">
          Outdoor media inventory & booking management for Bikaner — unipoles, gantries, kiosks.
          Track availability, capture monitoring photos, generate invoices and proposals.
        </p>
      </div>
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="card w-full max-w-sm p-6">
          <h1 className="text-xl font-bold text-slate-800">Sign in</h1>
          <p className="text-sm text-slate-500 mb-4">Access your dashboard</p>
          {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary w-full mt-4" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Demo accounts (password: password123)</div>
            <div className="grid grid-cols-1 gap-1">
              {DEMO.map(([label, mail]) => (
                <button type="button" key={mail} onClick={() => setEmail(mail)}
                  className="flex justify-between rounded px-2 py-1 text-xs hover:bg-slate-50 text-left">
                  <span className="font-medium text-slate-700">{label}</span>
                  <span className="text-slate-400">{mail}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
