import { Link } from 'react-router-dom';
import { DETAIL_GRID } from './DetailDialog';
import { Badge, Money } from './ui';
import {
  Section, Breakdown, Bridge, DataTable, Figure, Figures, Note,
  orderLink, clientLink, siteLink, invoiceLink, fmtNum,
} from './detailKit';

// Drill-down bodies for the Reports page (/reports) tiles that aren't Dashboard
// cards. Data comes from /reports/card-detail (server/src/utils/reportCards.js).

const money = (v) => <Money value={v} />;
const HL = 'bg-brand/5 text-brand font-semibold';
const pick = (rows, f) => (rows || []).filter((g) => g[f]).map((g) => ({ key: g.key, label: g.label, value: g[f], count: g.count }));

const C = {
  order: { key: 'orderNo', label: 'Order', render: (r) => orderLink(r.id, r.orderNo) },
  client: { key: 'client', label: 'Client', render: (r) => clientLink(r.clientId, r.client) },
  booked: { key: 'bookingDate', label: 'Booked', date: true },
  status: { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
  company: { key: 'company', label: 'Business' },
};

// ── Booked-value components: Excluding GST, Rental, Printing, Mounting ───────
const COMPONENT_LABEL = { bookedExGst: 'Taxable (ex-GST)', rental: 'Site rent', printing: 'Printing', mounting: 'Mounting' };

function ComponentBody({ d, card }) {
  const b = d.bridge;
  const hl = (k) => (k === card ? HL : '');
  // A line opens its own card; on the card it describes it focuses the table.
  const steps = [
    { label: 'Site rent', value: b.rent, accent: hl('rental'), card: 'rental', col: 'rent' },
    { label: 'Printing', value: b.printing, op: '+', accent: hl('printing'), card: 'printing', col: 'printing' },
    { label: 'Mounting', value: b.mounting, op: '+', accent: hl('mounting'), card: 'mounting', col: 'mounting' },
    { label: 'Extras (add-ons)', value: b.extras, op: '+', col: 'extras' },
    { label: 'Discount', value: b.discount, op: '−', card: 'discounts', col: 'discount' },
    b.adjustment ? { label: 'Other adjustments', value: b.adjustment, op: '±', col: 'adjustment' } : null,
    { label: 'Taxable (ex-GST)', value: b.taxable, op: '=', total: true, accent: hl('bookedExGst'), card: 'bookedExGst', col: 'taxable' },
    { label: 'GST', value: b.gst, op: '+', card: 'gst', col: 'gst' },
    { label: 'Booked value (incl. GST)', value: b.total, op: '=', total: true, final: true, card: 'booked', col: 'total' },
  ];
  const own = { bookedExGst: 'taxable', rental: 'rent', printing: 'printing', mounting: 'mounting' }[card];
  const extra = {
    bookedExGst: [],
    rental: [{ key: 'sites', label: 'Sites', num: true, sum: true }],
    printing: [{ key: 'partner', label: 'Partner' }, { key: 'material', label: 'Material' }, { key: 'basis', label: 'Charged' },
      { key: 'prints', label: 'Prints', num: true, sum: true }, { key: 'printRate', label: 'Rate', money: true }],
    mounting: [{ key: 'sites', label: 'Sites', num: true }, { key: 'basis', label: 'Charged' }, { key: 'prints', label: 'Prints', num: true }],
  }[card];
  const m = (key, label) => ({ key, label, money: true, sum: true });
  const cols = [
    ...extra,
    m('rent', 'Rent'), m('printing', 'Printing'), m('mounting', 'Mounting'), m('extras', 'Extras'), m('discount', 'Discount'),
    ...(b.adjustment ? [m('adjustment', 'Adj.')] : []),
    m('taxable', 'Taxable'), m('gst', 'GST'), m('total', 'Total'),
  ];
  return (
    <div className={DETAIL_GRID}>
      <Section title="How the number is built" note={`${d.count} campaigns booked in the period (quotations and cancelled excluded). The highlighted line is this tile.`}>
        <Bridge steps={steps} />
        {card === 'rental' && <Note>Rental is the campaigns' rent subtotal before discount. The Site-wise report shows the same rent per site line.</Note>}
        {card !== 'bookedExGst' && <Note tone="slate">Components are gross of discount — the discount is taken off the campaign as a whole.</Note>}
      </Section>
      <Section title="By business"><Breakdown rows={d.byCompany} countLabel="campaigns" /></Section>
      <Section title="By month (booking date)"><Breakdown rows={d.byMonth} month countLabel="campaigns" /></Section>
      <Section title="By category"><Breakdown rows={d.byCategory} countLabel="campaigns" /></Section>
      {card === 'rental' && <Section title="By media type" note="From the site lines (billable lines only)."><Breakdown rows={d.byMedia} countLabel="lines" /></Section>}
      {card === 'printing' && <Section title="By printing partner"><Breakdown rows={d.byPartner} countLabel="campaigns" /></Section>}
      {card === 'printing' && <Section title="By material"><Breakdown rows={d.byMaterial} countLabel="campaigns" /></Section>}
      <Section title="Top clients"><Breakdown rows={d.topClients} countLabel="campaigns" /></Section>
      <Section title={`Campaigns (${d.rowCount})`}
        note={card !== 'bookedExGst' ? `${d.withValue} carry ${COMPONENT_LABEL[card].toLowerCase()}; the rest are listed so every line above can be traced. Click a line to filter.` : 'Click a line above to filter the table to it.'}
        className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.rows} total={d.rowCount} defaultSort={{ key: own, dir: 'desc' }}
          columns={[C.order, C.client, C.booked, C.status, ...cols]} />
      </Section>
    </div>
  );
}

// ── Profitability: Revenue, Printing charged / cost / margin, Discounts ──────
const SOURCE_LABEL = { entered: 'Entered', material_sqft: 'Material ₹/sqft', sqft: 'Partner ₹/sqft', none: 'No basis' };

function ProfitBody({ d, card }) {
  const s = d.summary, b = d.bridge;
  const monthly = (f) => d.monthly.filter((m) => m[f]).map((m) => ({ key: m.key, label: m.label, value: m[f], count: m.count }));
  const reconNote = d.zeroCostCount > 0 && (
    <Note>
      {d.zeroCostCount} campaign{d.zeroCostCount === 1 ? '' : 's'} charge printing (<Money value={d.zeroCostCharged} />) but have a ₹0 cost — no cost entered and no
      material / partner ₹/sqft to work it out. <Link to="/accounts?tab=recon" className="font-semibold underline">Open Printing Reconciliation</Link>
    </Note>
  );
  const printCols = [
    { key: 'partner', label: 'Partner' }, { key: 'material', label: 'Material' },
    { key: 'prints', label: 'Prints', num: true }, { key: 'sites', label: 'Sites', num: true },
  ];
  let body;
  if (card === 'profitRevenue') {
    body = (
      <>
        <Section title="How the number is built" note={`${s.orders} confirmed / live / completed campaigns booked in the period.`}>
          <Bridge steps={[
            { label: 'Site rent', value: b.rent, card: 'rental', col: 'rent' },
            { label: 'Printing', value: b.printing, op: '+', card: 'printCharged', col: 'printing' },
            { label: 'Mounting', value: b.mounting, op: '+', card: 'mounting', col: 'mounting' },
            { label: 'Extras (add-ons)', value: b.extras, op: '+', col: 'extras' },
            { label: 'Discount', value: b.discount, op: '−', card: 'discounts', col: 'discount' },
            b.adjustment ? { label: 'Other adjustments', value: b.adjustment, op: '±', col: 'adjustment' } : null,
            { label: 'Revenue (ex-GST)', value: s.revenueExGst, op: '=', total: true, final: true, col: 'taxable' },
            { label: 'Printing cost (paid to partners)', value: s.printingCost, op: '−', card: 'printCost', col: 'printCost' },
            { label: 'Contribution', value: s.contribution, op: '=', total: true, accent: 'text-emerald-700' },
          ]} />
          <Note tone="slate">The same campaigns as Booked Value's “Excluding GST”, rounded to the rupee. Rental &amp; mounting vendor costs aren't tracked, so contribution is an upper bound, not net profit.</Note>
        </Section>
        <Section title="By category"><Breakdown rows={d.byCategory.map((c) => ({ key: c.category, label: c.category, value: c.revenue }))} /></Section>
        <Section title="By month (booking date)"><Breakdown rows={monthly('taxable')} month countLabel="campaigns" /></Section>
      </>
    );
  } else if (card === 'printCharged') {
    body = (
      <>
        <Figures cols={3}>
          <Figure label="Printing charged" value={money(s.printingCharged)} accent="text-purple-600" sub={`${d.rowCount} campaigns with printing`} />
          <Figure label="Printing cost" value={money(s.printingCost)} sub="paid to partners" />
          <Figure label="Printing margin" value={money(s.printingMargin)} accent={s.printingMargin >= 0 ? 'text-emerald-600' : 'text-red-600'} />
        </Figures>
        <Section title="By printing partner"><Breakdown rows={pick(d.byPartner, 'printing')} countLabel="campaigns" /></Section>
        <Section title="By month (booking date)"><Breakdown rows={monthly('printing')} month countLabel="campaigns" /></Section>
        <Section title="How it's charged" note="Per print: no. of prints × rate (+ mounting). Per site: each site line's printing charge.">
          <Breakdown rows={[
            { key: 'p', label: 'Per print', value: d.rows.filter((r) => !r.perSite).reduce((x, r) => x + r.printing, 0), count: d.rows.filter((r) => !r.perSite).length },
            { key: 's', label: 'Per site', value: d.rows.filter((r) => r.perSite).reduce((x, r) => x + r.printing, 0), count: d.rows.filter((r) => r.perSite).length },
          ]} countLabel="campaigns" />
        </Section>
      </>
    );
  } else if (card === 'printCost') {
    body = (
      <>
        <Section title="How the number is built" note="What we pay the printing partner, per campaign, in priority order:">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>a cost entered on the campaign;</li>
            <li>printed area × the material's ₹/sqft (e.g. Black Base);</li>
            <li>printed area × the partner's default ₹/sqft;</li>
            <li>otherwise ₹0 — no cost basis yet.</li>
          </ol>
          <div className="mt-2 text-xs text-slate-500">Printed area = no. of prints × the average sqft of the campaign's live sites (per-site charging prints every site).</div>
          {reconNote}
        </Section>
        <Section title="By cost basis" note="Cost, with the campaigns on each basis — “No basis” campaigns add ₹0.">
          <Breakdown rows={d.bySource.map((g) => ({ key: g.key, label: g.label, value: g.printCost, count: g.count }))} countLabel="campaigns" />
        </Section>
        <Section title="By printing partner"><Breakdown rows={pick(d.byPartner, 'printCost')} countLabel="campaigns" /></Section>
      </>
    );
  } else if (card === 'printMargin') {
    body = (
      <>
        <Section title="How the number is built">
          <Bridge steps={[
            { label: 'Printing charged to clients', value: s.printingCharged, card: 'printCharged', col: 'printing' },
            { label: 'Printing cost (paid to partners)', value: s.printingCost, op: '−', card: 'printCost', col: 'printCost' },
            { label: 'Printing margin', value: s.printingMargin, op: '=', total: true, final: true, accent: s.printingMargin >= 0 ? 'text-emerald-700' : 'text-red-600', col: 'margin' },
          ]} />
          <div className="mt-2 text-xs text-slate-500">Margin % on charged: {s.printingCharged ? Math.round((s.printingMargin / s.printingCharged) * 100) : 0}%.</div>
          {reconNote}
        </Section>
        <Section title="By printing partner"><Breakdown rows={pick(d.byPartner, 'margin')} countLabel="campaigns" /></Section>
        <Section title="By category"><Breakdown rows={d.byCategory.filter((c) => c.printingMargin).map((c) => ({ key: c.category, label: c.category, value: c.printingMargin }))} /></Section>
        <Section title="By month (booking date)"><Breakdown rows={monthly('margin')} month countLabel="campaigns" /></Section>
      </>
    );
  } else {
    const disc = d.rows;
    const gross = disc.reduce((x, r) => x + r.grossBeforeDiscount, 0);
    body = (
      <>
        <Figures cols={3}>
          <Figure label="Discounts given" value={money(s.discounts)} accent="text-amber-600" sub={`${d.rowCount} of ${d.count} campaigns`} />
          <Figure label="Before discount (those campaigns)" value={money(Math.round(gross))} sub="rent + printing + mounting + extras" />
          <Figure label="Average discount" value={`${gross ? Math.round((s.discounts / gross) * 1000) / 10 : 0}%`} sub="of the pre-discount value" />
        </Figures>
        <Section title="By client"><Breakdown rows={pick(d.byClient, 'discount')} countLabel="campaigns" /></Section>
        <Section title="By month (booking date)"><Breakdown rows={monthly('discount')} month countLabel="campaigns" /></Section>
      </>
    );
  }
  const tableCols = {
    profitRevenue: [C.client, { key: 'category', label: 'Category' }, C.booked, { key: 'rent', label: 'Rent', money: true, sum: true },
      { key: 'printing', label: 'Printing', money: true, sum: true }, { key: 'mounting', label: 'Mounting', money: true, sum: true },
      { key: 'extras', label: 'Extras', money: true, sum: true }, { key: 'discount', label: 'Discount', money: true, sum: true },
      ...(b.adjustment ? [{ key: 'adjustment', label: 'Adj.', money: true, sum: true }] : []),
      { key: 'taxable', label: 'Revenue', money: true, sum: true }, { key: 'printCost', label: 'Print cost', money: true, sum: true }],
    printCharged: [C.client, C.booked, ...printCols, { key: 'printRate', label: 'Rate', money: true },
      { key: 'printing', label: 'Charged', money: true, sum: true }, { key: 'printCost', label: 'Cost', money: true, sum: true }, { key: 'margin', label: 'Margin', money: true, sum: true }],
    printCost: [C.client, ...printCols, { key: 'avgSqft', label: 'Avg sqft', num: true }, { key: 'sqft', label: 'Printed sqft', num: true, sum: true },
      { key: 'costRate', label: '₹/sqft', num: true }, { key: 'costSource', label: 'Basis', render: (r) => <span className={r.costSource === 'none' ? 'text-red-600' : ''}>{SOURCE_LABEL[r.costSource] || r.costSource}</span> },
      { key: 'printCost', label: 'Cost', money: true, sum: true }, { key: 'printing', label: 'Charged', money: true, sum: true }],
    printMargin: [C.client, { key: 'partner', label: 'Partner' }, { key: 'printing', label: 'Charged', money: true, sum: true },
      { key: 'printCost', label: 'Cost', money: true, sum: true }, { key: 'margin', label: 'Margin', money: true, sum: true,
        render: (r) => <span className={r.margin < 0 ? 'text-red-600' : 'text-emerald-700'}><Money value={r.margin} /></span> },
      { key: 'marginPct', label: 'Margin %', num: true, render: (r) => (r.marginPct == null ? '—' : `${r.marginPct}%`) },
      { key: 'costSource', label: 'Cost basis', render: (r) => SOURCE_LABEL[r.costSource] || r.costSource }],
    discounts: [C.client, C.booked, { key: 'grossBeforeDiscount', label: 'Before discount', money: true, sum: true },
      { key: 'discount', label: 'Discount', money: true, sum: true },
      { key: 'discountPct', label: '%', num: true, render: (r) => (r.discountPct ? `${r.discountPct}%` : r.grossBeforeDiscount ? `${Math.round((r.discount / r.grossBeforeDiscount) * 1000) / 10}% (flat)` : '—') },
      { key: 'taxable', label: 'Revenue', money: true, sum: true }, { key: 'discountRemarks', label: 'Remarks' }],
  }[card];
  const sortKey = { profitRevenue: 'taxable', printCharged: 'printing', printCost: 'printCost', printMargin: 'margin', discounts: 'discount' }[card];
  return (
    <div className={DETAIL_GRID}>
      {body}
      <Section title={`Campaigns (${d.rowCount})`} className="md:col-span-2 xl:col-span-3"
        note={card === 'profitRevenue' ? null : card === 'discounts' ? 'Campaigns with a discount.' : 'Campaigns that charge printing or carry a printing cost.'}>
        <DataTable rows={d.rows} total={d.rowCount} defaultSort={{ key: sortKey, dir: card === 'printMargin' ? 'asc' : 'desc' }} columns={[C.order, ...tableCols]} />
      </Section>
    </div>
  );
}

// ── Receivables aging ─────────────────────────────────────────────────────────
function ReceivablesBody({ d }) {
  return (
    <div className={DETAIL_GRID}>
      <Figures cols={4}>
        <Figure label={d.bucket ? `Outstanding · ${d.bucketLabel}` : 'Outstanding'} value={money(d.headline)} accent="text-red-600" sub={`${d.count} campaigns`} />
        <Figure label="Invoiced (these campaigns)" value={money(d.totals.invoiced)} />
        <Figure label="Paid against them" value={money(d.totals.paid)} accent="text-emerald-600" />
        <Figure label="DSO" value={`${d.dso} days`} sub={<>total outstanding ÷ (<Money value={d.invoicedLast365} /> invoiced in 365 d ÷ 365)</>} />
      </Figures>
      <Section title="How the number is built">
        <Bridge steps={[
          { label: 'Invoiced (live invoices)', value: d.totals.invoiced, col: 'invoiced' },
          { label: 'Payments received', value: d.totals.paid, op: '−', col: 'paid' },
          { label: d.bucket ? `Outstanding in ${d.bucketLabel}` : 'Outstanding', value: d.totals.outstanding, op: '=', total: true, final: true, accent: 'text-red-600', col: 'outstanding' },
        ]} />
        <Note tone="slate">
          Per campaign: invoiced (cancelled bills excluded) − all payments, rounded; only campaigns owing more than ₹0. Each is aged by its
          oldest live invoice's due date (issue date if none) as of today. Not limited by the date range.
        </Note>
      </Section>
      <Section title="By age bucket" note="All receivable campaigns."><Breakdown rows={d.byBucket} countLabel="campaigns" /></Section>
      <Section title="By client"><Breakdown rows={d.byClient} countLabel="campaigns" /></Section>
      {d.byCompany.length > 1 && <Section title="By business"><Breakdown rows={d.byCompany} countLabel="campaigns" /></Section>}
      <Section title={`Campaigns (${d.count})`} className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.rows} total={d.count} empty="Nothing outstanding in this bucket." defaultSort={{ key: 'outstanding', dir: 'desc' }} columns={[
          C.order, C.client, C.status,
          { key: 'invoiceNos', label: 'Invoices' },
          { key: 'ageDate', label: 'Oldest due', date: true },
          { key: 'daysPast', label: 'Days overdue', num: true, render: (r) => <span className={r.daysPast > 0 ? 'text-red-600' : 'text-slate-500'}>{r.daysPast > 0 ? `${r.daysPast} d` : 'not due'}</span> },
          { key: 'bucketLabel', label: 'Bucket' },
          { key: 'invoiced', label: 'Invoiced', money: true, sum: true },
          { key: 'paid', label: 'Paid', money: true, sum: true },
          { key: 'outstanding', label: 'Outstanding', money: true, sum: true },
          { key: 'lastPaid', label: 'Last paid', date: true },
        ]} />
      </Section>
      <Section title={`Invoices on these campaigns (${d.invoiceCount})`} note="Every live invoice — the campaign's outstanding is netted at campaign level, so a paid bill can sit next to an unpaid one."
        className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.invoices} total={d.invoiceCount} defaultSort={{ key: 'dueDate', dir: 'asc' }} columns={[
          { key: 'invoiceNo', label: 'Invoice', render: (r) => invoiceLink(r.id, r.invoiceNo) },
          { key: 'orderNo', label: 'Campaign', render: (r) => orderLink(r.orderId, r.orderNo) },
          C.client, { key: 'periodLabel', label: 'Period' },
          { key: 'issuedAt', label: 'Issued', date: true }, { key: 'dueDate', label: 'Due', date: true },
          { key: 'daysPast', label: 'Days past due', num: true },
          C.status, { key: 'total', label: 'Amount', money: true, sum: true },
        ]} />
      </Section>
    </div>
  );
}

// ── GST: GST collected, CGST + SGST, IGST ─────────────────────────────────────
function GstBody({ d, card }) {
  const s = d.split, inv = d.invoiced;
  const steps = card === 'gst'
    ? [{ label: 'CGST', value: s.cgst, col: 'cgst' }, { label: 'SGST', value: s.sgst, op: '+', col: 'sgst' },
      { label: 'IGST', value: s.igst, op: '+', card: 'igst', col: 'igst' },
      s.mismatch ? { label: 'Not split (GST amount vs components)', value: s.mismatch, op: '±', col: 'unsplit' } : null,
      { label: 'GST collected', value: s.gstAmount, op: '=', total: true, final: true, col: 'gst' }]
    : card === 'cgstSgst'
      ? [{ label: 'CGST', value: s.cgst, col: 'cgst' }, { label: 'SGST', value: s.sgst, op: '+', col: 'sgst' },
        { label: 'CGST + SGST (intra-state)', value: d.headline, op: '=', total: true, final: true, col: 'cgstSgst' }]
      : [{ label: 'IGST on inter-state campaigns', value: s.igst, total: true, final: true, col: 'igst' }];
  const tax = card === 'gst' ? 'gst' : card === 'igst' ? 'igst' : 'cgstSgst';
  return (
    <div className={DETAIL_GRID}>
      <Section title="How the number is built" note="GST booked on confirmed campaigns (by booking date), quotations and cancelled excluded.">
        <Bridge steps={steps} />
        <div className="mt-3 space-y-1 text-xs text-slate-500">
          <div>{s.gstCampaigns} GST campaigns (taxable <Money value={s.taxableGst} />) · {s.nonGstCampaigns} non-GST campaigns (<Money value={s.taxableNonGst} />, no tax).</div>
          <div>{s.intra} intra-state (CGST + SGST) · {s.inter} inter-state (IGST).</div>
        </div>
      </Section>
      <Section title="GST actually invoiced in the period" note={`${inv.count} live invoices issued in the period — booked GST is billed over the campaign, so the two differ.`}>
        <Bridge steps={[
          { label: 'Taxable invoiced', value: inv.amount },
          { label: 'CGST', value: inv.cgst }, { label: 'SGST', value: inv.sgst }, { label: 'IGST', value: inv.igst },
          { label: 'GST invoiced', value: inv.gstAmount, total: true },
          { label: 'Invoice total', value: inv.total, total: true, final: true },
        ]} />
      </Section>
      <Section title="By month (booking date)"><Breakdown rows={d.byMonth} month countLabel="campaigns" /></Section>
      <Section title="By business"><Breakdown rows={d.byCompany} countLabel="campaigns" /></Section>
      {card === 'igst' && <Section title="By place of supply"><Breakdown rows={d.byPlace} countLabel="campaigns" /></Section>}
      <Section title="Top clients"><Breakdown rows={d.topClients} countLabel="campaigns" /></Section>
      <Section title={`Campaigns (${d.count})`} className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.rows} total={d.count} empty="No campaigns carry this tax in the period." defaultSort={{ key: tax, dir: 'desc' }} columns={[
          C.order, C.client, { key: 'gstin', label: 'GSTIN' }, C.booked, { key: 'place', label: 'Place of supply' }, { key: 'supply', label: 'Supply' },
          { key: 'taxable', label: 'Taxable', money: true, sum: true },
          { key: 'cgst', label: 'CGST', money: true, sum: true }, { key: 'sgst', label: 'SGST', money: true, sum: true },
          ...(card === 'cgstSgst' ? [{ key: 'cgstSgst', label: 'CGST + SGST', money: true, sum: true }] : []),
          { key: 'igst', label: 'IGST', money: true, sum: true },
          ...(s.mismatch ? [{ key: 'unsplit', label: 'Not split', money: true, sum: true }] : []),
          { key: 'gst', label: 'GST', money: true, sum: true },
          { key: 'total', label: 'Total', money: true, sum: true },
        ]} />
      </Section>
    </div>
  );
}

// ── TDS deducted ──────────────────────────────────────────────────────────────
function TdsBody({ d }) {
  const t = d.totals;
  return (
    <div className={DETAIL_GRID}>
      <Figures cols={4}>
        <Figure label="TDS deducted" value={money(t.tds)} accent="text-indigo-600" sub={`${d.count} payments with TDS`} />
        <Figure label="Gross credited" value={money(t.amount)} sub={`all ${t.payments} payments in the period`} />
        <Figure label="Net in bank" value={money(t.net)} accent="text-emerald-600" />
        <Figure label="Effective TDS rate" value={`${t.amount ? Math.round((t.tds / t.amount) * 1000) / 10 : 0}%`} sub="of everything collected" />
      </Figures>
      <Section title="How the number is built" note="Payments received in the period (by receipt date). The campaign is credited the gross; the client keeps the TDS and remits it to the government.">
        <Bridge steps={[
          { label: 'Gross credited to campaigns', value: t.amount, card: 'collected' },
          { label: 'TDS deducted by clients', value: t.tds, op: '−', accent: HL, col: 'tds' },
          { label: 'Net received in bank', value: t.net, op: '=', total: true, final: true },
        ]} />
        {Math.round(t.amount - t.tds - t.net) !== 0 && <Note>Gross − TDS differs from net received by <Money value={Math.round(t.amount - t.tds - t.net)} /> (net entered by hand on some payments).</Note>}
      </Section>
      <Section title="By client"><Breakdown rows={d.byClient} countLabel="payments" /></Section>
      <Section title="By month (receipt date)"><Breakdown rows={d.byMonth} month countLabel="payments" /></Section>
      <Section title="By TDS rate"><Breakdown rows={d.byRate} countLabel="payments" /></Section>
      <Section title={`Payments with TDS (${d.count})`} className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.rows} total={d.count} empty="No TDS deducted in this period." defaultSort={{ key: 'receivedAt', dir: 'desc' }} columns={[
          { key: 'receivedAt', label: 'Date', date: true },
          { key: 'orderNo', label: 'Campaign', render: (r) => orderLink(r.orderId, r.orderNo) },
          C.client, { key: 'mode', label: 'Mode' },
          { key: 'amount', label: 'Gross', money: true, sum: true },
          { key: 'tdsPct', label: 'TDS %', num: true, render: (r) => `${r.tdsPct}%` },
          { key: 'tds', label: 'TDS', money: true, sum: true },
          { key: 'net', label: 'Net', money: true, sum: true },
          { key: 'reference', label: 'Reference' },
        ]} />
      </Section>
    </div>
  );
}

// ── Clients ───────────────────────────────────────────────────────────────────
function ClientsBody({ d }) {
  const f = d.figures;
  return (
    <div className={DETAIL_GRID}>
      <Figures cols={4}>
        <Figure label="Clients on record" value={fmtNum(f.total)} sub="the tile — not limited by the period" />
        <Figure label="Ordered in the period" value={fmtNum(f.active)} accent="text-emerald-600" sub={<>booked <Money value={f.booked} /></>} />
        <Figure label="Repeat clients" value={fmtNum(f.repeat)} accent="text-brand" sub="2+ orders in the period (quotes count)" />
        <Figure label="New in the period" value={f.newInPeriod == null ? '—' : fmtNum(f.newInPeriod)} sub={`${f.dormant} with no orders in the period`} />
      </Figures>
      <Section title="Clients by activity"><Breakdown rows={d.byType} money={false} /></Section>
      <Section title="Booked by client category" className="xl:col-span-2"><Breakdown rows={d.byCategory} countLabel="clients" /></Section>
      <Section title={`All clients (${d.count})`} note="Booked = confirmed campaigns booked in the period (incl. GST); paid = payments against those campaigns."
        className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.rows} total={d.count} defaultSort={{ key: 'booked', dir: 'desc' }} columns={[
          { key: 'client', label: 'Client', render: (r) => clientLink(r.id, r.client) },
          { key: 'contact', label: 'Contact' }, { key: 'phone', label: 'Phone' }, { key: 'category', label: 'Category' },
          { key: 'orders', label: 'Orders', num: true, sum: true }, { key: 'campaigns', label: 'Campaigns', num: true, sum: true },
          { key: 'quotes', label: 'Quotes', num: true, sum: true },
          { key: 'booked', label: 'Booked', money: true, sum: true }, { key: 'paid', label: 'Paid', money: true, sum: true },
          { key: 'outstanding', label: 'Balance', money: true, sum: true },
          { key: 'lastBooking', label: 'Last booking', date: true },
          { key: 'repeat', label: 'Type', render: (r) => <span className={`badge ${r.repeat === 'Repeat' ? 'bg-emerald-100 text-emerald-800' : r.repeat === 'One-off' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>{r.repeat}</span> },
          { key: 'isNew', label: 'New', render: (r) => (r.isNew ? <span className="badge bg-amber-100 text-amber-800">New</span> : '') },
          { key: 'createdAt', label: 'Added', date: true },
        ]} />
      </Section>
    </div>
  );
}

// ── Top media type ────────────────────────────────────────────────────────────
function TopMediaBody({ d }) {
  const top = d.byType[0];
  return (
    <div className={DETAIL_GRID}>
      <Figures cols={3}>
        <Figure label="Top media type" value={d.topLabel || '—'} accent="text-brand" sub={d.headline ? `code ${d.headline}` : null} />
        <Figure label="Its site rent" value={money(top?.revenue || 0)} sub={`${top?.share || 0}% of ${'₹' + Number(d.totalRevenue).toLocaleString('en-IN')}`} />
        <Figure label="Its bookings" value={fmtNum(top?.bookings || 0)} sub={`of ${fmtNum(d.totalBookings)} site lines`} />
      </Figures>
      <Section title="How it's picked">
        <div className="text-sm text-slate-600">The media type with the most site rent (ex-GST) across every non-cancelled site line — the same lines as the Revenue by Media Type chart.</div>
        <Note>This tile is all-time: it isn't limited by the date range (only by business). The “In period” column shows the selected range for comparison.</Note>
      </Section>
      <Section title="Site rent by media type" className="xl:col-span-2"><Breakdown rows={d.byType.map((t) => ({ key: t.code, label: t.label, value: t.revenue, count: t.bookings }))} countLabel="lines" /></Section>
      <Section title="Media types" className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.byType} search={false} defaultSort={{ key: 'revenue', dir: 'desc' }} columns={[
          { key: 'label', label: 'Media type' }, { key: 'code', label: 'Code' },
          { key: 'inventory', label: 'Active sites', num: true, sum: true }, { key: 'sitesUsed', label: 'Sites booked', num: true, sum: true },
          { key: 'bookings', label: 'Site lines', num: true, sum: true }, { key: 'revenue', label: 'Site rent', money: true, sum: true },
          { key: 'share', label: 'Share', num: true, render: (r) => `${r.share}%` }, { key: 'avgPerBooking', label: 'Avg / line', money: true },
          { key: 'periodRevenue', label: 'In period', money: true, sum: true }, { key: 'periodBookings', label: 'Lines in period', num: true, sum: true },
        ]} />
      </Section>
      <Section title={`Sites (${d.count})`} className="md:col-span-2 xl:col-span-3">
        <DataTable rows={d.rows} total={d.count} defaultSort={{ key: 'revenue', dir: 'desc' }} columns={[
          { key: 'code', label: 'Site', render: (r) => siteLink(r.id, r.code) }, { key: 'location', label: 'Location' },
          { key: 'zone', label: 'Zone' }, { key: 'type', label: 'Type' },
          { key: 'bookings', label: 'Lines', num: true, sum: true }, { key: 'revenue', label: 'Site rent', money: true, sum: true },
        ]} />
      </Section>
    </div>
  );
}

const M = (v) => <Money value={v} />;
const comp = (title, explain) => ({ title, Body: ComponentBody, fmt: M, to: '/orders', explain });
const prof = (title, explain) => ({ title, Body: ProfitBody, fmt: M, to: '/orders', explain });
const recv = (title, explain) => ({ title, Body: ReceivablesBody, fmt: M, to: '/accounts?tab=receivables', toLabel: 'Receivables', asOfNow: true, explain });
const gst = (title, explain) => ({ title, Body: GstBody, fmt: M, to: '/invoices', toLabel: 'Invoices', explain });

export const REPORT_CARDS = {
  clients: {
    title: 'Clients', Body: ClientsBody, fmt: (v) => v, to: '/clients',
    explain: 'Every client on record. Repeat = 2+ orders (quotations included) booked in the period.',
  },
  bookedExGst: comp('Excluding GST', 'Taxable value of campaigns booked in the period — rent + printing + mounting + extras − discount, before GST.'),
  rental: comp('Rental', 'Site rent on campaigns booked in the period, before discount and GST.'),
  printing: comp('Printing', 'Printing charged to clients on campaigns booked in the period, before discount and GST.'),
  mounting: comp('Mounting', 'Mounting charged to clients on campaigns booked in the period, before discount and GST.'),
  profitRevenue: prof('Revenue (ex-GST)', 'Taxable value of confirmed, live and completed campaigns booked in the period.'),
  printCharged: prof('Printing charged', 'Printing billed to clients on confirmed, live and completed campaigns booked in the period.'),
  printCost: { ...prof('Printing cost', 'What we pay printing partners for those campaigns’ printing.'), to: '/accounts?tab=recon', toLabel: 'Printing Reconciliation' },
  printMargin: prof('Printing margin', 'Printing charged less printing cost, on confirmed, live and completed campaigns booked in the period.'),
  discounts: prof('Discounts given', 'Discounts on confirmed, live and completed campaigns booked in the period.'),
  recvTotal: recv('Receivables outstanding', 'Invoiced but unpaid on confirmed, live and completed campaigns, any booking date.'),
  recvCurrent: recv('Receivables · Not due', 'Unpaid invoices whose oldest due date hasn’t passed.'),
  recv1_30: recv('Receivables · 1–30 days', 'Unpaid, oldest invoice 1–30 days past due.'),
  recv31_60: recv('Receivables · 31–60 days', 'Unpaid, oldest invoice 31–60 days past due.'),
  recv61_90: recv('Receivables · 61–90 days', 'Unpaid, oldest invoice 61–90 days past due.'),
  recv90plus: recv('Receivables · 90+ days', 'Unpaid, oldest invoice more than 90 days past due.'),
  topMedia: {
    title: 'Top Media Type', Body: TopMediaBody, fmt: (v) => v || '—', to: '/reports/sites', toLabel: 'Site-wise report', allTime: true,
    explain: 'The media type earning the most site rent (ex-GST) across all non-cancelled site lines.',
  },
  gst: gst('GST Collected', 'GST on campaigns booked in the period (CGST + SGST + IGST), quotations and cancelled excluded.'),
  cgstSgst: gst('CGST + SGST', 'Intra-state GST on campaigns booked in the period.'),
  igst: gst('IGST', 'Inter-state GST on campaigns booked in the period.'),
  tds: {
    title: 'TDS Deducted', Body: TdsBody, fmt: M, to: '/payments', toLabel: 'Payments',
    explain: 'TDS clients deducted from payments received in the period (by receipt date).',
  },
};
