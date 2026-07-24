import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Save, CheckCircle, Plus, Check } from 'lucide-react';
import api from '../api';
import { useCompany } from '../CompanyContext';
import { Money, Badge } from '../components/ui';

const emptyClient = { name: '', phone: '', email: '', company: '', taxCategory: 'NON_GST', gstNumber: '', state: 'Rajasthan', categoryId: '' };

// Duration presets. Value encodes the tenure; the label is what the user picks.
const DURATIONS = [
  ['7D', '1 Week'], ['15D', '15 Days'],
  ['1M', '1 Month'], ['2M', '2 Months'], ['3M', '3 Months'],
  ['6M', '6 Months'], ['9M', '9 Months'], ['12M', '12 Months'],
];

// End date for a preset, using the inclusive last-active-day convention: a month
// tenure from the 23rd runs to the 22nd of the target month (start + N months − 1
// day); a day tenure of N days ends on start + N − 1.
function presetEnd(startDate, val) {
  const start = dayjs(startDate);
  if (val.endsWith('M')) return start.add(Number(val.replace('M', '')), 'month').subtract(1, 'day').format('YYYY-MM-DD');
  return start.add(Number(val.replace('D', '')) - 1, 'day').format('YYYY-MM-DD');
}

// Billed days for an inclusive [start, end] span — mirrors the server's
// computeLine (flat 30-day months). Returns 0 for an invalid span.
function billedDays(startDate, endDate) {
  const start = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).startOf('day');
  if (!startDate || !endDate || end.isBefore(start)) return 0;
  const takeDown = end.add(1, 'day');
  const months = takeDown.diff(start, 'month');
  const remainingDays = takeDown.diff(start.add(months, 'month'), 'day');
  return Math.max(1, months * 30 + remainingDays);
}

export default function NewBooking() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { activeCompany } = useCompany();
  const quotationMode = params.get('mode') === 'quotation';
  const [sites, setSites] = useState([]);
  const [clients, setClients] = useState([]);
  const [partners, setPartners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newClient, setNewClient] = useState(false);
  // Full record (orders + ledger) for the selected client, shown as history.
  const [clientInfo, setClientInfo] = useState(null);

  const defStart = dayjs().format('YYYY-MM-DD');
  const defEnd = dayjs().add(29, 'day').format('YYYY-MM-DD'); // 30-day mounting cycle

  const [form, setForm] = useState({
    bookingType: 'REGULAR',
    clientId: '',
    categoryId: '',
    bookingDate: dayjs().format('YYYY-MM-DD'),
    description: '',
    defaultStart: defStart,
    defaultEnd: defEnd,
    printingPartnerId: '',
    noOfPrints: 0,
    printRate: 0,
    mountingCost: 0,
    monitoring: true,
    monitorStart: true,
    monitorMid: true,
    monitorEnd: true,
    taxCategory: 'NON_GST',
    interState: false,
    placeOfSupply: 'Rajasthan',
    paymentTerms: 'ADVANCE',
    discountPct: 0,
    discountRemarks: '',
    notes: '',
  });
  const [lines, setLines] = useState([]); // { siteId, startDate, endDate, dayRateOverride, displayNotes }
  const [addOns, setAddOns] = useState([]); // { label, amount }
  const [clientForm, setClientForm] = useState(emptyClient);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Fetch every site, not just the bookable ones — a line seeded from the grid may
  // point at a booked site, and we still need its code/rate to render the row.
  useEffect(() => {
    api.get('/clients').then((r) => setClients(r.data));
    api.get('/printing-partners').then((r) => setPartners(r.data.filter((p) => p.active)));
    api.get('/categories').then((r) => setCategories(r.data));
    api.get('/sites').then((r) => setSites(r.data));
  }, []);

  // Seed lines from ?siteId= (single, from the site modal) or ?siteIds= (grid multi-select)
  useEffect(() => {
    const ids = (params.get('siteIds') || params.get('siteId') || '')
      .split(',').map((s) => Number(s.trim())).filter(Boolean);
    if (ids.length) setLines(ids.map((siteId) => ({ siteId, startDate: defStart, endDate: defEnd, dayRateOverride: '', displayNotes: '' })));
  }, []); // eslint-disable-line

  // When a client is chosen, default their tax category. The order's category is
  // the client's, so it rides along here rather than being picked separately.
  useEffect(() => {
    const c = clients.find((x) => x.id === Number(form.clientId));
    if (c) setForm((f) => ({
      ...f,
      taxCategory: c.taxCategory,
      interState: (c.state && c.state !== 'Rajasthan') || false,
      categoryId: c.categoryId ? String(c.categoryId) : '',
    }));
  }, [form.clientId]); // eslint-disable-line

  // Pull the chosen client's past activity for the history panel.
  useEffect(() => {
    if (!form.clientId) { setClientInfo(null); return; }
    let alive = true;
    api.get(`/clients/${form.clientId}`)
      .then((r) => { if (alive) setClientInfo(r.data); })
      .catch(() => { if (alive) setClientInfo(null); });
    return () => { alive = false; };
  }, [form.clientId]);

  const selectedClient = clients.find((x) => x.id === Number(form.clientId)) || null;
  const clientCategory = categories.find((c) => c.id === Number(form.categoryId)) || null;

  const siteById = useMemo(() => Object.fromEntries(sites.map((s) => [s.id, s])), [sites]);
  // Regular bookings may only pick vacant sites; loose bookings can override onto any site.
  const available = sites.filter((s) =>
    !lines.some((l) => l.siteId === s.id) && (form.bookingType === 'LOOSE' || s.status === 'AVAILABLE'));

  function addSites(ids) {
    if (!ids || ids.length === 0) return;
    setLines((ls) => [
      ...ls,
      ...ids.map(id => ({ siteId: Number(id), startDate: form.defaultStart, endDate: form.defaultEnd, dayRateOverride: '', displayNotes: '' }))
    ]);
  }
  const updateLine = (i, k, v) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const removeLine = (i) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const updateAddOn = (i, k, v) => setAddOns((a) => a.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));

  // Live order quote
  useEffect(() => {
    const items = lines.filter((l) => l.siteId && l.startDate && l.endDate)
      .map((l) => ({ siteId: l.siteId, startDate: l.startDate, endDate: l.endDate, monthlyRateOverride: l.monthlyRateOverride || undefined }));
    if (items.length === 0) { setQuote(null); return; }
    const t = setTimeout(() => {
      api.post('/orders/quote', {
        items,
        addOns: addOns.filter((a) => a.label),
        noOfPrints: Number(form.noOfPrints) || 0,
        printRate: Number(form.printRate) || 0,
        mountingCost: (Number(form.mountingCost) || 0) * lines.length,
        discountPct: Number(form.discountPct) || 0,
        taxCategory: form.taxCategory,
        interState: form.interState,
      }).then((r) => setQuote(r.data)).catch(() => setQuote(null));
    }, 250);
    return () => clearTimeout(t);
  }, [lines, addOns, form.noOfPrints, form.printRate, form.mountingCost, form.discountPct, form.taxCategory, form.interState]);

  async function submit(status) {
    setError(''); setBusy(true);
    try {
      let clientId = form.clientId;
      if (newClient) {
        const { data } = await api.post('/clients', clientForm);
        clientId = data.id;
      }
      if (!clientId) throw { response: { data: { error: 'Select or create a client' } } };
      if (lines.length === 0) throw { response: { data: { error: 'Add at least one site' } } };
      if (!activeCompany) throw { response: { data: { error: 'No company selected' } } };

      // Determine taxCategory based on company GST rules
      let effectiveTaxCategory = form.taxCategory;
      if (activeCompany.gstHidden) effectiveTaxCategory = 'NON_GST';
      if (activeCompany.gstMandatory) effectiveTaxCategory = 'GST';

      const { data } = await api.post('/orders', {
        clientId: Number(clientId),
        companyId: activeCompany.id,
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        type: form.bookingType,
        status,
        bookingDate: form.bookingDate,
        description: form.description,
        printingPartnerId: form.printingPartnerId ? Number(form.printingPartnerId) : undefined,
        noOfPrints: Number(form.noOfPrints) || 0,
        printRate: Number(form.printRate) || 0,
        mountingCost: (Number(form.mountingCost) || 0) * lines.length,
        monitoring: form.monitoring,
        monitorStart: form.monitoring && form.monitorStart,
        monitorMid: form.monitoring && form.monitorMid,
        monitorEnd: form.monitoring && form.monitorEnd,
        taxCategory: effectiveTaxCategory,
        interState: form.interState,
        placeOfSupply: form.placeOfSupply,
        paymentTerms: form.paymentTerms,
        discountPct: Number(form.discountPct) || 0,
        discountRemarks: form.discountRemarks,
        addOns: addOns.filter((a) => a.label),
        notes: form.notes,
        items: lines.map((l) => ({
          siteId: l.siteId, startDate: l.startDate, endDate: l.endDate,
          monthlyRateOverride: l.monthlyRateOverride || undefined,
          displayNotes: l.displayNotes || undefined,
        })),
      });
      navigate(`/orders?highlight=${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save order');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">{quotationMode ? 'New Quotation' : 'New Booking / Quotation'}</h1>
      <p className="text-sm text-slate-500 mb-5">
        {quotationMode
          ? 'Build a client quotation from vacant sites — nothing is held until you confirm it'
          : 'Add multiple sites for one client — price updates live'}
      </p>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {/* Booking type */}
          <div className="card p-5">
            <div>
              <label className="label">Booking Type</label>
              {/* Side by side needs ~200px each for the descriptions; stack them on phones. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[['REGULAR', 'Regular', 'Available sites only'], ['LOOSE', 'Loose', 'Any site — waitlist/override (1–2 day displays)']].map(([v, l, d]) => (
                  <button type="button" key={v} onClick={() => set('bookingType', v)}
                    className={`rounded-lg border p-3 text-left transition ${form.bookingType === v ? 'border-brand bg-brand/5' : 'border-slate-200'}`}>
                    <div className="font-medium text-sm">{l}</div>
                    <div className="text-xs text-slate-500">{d}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Client — sits directly under the booking type because the client
              decides the category and tax defaults for everything below. */}
          <div className="card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="label mb-0">Client</label>
              <button type="button" className="text-xs text-brand-light font-medium" onClick={() => setNewClient((v) => !v)}>
                {newClient ? '← Select existing' : '+ New client'}
              </button>
            </div>
            {!newClient ? (
              <>
                <select className="input" value={form.clientId} onChange={(e) => set('clientId', e.target.value)}>
                  <option value="">Select client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                </select>
                {selectedClient && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-500">Category:</span>
                    {clientCategory
                      ? <span className="badge bg-teal-100 text-teal-800">{clientCategory.name}</span>
                      : <span className="badge bg-slate-100 text-slate-500">Uncategorised</span>}
                    <span className="text-slate-400">
                      · inherited from the client. Change it on the Clients page.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <input className="input" placeholder="Name *" value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} />
                <input className="input" placeholder="Phone * (unique)" value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} />
                <div className="sm:col-span-2">
                  <select className="input" value={clientForm.categoryId} onChange={(e) => setClientForm({ ...clientForm, categoryId: e.target.value })}>
                    <option value="">Category — uncategorised</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
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

          {/* Dates & description */}
          <div className="card p-5 space-y-4">
            <div className="grid sm:grid-cols-4 gap-4">
              <div>
                <label className="label">Booking Date</label>
                <input type="date" className="input" value={form.bookingDate} onChange={(e) => set('bookingDate', e.target.value)} />
              </div>
              <div>
                <label className="label">Default Start</label>
                <input type="date" className="input" value={form.defaultStart} onChange={(e) => set('defaultStart', e.target.value)} />
              </div>
              <div>
                <label className="label">Duration</label>
                <select className="input" onChange={(e) => {
                  if (e.target.value) set('defaultEnd', presetEnd(form.defaultStart, e.target.value));
                }}>
                  <option value="">Custom...</option>
                  {DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Default End</label>
                <input type="date" className="input" value={form.defaultEnd} onChange={(e) => set('defaultEnd', e.target.value)} />
              </div>
            </div>
            <div>
              <div>
                <label className="label">Description</label>
                <input className="input" placeholder="e.g. Summer campaign — Diwali promo" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Sites */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Sites ({lines.length})</label>
              <AddSitePicker sites={available} onPickMultiple={addSites} />
            </div>
            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">Add one or more sites to this order</div>
            ) : (
              <div className="space-y-2">
                {lines.map((l, i) => {
                  const s = siteById[l.siteId];
                  const days = billedDays(l.startDate, l.endDate);
                  return (
                    <div key={i} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-800">{s?.code} <span className="font-normal text-slate-400">· {s?.type}</span></div>
                          <div className="text-xs text-slate-500 truncate">{s?.location}</div>
                        </div>
                        <button type="button" onClick={() => removeLine(i)} className="text-slate-400 hover:text-red-600 text-lg leading-none">&times;</button>
                      </div>
                      {/* Native date inputs need ~130px; two columns only fit above ~420px wide. */}
                      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                        <div><div className="text-[10px] text-slate-400 mb-0.5">Start</div><input type="date" className="input py-1 text-xs" value={l.startDate} onChange={(e) => { updateLine(i, 'startDate', e.target.value); updateLine(i, 'customDays', undefined); }} /></div>
                        <div>
                          <div className="text-[10px] text-slate-400 mb-0.5">Duration</div>
                          <select className="input py-1 text-xs" onChange={(e) => {
                            if (e.target.value) {
                              updateLine(i, 'endDate', presetEnd(l.startDate, e.target.value));
                              updateLine(i, 'customDays', undefined);
                            }
                          }}>
                            <option value="">Custom...</option>
                            {DURATIONS.map(([v, l2]) => <option key={v} value={v}>{l2}</option>)}
                          </select>
                        </div>
                        <div><div className="text-[10px] text-slate-400 mb-0.5">End</div><input type="date" className="input py-1 text-xs" value={l.endDate} onChange={(e) => { updateLine(i, 'endDate', e.target.value); updateLine(i, 'customDays', undefined); }} /></div>
                        <div><div className="text-[10px] text-slate-400 mb-0.5">Rate/Month</div><input type="number" className="input py-1 text-xs" placeholder={s ? String(s.monthlyRate) : ''} value={l.monthlyRateOverride || ''} onChange={(e) => updateLine(i, 'monthlyRateOverride', e.target.value)} /></div>
                        <div>
                          <div className="text-[10px] text-slate-400 mb-0.5">Days</div>
                          <input type="text" className="input py-1 text-xs" value={l.customDays !== undefined ? l.customDays : (days > 0 ? days : '')} onChange={(e) => {
                            const val = e.target.value;
                            updateLine(i, 'customDays', val);
                            const d = parseInt(val, 10);
                            if (d > 0) {
                              const end = dayjs(l.startDate).add(d - 1, 'day').format('YYYY-MM-DD');
                              setLines((ls) => ls.map((line, idx) => (idx === i ? { ...line, customDays: val, endDate: end } : line)));
                            } else {
                              setLines((ls) => ls.map((line, idx) => (idx === i ? { ...line, customDays: val } : line)));
                            }
                          }} />
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="text-[10px] text-slate-400 mb-0.5">Display notes <span className="text-slate-300">(prints on the billing plan)</span></div>
                        <input className="input py-1 text-xs" placeholder="e.g. Facing the highway exit — client wants it lit"
                          value={l.displayNotes || ''} onChange={(e) => updateLine(i, 'displayNotes', e.target.value)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Printing + mounting */}
          <div className="card p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-700">Printing &amp; Mounting</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Printing Partner</label>
                <select className="input" value={form.printingPartnerId} onChange={(e) => set('printingPartnerId', e.target.value)}>
                  <option value="">None</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ratePerSqft ? ` (₹${p.ratePerSqft}/sqft)` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Mounting Cost (per site)</label>
                <input type="number" className="input" value={form.mountingCost} onChange={(e) => set('mountingCost', e.target.value)} />
              </div>
              <div>
                <label className="label">No. of Prints</label>
                <input type="number" min="0" className="input" value={form.noOfPrints} onChange={(e) => set('noOfPrints', e.target.value)} />
              </div>
              <div>
                <label className="label">Rate per Print</label>
                <input type="number" min="0" className="input" value={form.printRate} onChange={(e) => set('printRate', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Add-ons */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Add-ons (extra)</div>
              <button type="button" className="text-xs text-brand-light font-medium" onClick={() => setAddOns((a) => [...a, { label: '', amount: '' }])}>+ Add-on</button>
            </div>
            {addOns.length === 0 ? <div className="text-xs text-slate-400">No add-ons. e.g. illumination, permits, transport.</div> : (
              <div className="space-y-2">
                {addOns.map((a, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input min-w-0 flex-1" placeholder="Label" value={a.label} onChange={(e) => updateAddOn(i, 'label', e.target.value)} />
                    <input type="number" className="input w-24 shrink-0 sm:w-36" placeholder="Amount" value={a.amount} onChange={(e) => updateAddOn(i, 'amount', e.target.value)} />
                    <button type="button" onClick={() => setAddOns((x) => x.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600 px-1">&times;</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monitoring */}
          <div className="card p-5 space-y-3">
            <div className="text-sm font-semibold text-slate-700">Monitoring</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => set('monitoring', true)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-sm font-medium transition ${form.monitoring ? 'border-brand bg-brand/5 text-brand' : 'border-slate-200 text-slate-600'}`}><Check size={16} /> Monitoring</button>
              <button type="button" onClick={() => set('monitoring', false)}
                className={`flex-1 rounded-lg border p-2.5 text-sm font-medium transition ${!form.monitoring ? 'border-brand bg-brand/5 text-brand' : 'border-slate-200 text-slate-600'}`}>Non-monitoring</button>
            </div>
            {form.monitoring && (
              <div>
                <div className="text-xs text-slate-500 mb-2">Reminders will appear on each selected phase's date.</div>
                <div className="flex flex-wrap gap-4">
                  {[['monitorStart', 'Start'], ['monitorMid', 'Mid'], ['monitorEnd', 'End']].map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} /> {l} date
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Payment terms — advance (paid up front) vs postpaid (billed after run) */}
          <div className="card p-5 space-y-3">
            <div className="text-sm font-semibold text-slate-700">Payment Terms</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                ['ADVANCE', 'Advance', 'Client pays before the display goes up'],
                ['POSTPAID', 'Postpaid', 'Billed after the campaign runs'],
              ].map(([v, l, d]) => (
                <button type="button" key={v} onClick={() => set('paymentTerms', v)}
                  className={`rounded-lg border p-3 text-left transition ${form.paymentTerms === v ? 'border-brand bg-brand/5' : 'border-slate-200'}`}>
                  <div className="font-medium text-sm">{l}</div>
                  <div className="text-xs text-slate-500">{d}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tax — hidden/forced based on company */}
          <div className="card p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-700">Tax &amp; Discount</div>
            {activeCompany?.gstHidden && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                {activeCompany.name}: GST is not applicable. All orders are Non-GST.
              </div>
            )}
            {activeCompany?.gstMandatory && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                {activeCompany.name}: GST (18%) is mandatory on all orders.
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              {!activeCompany?.gstHidden && !activeCompany?.gstMandatory && (
                <div>
                  <label className="label">Tax Category</label>
                  <select className="input" value={form.taxCategory} onChange={(e) => set('taxCategory', e.target.value)}>
                    <option value="NON_GST">Non-GST</option>
                    <option value="GST">GST (18%)</option>
                  </select>
                </div>
              )}
              {(form.taxCategory === 'GST' || activeCompany?.gstMandatory) && !activeCompany?.gstHidden && (
                <div>
                  <label className="label">Supply Type</label>
                  <select className="input" value={form.interState ? 'inter' : 'intra'} onChange={(e) => set('interState', e.target.value === 'inter')}>
                    <option value="intra">Intra-state (CGST + SGST)</option>
                    <option value="inter">Inter-state (IGST)</option>
                  </select>
                </div>
              )}
              <div>
                <label className="label">Discount %</label>
                <input type="number" min="0" max="100" className="input" value={form.discountPct} onChange={(e) => set('discountPct', e.target.value)} />
              </div>
              <div>
                <label className="label">Discount Remarks</label>
                <input className="input" value={form.discountRemarks} onChange={(e) => set('discountRemarks', e.target.value)} />
              </div>
            </div>
          </div>

        </div>

        {/* Price summary + the selected client's history */}
        <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card p-5">
            <div className="text-sm font-semibold text-slate-700 mb-3">Order Summary</div>
            {!quote ? (
              <div className="text-sm text-slate-400 py-6 text-center">Add a site and dates</div>
            ) : (
              <dl className="space-y-2 text-sm">
                <Line k={`Rental (${lines.length} site${lines.length !== 1 ? 's' : ''})`} v={<Money value={quote.rentalSubtotal} />} />
                {quote.printingTotal > 0 && <Line k={`Printing (${form.noOfPrints})`} v={<Money value={quote.printingTotal} />} />}
                {quote.mountingTotal > 0 && <Line k="Mounting" v={<Money value={quote.mountingTotal} />} />}
                {quote.addOnTotal > 0 && <Line k="Add-ons" v={<Money value={quote.addOnTotal} />} />}
                {quote.discountAmount > 0 && <Line k={`Discount (${form.discountPct}%)`} v={<span className="text-red-600">−<Money value={quote.discountAmount} /></span>} />}
                <div className="flex justify-between border-t border-slate-200 pt-2"><dt className="text-slate-600 font-medium">Taxable</dt><dd className="font-semibold"><Money value={quote.taxableAmount} /></dd></div>
                {quote.cgst > 0 && <Line k="CGST 9%" v={<Money value={quote.cgst} />} />}
                {quote.sgst > 0 && <Line k="SGST 9%" v={<Money value={quote.sgst} />} />}
                {quote.igst > 0 && <Line k="IGST 18%" v={<Money value={quote.igst} />} />}
                <div className="flex justify-between border-t border-slate-200 pt-2 mt-2 text-base font-bold text-brand">
                  <span>Grand Total</span><span><Money value={quote.grandTotal} /></span>
                </div>
              </dl>
            )}
            {quotationMode ? (
              <>
                <button className="btn-primary w-full mt-4 flex justify-center items-center gap-1.5" disabled={busy || !quote} onClick={() => submit('QUOTATION')}>
                  {busy ? 'Saving…' : <><Save size={16} /> Save as Quotation</>}
                </button>
                <button className="btn-accent w-full mt-2 flex justify-center items-center gap-1.5" disabled={busy || !quote} onClick={() => submit('CONFIRMED')}>
                  <CheckCircle size={16} /> Confirm Booking instead
                </button>
              </>
            ) : (
              <>
                <button className="btn-primary w-full mt-4 flex justify-center items-center gap-1.5" disabled={busy || !quote} onClick={() => submit('CONFIRMED')}>
                  {busy ? 'Saving…' : <><CheckCircle size={16} /> Confirm Booking</>}
                </button>
                <button className="btn-accent w-full mt-2 flex justify-center items-center gap-1.5" disabled={busy || !quote} onClick={() => submit('QUOTATION')}>
                  <Save size={16} /> Save as Quotation
                </button>
              </>
            )}
            <button type="button" className="btn-ghost w-full mt-2" onClick={() => navigate(-1)}>Cancel</button>
          </div>

          {selectedClient && <ClientHistory client={selectedClient} info={clientInfo} category={clientCategory} />}
        </div>
      </div>
    </div>
  );
}

// Past activity for the client being booked, so the sales user can see standing
// balance and what was booked before without leaving the form.
function ClientHistory({ client, info, category }) {
  const orders = info?.orders || [];
  const recent = orders.slice(0, 5);
  const lifetime = orders.reduce((s, o) => s + (o.grandTotal || 0), 0);
  const balance = info?.balance || 0;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="text-sm font-semibold text-slate-700">Client History</div>
        {category
          ? <span className="badge bg-teal-100 text-teal-800">{category.name}</span>
          : <span className="badge bg-slate-100 text-slate-500">Uncategorised</span>}
      </div>
      <div className="text-xs text-slate-500 mb-3">{client.name}{client.company ? ` · ${client.company}` : ''}</div>

      {!info ? (
        <div className="text-sm text-slate-400 py-4 text-center">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Stat label="Orders" value={orders.length} />
            <Stat label="Lifetime" value={<Money value={lifetime} />} />
            <Stat
              label="Balance"
              value={<Money value={balance} />}
              tone={balance > 0 ? 'text-red-600' : 'text-emerald-600'}
            />
          </div>

          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
              First booking for this client
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recent activity</div>
              {recent.map((o) => (
                <div key={o.id} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">{o.orderNo}</span>
                    <span className="text-xs font-medium text-slate-700"><Money value={o.grandTotal} /></span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 truncate">
                      {o.items?.map((it) => it.site?.code).filter(Boolean).join(', ') || 'No sites'}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {dayjs(o.bookingDate || o.createdAt).format('DD MMM YY')}
                    </span>
                  </div>
                  <div className="mt-1.5"><Badge status={o.status} /></div>
                </div>
              ))}
              {orders.length > recent.length && (
                <div className="text-[11px] text-slate-400">+{orders.length - recent.length} older order{orders.length - recent.length === 1 ? '' : 's'}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-sm font-bold truncate ${tone || 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

function Line({ k, v }) {
  return <div className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v}</dd></div>;
}

const DOT = { AVAILABLE: 'bg-emerald-500', BOOKED: 'bg-red-500', TENTATIVE: 'bg-amber-500', MAINTENANCE: 'bg-slate-400' };

// Compact searchable dropdown for adding sites to the order
function AddSitePicker({ sites, onPickMultiple }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(new Set());
  const ref = useRef(null);

  useEffect(() => {
    if (open) { setPicked(new Set()); setQ(''); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const matches = sites.filter((s) => !needle || `${s.code} ${s.location} ${s.zone}`.toLowerCase().includes(needle));
  const shown = matches.slice(0, 60);

  const toggle = (id) => {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    if (picked.size > 0) onPickMultiple(Array.from(picked));
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="btn-accent text-sm py-1.5 px-3 flex items-center gap-1">
        <Plus size={16} /> Add sites <span className="opacity-70 ml-0.5">▾</span>
      </button>
      {/* 20rem is wider than a phone's content column, so cap the panel to the viewport. */}
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100 shrink-0">
            <input autoFocus className="input py-1.5 text-sm" placeholder="Search code, location or zone…"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">{sites.length === 0 ? 'All sites added' : 'No matching sites'}</div>
            ) : shown.map((s) => (
              <label key={s.id} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="shrink-0" />
                <span className={`h-2 w-2 rounded-full shrink-0 ${DOT[s.status] || 'bg-slate-400'}`} />
                <span className="font-semibold text-sm text-slate-800 shrink-0 w-12">{s.code}</span>
                <span className="text-xs text-slate-500 truncate flex-1">{s.location}</span>
              </label>
            ))}
          </div>
          {matches.length > shown.length && (
            <div className="px-3 py-1.5 text-[11px] text-slate-400 border-t border-slate-100 shrink-0">
              Showing {shown.length} of {matches.length} — keep typing to narrow
            </div>
          )}
          <div className="p-2 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end gap-2">
            <button type="button" className="btn-ghost text-xs py-1" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary text-xs py-1" disabled={picked.size === 0} onClick={confirm}>
              Add {picked.size} site{picked.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
