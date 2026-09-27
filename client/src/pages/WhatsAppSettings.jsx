import { useEffect, useState } from 'react';
import { MessageCircle, Save, Check } from 'lucide-react';
import api from '../api';
import { useAuth } from '../auth';
import { Spinner } from '../components/ui';

const EVENTS = [
  ['onInvoice', 'tplInvoice', 'Invoice raised', '{{client}} {{invoiceNo}} {{amount}} {{dueDate}} {{company}}'],
  ['onBooking', 'tplBooking', 'Booking confirmed', '{{client}} {{orderNo}} {{sites}} {{company}}'],
  ['onPayment', 'tplPayment', 'Payment received', '{{client}} {{amount}} {{orderNo}} {{company}}'],
  ['onExpiry', 'tplExpiry', 'Campaign expiry', '{{client}} {{orderNo}} {{endDate}} {{company}}'],
  ['onBillingDue', 'tplBillingDue', 'Billing due', '{{client}} {{orderNo}} {{company}}'],
];

export default function WhatsAppSettings() {
  const { user } = useAuth();
  const canManage = user.role === 'MANAGER' || user.role === 'SUPER_ADMIN';
  const [form, setForm] = useState(null);
  const [hasApiToken, setHasApiToken] = useState(false);
  const [apiToken, setApiToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  useEffect(() => {
    api.get('/whatsapp-settings')
      .then((r) => { const { apiToken: _t, hasApiToken: h, ...rest } = r.data; setForm(rest); setHasApiToken(!!h); })
      .catch(() => setForm({}));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const body = { ...form };
      if (apiToken) body.apiToken = apiToken; // only send when a new one is typed
      const r = await api.put('/whatsapp-settings', body);
      const { apiToken: _t, hasApiToken: h, ...rest } = r.data;
      setForm(rest); setHasApiToken(!!h); setApiToken('');
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || 'Could not save settings.' });
    } finally { setBusy(false); }
  }

  if (!canManage) {
    return <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">Only a Manager or Super-Admin can change WhatsApp settings.</div>;
  }
  if (!form) return <Spinner />;

  const provider = form.provider || 'MANUAL';
  const isApi = provider !== 'MANUAL';

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle size={22} className="text-emerald-600" />
        <h1 className="text-2xl font-bold text-slate-800">WhatsApp</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Two modes: <b>Manual</b> shows one-tap "Send on WhatsApp" buttons (a person presses send — free, no setup).
        <b> Cloud API / BSP</b> send template messages automatically and power scheduled reminders (needs credentials + approved templates; server automation is Phase 2).
      </p>

      {/* Mode */}
      <div className="card p-5 mb-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Mode</label>
            <select className="input" value={provider} onChange={(e) => set('provider', e.target.value)}>
              <option value="MANUAL">Manual (click-to-chat)</option>
              <option value="CLOUD_API">WhatsApp Cloud API</option>
              <option value="BSP">BSP (Interakt / Gupshup / Wati)</option>
            </select>
          </div>
          <div>
            <label className="label">Office WhatsApp number</label>
            <input className="input" placeholder="e.g. 9198XXXXXXXX" value={form.fromNumber || ''} onChange={(e) => set('fromNumber', e.target.value)} />
          </div>
        </div>

        {!isApi && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
            One-tap "Send on WhatsApp" buttons only — nothing auto-sends. Set the office number and templates below.
          </div>
        )}

        {isApi && (
          <div className="rounded-lg border border-slate-200 p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-4">
              {provider === 'CLOUD_API' && (
                <div>
                  <label className="label">Phone number ID</label>
                  <input className="input" value={form.phoneNumberId || ''} onChange={(e) => set('phoneNumberId', e.target.value)} />
                </div>
              )}
              {provider === 'BSP' && (
                <div>
                  <label className="label">BSP base URL</label>
                  <input className="input" placeholder="https://api.provider.com" value={form.bspBaseUrl || ''} onChange={(e) => set('bspBaseUrl', e.target.value)} />
                </div>
              )}
              <div>
                <label className="label flex items-center gap-2">API token {hasApiToken && <span className="text-emerald-600 inline-flex items-center gap-0.5 text-[11px] font-normal"><Check size={12} /> saved</span>}</label>
                <input type="password" className="input" placeholder="leave blank to keep existing" value={apiToken} onChange={(e) => setApiToken(e.target.value)} />
              </div>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Automatic sending and the reminder scheduler switch on once credentials are saved and templates are approved by the provider (server integration is Phase 2).
            </div>
          </div>
        )}
      </div>

      {/* Events + templates */}
      <div className="card p-5 mb-4">
        <div className="text-sm font-semibold text-slate-700 mb-3">Events &amp; message templates</div>
        <div className="space-y-4">
          {EVENTS.map(([toggle, tpl, label, hint]) => (
            <div key={toggle} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={!!form[toggle]} onChange={(e) => set(toggle, e.target.checked)} />
                {label}
              </label>
              <textarea className="input mt-2 h-20 text-sm" value={form[tpl] || ''} onChange={(e) => set(tpl, e.target.value)} placeholder={`Message for ${label.toLowerCase()}…`} />
              <div className="text-[11px] text-slate-400 mt-1">Placeholders: {hint}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary flex items-center gap-1.5" disabled={busy} onClick={save}><Save size={16} /> {busy ? 'Saving…' : 'Save settings'}</button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
