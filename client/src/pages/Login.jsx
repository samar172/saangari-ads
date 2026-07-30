import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);

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
      <div 
        className="hidden md:flex flex-col justify-center p-12 relative overflow-hidden"
        style={{
          backgroundImage: "url('/logo.png')",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      >
        {/* White overlay with minimal blur for frosted glass effect */}
        <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-0"></div>
        
        {/* Content on top of the blur */}
        <div className="relative z-10">
          <div className="text-5xl font-bold tracking-tight text-slate-900">SAANGRI</div>
          <div className="text-brand font-bold uppercase tracking-widest text-sm mt-2 mb-8">Advertising CRM</div>
          <p className="text-slate-800 font-medium max-w-sm text-lg leading-relaxed">
            Outdoor media inventory & booking management for Bikaner — unipoles, gantries, kiosks.
            Track availability, capture monitoring photos, generate invoices and proposals.
          </p>
        </div>
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
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
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
