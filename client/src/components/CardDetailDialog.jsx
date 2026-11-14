import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import api from '../api';
import DetailDialog, { DETAIL_GRID } from './DetailDialog';
import { Badge, Money, Spinner } from './ui';
import { Section, Breakdown, Bridge, DataTable, Figure, Note, DrillContext, orderLink, fmtDate } from './detailKit';
import { REPORT_CARDS } from './reportCardBodies';
import { SITE_CARDS } from './siteCardBodies';
import { BA_CARDS } from './bookingAnalysisCardBodies';

// Stat-card drill-downs: one dialog per tile, fed by a detail endpoint with the
// same filters as the tile, so the headline here always equals the figure on
// the card. Dashboard cards are below; Reports, Site-wise and Booking Analysis
// cards are registered from their own body files.

// ── Booked value ──────────────────────────────────────────────────────────────
function BookedBody({ d }) {
  const b = d.bridge;
  // Each line opens its own card (same filters) or focuses the campaign table.
  const steps = [
    { label: 'Site rent', value: b.rent, card: 'rental', col: 'rent' },
    { label: 'Printing', value: b.printing, op: '+', card: 'printing', col: 'printing' },
    { label: 'Mounting', value: b.mounting, op: '+', card: 'mounting', col: 'mounting' },
    { label: 'Extras (add-ons)', value: b.extras, op: '+', col: 'extras' },
    { label: 'Discount', value: b.discount, op: '−', card: 'discounts', col: 'discount' },
    b.adjustment ? { label: 'Other adjustments', value: b.adjustment, op: '±', col: 'adjustment' } : null,
    { label: 'Taxable (ex-GST)', value: b.taxable, op: '=', total: true, card: 'bookedExGst', col: 'taxable' },
    { label: 'GST', value: b.gst, op: '+', card: 'gst', col: 'gst' },
    { label: 'Booked value', value: b.total, op: '=', total: true, final: true, accent: 'text-emerald-700' },
  ];
  return (
    <div className={DETAIL_GRID}>
      <Section title="How the number is built" note={`${d.count} campaigns booked in the period, quotations and cancelled excluded.`}>
        <Bridge steps={steps} />
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The Site-wise report shows site rent only (ex-GST): <b><Money value={b.rent} /></b>. Reports that use taxable value show <b><Money value={b.taxable} /></b>.
        </div>
      </Section>
      <div className="space-y-4">
        <Section title="By business"><Breakdown rows={d.byCompany} countLabel="campaigns" /></Section>
        <Section title="By category"><Breakdown rows={d.byCategory} countLabel="campaigns" /></Section>
      </div>
      <div className="space-y-4">
        <Section title="By media type" note="Site rent only (ex-GST) — printing, extras and GST are per campaign, not per site.">
          <Breakdown rows={d.byMedia} countLabel="sites" />
        </Section>
        <Section title="By month (booking date)"><Breakdown rows={d.byMonth} month countLabel="campaigns" /></Section>
      </div>
      <Section title="Top clients"><Breakdown rows={d.topClients} countLabel="campaigns" /></Section>
      <Section title="Campaigns" className="md:col-span-2 xl:col-span-2">
        <DataTable rows={d.rows} total={d.count} defaultSort={{ key: 'total', dir: 'desc' }} columns={[
          { key: 'orderNo', label: 'Order', render: (r) => orderLink(r.id, r.orderNo) },
          { key: 'client', label: 'Client' },
          { key: 'bookingDate', label: 'Booked', date: true },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          { key: 'rent', label: 'Rent', money: true },
          { key: 'printing', label: 'Printing', money: true },
          { key: 'mounting', label: 'Mounting', money: true },
          { key: 'extras', label: 'Extras', money: true },
          { key: 'discount', label: 'Discount', money: true },
          ...(b.adjustment ? [{ key: 'adjustment', label: 'Adj.', money: true }] : []),
          { key: 'taxable', label: 'Taxable', money: true },
          { key: 'gst', label: 'GST', money: true },
          { key: 'total', label: 'Total', money: true },
        ]} />
      </Section>
    </div>
  );
}

// ── Collected ─────────────────────────────────────────────────────────────────
function CollectedBody({ d }) {
  return (
    <div className={DETAIL_GRID}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:col-span-2 xl:col-span-3">
        <Figure label="Credited to campaigns" value={<Money value={d.totals.amount} />} accent="text-emerald-600" sub={`${d.count} payments`} />
        <Figure label="TDS deducted" value={<Money value={d.totals.tds} />} accent="text-amber-600" sub="remitted by client" />
        <Figure label="Net received" value={<Money value={d.totals.net} />} sub="landed in bank" />
      </div>
      <Section title="How the number is built" note="Payments received in the period (by receipt date). The campaign is credited the gross; TDS is the slice the client remitted to the government.">
        <Bridge steps={[
          { label: 'Net received in bank', value: d.totals.net, col: 'net' },
          { label: 'TDS deducted by clients', value: d.totals.tds, op: '+', card: 'tds', col: 'tds' },
          { label: 'Collected (credited to campaigns)', value: d.totals.amount, op: '=', total: true, final: true, accent: 'text-emerald-700', col: 'amount' },
        ]} />
        {Math.round(d.totals.amount - d.totals.tds - d.totals.net) !== 0 && <Note>Net + TDS differs from the gross by <Money value={Math.round(d.totals.amount - d.totals.tds - d.totals.net)} /> (net entered by hand on some payments).</Note>}
      </Section>
      <Section title="By mode"><Breakdown rows={d.byMode} countLabel="payments" /></Section>
      <Section title="By month (receipt date)"><Breakdown rows={d.byMonth} month countLabel="payments" /></Section>
      <Section title="By business"><Breakdown rows={d.byCompany} countLabel="payments" /></Section>
      <Section title="Payments" className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.rows} total={d.count} defaultSort={{ key: 'receivedAt', dir: 'desc' }} columns={[
          { key: 'receivedAt', label: 'Date', date: true },
          { key: 'orderNo', label: 'Campaign', render: (r) => orderLink(r.orderId, r.orderNo) },
          { key: 'client', label: 'Client' },
          { key: 'mode', label: 'Mode' },
          { key: 'amount', label: 'Amount', money: true },
          { key: 'tds', label: 'TDS', money: true },
          { key: 'net', label: 'Net', money: true },
          { key: 'reference', label: 'Reference' },
        ]} />
      </Section>
    </div>
  );
}

// ── Outstanding ───────────────────────────────────────────────────────────────
function OutstandingBody({ d }) {
  return (
    <div className={DETAIL_GRID}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-2 xl:col-span-3">
        <Figure label="Due on campaigns (booked − collected)" value={<Money value={d.headline} />} accent="text-red-600"
          sub="What the dashboard card shows — the whole contract value not yet paid." />
        <Figure label="of which invoiced but unpaid (invoiced − paid)" value={<Money value={d.invoicedUnpaid} />} accent="text-amber-600"
          sub={`The Campaigns “Outstanding” column. Only ${d.invoicedCount} of ${d.count} campaigns have been invoiced, so most of the due amount is not billed yet.`} />
      </div>
      <Section title="How the number is built">
        <Bridge steps={[
          { label: 'Booked value (period)', value: d.booked, card: 'booked' },
          { label: 'Collected (receipt date in period)', value: d.collected, op: '−', card: 'collected' },
          { label: 'Due on campaigns', value: d.headline, op: '=', total: true, final: true, accent: 'text-red-600' },
        ]} />
        <div className="mt-3 space-y-1 text-xs text-slate-500">
          <div>Sum of per-campaign balances below: <b className="text-slate-700"><Money value={d.campaignBalance} /></b>{d.overpaidTotal > 0 && <> (less <Money value={d.overpaidTotal} /> overpaid)</>}.</div>
          <div>Invoiced to date on these campaigns: <b className="text-slate-700"><Money value={d.invoiced} /></b>.</div>
          <div>Receivables report (all invoiced campaigns, any date): <b className="text-slate-700"><Money value={d.receivablesTotal} /></b>.</div>
        </div>
      </Section>
      <Section title="Overpaid campaigns" note="Paid more than the campaign total — check for a wrong allocation or a missing charge." className="xl:col-span-2">
        <DataTable rows={d.overpaid} empty="No overpaid campaigns." defaultSort={{ key: 'balance', dir: 'asc' }} columns={[
          { key: 'orderNo', label: 'Order', render: (r) => orderLink(r.id, r.orderNo) },
          { key: 'client', label: 'Client' },
          { key: 'total', label: 'Total', money: true },
          { key: 'paid', label: 'Paid', money: true },
          { key: 'balance', label: 'Excess', money: true, render: (r) => <span className="text-amber-700"><Money value={-r.balance} /></span> },
        ]} />
      </Section>
      <Section title={`Campaigns with a balance (${d.owingCount})`} className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.rows} total={d.owingCount} defaultSort={{ key: 'balance', dir: 'desc' }} columns={[
          { key: 'orderNo', label: 'Order', render: (r) => orderLink(r.id, r.orderNo) },
          { key: 'client', label: 'Client' },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          { key: 'total', label: 'Total', money: true },
          { key: 'paid', label: 'Paid', money: true },
          { key: 'balance', label: 'Balance', money: true },
          { key: 'invoiced', label: 'Invoiced', money: true },
          { key: 'invoiceDue', label: 'Invoice due', money: true },
          { key: 'lastPayment', label: 'Last paid', date: true },
          { key: 'ageDays', label: 'Age (days)', num: true },
        ]} />
      </Section>
    </div>
  );
}

// ── Occupancy ─────────────────────────────────────────────────────────────────
function OccupancyBody({ d }) {
  const share = (rows) => (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-1">Name</th><th className="py-1 text-right">Booked</th><th className="py-1 text-right">Sites</th><th className="py-1 text-right">%</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => (
          <tr key={r.label}><td className="py-1 text-slate-700">{r.label}</td><td className="py-1 text-right">{r.booked}</td><td className="py-1 text-right">{r.total}</td><td className="py-1 text-right font-medium">{r.pct}%</td></tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div className={DETAIL_GRID}>
      <Section title="Sites right now" note="Occupancy is as of today, across all active sites (not limited by the period or business).">
        <div className="flex flex-wrap gap-2">
          {Object.entries(d.byStatus).map(([s, n]) => <Badge key={s} status={s}>{s} · {n}</Badge>)}
        </div>
        <div className="mt-3 text-sm text-slate-600">{d.byStatus.BOOKED || 0} booked of {d.siteCount} active sites.</div>
      </Section>
      <Section title="By zone">{share(d.byZone)}</Section>
      <Section title="By media type">{share(d.byType)}</Section>
      <Section title={`Booked sites (${d.bookedCount})`} note="The campaign on each site today, soonest to come down first." className="md:col-span-2 xl:col-span-2">
        <DataTable rows={d.booked} total={d.bookedCount} defaultSort={{ key: 'endDate', dir: 'asc' }} columns={[
          { key: 'code', label: 'Site', render: (r) => <Link to={`/inventory/${r.id}`} className="font-medium text-brand hover:underline">{r.code}</Link> },
          { key: 'location', label: 'Location' },
          { key: 'zone', label: 'Zone' },
          { key: 'type', label: 'Type' },
          { key: 'client', label: 'Client' },
          { key: 'orderNo', label: 'Campaign', render: (r) => orderLink(r.orderId, r.orderNo) },
          { key: 'endDate', label: 'Ends', date: true, render: (r) => <>{fmtDate(r.endDate)}{r.endDate && !r.running && <span className="ml-1 text-[11px] text-amber-600">(not running)</span>}</> },
        ]} />
      </Section>
      <Section title={`Free now (${d.freeCount})`}>
        <DataTable rows={d.free} total={d.freeCount} defaultSort={{ key: 'code', dir: 'asc' }} columns={[
          { key: 'code', label: 'Site', render: (r) => <Link to={`/inventory/${r.id}`} className="font-medium text-brand hover:underline">{r.code}</Link> },
          { key: 'location', label: 'Location' },
          { key: 'type', label: 'Type' },
          { key: 'monthlyRate', label: 'Rate / mo', money: true },
        ]} />
      </Section>
    </div>
  );
}

// ── Quotations & Orders ───────────────────────────────────────────────────────
const orderColumns = (withStatus) => [
  { key: 'orderNo', label: 'No.', render: (r) => orderLink(r.id, r.orderNo) },
  { key: 'client', label: 'Client' },
  { key: 'bookingDate', label: 'Date', date: true },
  ...(withStatus ? [{ key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> }] : []),
  { key: 'company', label: 'Business' },
  { key: 'sites', label: 'Sites', num: true },
  { key: 'value', label: 'Value', money: true },
];

function QuotationsBody({ d }) {
  return (
    <div className={DETAIL_GRID}>
      <Figure label="Open quotations" value={d.count} sub={<>worth <Money value={d.value} /></>} />
      <Section title="By business"><Breakdown rows={d.byCompany} countLabel="quotes" /></Section>
      <Section title="By month (quote date)"><Breakdown rows={d.byMonth} month countLabel="quotes" /></Section>
      <Section title="Open quotations" className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.rows} total={d.count} empty="No open quotations in this period." defaultSort={{ key: 'bookingDate', dir: 'desc' }} columns={orderColumns(false)} />
      </Section>
    </div>
  );
}

function OrdersBody({ d }) {
  return (
    <div className={DETAIL_GRID}>
      <Section title="By status" note="Count of orders; value incl. GST.">
        <Breakdown rows={d.byStatus} countLabel="orders" />
      </Section>
      <Section title="By business"><Breakdown rows={d.byCompany} countLabel="orders" /></Section>
      <Section title="By month (booking date)"><Breakdown rows={d.byMonth} month countLabel="orders" /></Section>
      <Section title="Orders" className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.rows} total={d.count} defaultSort={{ key: 'bookingDate', dir: 'desc' }} columns={orderColumns(true)} />
      </Section>
    </div>
  );
}

const CARDS = {
  ...REPORT_CARDS,
  ...SITE_CARDS,
  ...BA_CARDS,
  booked: {
    title: 'Booked Value', to: '/orders', Body: BookedBody, fmt: (v) => <Money value={v} />,
    explain: 'Campaigns booked in the period (by booking date), incl. GST — rent, printing, mounting and extras, less discount. Quotations and cancelled excluded.',
  },
  collected: {
    title: 'Collected', to: '/payments', Body: CollectedBody, fmt: (v) => <Money value={v} />,
    explain: 'Payments received in the period (by receipt date), gross — TDS the client deducted counts as paid.',
  },
  outstanding: {
    title: 'Outstanding', to: '/orders?pay=OUTSTANDING', Body: OutstandingBody, fmt: (v) => <Money value={v} />,
    explain: 'Booked value in the period less payments received in the period — the whole contract, billed or not.',
  },
  occupancy: {
    title: 'Occupancy', to: '/', Body: OccupancyBody, fmt: (v) => `${v}%`, asOfNow: true,
    explain: 'Share of active sites marked Booked right now. Loose (per-day) bookings leave a site Available.',
  },
  quotations: {
    title: 'Quotation Pipeline', to: '/quotations', Body: QuotationsBody, fmt: (v) => <Money value={v} />,
    explain: 'Quotations dated in the period not yet confirmed or cancelled, incl. GST. Pipeline, not revenue.',
  },
  orders: {
    title: 'Orders', to: '/orders', Body: OrdersBody, fmt: (v) => v,
    explain: 'All non-cancelled orders booked in the period, including open quotations.',
  },
};

export default function CardDetailDialog({ card, onClose, params }) {
  // A stack of card kinds: the tile's card at the bottom, drilled cards above it.
  const [stack, setStack] = useState([]);
  const [cache, setCache] = useState({}); // kind → data, so Back is instant
  const [errors, setErrors] = useState({});
  const [focus, setFocus] = useState(null);
  const paramKey = JSON.stringify(params || {});
  const chain = useMemo(() => (card ? [{ kind: card }, ...stack] : []), [card, stack]);
  const top = chain[chain.length - 1];
  const kind = top?.kind;
  const cfg = CARDS[kind];
  const topParams = useMemo(() => ({ ...params, ...(top?.params || {}) }), [paramKey, top]); // eslint-disable-line react-hooks/exhaustive-deps
  const cacheKey = `${paramKey}|${kind}|${JSON.stringify(top?.params || {})}`;

  // A new tile (or new filters) starts a fresh stack.
  useEffect(() => { setStack([]); setFocus(null); }, [card, paramKey]);
  // Closing drops the cache, so reopening a tile always shows fresh figures.
  useEffect(() => { if (!card) { setCache({}); setErrors({}); } }, [card]);

  useEffect(() => {
    if (!kind || !cfg || cache[cacheKey]) return undefined;
    let alive = true;
    api.get(cfg.endpoint || '/reports/card-detail', { params: { ...topParams, card: kind } })
      .then((r) => { if (alive) setCache((c) => ({ ...c, [cacheKey]: r.data })); })
      .catch((e) => { if (alive) setErrors((x) => ({ ...x, [cacheKey]: e.response?.data?.error || 'Could not load the details.' })); });
    return () => { alive = false; };
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each card in the stack starts at the top with no focus.
  useEffect(() => {
    setFocus(null);
    document.querySelector('[role=dialog] .overflow-y-auto')?.scrollTo?.(0, 0);
  }, [chain.length]);
  // Bring the first table narrowed by a focused line into view.
  useEffect(() => {
    if (!focus) return;
    requestAnimationFrame(() => document.querySelector('[role=dialog] [data-focus-match]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [focus]);

  const openCard = useCallback((k, p) => setStack((st) => [...st, { kind: k, params: p }]), []);
  const back = useCallback(() => setStack((st) => st.slice(0, -1)), []);
  const drill = useMemo(() => ({
    current: kind,
    canOpen: (k) => !!CARDS[k] && !chain.some((c) => c.kind === k),
    openCard, cardTitle: (k) => CARDS[k]?.title || k,
    focus, setFocus,
  }), [kind, chain, openCard, focus]);

  if (!CARDS[card] || !cfg) return null;
  const data = cache[cacheKey];
  const error = errors[cacheKey];
  const { Body } = cfg;
  const prev = chain.length > 1 ? CARDS[chain[chain.length - 2].kind] : null;
  const period = cfg.asOfNow ? 'as of today' : cfg.allTime || (!topParams.from && !topParams.to) ? 'all time' : `${fmtDate(topParams.from)} – ${fmtDate(topParams.to)}`;
  return (
    <DrillContext.Provider value={drill}>
      <DetailDialog
        open={!!card} onClose={onClose} title={cfg.title}
        onBack={prev ? back : null} backLabel={prev?.title}
        headline={data && data.card === kind ? cfg.fmt(data.headline) : null}
        explain={<>{cfg.explain} <span className="whitespace-nowrap text-slate-400">({period}{cfg.filterNote ? cfg.filterNote(topParams) : ''})</span></>}
        footer={cfg.to ? <Link to={typeof cfg.to === 'function' ? cfg.to(data) : cfg.to} className="btn-ghost text-sm">{cfg.toLabel || 'View all'} <ExternalLink size={14} /></Link> : null}
      >
        {error ? <div className="py-10 text-center text-sm text-red-600">{error}</div>
          : !data || data.card !== kind ? <Spinner /> : <Body key={cacheKey} d={data} card={kind} params={topParams} />}
      </DetailDialog>
    </DrillContext.Provider>
  );
}
