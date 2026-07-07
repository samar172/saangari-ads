import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api';
import { Money } from '../components/ui';

export default function NewBooking() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [sites, setSites] = useState([]);
  const [clients, setClients] = useState([]);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newClient, setNewClient] = useState(false);

  const [form, setForm] = useState({
    bookingType: 'REGULAR',
    siteId: params.get('siteId') || '',
    clientId: '',
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().add(29, 'day').format('YYYY-MM-DD'),
    discountPct: 0,
    discountRemarks: '',
    gstApplicable: false,
    dayRateOverride: '',
    notes: '',
  });
  const [clientForm, setClientForm] = useState({ name: '', phone: '', email: '', company: '', taxCategory: 'NON_GST', gstNumber: '' });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { api.get('/clients').then((r) => setClients(r.data)); }, []);

  // Regular = only available sites; Loose = all sites (waitlist/override)
  useEffect(() => {
    const p = form.bookingType === 'REGULAR' ? { status: 'AVAILABLE' } : {};
    api.get('/sites', { params: p }).then((r) => setSites(r.data));
  }, [form.bookingType]);

  const selectedSite = useMemo(() => sites.find((s) => s.id === Number(form.siteId)), [sites, form.siteId]);

  // Live quote whenever pricing inputs change
  useEffect(() => {
    if (!form.siteId || !form.startDate || !form.endDate) { setQuote(null); return; }
    const t = setTimeout(() => {
      api.post('/bookings/quote', {
        siteId: Number(form.siteId), startDate: form.startDate, endDate: form.endDate,
        discountPct: Number(form.discountPct) || 0, gstApplicable: form.gstApplicable,
        dayRateOverride: form.dayRateOverride ? Number(form.dayRateOverride) : undefined,
      }).then((r) => setQuote(r.data)).catch(() => setQuote(null));
    }, 250);
    return () => clearTimeout(t);
  }, [form.siteId, form.startDate, form.endDate, form.discountPct, form.gstApplicable, form.dayRateOverride]);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      let clientId = form.clientId;
      if (newClient) {
        const { data } = await api.post('/clients', clientForm);
        clientId = data.id;
      }
      if (!clientId) throw { response: { data: { error: 'Select or create a client' } } };
      const { data } = await api.post('/bookings', {
        siteId: Number(form.siteId), clientId: Number(clientId), type: form.bookingType,
        startDate: form.startDate, endDate: form.endDate,
        discountPct: Number(form.discountPct) || 0, discountRemarks: form.discountRemarks,
        gstApplicable: form.gstApplicable,
        dayRateOverride: form.dayRateOverride ? Number(form.dayRateOverride) : undefined,
        notes: form.notes,
      });
      navigate(`/bookings?highlight=${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create booking');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">New Booking</h1>
      <p className="text-sm text-slate-500 mb-5">Price auto-calculates as you fill the form</p>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <form onSubmit={submit} className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <label className="label">Booking Type</label>
              <div className="flex gap-2">
                {[['REGULAR', 'Regular', 'Available sites only'], ['LOOSE', 'Loose', 'All sites — waitlist/override']].map(([v, l, d]) => (
                  <button type="button" key={v} onClick={() => set('bookingType', v)}
                    className={`flex-1 rounded-lg border p-3 text-left transition ${form.bookingType === v ? 'border-brand bg-brand/5' : 'border-slate-200'}`}>
                    <div className="font-medium text-sm">{l}</div>
                    <div className="text-xs text-slate-500">{d}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Site</label>
              <select className="input" value={form.siteId} onChange={(e) => set('siteId', e.target.value)} required>
                <option value="">Select site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.location} ({s.status})</option>
                ))}
              </select>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Start Date</label>
                <input type="date" className="input" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} required />
              </div>
              <div>
                <label className="label">End Date</label>
                <input type="date" className="input" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} required />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Discount %</label>
                <input type="number" min="0" max="100" className="input" value={form.discountPct} onChange={(e) => set('discountPct', e.target.value)} />
              </div>
              <div>
                <label className="label">Day Rate Override (optional)</label>
                <input type="number" className="input" placeholder={selectedSite ? `default ${Math.round(selectedSite.monthlyRate / 30)}` : ''} value={form.dayRateOverride} onChange={(e) => set('dayRateOverride', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Discount Remarks</label>
              <input className="input" value={form.discountRemarks} onChange={(e) => set('discountRemarks', e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.gstApplicable} onChange={(e) => set('gstApplicable', e.target.checked)} />
              Apply GST (18%) — sets GST invoice sequence
            </label>
          </div>

          {/* Client */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Client</label>
              <button type="button" className="text-xs text-brand-light font-medium" onClick={() => setNewClient((v) => !v)}>
                {newClient ? '← Select existing' : '+ New client'}
              </button>
            </div>
            {!newClient ? (
              <select className="input" value={form.clientId} onChange={(e) => set('clientId', e.target.value)}>
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
              </select>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <input className="input" placeholder="Name *" value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} />
                <input className="input" placeholder="Phone * (unique)" value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} />
                <input className="input" placeholder="Company" value={clientForm.company} onChange={(e) => setClientForm({ ...clientForm, company: e.target.value })} />
                <input className="input" placeholder="Email" value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} />
                <select className="input" value={clientForm.taxCategory} onChange={(e) => setClientForm({ ...clientForm, taxCategory: e.target.value })}>
                  <option value="NON_GST">Non-GST</option>
                  <option value="GST">GST</option>
                </select>
                <input className="input" placeholder="GSTIN" value={clientForm.gstNumber} onChange={(e) => setClientForm({ ...clientForm, gstNumber: e.target.value })} />
              </div>
            )}
          </div>
        </div>

        {/* Price summary */}
        <div className="lg:col-span-1">
          <div className="card p-5 sticky top-6">
            <div className="text-sm font-semibold text-slate-700 mb-3">Price Summary</div>
            {!quote ? (
              <div className="text-sm text-slate-400 py-6 text-center">Select a site and dates</div>
            ) : (
              <dl className="space-y-2 text-sm">
                <Line k={`Day Rate`} v={<Money value={quote.dayRate} />} />
                <Line k="No. of Days" v={quote.days} />
                <Line k="Subtotal" v={<Money value={quote.subtotal} />} />
                {quote.discount > 0 && <Line k={`Discount (${form.discountPct}%)`} v={<span className="text-red-600">−<Money value={quote.discount} /></span>} />}
                {quote.gstAmount > 0 && <Line k="GST 18%" v={<Money value={quote.gstAmount} />} />}
                <div className="flex justify-between border-t border-slate-200 pt-2 mt-2 text-base font-bold text-brand">
                  <span>Final Quote</span><span><Money value={quote.totalAmount} /></span>
                </div>
              </dl>
            )}
            <button className="btn-primary w-full mt-4" disabled={busy || !quote}>
              {busy ? 'Saving…' : '✓ Confirm Booking'}
            </button>
            <button type="button" className="btn-ghost w-full mt-2" onClick={() => navigate(-1)}>Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Line({ k, v }) {
  return <div className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v}</dd></div>;
}
