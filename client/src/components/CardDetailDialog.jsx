import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import api from '../api';
import DetailDialog, { DETAIL_GRID } from './DetailDialog';
import { Badge, Money, Spinner } from './ui';
import { Section, Breakdown, DataTable, Figure, orderLink, fmtDate } from './detailKit';
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
  const steps = [
    ['Site rent', b.rent, ''],
    ['Printing', b.printing, '+'],
    ['Mounting', b.mounting, '+'],
    ['Extras (add-ons)', b.extras, '+'],
    ['Discount', b.discount, '−'],
    ...(b.adjustment ? [['Other adjustments', b.adjustment, '±']] : []),
  ];
  return (
    <div className={DETAIL_GRID}>
      <Section title="How the number is built" note={`${d.count} campaigns booked in the period, quotations and cancelled excluded.`}>
        <table className="w-full text-sm">
          <tbody>
            {steps.map(([label, v, op]) => (
              <tr key={label}><td className="py-1 text-slate-600"><span className="inline-block w-4 text-slate-400">{op}</span>{label}</td><td className="py-1 text-right tabular-nums"><Money value={v} /></td></tr>
            ))}
            <tr className="border-t border-slate-200 font-semibold"><td className="py-1.5"><span className="inline-block w-4 text-slate-400">=</span>Taxable (ex-GST)</td><td className="py-1.5 text-right tabular-nums"><Money value={b.taxable} /></td></tr>
            <tr><td className="py-1 text-slate-600"><span className="inline-block w-4 text-slate-400">+</span>GST</td><td className="py-1 text-right tabular-nums"><Money value={b.gst} /></td></tr>
            <tr className="border-t-2 border-slate-300 font-bold text-emerald-700"><td className="py-1.5"><span className="inline-block w-4 text-slate-400">=</span>Booked value</td><td className="py-1.5 text-right tabular-nums"><Money value={b.total} /></td></tr>
          </tbody>
        </table>
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
          { key: 'printMount', label: 'Print + mount', money: true },
          { key: 'extras', label: 'Extras', money: true },
          { key: 'discount', label: 'Discount', money: true },
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
        <table className="w-full text-sm">
          <tbody>
            <tr><td className="py-1 text-slate-600">Booked value (period)</td><td className="py-1 text-right tabular-nums"><Money value={d.booked} /></td></tr>
            <tr><td className="py-1 text-slate-600">− Collected (receipt date in period)</td><td className="py-1 text-right tabular-nums"><Money value={d.collected} /></td></tr>
            <tr className="border-t-2 border-slate-300 font-bold text-red-600"><td className="py-1.5">= Due on campaigns</td><td className="py-1.5 text-right tabular-nums"><Money value={d.headline} /></td></tr>
          </tbody>
        </table>
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
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const cfg = CARDS[card];
  const paramKey = JSON.stringify(params || {});

  useEffect(() => {
    if (!card || !cfg) return undefined;
    let alive = true;
    setData(null); setError(null);
    api.get(cfg.endpoint || '/reports/card-detail', { params: { ...params, card } })
      .then((r) => { if (alive) setData(r.data); })
      .catch((e) => { if (alive) setError(e.response?.data?.error || 'Could not load the details.'); });
    return () => { alive = false; };
  }, [card, paramKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg) return null;
  const { Body } = cfg;
  const period = cfg.asOfNow ? 'as of today' : cfg.allTime || (!params.from && !params.to) ? 'all time' : `${fmtDate(params.from)} – ${fmtDate(params.to)}`;
  return (
    <DetailDialog
      open={!!card} onClose={onClose} title={cfg.title}
      headline={data && data.card === card ? cfg.fmt(data.headline) : null}
      explain={<>{cfg.explain} <span className="whitespace-nowrap text-slate-400">({period}{cfg.filterNote ? cfg.filterNote(params) : ''})</span></>}
      footer={cfg.to ? <Link to={typeof cfg.to === 'function' ? cfg.to(data) : cfg.to} className="btn-ghost text-sm">{cfg.toLabel || 'View all'} <ExternalLink size={14} /></Link> : null}
    >
      {error ? <div className="py-10 text-center text-sm text-red-600">{error}</div>
        : !data || data.card !== card ? <Spinner /> : <Body d={data} card={card} params={params} />}
    </DetailDialog>
  );
}
