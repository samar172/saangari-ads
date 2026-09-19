import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Save } from 'lucide-react';
import api from '../api';
import { useAuth, can } from '../auth';
import { Money, Spinner } from '../components/ui';
import { AddSitePicker, DURATIONS, presetEnd, billedDays, siteFreeForRange } from './NewBooking';

// Full campaign editor — SUPER_ADMIN only. Loads an existing order, lets the
// admin rewrite dates, sites, printing, discount and add-ons, then PUTs the whole
// thing back to /orders/:id. Line items carry their booking `id` so kept lines
// (and their monitoring photos) survive the edit; sites removed here are dropped.
export default function EditCampaign() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [order, setOrder] = useState(null);
  const [sites, setSites] = useState([]);
  const [partners, setPartners] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState(null);

  const [form, setForm] = useState(null);
  const [lines, setLines] = useState([]);
  const [addOns, setAddOns] = useState([]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get('/sites').then((r) => setSites(r.data));
    api.get('/printing-partners').then((r) => setPartners(r.data.filter((p) => p.active)));
    api.get(`/orders/${id}`).then((r) => {
      const o = r.data;
      setOrder(o);
      setForm({
        bookingType: o.items[0]?.type || o.type || 'REGULAR',
        clientId: o.clientId,
        categoryId: o.categoryId ? String(o.categoryId) : '',
        companyId: o.companyId,
        bookingDate: dayjs(o.bookingDate).format('YYYY-MM-DD'),
        description: o.description || '',
        printingPartnerId: o.printingPartnerId ? String(o.printingPartnerId) : '',
        printMaterial: o.printMaterial || '',
        noOfPrints: o.noOfPrints || 0,
        printRate: o.printRate || 0,
        printCost: o.printCost || 0,
        // The server stores mounting as a single total (per-print × count). We edit
        // it here as that total directly — no re-multiplication on save.
        mountingCost: o.mountingCost || 0,
        monitoring: o.monitoring, monitorStart: o.monitorStart, monitorMid: o.monitorMid, monitorEnd: o.monitorEnd,
        taxCategory: o.taxCategory, interState: o.interState, placeOfSupply: o.placeOfSupply || 'Rajasthan',
        paymentTerms: o.paymentTerms,
        discountPct: o.discountPct || 0, discountRemarks: o.discountRemarks || '',
        notes: o.notes || '',
      });
      setLines(o.items.map((b) => {
        // Bookings store a rounded dayRate + subtotal, not the monthly rate. To
        // reprice an unchanged line to the exact same amount (and to preserve any
        // custom rate rather than snapping back to the site default), seed the
        // override from the stored line: monthly = round(subtotal × 30 / days).
        const loose = b.type === 'LOOSE';
        return {
          id: b.id,
          siteId: b.siteId,
          startDate: dayjs(b.startDate).format('YYYY-MM-DD'),
          endDate: dayjs(b.endDate).format('YYYY-MM-DD'),
          dayRateOverride: loose ? String(b.dayRate || '') : '',
          monthlyRateOverride: loose ? '' : (b.days > 0 ? String(Math.round((b.subtotal * 30) / b.days)) : ''),
          displayNotes: b.displayNotes || '',
        };
      }));
      setAddOns((o.addOns || []).map((a) => ({ label: a.label, amount: a.amount })));
    }).catch(() => navigate('/orders'));
  }, [id, navigate]);

  const siteById = useMemo(() => Object.fromEntries(sites.map((s) => [s.id, s])), [sites]);

  // Dates to seed newly-added lines with: reuse the first existing line, else today+30.
  const addStart = lines[0]?.startDate || dayjs().format('YYYY-MM-DD');
  const addEnd = lines[0]?.endDate || dayjs().add(29, 'day').format('YYYY-MM-DD');

  // Sites offerable for a new line: not already on the order, and free for the seed
  // range — ignoring this order's own bookings (they belong to us). Loose overrides.
  const available = useMemo(() => {
    if (!form) return [];
    return sites.filter((s) =>
      !lines.some((l) => l.siteId === s.id)
      && (form.bookingType === 'LOOSE'
        || (!['HOLD', 'MAINTENANCE'].includes(s.status)
          && siteFreeForRange({ ...s, bookings: (s.bookings || []).filter((b) => b.order?.id !== Number(id)) }, addStart, addEnd))));
  }, [sites, lines, form, addStart, addEnd, id]);

  function addSites(ids) {
    if (!ids || ids.length === 0) return;
    setLines((ls) => [
      ...ls,
      ...ids.map((sid) => ({ id: undefined, siteId: Number(sid), startDate: addStart, endDate: addEnd, dayRateOverride: '', monthlyRateOverride: '', displayNotes: '' })),
    ]);
  }
  const updateLine = (i, k, v) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const removeLine = (i) => setLines((ls) => ls.filter((_, idx) => idx !== i));
  const updateAddOn = (i, k, v) => setAddOns((a) => a.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));

  // Live re-quote as the admin edits (mirrors New Booking; mounting is sent as a total).
  useEffect(() => {
    if (!form) return;
    const items = lines.filter((l) => l.siteId && l.startDate && l.endDate)
      .map((l) => ({ siteId: l.siteId, startDate: l.startDate, endDate: l.endDate, monthlyRateOverride: l.monthlyRateOverride || undefined, dayRateOverride: l.dayRateOverride || undefined }));
    if (items.length === 0) { setQuote(null); return; }
    const t = setTimeout(() => {
      api.post('/orders/quote', {
        items, type: form.bookingType,
        addOns: addOns.filter((a) => a.label),
        noOfPrints: Number(form.noOfPrints) || 0,
        printRate: Number(form.printRate) || 0,
        mountingCost: Number(form.mountingCost) || 0,
        discountPct: Number(form.discountPct) || 0,
        taxCategory: form.taxCategory, interState: form.interState,
      }).then((r) => setQuote(r.data)).catch(() => setQuote(null));
    }, 250);
    return () => clearTimeout(t);
  }, [lines, addOns, form]);

  async function save() {
    setError(''); setBusy(true);
    try {
      if (lines.length === 0) throw { response: { data: { error: 'Add at least one site' } } };
      const { data } = await api.put(`/orders/${id}`, {
        clientId: Number(form.clientId),
        companyId: Number(form.companyId),
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        type: form.bookingType,
        bookingDate: form.bookingDate,
        description: form.description,
        printingPartnerId: form.printingPartnerId ? Number(form.printingPartnerId) : undefined,
        printMaterial: form.printMaterial || undefined,
        noOfPrints: Number(form.noOfPrints) || 0,
        printRate: Number(form.printRate) || 0,
        printCost: Number(form.printCost) || 0,
        mountingCost: Number(form.mountingCost) || 0,
        monitoring: form.monitoring,
        monitorStart: form.monitoring && form.monitorStart,
        monitorMid: form.monitoring && form.monitorMid,
        monitorEnd: form.monitoring && form.monitorEnd,
        taxCategory: form.taxCategory,
        interState: form.interState,
        placeOfSupply: form.placeOfSupply,
        paymentTerms: form.paymentTerms,
        discountPct: Number(form.discountPct) || 0,
        discountRemarks: form.discountRemarks,
        addOns: addOns.filter((a) => a.label),
        notes: form.notes,
        items: lines.map((l) => ({
          id: l.id || undefined,
          siteId: l.siteId, startDate: l.startDate, endDate: l.endDate,
          monthlyRateOverride: l.monthlyRateOverride || undefined,
          dayRateOverride: l.dayRateOverride || undefined,
          displayNotes: l.displayNotes || undefined,
        })),
      });
      navigate(`/orders/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save campaign');
    } finally {
      setBusy(false);
    }
  }

  if (!can(user, 'editCampaign')) {
    return <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">Only a super admin can edit a campaign.</div>;
  }
  if (!order || !form) return <Spinner />;

  const isLoose = form.bookingType === 'LOOSE';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <button className="btn-ghost" onClick={() => navigate(`/orders/${id}`)}>← Back</button>
        <h1 className="text-2xl font-bold text-slate-800">Edit {order.orderNo}</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">Super-admin edit — {order.client.company ? `${order.client.company} · ${order.client.name}` : order.client.name}. Changing amounts reprices the whole campaign.</p>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {/* Dates & description */}
          <div className="card p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Booking Date</label>
                <input type="date" className="input" value={form.bookingDate} onChange={(e) => set('bookingDate', e.target.value)} />
              </div>
              <div>
                <label className="label">Booking Type</label>
                <select className="input" value={form.bookingType} onChange={(e) => set('bookingType', e.target.value)}>
                  <option value="REGULAR">Regular</option>
                  <option value="LOOSE">Loose (per-day)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </div>

          {/* Sites */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Sites ({lines.length})</label>
              <AddSitePicker sites={available} onPickMultiple={addSites} />
            </div>
            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">Add one or more sites to this campaign</div>
            ) : (
              <div className="space-y-2">
                {lines.map((l, i) => {
                  const s = siteById[l.siteId];
                  const days = billedDays(l.startDate, l.endDate);
                  return (
                    <div key={l.id ?? `new-${i}`} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-800">{s?.code} <span className="font-normal text-slate-400">· {s?.type}</span>{!l.id && <span className="badge bg-emerald-100 text-emerald-700 ml-1.5 text-[10px]">New</span>}</div>
                          <div className="text-xs text-slate-500 break-words">{s?.location}</div>
                        </div>
                        <button type="button" onClick={() => removeLine(i)} className="text-slate-400 hover:text-red-600 text-lg leading-none">&times;</button>
                      </div>
                      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                        <div><div className="text-[10px] text-slate-400 mb-0.5">Start</div><input type="date" className="input py-1 text-xs" value={l.startDate} onChange={(e) => updateLine(i, 'startDate', e.target.value)} /></div>
                        <div>
                          <div className="text-[10px] text-slate-400 mb-0.5">Duration</div>
                          <select className="input py-1 text-xs" onChange={(e) => { if (e.target.value) updateLine(i, 'endDate', presetEnd(l.startDate, e.target.value)); }}>
                            <option value="">Custom...</option>
                            {DURATIONS.map(([v, l2]) => <option key={v} value={v}>{l2}</option>)}
                          </select>
                        </div>
                        <div><div className="text-[10px] text-slate-400 mb-0.5">End</div><input type="date" className="input py-1 text-xs" value={l.endDate} onChange={(e) => updateLine(i, 'endDate', e.target.value)} /></div>
                        {isLoose ? (
                          <div><div className="text-[10px] text-slate-400 mb-0.5">Rate/Day</div><input type="number" className="input py-1 text-xs" placeholder={s ? String(s.dayRate > 0 ? s.dayRate : Math.round(s.monthlyRate / 30)) : ''} value={l.dayRateOverride || ''} onChange={(e) => updateLine(i, 'dayRateOverride', e.target.value)} /></div>
                        ) : (
                          <div><div className="text-[10px] text-slate-400 mb-0.5">Rate/Month</div><input type="number" className="input py-1 text-xs" placeholder={s ? String(s.monthlyRate) : ''} value={l.monthlyRateOverride || ''} onChange={(e) => updateLine(i, 'monthlyRateOverride', e.target.value)} /></div>
                        )}
                        <div><div className="text-[10px] text-slate-400 mb-0.5">Days</div><input type="text" className="input py-1 text-xs bg-slate-50" value={days > 0 ? days : ''} readOnly /></div>
                      </div>
                      <div className="mt-2">
                        <div className="text-[10px] text-slate-400 mb-0.5">Display notes <span className="text-slate-300">(prints on the billing plan)</span></div>
                        <input className="input py-1 text-xs" value={l.displayNotes || ''} onChange={(e) => updateLine(i, 'displayNotes', e.target.value)} />
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
                <select className="input" value={form.printingPartnerId}
                  onChange={(e) => setForm((f) => ({ ...f, printingPartnerId: e.target.value, printMaterial: '' }))}>
                  <option value="">None</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ratePerSqft ? ` (₹${p.ratePerSqft}/sqft)` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Material</label>
                {(() => {
                  const partner = partners.find((p) => String(p.id) === String(form.printingPartnerId));
                  const materials = (partner?.materials || []).filter((m) => m.active);
                  return (
                    <select className="input" value={form.printMaterial}
                      disabled={!form.printingPartnerId || materials.length === 0}
                      onChange={(e) => {
                        const m = materials.find((x) => x.name === e.target.value);
                        setForm((f) => ({ ...f, printMaterial: e.target.value, printRate: m ? m.rate : f.printRate }));
                      }}>
                      <option value="">{form.printingPartnerId ? (materials.length ? 'Select material…' : 'No materials set') : 'Pick a partner first'}</option>
                      {materials.map((m) => <option key={m.id} value={m.name}>{m.name} (₹{m.rate})</option>)}
                    </select>
                  );
                })()}
              </div>
              <div>
                <label className="label">No. of Prints</label>
                <input type="number" min="0" className="input" value={form.noOfPrints} onChange={(e) => set('noOfPrints', e.target.value)} />
              </div>
              <div>
                <label className="label">Rate per Print</label>
                <input type="number" min="0" className="input" value={form.printRate} onChange={(e) => set('printRate', e.target.value)} />
              </div>
              <div>
                <label className="label">Mounting Cost (total)</label>
                <input type="number" className="input" value={form.mountingCost} onChange={(e) => set('mountingCost', e.target.value)} />
              </div>
              <div>
                <label className="label">Partner cost (total you pay)</label>
                <input type="number" min="0" className="input" value={form.printCost} onChange={(e) => set('printCost', e.target.value)} placeholder="What you pay the printer" />
              </div>
            </div>
            {(() => {
              const charge = (Number(form.noOfPrints) || 0) * (Number(form.printRate) || 0);
              const cost = Number(form.printCost) || 0;
              if (charge <= 0 && cost <= 0) return null;
              const margin = charge - cost;
              return (
                <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1">
                  <span className="text-slate-500">Printing charged: <b className="text-slate-700">₹{charge.toLocaleString('en-IN')}</b></span>
                  <span className="text-slate-500">Partner cost: <b className="text-slate-700">₹{cost.toLocaleString('en-IN')}</b></span>
                  <span className={margin >= 0 ? 'text-emerald-600' : 'text-red-600'}>Margin: <b>₹{margin.toLocaleString('en-IN')}</b></span>
                </div>
              );
            })()}
          </div>

          {/* Add-ons */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Add-ons (extra)</div>
              <button type="button" className="text-xs text-brand-light font-medium" onClick={() => setAddOns((a) => [...a, { label: '', amount: '' }])}>+ Add-on</button>
            </div>
            {addOns.length === 0 ? <div className="text-xs text-slate-400">No add-ons.</div> : (
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
                className={`flex-1 rounded-lg border p-2.5 text-sm font-medium transition ${form.monitoring ? 'border-brand bg-brand/5 text-brand' : 'border-slate-200 text-slate-600'}`}>Monitoring</button>
              <button type="button" onClick={() => set('monitoring', false)}
                className={`flex-1 rounded-lg border p-2.5 text-sm font-medium transition ${!form.monitoring ? 'border-brand bg-brand/5 text-brand' : 'border-slate-200 text-slate-600'}`}>Non-monitoring</button>
            </div>
            {form.monitoring && (
              <div className="flex flex-wrap gap-4">
                {[['monitorStart', 'Start'], ['monitorMid', 'Mid'], ['monitorEnd', 'End']].map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} /> {l} date
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Payment terms — its own card (mirrors New Booking) so it's easy to
              find on the edit screen, not buried inside Tax & Discount. */}
          <div className="card p-5 space-y-3">
            <div className="text-sm font-semibold text-slate-700">Payment Terms</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                ['ADVANCE', 'Advance', 'Client pays before the display goes up'],
                ['POSTPAID', 'Postpaid', 'Billed after the campaign runs'],
              ].map(([v, l, d]) => (
                <button type="button" key={v} onClick={() => set('paymentTerms', v)}
                  className={`text-left rounded-lg border p-3 transition ${form.paymentTerms === v ? 'border-brand bg-brand/5' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className={`text-sm font-semibold ${form.paymentTerms === v ? 'text-brand' : 'text-slate-700'}`}>{l}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{d}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tax & discount */}
          <div className="card p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-700">Tax &amp; Discount</div>
            <div className="grid sm:grid-cols-2 gap-4">
              {form.taxCategory === 'GST' && (
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
            <p className="text-xs text-slate-400">Tax category ({form.taxCategory === 'GST' ? 'GST' : 'Non-GST'}) follows the company and isn't changed here — use “Settle in cash” on the campaign for that.</p>
          </div>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card p-5">
            <div className="text-sm font-semibold text-slate-700 mb-3">Updated Total</div>
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
            <div className="mt-3 text-[11px] text-slate-400">
              Was <Money value={order.grandTotal} />. {order.amountPaid > 0 && <>Paid <Money value={order.amountPaid} /> stays recorded.</>}
            </div>
            <button className="btn-primary w-full mt-4 flex justify-center items-center gap-1.5" disabled={busy || !quote} onClick={save}>
              {busy ? 'Saving…' : <><Save size={16} /> Save changes</>}
            </button>
            <button type="button" className="btn-ghost w-full mt-2" onClick={() => navigate(`/orders/${id}`)}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ k, v }) {
  return <div className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v}</dd></div>;
}
