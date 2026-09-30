import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth';
import api from '../api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('email'); // 'email' | 'phone'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (mode === 'phone') {
      if (!/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits'); return; }
      setBusy(true);
      try {
        // auth.jsx's login() only builds an {email, password} body, so for the
        // phone+PIN path we post to the same endpoint directly and mirror its
        // token-setting, then hard-navigate so AuthProvider re-reads the user.
        const { data } = await api.post('/auth/login', { phone: phone.trim(), pin });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.assign('/dashboard');
      } catch (err) {
        setError(err.response?.data?.error || 'Login failed');
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await login(email, password);
      navigate('/dashboard');
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
          <img src="/logo.png" alt="Saangari Ads" className="h-24 w-auto rounded-xl shadow-md mb-4" />
          <div className="text-5xl font-bold tracking-tight text-slate-900 mb-8">Saangari Ads</div>
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

          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => { setMode('email'); setError(''); }}
              className={`rounded-md py-1.5 font-medium transition ${mode === 'email' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => { setMode('phone'); setError(''); }}
              className={`rounded-md py-1.5 font-medium transition ${mode === 'phone' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Phone + PIN
            </button>
          </div>

          {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

          {mode === 'email' ? (
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
          ) : (
            <div className="space-y-3">
              <div>
                <label className="label">Phone</label>
                <input className="input" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="label">PIN</label>
                <input
                  className="input tracking-[0.5em]"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
            </div>
          )}

          <button className="btn-primary w-full mt-4" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
