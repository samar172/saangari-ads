import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { Search, ArrowUp, ArrowDown, ChevronRight, X } from 'lucide-react';
import { Money } from './ui';

// Drill-down plumbing shared by every card dialog (provided by CardDetailDialog):
//  current       — the card kind on top of the dialog's stack;
//  canOpen(kind) — a card that can be pushed (exists, not already on the stack);
//  openCard(kind)— push it (same page params), cardTitle(kind) for labels;
//  focus/setFocus— { col, label }: tables with that column show only the rows
//                  carrying it, sorted by it, with a chip to clear.
export const DrillContext = createContext(null);
export const useDrill = () => useContext(DrillContext);

// Building blocks for the stat-card drill-down dialogs (Dashboard, Reports,
// Site-wise report, Booking Analysis): sections, share bars, a "how it's built"
// bridge and a searchable / sortable table with totals.

export const fmtDate = (d) => (d ? dayjs(d).format('D MMM YY') : '—');
export const fmtMonth = (k) => (k ? dayjs(`${k}-01`).format('MMM YY') : '—');
export const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');
export const fmtPct = (f) => (f == null || Number.isNaN(f) ? '—' : `${Math.round(f * 100)}%`);

const linkCls = 'font-medium text-brand hover:underline';
export const orderLink = (id, no) => (id ? <Link to={`/orders/${id}`} className={linkCls}>{no}</Link> : (no || '—'));
export const clientLink = (id, name) => (id ? <Link to={`/clients/${id}`} className="text-slate-700 hover:text-brand hover:underline">{name}</Link> : (name || '—'));
export const siteLink = (id, code) => (id ? <Link to={`/inventory/${id}`} className={linkCls}>{code}</Link> : (code || '—'));
export const invoiceLink = (id, no) => (id ? <Link to={`/invoices/${id}`} className={linkCls}>{no}</Link> : (no || '—'));

export function Section({ title, note, className = '', children }) {
  return (
    <div className={`card min-w-0 p-4 ${className}`}>
      <div className="mb-2 text-sm font-semibold text-slate-800">{title}</div>
      {note && <div className="-mt-1 mb-2 text-xs text-slate-500">{note}</div>}
      {children}
    </div>
  );
}

// label | value | share bar — for the by-business / by-month style splits.
// rows: [{ key, label, value, count? }]
export function Breakdown({ rows, money = true, month = false, countLabel, fmt }) {
  if (!rows?.length) return <div className="py-4 text-center text-sm text-slate-400">Nothing in this period.</div>;
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0) || 1;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-slate-700">{month ? fmtMonth(r.label) : r.label}</span>
            <span className="whitespace-nowrap font-medium text-slate-800">
              {fmt ? fmt(r.value) : money ? <Money value={r.value} /> : fmtNum(r.value)}
              {countLabel && <span className="ml-1.5 text-xs font-normal text-slate-400">{r.count} {countLabel}</span>}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-brand/70" style={{ width: `${Math.max(0, (r.value / total) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// "How the number is built": [{ label, value, op?, total?, final?, accent?, money?, text?, card?, col? }].
// A row with total:true is drawn as a subtotal line; the last one is the result.
// `card` opens that card kind on top of the dialog (when it can be opened from
// here); otherwise `col` focuses the dialog's tables on that column. A row with
// neither stays plain.
export function Bridge({ steps, money = true }) {
  const drill = useDrill();
  const target = (s) => {
    if (!drill) return null;
    if (s.card && drill.canOpen(s.card)) return { card: s.card, title: `Open ${drill.cardTitle(s.card)}` };
    // A ₹0 line has no rows behind it, so it only drills when it opens a card.
    if (s.col && (s.text != null || Number(s.value) !== 0)) return { col: s.col, title: `Show the rows behind “${s.label}”` };
    return null;
  };
  const go = (s, t) => (t.card ? drill.openCard(t.card) : drill.setFocus({ col: t.col, label: s.label }));
  return (
    <table className="w-full text-sm">
      <tbody>
        {steps.filter(Boolean).map((s, i) => {
          const t = target(s);
          const active = t?.col && drill?.focus?.col === t.col;
          const cls = `${s.total ? `border-t ${s.final ? 'border-t-2 border-slate-300 font-bold' : 'border-slate-200 font-semibold'}` : ''} ${s.accent || ''}`;
          const value = s.text != null ? s.text : (s.money ?? money) ? <Money value={s.value} /> : fmtNum(s.value);
          return (
            <tr
              key={`${s.label}-${i}`}
              className={`${cls}${t ? ' group cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none' : ''}${active ? ' bg-brand/5' : ''}`}
              {...(t ? {
                role: 'button', tabIndex: 0, title: t.title,
                'data-drill-card': t.card || undefined, 'data-drill-col': t.col || undefined,
                onClick: () => go(s, t),
                onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(s, t); } },
              } : {})}
            >
              <td className={`py-1 ${s.total ? '' : 'text-slate-600'}`}><span className="inline-block w-4 text-slate-400">{s.op || ''}</span>
                <span className={t ? 'group-hover:text-brand group-hover:underline decoration-dotted underline-offset-2' : ''}>{s.label}</span>
              </td>
              <td className="py-1 text-right tabular-nums whitespace-nowrap" data-bridge-value>
                {value}
                {t ? <ChevronRight size={12} className="ml-0.5 inline-block -mt-0.5 text-slate-300 group-hover:text-brand" /> : <span className="ml-0.5 inline-block w-3" />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const r2 = (n) => Math.round(n * 100) / 100;

// Searchable, sortable table.
// columns: [{ key, label, money?, num?, date?, month?, pct?, sum?, render? }]
// `sum` columns get a footer total over the rows currently shown (after search).
// `total` = the full record count when the server capped `rows`.
export function DataTable({ rows, columns, defaultSort, total, empty = 'No records.', search = true }) {
  const drill = useDrill();
  const initial = defaultSort || { key: columns[0].key, dir: 'asc' };
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initial);
  // A focused bridge line narrows this table when it has that column.
  const focus = drill?.focus && columns.some((c) => c.key === drill.focus.col) ? drill.focus : null;
  useEffect(() => {
    setSort(focus ? { key: focus.col, dir: 'desc', abs: true } : initial);
  }, [focus?.col]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let filtered = term
      ? rows.filter((r) => columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(term)))
      : rows;
    if (focus) filtered = filtered.filter((r) => (Number(r[focus.col]) || 0) !== 0);
    const col = columns.find((c) => c.key === sort.key);
    const val = (r) => {
      if (col?.date) return new Date(r[sort.key] || 0).getTime();
      const v = r[sort.key] ?? '';
      return sort.abs && typeof v === 'number' ? Math.abs(v) : v;
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, columns, q, sort, focus]);
  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  const right = (c) => c.money || c.num || c.pct;
  // Footer totals: `sum` columns, plus the focused column so a drilled line can be checked.
  const summed = (c) => c.sum || (focus && c.key === focus.col);
  const hasSum = columns.some(summed);
  const cell = (c, r) => (c.render ? c.render(r)
    : c.money ? <Money value={r[c.key]} />
      : c.date ? fmtDate(r[c.key])
        : c.month ? fmtMonth(r[c.key])
          : c.pct ? fmtPct(r[c.key])
            : c.num ? (r[c.key] == null ? '—' : fmtNum(r[c.key]))
              : (r[c.key] === '' || r[c.key] == null ? '—' : r[c.key]));

  return (
    <div {...(focus ? { 'data-focus-match': focus.col } : {})} className={focus ? 'scroll-mt-4' : ''}>
      {focus && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand" data-focus-chip>
          Showing rows with {focus.label}
          <button onClick={() => drill.setFocus(null)} className="inline-flex items-center gap-0.5 rounded-full px-1 hover:bg-brand/15" aria-label="Clear">
            · Clear <X size={12} />
          </button>
        </div>
      )}
      {search && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input py-1.5 pl-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="text-xs text-slate-500">
            {shown.length} shown{total != null && total > rows.length ? ` · first ${rows.length} of ${total}` : ''}
          </span>
        </div>
      )}
      {shown.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">{empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                {columns.map((c) => (
                  <th key={c.key} className={`whitespace-nowrap px-2 py-2 font-semibold ${right(c) ? 'text-right' : ''}`}>
                    <button onClick={() => toggle(c.key)} className="inline-flex items-center gap-0.5 hover:text-slate-800">
                      {c.label}
                      {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r, i) => (
                <tr key={r.id ?? i} className="hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c.key} className={`whitespace-nowrap px-2 py-1.5 ${right(c) ? 'text-right tabular-nums' : 'text-slate-700'}`}>{cell(c, r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {hasSum && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold text-slate-800">
                  {columns.map((c, i) => (
                    <td key={c.key} data-col={c.key} className={`whitespace-nowrap px-2 py-2 ${right(c) ? 'text-right tabular-nums' : ''}`}>
                      {summed(c) ? (c.money ? <Money value={r2(shown.reduce((s, r) => s + (Number(r[c.key]) || 0), 0))} /> : fmtNum(r2(shown.reduce((s, r) => s + (Number(r[c.key]) || 0), 0))))
                        : i === 0 ? `Total${shown.length !== rows.length || (total != null && total > rows.length) ? ' (shown)' : ''}` : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

export function Figure({ label, value, accent = 'text-slate-800', sub }) {
  return (
    <div className="card min-w-0 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// A row of Figures spanning the dialog grid.
export function Figures({ children, cols = 4 }) {
  const c = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4', 5: 'sm:grid-cols-3 lg:grid-cols-5' }[cols];
  return <div className={`grid grid-cols-1 gap-3 ${c} md:col-span-2 xl:col-span-3`}>{children}</div>;
}

export const Note = ({ children, tone = 'amber' }) => (
  <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${tone === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{children}</div>
);
