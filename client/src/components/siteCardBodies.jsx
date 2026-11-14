import { DETAIL_GRID } from './DetailDialog';
import { Badge, Money } from './ui';
import {
  Section, Breakdown, Bridge, DataTable, Figure, Figures, Note,
  orderLink, clientLink, siteLink, fmtNum,
} from './detailKit';

// Drill-down bodies for the Site-wise report (/reports/sites) tiles, fed by
// /reports/site-wise/detail with the page's own filters (business, period,
// zone, media type, search, booked-only).

const money = (v) => <Money value={v} />;

function RollTable({ rows, label, focus }) {
  return (
    <DataTable rows={rows} search={false} defaultSort={{ key: focus, dir: 'desc' }} columns={[
      { key: 'label', label },
      { key: 'sites', label: 'Sites', num: true, sum: true },
      { key: 'booked', label: 'Booked', num: true, sum: true },
      { key: 'pct', label: '% booked', num: true, render: (r) => `${r.pct}%` },
      { key: 'bookings', label: 'Bookings', num: true, sum: true },
      { key: 'days', label: 'Days', num: true, sum: true },
      { key: 'revenue', label: 'Revenue', money: true, sum: true },
      { key: 'avg', label: 'Avg / booked site', money: true },
    ]} />
  );
}

function SiteBody({ d, card }) {
  const s = d.summary;
  const monthField = { siteBookings: 'bookings', siteDays: 'days' }[card] || 'revenue';
  const byMonth = d.byMonth.map((m) => ({ key: m.month, label: m.month, value: m[monthField], count: m.bookings }));

  let bridge;
  if (card === 'sitesCount') {
    bridge = (
      <>
        <Bridge money={false} steps={[
          { label: 'Sites with at least one booking', value: s.bookedSites, accent: 'text-emerald-700', col: 'isBooked' },
          { label: 'Sites with no booking in the period', value: s.siteCount - s.bookedSites, op: '+', col: 'idle' },
          { label: 'Sites shown (active, matching the filters)', value: s.siteCount, op: '=', total: true, final: true },
        ]} />
        <Note tone="slate">“Booked” here means booked at any time for a campaign booked in the period — not the site's status today (that's the Occupancy card on Reports).</Note>
      </>
    );
  } else if (card === 'siteRevenue') {
    bridge = (
      <>
        <Bridge steps={[
          { label: `Site rent on ${fmtNum(d.bookingCount)} booking lines`, value: s.rawRevenue, col: 'subtotal' },
          { label: 'Rounding (each site rounded to the rupee)', value: Math.round((s.totalRevenue - s.rawRevenue) * 100) / 100, op: '±' },
          { label: 'Revenue (ex-GST)', value: s.totalRevenue, op: '=', total: true, final: true, col: 'revenue' },
        ]} />
        <Note tone="slate">Rent only — printing, mounting, extras, discount and GST sit on the campaign, not the site. Lines on cancelled campaigns or cancelled lines are excluded; a campaign counts in the period by its booking date.</Note>
      </>
    );
  } else if (card === 'siteBookings') {
    bridge = (
      <>
        <Breakdown rows={d.byStatus} money={false} />
        <Note tone="slate">Each site line on a non-cancelled campaign booked in the period counts once (waitlisted and stopped lines included, cancelled lines left out).</Note>
      </>
    );
  } else if (card === 'siteDays') {
    bridge = (
      <Bridge money={false} steps={[
        { label: `Days on ${fmtNum(d.bookingCount)} booking lines`, value: s.totalDays, total: true, final: true, col: 'days' },
        { label: 'Site-months (days ÷ 30)', text: fmtNum(Math.round((s.totalDays / 30) * 100) / 100) },
        { label: 'Average days per booking', text: d.bookingCount ? fmtNum(Math.round((s.totalDays / d.bookingCount) * 10) / 10) : '—' },
      ]} />
    );
  } else {
    bridge = (
      <Bridge steps={[
        { label: 'Revenue (ex-GST)', value: s.totalRevenue, card: 'siteRevenue', col: 'revenue' },
        { label: 'Booked sites', text: `÷ ${fmtNum(s.bookedSites)}`, col: 'isBooked' },
        { label: 'Average per booked site', value: s.avg, op: '=', total: true, final: true },
      ]} />
    );
  }

  return (
    <div className={DETAIL_GRID}>
      <Figures cols={5}>
        <Figure label="Sites booked / shown" value={`${s.bookedSites}/${s.siteCount}`} />
        <Figure label="Revenue (ex-GST)" value={money(s.totalRevenue)} accent="text-emerald-600" />
        <Figure label="Bookings" value={fmtNum(s.totalBookings)} />
        <Figure label="Days booked" value={fmtNum(s.totalDays)} />
        <Figure label="Avg / booked site" value={money(s.avg)} />
      </Figures>
      <Section title="How the number is built">{bridge}</Section>
      <Section title={`By month (line start) — ${monthField}`}>
        <Breakdown rows={byMonth} month money={monthField === 'revenue'} countLabel={monthField === 'bookings' ? null : 'lines'} />
      </Section>
      <Section title="Top clients (site rent)"><Breakdown rows={d.byClient} countLabel="lines" /></Section>
      <Section title="By zone" className="md:col-span-2 xl:col-span-3"><RollTable rows={d.byZone} label="Zone" focus={card === 'sitesCount' ? 'sites' : monthField} /></Section>
      <Section title="By media type" className="md:col-span-2 xl:col-span-3"><RollTable rows={d.byType} label="Media type" focus={card === 'sitesCount' ? 'sites' : monthField} /></Section>
      <Section title={`Sites (${d.sites.length})`} className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.sites}
          defaultSort={{ key: { sitesCount: 'booked', siteBookings: 'bookings', siteDays: 'days' }[card] || 'revenue', dir: card === 'sitesCount' ? 'asc' : 'desc' }}
          columns={[
            { key: 'code', label: 'Site', render: (r) => siteLink(r.id, r.code) },
            { key: 'location', label: 'Location' }, { key: 'zone', label: 'Zone' }, { key: 'type', label: 'Type' },
            { key: 'isBooked', label: 'In period', num: true, sum: card === 'sitesCount' || card === 'siteAvg', render: (r) => <span className={`badge ${r.bookings ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{r.booked}</span> },
            ...(card === 'sitesCount' ? [{ key: 'idle', label: 'Idle', num: true, sum: true, render: (r) => (r.idle ? 'idle' : '') }] : []),
            { key: 'status', label: 'Now', render: (r) => <Badge status={r.status} /> },
            { key: 'bookings', label: 'Bookings', num: true, sum: true },
            { key: 'days', label: 'Days', num: true, sum: true },
            { key: 'siteMonths', label: 'Site-months', num: true, sum: true },
            { key: 'revenue', label: 'Revenue', money: true, sum: true },
            ...(card === 'siteAvg' ? [{ key: 'vsAvg', label: 'vs avg', num: true, render: (r) => (r.vsAvg == null ? '—' : <span className={r.vsAvg >= 0 ? 'text-emerald-700' : 'text-red-600'}>{r.vsAvg >= 0 ? '+' : ''}<Money value={r.vsAvg} /></span>) }] : []),
            { key: 'monthlyRate', label: 'Rate / mo', money: true },
          ]} />
      </Section>
      {card !== 'sitesCount' && (
        <Section title={`Booking lines (${d.bookingCount})`} className="md:col-span-2 xl:col-span-3">
          <DataTable rows={d.bookings} total={d.bookingCount} defaultSort={{ key: card === 'siteDays' ? 'days' : card === 'siteBookings' ? 'startDate' : 'subtotal', dir: 'desc' }} columns={[
            { key: 'code', label: 'Site', render: (r) => siteLink(r.siteId, r.code) },
            { key: 'type', label: 'Type' }, { key: 'zone', label: 'Zone' },
            { key: 'orderNo', label: 'Campaign', render: (r) => orderLink(r.orderId, r.orderNo) },
            { key: 'client', label: 'Client', render: (r) => clientLink(r.clientId, r.client) },
            { key: 'bookingDate', label: 'Booked', date: true },
            { key: 'startDate', label: 'From', date: true }, { key: 'endDate', label: 'To', date: true },
            { key: 'status', label: 'Line', render: (r) => <Badge status={r.status} /> },
            { key: 'days', label: 'Days', num: true, sum: true },
            { key: 'subtotal', label: 'Site rent', money: true, sum: true },
          ]} />
        </Section>
      )}
    </div>
  );
}

const cfg = (title, fmt, explain) => ({ title, Body: SiteBody, fmt, explain, endpoint: '/reports/site-wise/detail', to: null });
const filterNote = (p) => [p.zone && `zone ${p.zone}`, p.type, p.q && `“${p.q}”`, p.bookedOnly && 'booked only'].filter(Boolean).map((x) => ` · ${x}`).join('');

export const SITE_CARDS = Object.fromEntries(Object.entries({
  sitesCount: cfg('Sites', (v) => v, 'Sites with a booking in the period, out of the active sites matching the filters.'),
  siteRevenue: cfg('Revenue (ex-GST)', (v) => <Money value={v} />, 'Site rent on booking lines of campaigns booked in the period, summed per site.'),
  siteBookings: cfg('Bookings', (v) => v, 'Booking lines on the sites shown, for campaigns booked in the period.'),
  siteDays: cfg('Days booked', (v) => Number(v || 0).toLocaleString('en-IN'), 'Days on those booking lines, added up.'),
  siteAvg: cfg('Avg / booked site', (v) => <Money value={v} />, 'Revenue (ex-GST) divided by the number of sites with a booking.'),
}).map(([k, v]) => [k, { ...v, filterNote }]));
