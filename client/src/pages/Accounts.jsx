import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { BookOpen, Users, NotebookPen, Plus } from 'lucide-react';
import api from '../api';
import { useCompany } from '../CompanyContext';
import { useAuth, can } from '../auth';
import { Money, Spinner, StatTile } from '../components/ui';

// A ledger balance shown the accounting way: absolute value + Dr/Cr, never a
// bare minus. Dr = the party owes us (receivable); Cr = they're in advance (an
// advance payment before invoicing sits here until the invoice squares it off).
function Bal({ value }) {
  const v = Math.round(value || 0);
  if (v === 0) return <span className="text-slate-500"><Money value={0} /></span>;
  const cr = v < 0;
  return <span className={cr ? 'text-emerald-600' : 'text-red-600'}><Money value={Math.abs(v)} /> {cr ? 'Cr' : 'Dr'}</span>;
}

// Financial-year start (1 Apr) for the current year — mirrors Reports.jsx.
const fyStart = () => (dayjs().month() >= 3 ? dayjs().month(3) : dayjs().subtract(1, 'year').month(3)).date(1);
const RANGES = {
  MONTH: { label: 'This month', from: () => dayjs().startOf('month'), to: () => dayjs() },
  // Explicit financial-year picks (Apr 1 → Mar 31).
  FY_2025: { label: 'FY 2025-26', from: () => dayjs('2025-04-01'), to: () => dayjs('2026-03-31') },
  FY_2026: { label: 'FY 2026-27', from: () => dayjs('2026-04-01'), to: () => dayjs('2027-03-31') },
  ALL: { label: 'All time', from: () => null, to: () => null },
};

const KINDS = [
  ['CREDIT_NOTE', 'Credit note', 'CREDIT'],
  ['DEBIT_NOTE', 'Debit note', 'DEBIT'],
  ['ADJUSTMENT', 'Adjustment', 'CREDIT'],
  ['OPENING', 'Opening balance', 'DEBIT'],
];

const TABS = [
  ['receivables', 'Receivables', Users],
  ['statement', 'Party statement', BookOpen],
  ['daybook', 'Day book', NotebookPen],
  ['financials', 'Financials', BookOpen],
];

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Accounts() {
  const { companies, activeCompany } = useCompany();
  const { user } = useAuth();
  const [localCid, setLocalCid] = useState(activeCompany?.id || 'ALL');
  const [rangeKey, setRangeKey] = useState('FY_2026');
  const [tab, setTab] = useState('receivables');
  const [clients, setClients] = useState([]);
  const [partyId, setPartyId] = useState('');
  const [postOpen, setPostOpen] = useState(false);

  const cid = localCid === 'ALL' ? undefined : localCid;
  const r = RANGES[rangeKey];
  const from = r.from() ? r.from().format('YYYY-MM-DD') : undefined;
  const to = r.to() ? r.to().format('YYYY-MM-DD') : undefined;

  const canPost = can(user, 'manageLedger');

  useEffect(() => {
    if (activeCompany && localCid !== 'ALL' && localCid !== activeCompany.id) setLocalCid(activeCompany.id);
  }, [activeCompany]);

  useEffect(() => { api.get('/clients').then((res) => setClients(res.data)).catch(() => setClients([])); }, []);

  // Bump this to force child panels to re-fetch after a journal entry is posted.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  function openStatement(clientId) { setPartyId(String(clientId)); setTab('statement'); }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Accounts &amp; Ledger</h1>
          <p className="text-sm text-slate-500">{localCid === 'ALL' ? 'Combined across all companies' : `${companies.find((c) => c.id === Number(localCid))?.name || ''} — party ledgers & receivables`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab !== 'receivables' && (
            <select className="input w-auto py-1.5" value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} title="Date range">
              {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
          <select className="input w-auto py-1.5" value={localCid} onChange={(e) => setLocalCid(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}>
            <option value="ALL">All Companies (Combined)</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {canPost && (
            <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setPostOpen(true)}><Plus size={16} /> Post entry</button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 transition ${tab === k ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'receivables' && <Receivables cid={cid} refreshKey={refreshKey} onOpenParty={openStatement} />}
      {tab === 'statement' && (
        <Statement cid={cid} from={from} to={to} clients={clients} partyId={partyId} setPartyId={setPartyId} refreshKey={refreshKey} />
      )}
      {tab === 'daybook' && <DayBook cid={cid} from={from} to={to} refreshKey={refreshKey} />}
      {tab === 'financials' && <Financials cid={cid} from={from} to={to} refreshKey={refreshKey} />}

      {postOpen && (
        <PostEntryModal clients={clients} defaultCompanyId={cid} onClose={() => setPostOpen(false)} onSaved={() => { setPostOpen(false); refresh(); }} />
      )}
    </div>
  );
}

// ---- Receivables (trial balance) ----
function Receivables({ cid, refreshKey, onOpenParty }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('balDesc'); // balDesc | balAsc | nameAsc
  useEffect(() => {
    setData(null);
    api.get('/accounts/parties', { params: { companyId: cid } }).then((r) => setData(r.data)).catch(() => setData({ parties: [], totals: { debit: 0, credit: 0, balance: 0 } }));
  }, [cid, refreshKey]);

  if (!data) return <Spinner />;
  const allParties = data.parties || [];
  // Stat tiles reflect the whole book; the table reflects the search/sort.
  const receivable = allParties.filter((p) => p.balance > 0).reduce((s, p) => s + p.balance, 0);
  const advance = allParties.filter((p) => p.balance < 0).reduce((s, p) => s + Math.abs(p.balance), 0);

  const needle = q.trim().toLowerCase();
  const parties = allParties
    .filter((p) => !needle || (p.name || '').toLowerCase().includes(needle))
    .sort((a, b) => (sort === 'nameAsc' ? (a.name || '').localeCompare(b.name || '') : sort === 'balAsc' ? a.balance - b.balance : b.balance - a.balance));

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatTile label="Total receivable" value={<Money value={receivable} />} accent="text-red-600" sub={`${allParties.filter((p) => p.balance > 0).length} parties owe`} />
        <StatTile label="Advances held" value={<Money value={advance} />} accent="text-emerald-600" sub={`${allParties.filter((p) => p.balance < 0).length} in credit`} />
        <StatTile label="Total billed" value={<Money value={data.totals?.debit || 0} />} sub="debits" />
        <StatTile label="Total received" value={<Money value={data.totals?.credit || 0} />} sub="credits" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input className="input w-full sm:w-64" placeholder="Search party name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)} title="Sort">
          <option value="balDesc">Balance: high → low</option>
          <option value="balAsc">Balance: low → high</option>
          <option value="nameAsc">Name: A → Z</option>
        </select>
        <span className="text-xs text-slate-400">{parties.length} of {allParties.length}</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Party</th>
              <th className="px-4 py-2 text-right">Debit (billed)</th>
              <th className="px-4 py-2 text-right">Credit (received)</th>
              <th className="px-4 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {parties.map((p) => (
              <tr key={p.clientId} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => onOpenParty(p.clientId)}>
                <td className="px-4 py-2 font-medium text-slate-800">{p.name}</td>
                <td className="px-4 py-2 text-right"><Money value={p.debit} /></td>
                <td className="px-4 py-2 text-right text-emerald-700"><Money value={p.credit} /></td>
                <td className={`px-4 py-2 text-right font-semibold ${p.balance > 0 ? 'text-red-600' : p.balance < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                  <Money value={Math.abs(p.balance)} />{p.balance < 0 ? ' Cr' : p.balance > 0 ? ' Dr' : ''}
                </td>
              </tr>
            ))}
            {parties.length === 0 && <tr><td colSpan="4" className="px-4 py-10 text-center text-slate-400">No ledger activity yet.</td></tr>}
          </tbody>
          {parties.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold text-sm">
              <tr>
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right"><Money value={data.totals?.debit || 0} /></td>
                <td className="px-4 py-2 text-right text-emerald-700"><Money value={data.totals?.credit || 0} /></td>
                <td className="px-4 py-2 text-right"><Bal value={data.totals?.balance || 0} /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Balance = billed (debit) − received (credit). Dr = the party owes you; Cr = they're in advance. Tap a row for the full statement.</p>
    </div>
  );
}

// ---- Party statement (running balance) ----
function Statement({ cid, from, to, clients, partyId, setPartyId, refreshKey }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!partyId) { setData(null); return; }
    setData(null);
    api.get(`/accounts/party/${partyId}`, { params: { companyId: cid, from, to } }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [partyId, cid, from, to, refreshKey]);

  return (
    <div>
      <div className="mb-4 max-w-sm">
        <label className="label">Party</label>
        <select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          <option value="">Select a client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
        </select>
      </div>

      {!partyId ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">Pick a party to see its statement of account.</div>
      ) : !data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <StatTile label="Opening balance" value={<Money value={data.opening || 0} />} />
            <StatTile label="Closing balance" value={<Money value={Math.abs(data.closing || 0)} />} accent={(data.closing || 0) > 0 ? 'text-red-600' : 'text-emerald-600'} sub={(data.closing || 0) > 0 ? 'receivable' : (data.closing || 0) < 0 ? 'in advance' : 'settled'} />
            <StatTile label="Entries" value={(data.entries || []).length} />
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Particulars</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100 text-slate-500">
                  <td className="px-4 py-1.5" colSpan="4">Opening balance</td>
                  <td className="px-4 py-1.5 text-right"><Bal value={data.opening || 0} /></td>
                </tr>
                {(data.entries || []).map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-4 py-1.5 whitespace-nowrap text-slate-500">{fmtDate(e.date)}</td>
                    <td className="px-4 py-1.5">{e.narration}{e.invoiceNo ? <span className="text-slate-400"> · {e.invoiceNo}</span> : ''}</td>
                    <td className="px-4 py-1.5 text-right">{e.debit ? <Money value={e.debit} /> : '—'}</td>
                    <td className="px-4 py-1.5 text-right text-emerald-700">{e.credit ? <Money value={e.credit} /> : '—'}</td>
                    <td className="px-4 py-1.5 text-right font-medium"><Bal value={e.balance} /></td>
                  </tr>
                ))}
                {(data.entries || []).length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-400">No entries in this period.</td></tr>}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold">
                <tr>
                  <td className="px-4 py-2" colSpan="4">Closing balance</td>
                  <td className="px-4 py-2 text-right"><Bal value={data.closing || 0} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Day book (all entries chronologically) ----
function DayBook({ cid, from, to, refreshKey }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    setData(null);
    api.get('/accounts/daybook', { params: { companyId: cid, from, to } }).then((r) => setData(r.data)).catch(() => setData({ entries: [], totalDebit: 0, totalCredit: 0 }));
  }, [cid, from, to, refreshKey]);

  if (!data) return <Spinner />;
  const needle = q.trim().toLowerCase();
  const entries = (data.entries || []).filter((e) => !needle || (e.clientName || '').toLowerCase().includes(needle));
  return (
   <div>
    <div className="flex items-center gap-2 mb-3">
      <input className="input w-full sm:w-64" placeholder="Search party name…" value={q} onChange={(e) => setQ(e.target.value)} />
      <span className="text-xs text-slate-400">{entries.length} of {(data.entries || []).length} entries</span>
    </div>
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            <th className="px-4 py-2 text-left">Date</th>
            <th className="px-4 py-2 text-left">Party</th>
            <th className="px-4 py-2 text-left">Particulars</th>
            <th className="px-4 py-2 text-right">Debit</th>
            <th className="px-4 py-2 text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-slate-100">
              <td className="px-4 py-1.5 whitespace-nowrap text-slate-500">{fmtDate(e.date)}</td>
              <td className="px-4 py-1.5 font-medium text-slate-700">{e.clientName}</td>
              <td className="px-4 py-1.5 text-slate-600">{e.narration}</td>
              <td className="px-4 py-1.5 text-right">{e.debit ? <Money value={e.debit} /> : '—'}</td>
              <td className="px-4 py-1.5 text-right text-emerald-700">{e.credit ? <Money value={e.credit} /> : '—'}</td>
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan="5" className="px-4 py-10 text-center text-slate-400">No entries in this period.</td></tr>}
        </tbody>
        {entries.length > 0 && (
          <tfoot className="bg-slate-50 font-semibold text-sm">
            <tr>
              <td className="px-4 py-2" colSpan="3">Total</td>
              <td className="px-4 py-2 text-right"><Money value={data.totalDebit || 0} /></td>
              <td className="px-4 py-2 text-right text-emerald-700"><Money value={data.totalCredit || 0} /></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
   </div>
  );
}

// ---- Post a manual journal entry (credit/debit note, adjustment, opening) ----
// Financial statements — P&L (accrual, ex-GST, confirmed bookings in the period)
// + a working-capital position. Honest scope note surfaced from the API.
function Financials({ cid, from, to, refreshKey }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    api.get('/accounts/financials', { params: { companyId: cid, from, to } }).then((r) => setD(r.data)).catch(() => setD(null));
  }, [cid, from, to, refreshKey]);
  if (!d) return <Spinner />;
  const p = d.pnl, pos = d.position;
  const Row = ({ k, v, bold, indent, accent }) => (
    <div className={`flex justify-between py-1.5 ${bold ? 'font-semibold border-t border-slate-200 mt-1 pt-2' : ''} ${indent ? 'pl-4 text-slate-600' : ''}`}>
      <span>{k}</span><span className={accent || ''}><Money value={v} /></span>
    </div>
  );
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Profit & Loss (ex-GST)</div>
        <div className="text-sm">
          <div className="text-slate-400 text-xs uppercase mt-1">Revenue</div>
          <Row k="Rental" v={p.revenue.rental} indent />
          <Row k="Printing" v={p.revenue.printing} indent />
          <Row k="Mounting" v={p.revenue.mounting} indent />
          <Row k="Add-ons / other" v={p.revenue.addons} indent />
          <Row k="Gross revenue" v={p.revenue.grossExGst} bold />
          <Row k="Less: discounts" v={-p.discounts} indent accent="text-amber-600" />
          <Row k="Net revenue" v={p.netRevenueExGst} bold />
          <div className="text-slate-400 text-xs uppercase mt-3">Direct costs</div>
          <Row k="Printing (paid to partners)" v={-p.directCosts.printing} indent accent="text-slate-600" />
          <Row k={`Gross profit (${Math.round(p.grossMarginPct * 100)}% margin)`} v={p.grossProfit} bold accent={p.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'} />
        </div>
        <p className="text-[11px] text-slate-400 mt-3 leading-tight">{p.note}</p>
      </div>
      <div className="card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Position (as of today)</div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Receivable" value={<Money value={pos.receivable} />} accent="text-red-600" sub="invoiced − received" />
          <StatTile label="Received" value={<Money value={pos.received} />} accent="text-emerald-600" sub={`of ₹${(pos.invoiced || 0).toLocaleString('en-IN')} invoiced`} />
          <StatTile label="GST collected" value={<Money value={pos.gstCollected} />} sub="output GST" />
          <StatTile label="Partner payable" value={<Money value={pos.partnerPayable} />} accent={pos.partnerPayable > 0 ? 'text-red-600' : 'text-slate-700'} sub={`paid ₹${(pos.partnerPaid || 0).toLocaleString('en-IN')}`} />
        </div>
        <p className="text-[11px] text-slate-400 mt-3 leading-tight">{pos.note}</p>
      </div>
    </div>
  );
}

function PostEntryModal({ clients, defaultCompanyId, onClose, onSaved }) {
  const [clientId, setClientId] = useState('');
  const [kind, setKind] = useState('CREDIT_NOTE');
  const [type, setType] = useState('CREDIT');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Picking a kind sets a sensible default direction; the user can still flip it.
  function pickKind(k) {
    setKind(k);
    const def = KINDS.find((x) => x[0] === k)?.[2];
    if (def) setType(def);
  }

  async function submit(e) {
    e.preventDefault();
    if (!clientId) { setErr('Select a party'); return; }
    if (!(Number(amount) > 0)) { setErr('Enter an amount'); return; }
    if (!narration.trim()) { setErr('Add a narration'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/accounts/journal', {
        clientId: Number(clientId), type, amount: Number(amount), narration: narration.trim(), kind,
        companyId: defaultCompanyId || undefined, date: date || undefined,
      });
      onSaved();
    } catch (e2) { setErr(e2.response?.data?.error || 'Could not post the entry'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md my-auto space-y-4">
        <h2 className="text-xl font-bold">Post ledger entry</h2>
        <div>
          <label className="label">Party</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Kind</label>
            <select className="input" value={kind} onChange={(e) => pickKind(e.target.value)}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Direction</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="DEBIT">Debit (party owes more)</option>
              <option value="CREDIT">Credit (reduce what they owe)</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Amount (₹)</label>
            <input type="number" min="1" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" max={dayjs().format('YYYY-MM-DD')} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Narration</label>
          <input className="input" placeholder="e.g. Credit note — overcharge on SO-00012" value={narration} onChange={(e) => setNarration(e.target.value)} required />
        </div>
        {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Post entry'}</button>
        </div>
      </form>
    </div>
  );
}
