import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import dayjs from 'dayjs';
import api, { downloadFile } from '../api';
import { useCompany } from '../CompanyContext';
import { Money, Spinner, StatTile } from '../components/ui';

// Financial-year start (1 Apr).
const fyStart = () => (dayjs().month() >= 3 ? dayjs().month(3) : dayjs().subtract(1, 'year').month(3)).date(1);
// An Indian financial year (1 Apr Y → 31 Mar Y+1) as a range preset.
const fyRange = (y) => ({ label: `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`, from: () => dayjs(`${y}-04-01`), to: () => dayjs(`${y + 1}-03-31`) });
const RANGES = {
  MONTH: { label: 'This month', from: () => dayjs().startOf('month'), to: () => dayjs() },
  FY: { label: 'This FY', from: () => fyStart(), to: () => dayjs() },
  LAST_FY: { label: 'Last FY', from: () => fyStart().subtract(1, 'year'), to: () => fyStart().subtract(1, 'day') },
  FY_2024: fyRange(2024),
  FY_2025: fyRange(2025),
  FY_2026: fyRange(2026),
  ALL: { label: 'All time', from: () => null, to: () => null },
};

const pct = (f) => (f == null || Number.isNaN(f) ? '—' : `${Math.round(f * 100)}%`);
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
const TABS = ['Month-wise', 'Category-wise', 'Customer-wise', 'Payment Status', 'Pending Follow-up'];

export default function BookingAnalysis() {
  const { companies, activeCompany } = useCompany();
  const [localCid, setLocalCid] = useState(activeCompany?.id || 'ALL');
  const [rangeKey, setRangeKey] = useState('FY');
  const [category, setCategory] = useState('');
  const [customer, setCustomer] = useState('');
  const [zone, setZone] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('Month-wise');

  const cid = localCid === 'ALL' ? undefined : localCid;
  const r = RANGES[rangeKey];
  const from = r.from() ? r.from().format('YYYY-MM-DD') : undefined;
  const to = r.to() ? r.to().format('YYYY-MM-DD') : undefined;

  useEffect(() => {
    if (activeCompany && localCid !== 'ALL' && localCid !== activeCompany.id) setLocalCid(activeCompany.id);
  }, [activeCompany]);

  const params = { companyId: cid, from, to, category: category || undefined, customer: customer || undefined, zone: zone || undefined, paymentStatus: paymentStatus || undefined, paymentTerms: paymentTerms || undefined };

  useEffect(() => {
    setData(null);
    api.get('/reports/booking-analysis', { params }).then((res) => setData(res.data)).catch(() => setData(null));
  }, [cid, from, to, category, customer, zone, paymentStatus, paymentTerms]);

  function exportExcel() {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
    downloadFile(`/exports/booking-analysis?${qs.toString()}`, 'FY_Booking_Analysis.xlsx');
  }

  const filters = data?.filters || { categories: [], customers: [], zones: [] };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Booking Analysis</h1>
          <p className="text-sm text-slate-500">Site-month booking analysis — {RANGES[rangeKey].label}</p>
        </div>
        <button className="btn-accent text-sm flex items-center gap-1.5" onClick={exportExcel}>
          <Download size={16} /> Export Excel
        </button>
      </div>

      {/* Filter bar */}
      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto py-1.5" value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} title="Period">
          {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input w-auto py-1.5" value={localCid} onChange={(e) => setLocalCid(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))} title="Business">
          <option value="ALL">All Businesses</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-auto py-1.5" value={category} onChange={(e) => setCategory(e.target.value)} title="Category">
          <option value="">All categories</option>
          {filters.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input w-auto py-1.5" value={customer} onChange={(e) => setCustomer(e.target.value)} title="Customer">
          <option value="">All customers</option>
          {filters.customers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input w-auto py-1.5" value={zone} onChange={(e) => setZone(e.target.value)} title="Zone">
          <option value="">All zones</option>
          {filters.zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <select className="input w-auto py-1.5" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} title="Payment status">
          <option value="">All statuses</option>
          {['Received', 'Partial', 'Pending'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input w-auto py-1.5" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} title="Payment terms">
          <option value="">All terms</option>
          <option value="ADVANCE">Advance</option>
          <option value="POSTPAID">Postpaid</option>
        </select>
      </div>

      {!data ? <Spinner /> : (
        <>
          {/* Dashboard KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <StatTile label="Bookings" value={num(data.dashboard.bookings)} sub="site bookings" />
            <StatTile label="Customers" value={num(data.dashboard.customers)} sub="with ≥1 booking" />
            <StatTile label="Site-Months" value={num(data.dashboard.siteMonths)} accent="text-brand" />
            <StatTile label="Billing ex-GST" value={<Money value={data.dashboard.billingExGst} />} accent="text-slate-700" sub="taxable value" />
            <StatTile label="GST" value={<Money value={data.dashboard.gst} />} />
            <StatTile label="Total Billing" value={<Money value={data.dashboard.totalBilling} />} accent="text-emerald-600" sub="incl. GST" />
            <StatTile label="Received" value={<Money value={data.dashboard.received} />} accent="text-emerald-600" />
            <StatTile label="Outstanding" value={<Money value={data.dashboard.outstanding} />} accent="text-red-600" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <StatTile label="Collection %" value={pct(data.dashboard.collectionPct)} accent="text-brand" />
            <StatTile label="Avg Billing / Booking" value={<Money value={data.dashboard.avgBillingPerBooking} />} sub="ex-GST" />
            <StatTile label="Avg Rate / Site-Month" value={<Money value={data.dashboard.avgRatePerSiteMonth} />} sub="ex-GST" />
            <StatTile label="Advance Bookings %" value={pct(data.dashboard.advancePct)} />
            <StatTile label="Top Category" value={data.dashboard.topCategory || '—'} accent="text-brand" sub="by billing" />
            <StatTile label="Best Month" value={data.dashboard.bestMonth || '—'} sub="by billing" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-200 mb-3 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === t ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t}</button>
            ))}
          </div>

          <div className="card overflow-x-auto">
            {tab === 'Month-wise' && (
              <Table
                head={['Month', 'Bookings', 'Site-Months', 'Cust. Billed', 'New Cust.', 'Billing ex-GST', 'GST', 'Total', 'Received', 'Outstanding', 'Collection %', 'MoM', 'Share of Yr']}
                rows={data.monthwise}
                cells={(m) => [m.label, num(m.bookings), num(m.siteMonths), num(m.customersBilled), num(m.newCustomers), <Money value={m.billingExGst} />, <Money value={m.gst} />, <Money value={m.total} />, <Money value={m.received} />, <Money value={m.outstanding} />, pct(m.collectionPct), pct(m.momGrowth), pct(m.shareOfYear)]}
                numeric={[1,2,3,4,5,6,7,8,9,10,11,12]}
              />
            )}
            {tab === 'Category-wise' && (
              <Table
                head={['Category', 'Bookings', 'Customers', 'Site-Months', 'Billing ex-GST', 'Share', 'GST', 'Total', 'Received', 'Outstanding', 'Collection %', 'Avg Rate/SM', 'Avg Bill/Bk']}
                rows={data.categorywise}
                cells={(c) => [c.category, num(c.bookings), num(c.customers), num(c.siteMonths), <Money value={c.billingExGst} />, pct(c.shareOfBilling), <Money value={c.gst} />, <Money value={c.total} />, <Money value={c.received} />, <Money value={c.outstanding} />, pct(c.collectionPct), <Money value={c.avgRatePerSiteMonth} />, <Money value={c.avgBillingPerBooking} />]}
                numeric={[1,2,3,4,5,6,7,8,9,10,11,12]}
              />
            )}
            {tab === 'Customer-wise' && (
              <Table
                head={['#', 'Customer', 'Category', 'Contact', 'Phone', 'Bookings', 'First', 'Last', 'Site-Months', 'Billing ex-GST', 'GST', 'Total', 'Received', 'Outstanding', 'Coll. %', 'Status']}
                rows={data.customerwise}
                cells={(c) => [c.rank, c.customer, c.category, c.contact, c.phone, num(c.bookings), c.firstMonth, c.lastMonth, num(c.siteMonths), <Money value={c.billingExGst} />, <Money value={c.gst} />, <Money value={c.total} />, <Money value={c.received} />, <Money value={c.outstanding} />, pct(c.collectionPct), c.paymentStatus]}
                numeric={[5,8,9,10,11,12,13,14]}
              />
            )}
            {tab === 'Payment Status' && (
              <Table
                head={['Payment Status', 'Bookings', 'Total Billing', 'Received', 'Outstanding', 'Share', 'Customers']}
                rows={data.paymentStatus}
                cells={(p) => [p.status, num(p.bookings), <Money value={p.totalBilling} />, <Money value={p.received} />, <Money value={p.outstanding} />, pct(p.shareOfBilling), num(p.customers)]}
                numeric={[1,2,3,4,5,6]}
              />
            )}
            {tab === 'Pending Follow-up' && (
              <Table
                head={['#', 'Customer', 'Category', 'Contact', 'Phone', 'Outstanding', 'Oldest Due', 'Bookings Due']}
                rows={data.pendingFollowup}
                cells={(p) => [p.rank, p.customer, p.category, p.contact, p.phone, <Money value={p.outstanding} />, p.oldestDueMonth, num(p.bookingsDue)]}
                numeric={[5,7]}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Table({ head, rows, cells, numeric = [] }) {
  const numSet = new Set(numeric);
  return (
    <table className="w-full min-w-[720px] text-sm">
      <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
        <tr>{head.map((h, i) => <th key={i} className={`px-3 py-2 ${numSet.has(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {(rows || []).map((row, ri) => {
          const c = cells(row);
          return (
            <tr key={ri} className="border-t border-slate-100 hover:bg-slate-50">
              {c.map((cell, ci) => <td key={ci} className={`px-3 py-1.5 ${numSet.has(ci) ? 'text-right' : 'text-left'}`}>{cell === '' || cell == null ? <span className="text-slate-300">—</span> : cell}</td>)}
            </tr>
          );
        })}
        {(!rows || rows.length === 0) && <tr><td colSpan={head.length} className="px-3 py-10 text-center text-slate-400">No data for these filters</td></tr>}
      </tbody>
    </table>
  );
}
