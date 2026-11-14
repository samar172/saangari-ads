import { DETAIL_GRID } from './DetailDialog';
import { Money } from './ui';
import {
  Section, Breakdown, Bridge, DataTable, Figure, Figures, Note,
  orderLink, clientLink, siteLink, fmtNum, fmtPct,
} from './detailKit';

// Drill-down bodies for the Booking Analysis (/booking-analysis) tiles, fed by
// /reports/booking-analysis/detail with the page's filters. The unit is one site
// line on a confirmed / live / completed campaign, placed in the month it starts.

const money = (v) => <Money value={v} />;
const statusCls = { Received: 'bg-emerald-100 text-emerald-800', Partial: 'bg-amber-100 text-amber-800', Pending: 'bg-red-100 text-red-800' };
const StatusBadge = ({ s }) => <span className={`badge ${statusCls[s] || 'bg-slate-100 text-slate-600'}`}>{s}</span>;

const COL = {
  month: { key: 'month', label: 'Month', month: true },
  site: { key: 'siteCode', label: 'Site', render: (r) => siteLink(r.siteId, r.siteCode) },
  order: { key: 'orderNo', label: 'Campaign', render: (r) => orderLink(r.orderId, r.orderNo) },
  customer: { key: 'customer', label: 'Customer', render: (r) => clientLink(r.clientId, r.customer) },
  category: { key: 'category', label: 'Category' },
  zone: { key: 'zone', label: 'Zone' },
  media: { key: 'mediaType', label: 'Media' },
  start: { key: 'startDate', label: 'From', date: true },
  end: { key: 'endDate', label: 'To', date: true },
  days: { key: 'days', label: 'Days', num: true, sum: true },
  sm: { key: 'siteMonths', label: 'Site-months', num: true, sum: true },
  billing: { key: 'billingExGst', label: 'Billing ex-GST', money: true, sum: true },
  gst: { key: 'gst', label: 'GST', money: true, sum: true },
  total: { key: 'total', label: 'Total', money: true, sum: true },
  received: { key: 'received', label: 'Received', money: true, sum: true },
  outstanding: { key: 'outstanding', label: 'Outstanding', money: true, sum: true },
  status: { key: 'paymentStatus', label: 'Status', render: (r) => <StatusBadge s={r.paymentStatus} /> },
  terms: { key: 'paymentTerms', label: 'Terms' },
};

// Line columns + default sort per card.
const LINES = {
  baBookings: [[COL.month, COL.site, COL.order, COL.customer, COL.category, COL.start, COL.end, COL.days, COL.billing, COL.status], 'month'],
  baCustomers: [[COL.customer, COL.month, COL.site, COL.order, COL.category, COL.billing, COL.total, COL.status], 'customer'],
  baSiteMonths: [[COL.site, COL.zone, COL.media, COL.order, COL.customer, COL.start, COL.end, COL.days, COL.sm, COL.billing], 'siteMonths'],
  baBilling: [[COL.month, COL.site, COL.order, COL.customer, COL.category, COL.media, COL.sm, COL.billing], 'billingExGst'],
  baGst: [[COL.month, COL.site, COL.order, COL.customer, COL.billing, COL.gst, COL.total], 'gst'],
  baTotal: [[COL.month, COL.site, COL.order, COL.customer, COL.billing, COL.gst, COL.total], 'total'],
  baReceived: [[COL.month, COL.site, COL.order, COL.customer, COL.total, COL.received, COL.outstanding, COL.status], 'received'],
  baOutstanding: [[COL.month, COL.site, COL.order, COL.customer, COL.total, COL.received, COL.outstanding, COL.status, COL.terms], 'outstanding'],
  baCollection: [[COL.month, COL.site, COL.order, COL.customer, COL.total, COL.received, COL.outstanding, COL.status], 'month'],
  baAvgBooking: [[COL.month, COL.site, COL.order, COL.customer, COL.category, COL.days, COL.billing], 'billingExGst'],
  baAvgRate: [[COL.site, COL.order, COL.customer, COL.category, COL.days, COL.sm, COL.billing,
    { key: 'rate', label: 'Rate / site-month', money: true }], 'rate'],
  baAdvance: [[COL.terms, COL.month, COL.site, COL.order, COL.customer, COL.billing, COL.total, COL.status], 'paymentTerms'],
  baTopCategory: [[COL.category, COL.month, COL.site, COL.order, COL.customer, COL.sm, COL.billing], 'billingExGst'],
  baBestMonth: [[COL.month, COL.site, COL.order, COL.customer, COL.category, COL.billing, COL.total], 'month'],
};

function MonthTable({ rows }) {
  return (
    <DataTable rows={rows.map((m) => ({ ...m, id: m.month }))} search={false} defaultSort={{ key: 'month', dir: 'asc' }} columns={[
      COL.month,
      { key: 'bookings', label: 'Bookings', num: true, sum: true }, { key: 'siteMonths', label: 'Site-months', num: true, sum: true },
      { key: 'customersBilled', label: 'Customers', num: true }, { key: 'newCustomers', label: 'New', num: true, sum: true },
      COL.billing, COL.gst, COL.total, COL.received, COL.outstanding,
      { key: 'collectionPct', label: 'Coll. %', pct: true }, { key: 'momGrowth', label: 'MoM', pct: true },
      { key: 'shareOfYear', label: 'Share', pct: true },
    ]} />
  );
}

function CategoryTable({ rows }) {
  return (
    <DataTable rows={rows.map((c) => ({ ...c, id: c.category }))} search={false} defaultSort={{ key: 'billingExGst', dir: 'desc' }} columns={[
      COL.category,
      { key: 'bookings', label: 'Bookings', num: true, sum: true }, { key: 'customers', label: 'Customers', num: true, sum: true },
      { key: 'siteMonths', label: 'Site-months', num: true, sum: true }, COL.billing,
      { key: 'shareOfBilling', label: 'Share', pct: true }, COL.total, COL.received, COL.outstanding,
      { key: 'collectionPct', label: 'Coll. %', pct: true },
      { key: 'avgRatePerSiteMonth', label: 'Avg rate / SM', money: true }, { key: 'avgBillingPerBooking', label: 'Avg / booking', money: true },
    ]} />
  );
}

function CustomerTable({ rows, sortKey = 'billingExGst', onlyOwing }) {
  const shown = onlyOwing ? rows.filter((c) => c.outstanding > 0) : rows;
  return (
    <DataTable rows={shown} defaultSort={{ key: sortKey, dir: 'desc' }} columns={[
      { key: 'customer', label: 'Customer', render: (r) => clientLink(r.clientId, r.customer) },
      COL.category, { key: 'phone', label: 'Phone' },
      { key: 'bookings', label: 'Bookings', num: true, sum: true },
      { key: 'firstMonth', label: 'First', month: true }, { key: 'lastMonth', label: 'Last', month: true },
      { key: 'siteMonths', label: 'Site-months', num: true, sum: true },
      COL.billing, COL.total, COL.received, COL.outstanding,
      { key: 'collectionPct', label: 'Coll. %', pct: true },
      { key: 'paymentStatus', label: 'Status', render: (r) => <StatusBadge s={r.paymentStatus} /> },
    ]} />
  );
}

function GroupTable({ rows, label }) {
  return (
    <DataTable rows={rows} search={false} defaultSort={{ key: 'billingExGst', dir: 'desc' }} columns={[
      { key: 'label', label }, { key: 'count', label: 'Bookings', num: true, sum: true },
      { key: 'siteMonths', label: 'Site-months', num: true, sum: true }, COL.billing, COL.total, COL.received, COL.outstanding,
      { key: 'rate', label: 'Rate / SM', money: true, render: (r) => <Money value={r.siteMonths ? Math.round(r.billingExGst / r.siteMonths) : 0} /> },
    ]} />
  );
}

function BABody({ d, card }) {
  const k = d.dashboard, sp = d.split;
  const wide = 'md:col-span-2 xl:col-span-3';
  const [lineCols, lineSort] = LINES[card];
  let lines = d.lines.map((l) => ({ ...l, rate: l.siteMonths ? Math.round(l.billingExGst / l.siteMonths) : 0 }));
  if (card === 'baOutstanding') lines = lines.filter((l) => l.outstanding > 0);
  if (card === 'baGst') lines = lines.filter((l) => l.gst > 0);
  const linesCapped = d.lineCount > d.lines.length;
  const monthBars = (f) => d.monthwise.map((m) => ({ key: m.month, label: m.month, value: m[f], count: m.bookings }));
  const catBars = (f) => d.categorywise.map((c) => ({ key: c.category, label: c.category, value: c[f], count: c.bookings }));

  const sections = [];
  const how = (content, note) => sections.push(<Section key="how" title="How the number is built" note={note}>{content}</Section>);

  switch (card) {
    case 'baBookings':
      how(<Breakdown rows={d.paymentStatus.map((p) => ({ key: p.status, label: p.status, value: p.bookings }))} money={false} />,
        'One booking = one site line on a confirmed / live / completed campaign, counted in the month it starts. Split by payment status:');
      sections.push(<Section key="m" title="Bookings by month"><Breakdown rows={monthBars('bookings')} month money={false} /></Section>);
      sections.push(<Section key="c" title="Bookings by category"><Breakdown rows={catBars('bookings')} money={false} /></Section>);
      break;
    case 'baCustomers':
      how(<Bridge money={false} steps={[{ label: 'Distinct customers with ≥1 booking', value: k.customers, total: true, final: true },
        { label: 'Bookings per customer (avg)', text: k.customers ? fmtNum(Math.round((k.bookings / k.customers) * 10) / 10) : '—' }]} />,
      'Customers are counted by display name (company, else contact).');
      sections.push(<Section key="c" title="Customers by category"><Breakdown rows={d.categorywise.map((c) => ({ key: c.category, label: c.category, value: c.customers }))} money={false} /></Section>);
      sections.push(<Section key="n" title="New customers by month" note="First booking month within these filters."><Breakdown rows={d.monthwise.map((m) => ({ key: m.month, label: m.month, value: m.newCustomers }))} month money={false} /></Section>);
      sections.push(<Section key="t" title={`Customers (${d.customerwise.length})`} className={wide}><CustomerTable rows={d.customerwise} /></Section>);
      break;
    case 'baSiteMonths':
      how(<Bridge money={false} steps={[{ label: `Days on ${fmtNum(k.bookings)} bookings`, value: sp.days },
        { label: 'Each line: days ÷ 30, rounded to 0.01', text: '÷ 30' },
        { label: 'Site-months', text: fmtNum(k.siteMonths), total: true, final: true }]} />);
      sections.push(<Section key="m" title="Site-months by month"><Breakdown rows={monthBars('siteMonths')} month money={false} /></Section>);
      sections.push(<Section key="z" title="By media type"><Breakdown rows={d.byMedia.map((g) => ({ ...g, value: g.siteMonths }))} money={false} /></Section>);
      sections.push(<Section key="s" title={`Per site (${d.siteCount})`} className={wide}>
        <DataTable rows={d.bySite} total={d.siteCount} defaultSort={{ key: 'siteMonths', dir: 'desc' }} columns={[
          { key: 'code', label: 'Site', render: (r) => siteLink(r.id, r.code) }, { key: 'location', label: 'Location' }, COL.zone, COL.media,
          { key: 'count', label: 'Bookings', num: true, sum: true }, COL.days, COL.sm, COL.billing,
          { key: 'rate', label: 'Rate / SM', money: true, render: (r) => <Money value={r.siteMonths ? Math.round(r.billingExGst / r.siteMonths) : 0} /> },
        ]} /></Section>);
      break;
    case 'baBilling':
    case 'baTotal':
    case 'baGst':
      how(<Bridge steps={[
        { label: `Site rent on ${fmtNum(k.bookings)} bookings (ex-GST)`, value: k.billingExGst, accent: card === 'baBilling' ? 'bg-brand/5 text-brand font-semibold' : '' },
        { label: `GST 18% on ${fmtNum(sp.gstLines)} lines of GST campaigns (${'₹' + Number(sp.gstLinesBilling).toLocaleString('en-IN')})`, value: k.gst, op: '+', accent: card === 'baGst' ? 'bg-brand/5 text-brand font-semibold' : '' },
        { label: 'Total billing', value: k.totalBilling, op: '=', total: true, final: true },
      ]} />, 'Billing is the site line’s rent only — printing, mounting and extras on the campaign are not in this analysis. Non-GST campaigns carry no GST.');
      if (card === 'baGst') sections.push(<Section key="g" title="GST vs non-GST lines"><Breakdown rows={[{ key: 'g', label: 'GST campaigns', value: sp.gstLinesBilling, count: sp.gstLines }, { key: 'n', label: 'Non-GST campaigns', value: sp.nonGstBilling, count: sp.nonGstLines }]} countLabel="lines" /></Section>);
      sections.push(<Section key="m" title="By month"><Breakdown rows={monthBars(card === 'baBilling' ? 'billingExGst' : card === 'baGst' ? 'gst' : 'total')} month countLabel="bookings" /></Section>);
      sections.push(<Section key="c" title="By category"><Breakdown rows={catBars(card === 'baBilling' ? 'billingExGst' : card === 'baGst' ? 'gst' : 'total')} countLabel="bookings" /></Section>);
      if (card === 'baBilling') sections.push(<Section key="md" title="By media type" className={wide}><GroupTable rows={d.byMedia} label="Media type" /></Section>);
      break;
    case 'baReceived':
      how(<Bridge steps={[
        { label: 'Total billing', value: k.totalBilling },
        { label: 'Outstanding', value: k.outstanding, op: '−' },
        { label: 'Received', value: k.received, op: '=', total: true, final: true, accent: 'text-emerald-700' },
      ]} />, 'Each campaign’s payments are spread over its site lines by each line’s share of the campaign total (capped at the line total), so printing/mounting receipts aren’t credited to rent.');
      sections.push(<Section key="p" title="By payment status"><Breakdown rows={d.paymentStatus.map((p) => ({ key: p.status, label: p.status, value: p.received, count: p.bookings }))} countLabel="bookings" /></Section>);
      sections.push(<Section key="m" title="Received by month"><Breakdown rows={monthBars('received')} month countLabel="bookings" /></Section>);
      break;
    case 'baOutstanding':
      how(<Bridge steps={[
        { label: 'Total billing', value: k.totalBilling },
        { label: 'Received (allocated to lines)', value: k.received, op: '−' },
        { label: 'Outstanding', value: k.outstanding, op: '=', total: true, final: true, accent: 'text-red-600' },
      ]} />, 'Per line: total − allocated receipts, never below zero.');
      sections.push(<Section key="m" title="Outstanding by month"><Breakdown rows={monthBars('outstanding').filter((m) => m.value)} month countLabel="bookings" /></Section>);
      sections.push(<Section key="c" title="Outstanding by category"><Breakdown rows={catBars('outstanding').filter((m) => m.value)} countLabel="bookings" /></Section>);
      sections.push(<Section key="u" title="Customers to follow up" className={wide}><CustomerTable rows={d.customerwise} sortKey="outstanding" onlyOwing /></Section>);
      break;
    case 'baCollection':
      how(<Bridge steps={[
        { label: 'Received', value: k.received },
        { label: 'Total billing', text: <>÷ <Money value={k.totalBilling} /></> },
        { label: 'Collection %', text: fmtPct(k.collectionPct), total: true, final: true },
      ]} />);
      sections.push(<Section key="p" title="By payment status"><Breakdown rows={d.paymentStatus.map((p) => ({ key: p.status, label: p.status, value: p.totalBilling, count: p.bookings }))} countLabel="bookings" /></Section>);
      sections.push(<Section key="c" title="Collection % by category"><Breakdown rows={d.categorywise.map((c) => ({ key: c.category, label: c.category, value: Math.round(c.collectionPct * 100) }))} fmt={(v) => `${v}%`} /></Section>);
      sections.push(<Section key="m" title="Billed vs received by month" className={wide}><MonthTable rows={d.monthwise} /></Section>);
      break;
    case 'baAvgBooking':
      how(<Bridge steps={[
        { label: 'Billing ex-GST', value: k.billingExGst },
        { label: 'Bookings', text: `÷ ${fmtNum(k.bookings)}` },
        { label: 'Average billing per booking', value: k.avgBillingPerBooking, op: '=', total: true, final: true },
      ]} />);
      sections.push(<Section key="c" title="Average by category"><Breakdown rows={d.categorywise.map((c) => ({ key: c.category, label: c.category, value: c.avgBillingPerBooking, count: c.bookings }))} countLabel="bookings" /></Section>);
      sections.push(<Section key="m" title="Average by month"><Breakdown rows={d.monthwise.map((m) => ({ key: m.month, label: m.month, value: m.bookings ? Math.round(m.billingExGst / m.bookings) : 0, count: m.bookings }))} month countLabel="bookings" /></Section>);
      break;
    case 'baAvgRate':
      how(<Bridge steps={[
        { label: 'Billing ex-GST', value: k.billingExGst },
        { label: 'Site-months', text: `÷ ${fmtNum(k.siteMonths)}` },
        { label: 'Average rate per site-month', value: k.avgRatePerSiteMonth, op: '=', total: true, final: true },
      ]} />, 'A site-month is one site for 30 days.');
      sections.push(<Section key="c" title="Rate by category"><Breakdown rows={d.categorywise.map((c) => ({ key: c.category, label: c.category, value: c.avgRatePerSiteMonth, count: c.bookings }))} countLabel="bookings" /></Section>);
      sections.push(<Section key="z" title="By zone" className={wide}><GroupTable rows={d.byZone} label="Zone" /></Section>);
      sections.push(<Section key="md" title="By media type" className={wide}><GroupTable rows={d.byMedia} label="Media type" /></Section>);
      break;
    case 'baAdvance':
      how(<Bridge money={false} steps={[
        { label: 'Bookings on Advance-terms campaigns', value: sp.advance },
        { label: 'All bookings', text: `÷ ${fmtNum(k.bookings)}` },
        { label: 'Advance bookings %', text: fmtPct(k.advancePct), total: true, final: true },
      ]} />, 'Terms come from the campaign (Advance or Postpaid); every site line on it counts.');
      sections.push(<Section key="t" title="Advance vs Postpaid" className="xl:col-span-2">
        <DataTable rows={d.byTerms} search={false} defaultSort={{ key: 'count', dir: 'desc' }} columns={[
          { key: 'label', label: 'Terms' }, { key: 'count', label: 'Bookings', num: true, sum: true }, { key: 'customers', label: 'Customers', num: true },
          COL.billing, COL.total, COL.received, COL.outstanding,
          { key: 'coll', label: 'Coll. %', num: true, render: (r) => fmtPct(r.total ? r.received / r.total : 0) },
        ]} /></Section>);
      break;
    case 'baTopCategory':
      how(<div className="text-sm text-slate-600">The category with the highest billing ex-GST. Ranked:</div>);
      sections.push(<Section key="c" title="Billing by category" className="xl:col-span-2"><Breakdown rows={catBars('billingExGst')} countLabel="bookings" /></Section>);
      sections.push(<Section key="t" title="Category-wise" className={wide}><CategoryTable rows={d.categorywise} /></Section>);
      break;
    case 'baBestMonth':
    default:
      how(<div className="text-sm text-slate-600">The month (by line start) with the highest billing ex-GST.</div>);
      sections.push(<Section key="m" title="Billing by month" className="xl:col-span-2"><Breakdown rows={monthBars('billingExGst')} month countLabel="bookings" /></Section>);
      sections.push(<Section key="t" title="Month-wise" className={wide}><MonthTable rows={d.monthwise} /></Section>);
      break;
  }

  return (
    <div className={DETAIL_GRID}>
      <Figures cols={5}>
        <Figure label="Bookings" value={fmtNum(k.bookings)} sub={`${fmtNum(k.customers)} customers`} />
        <Figure label="Billing ex-GST" value={money(k.billingExGst)} sub={`${fmtNum(k.siteMonths)} site-months`} />
        <Figure label="Total billing" value={money(k.totalBilling)} accent="text-emerald-600" sub="incl. GST" />
        <Figure label="Received" value={money(k.received)} accent="text-emerald-600" sub={`${fmtPct(k.collectionPct)} collected`} />
        <Figure label="Outstanding" value={money(k.outstanding)} accent="text-red-600" />
      </Figures>
      {sections}
      <Section title={`Booking lines (${card === 'baOutstanding' || card === 'baGst' ? lines.length : d.lineCount})`} className={wide}
        note={card === 'baOutstanding' ? 'Lines with an outstanding balance.' : card === 'baGst' ? 'Lines on GST campaigns.' : null}>
        {linesCapped && <Note tone="slate">Showing the first {d.lines.length} of {d.lineCount} lines.</Note>}
        <DataTable rows={lines} total={d.lineCount} defaultSort={{ key: lineSort, dir: lineSort === 'customer' || lineSort === 'paymentTerms' ? 'asc' : 'desc' }} columns={lineCols} />
      </Section>
    </div>
  );
}

const M = (v) => <Money value={v} />;
const cfg = (title, fmt, explain) => ({ title, Body: BABody, fmt, explain, endpoint: '/reports/booking-analysis/detail', to: null });
const filterNote = (p) => ['category', 'customer', 'zone', 'mediaType', 'paymentStatus', 'paymentTerms']
  .filter((f) => p[f]).map((f) => ` · ${p[f]}`).join('');

export const BA_CARDS = Object.fromEntries(Object.entries({
  baBookings: cfg('Bookings', fmtNum, 'Site lines on confirmed / live / completed campaigns, by the month each line starts.'),
  baCustomers: cfg('Customers', fmtNum, 'Customers with at least one booking line in the period.'),
  baSiteMonths: cfg('Site-Months', fmtNum, 'Booked days ÷ 30 across the booking lines.'),
  baBilling: cfg('Billing ex-GST', M, 'Site rent on the booking lines, before GST.'),
  baGst: cfg('GST', M, '18% on booking lines of GST campaigns.'),
  baTotal: cfg('Total Billing', M, 'Billing ex-GST plus GST.'),
  baReceived: cfg('Received', M, 'Campaign receipts allocated to the booking lines.'),
  baOutstanding: cfg('Outstanding', M, 'Total billing on the lines not yet received.'),
  baCollection: cfg('Collection %', fmtPct, 'Received as a share of total billing.'),
  baAvgBooking: cfg('Avg Billing / Booking', M, 'Billing ex-GST per booking line.'),
  baAvgRate: cfg('Avg Rate / Site-Month', M, 'Billing ex-GST per site-month.'),
  baAdvance: cfg('Advance Bookings %', fmtPct, 'Share of booking lines on Advance-terms campaigns.'),
  baTopCategory: cfg('Top Category', (v) => v || '—', 'Client category with the most billing ex-GST.'),
  baBestMonth: cfg('Best Month', (v) => v || '—', 'Month with the most billing ex-GST.'),
}).map(([k, v]) => [k, { ...v, filterNote }]));
