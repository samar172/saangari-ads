const dayjs = require('dayjs');
const { computeLine, applyOrderCharges } = require('./pricing');

// Billing plan: how a campaign is billed.
//   • One-time (no billing cycle) → one suggested period: the whole run.
//   • MONTHLY / QUARTERLY → one suggested period per cycle, anchored on the
//     campaign's first start date (17 Jul → 16 Aug, 17 Aug → 16 Sep, …).
// Any bill can instead cover a custom From → To range. A bill charges only the
// days of each site that fall inside its range, and no two live bills may
// overlap. Printing, mounting and add-ons (and a flat discount) go on the bill
// covering the campaign's first day; a % discount applies to every bill. The bill that completes the
// campaign's coverage settles any rounding, so the bills always add up to the
// campaign's taxable value exactly.

const BILLABLE = ['TENTATIVE', 'CONFIRMED', 'LIVE', 'COMPLETED', 'STOPPED'];
const CYCLE_MONTHS = { MONTHLY: 1, QUARTERLY: 3 };

const day = (d) => dayjs(d).startOf('day');
// Stored dates follow the bookings' convention: UTC midnight of the calendar
// day ('2027-01-01' → 2027-01-01T00:00Z), whatever the server's timezone.
const asStored = (d) => new Date(d.format('YYYY-MM-DD'));
const fmt = (d) => d.format('DD MMM YYYY');

// "1 Month", "3 Months", "15 Days" — billing uses flat 30-day months.
function durationLabel(days) {
  const d = Math.max(1, Number(days) || 1);
  if (d >= 30 && d % 30 === 0) { const m = d / 30; return `${m} Month${m > 1 ? 's' : ''}`; }
  return `${d} Day${d > 1 ? 's' : ''}`;
}

function billableLines(order) {
  const live = (order.items || []).filter((l) => BILLABLE.includes(l.status));
  // A cancelled campaign's lines are all CANCELLED — keep them so a reprint works.
  return live.length ? live : (order.status === 'CANCELLED' ? order.items || [] : []);
}

// The campaign's first and last day across its billable lines.
function campaignSpan(order) {
  const lines = billableLines(order);
  if (!lines.length) return null;
  return {
    start: lines.map((l) => day(l.startDate)).reduce((a, b) => (b.isBefore(a) ? b : a)),
    end: lines.map((l) => day(l.endDate)).reduce((a, b) => (b.isAfter(a) ? b : a)),
  };
}

function periodsFor(order) {
  const span = campaignSpan(order);
  if (!span) return [];
  const step = CYCLE_MONTHS[order.billingCycle];
  if (!step) return [{ index: 0, start: span.start, end: span.end }];
  const out = [];
  for (let i = 0; ; i++) {
    const start = span.start.add(i * step, 'month');
    if (start.isAfter(span.end)) break;
    let end = span.start.add((i + 1) * step, 'month').subtract(1, 'day');
    if (end.isAfter(span.end)) end = span.end;
    out.push({ index: i, start, end });
  }
  const unit = step === 3 ? 'Quarter' : 'Month';
  if (out.length > 1) out.forEach((p) => { p.label = `${unit} ${p.index + 1} of ${out.length}`; });
  return out;
}

const liveInvoices = (order) => (order.invoices || []).filter((i) => i.status !== 'CANCELLED');

// The date range each live invoice covers. An invoice from before billing
// periods existed (no periodStart) covered the whole campaign.
function invoiceRanges(order, invoices) {
  const span = campaignSpan(order);
  return invoices.map((inv) => ({
    inv,
    start: inv.periodStart ? day(inv.periodStart) : span?.start,
    end: inv.periodStart ? day(inv.periodEnd || inv.periodStart) : span?.end,
  })).filter((r) => r.start && r.end);
}

const overlaps = (a, b) => !a.start.isAfter(b.end) && !b.start.isAfter(a.end);

// Does the union of `ranges` cover every day from s to e?
function covered(ranges, s, e) {
  if (s.isAfter(e)) return true;
  let cursor = s;
  const sorted = [...ranges].sort((a, b) => a.start.valueOf() - b.start.valueOf());
  for (const r of sorted) {
    if (r.end.isBefore(cursor)) continue;
    if (r.start.isAfter(cursor)) return false;
    cursor = r.end.add(1, 'day');
    if (cursor.isAfter(e)) return true;
  }
  return cursor.isAfter(e);
}

// First day of the campaign not covered by any live invoice (null = all billed).
function firstUncovered(order, ranges) {
  const span = campaignSpan(order);
  if (!span) return null;
  let cursor = span.start;
  const sorted = [...ranges].sort((a, b) => a.start.valueOf() - b.start.valueOf());
  for (const r of sorted) {
    if (r.end.isBefore(cursor)) continue;
    if (r.start.isAfter(cursor)) return cursor;
    cursor = r.end.add(1, 'day');
  }
  return cursor.isAfter(span.end) ? null : cursor;
}

// Rent for the part of a line that falls inside [range.start, range.end].
// Whole months bill at the line's own monthly rate; loose lines per day.
function overlapOf(line, range) {
  const s = day(line.startDate).isAfter(range.start) ? day(line.startDate) : range.start;
  const e = day(line.endDate).isBefore(range.end) ? day(line.endDate) : range.end;
  if (s.isAfter(e)) return null;
  const whole = s.isSame(day(line.startDate)) && e.isSame(day(line.endDate));
  if (whole) return { from: s, till: e, days: line.days, amount: Math.round(line.subtotal) };
  const priced = computeLine({
    monthlyRate: line.days ? (line.subtotal * 30) / line.days : 0,
    dayRate: line.dayRate, billPerDay: line.type === 'LOOSE',
    startDate: s.toDate(), endDate: e.toDate(),
  });
  return { from: s, till: e, days: priced.days, amount: priced.subtotal };
}

// What has already been billed for a site line across the live invoices.
function billedForLine(invoices, lineId) {
  let sum = 0;
  for (const inv of invoices) for (const r of (Array.isArray(inv.lines) ? inv.lines : [])) {
    if (r.kind === 'SITE' && r.bookingId === lineId) sum += (r.qty || 1) * r.price;
  }
  return sum;
}

// Have the one-off charges (printing / mounting / add-ons / a flat discount)
// already gone on a live bill?
const extrasBilled = (invoices) => invoices.some((inv) => !inv.periodStart
  || (Array.isArray(inv.lines) && inv.lines.some((r) => r.kind === 'PRINT' || r.kind === 'ADDON' || (r.kind === 'DISCOUNT' && r.flat))));

// Printing & mounting rows. Per-site charges list per site (collapsed to
// "Qty × Price" when every site costs the same); otherwise the campaign's lump
// printing/mounting, as Qty × per-unit when it divides evenly.
function printMountRows(order) {
  const pm = Math.round((order.printingTotal || 0) + (order.mountingCost || 0));
  if (!pm) return [];
  const lines = billableLines(order);
  const label = order.printingTotal && order.mountingCost ? 'Print & Mount' : order.printingTotal ? 'Printing' : 'Mounting';
  if (order.chargesPerSite) {
    const per = lines.map((l) => ({ l, amt: Math.round((l.printCharge || 0) + (l.mountCharge || 0)) })).filter((x) => x.amt > 0);
    if (per.reduce((s, x) => s + x.amt, 0) === pm) {
      if (per.every((x) => x.amt === per[0].amt)) return [{ kind: 'PRINT', location: label, qty: per.length, price: per[0].amt }];
      return per.map((x) => ({ kind: 'PRINT', location: `${label} — ${x.l.site?.location || x.l.site?.code || ''}`, qty: 1, price: x.amt }));
    }
  }
  const qty = Number(order.noOfPrints) > 0 ? Number(order.noOfPrints) : Math.max(1, lines.length);
  return pm % qty === 0 ? [{ kind: 'PRINT', location: label, qty, price: pm / qty }] : [{ kind: 'PRINT', location: label, qty: 1, price: pm }];
}

// The suggested period label for a range, if it matches one exactly.
function labelFor(order, start, end) {
  const p = periodsFor(order).find((x) => x.start.isSame(start) && x.end.isSame(end));
  if (p) return p.label || null;
  return `Custom: ${fmt(start)} – ${fmt(end)}`;
}

// Build the bill for [start, end] given the OTHER live invoices.
// `roundingOnly`: when re-drafting an issued bill (in-window edit), the bill
// that completes coverage only absorbs rupee rounding — a campaign-wide change
// (e.g. a new discount %) must change this bill's own figures, not dump the
// whole campaign's difference onto it.
function draftForRange(order, start, end, others, label, { roundingOnly = false } = {}) {
  const span = campaignSpan(order);
  const ranges = invoiceRanges(order, others);
  const rows = [];
  for (const line of billableLines(order)) {
    const x = overlapOf(line, { start, end });
    if (!x) continue;
    // The slice that finishes a site (all its earlier days already billed)
    // takes the remainder, so a site's slices sum exactly to its subtotal.
    const ls = day(line.startDate), le = day(line.endDate);
    if (x.till.isSame(le) && !x.from.isSame(ls) && covered(ranges, ls, x.from.subtract(1, 'day'))) {
      x.amount = Math.round(line.subtotal) - billedForLine(others, line.id);
    }
    rows.push({
      kind: 'SITE', bookingId: line.id,
      location: line.site?.location || line.site?.code || '', code: line.site?.code || '',
      from: x.from.format('YYYY-MM-DD'), till: x.till.format('YYYY-MM-DD'),
      duration: durationLabel(x.days), qty: 1, price: x.amount,
    });
  }
  // One-off charges (printing, mounting, add-ons, a flat discount) belong to
  // the bill covering the campaign's first day — Month 1 — so every month's
  // amount stays the same whichever order the bills are raised in.
  const withExtras = !extrasBilled(others) && !!span && !start.isAfter(span.start);
  if (withExtras) {
    rows.push(...printMountRows(order));
    for (const a of order.addOns || []) {
      if (Number(a.amount)) rows.push({ kind: 'ADDON', location: a.label, qty: 1, price: Math.round(a.amount) });
    }
  }
  const pre = rows.reduce((s, r) => s + r.qty * r.price, 0);
  const charges = applyOrderCharges({
    rentalSubtotal: pre, addOnTotal: 0, printingTotal: 0, mountingTotal: 0,
    discountPct: order.discountFlat > 0 ? 0 : order.discountPct, discountFlat: withExtras ? Math.round(order.discountFlat || 0) : 0,
    taxCategory: order.taxCategory, interState: order.interState,
  });
  let discount = charges.discountAmount;
  let taxable = charges.taxableAmount;

  // The bill that completes the campaign's coverage settles it exactly.
  if (span && covered([...ranges, { start, end }], span.start, span.end)) {
    const target = Math.round(order.taxableAmount) - Math.round(others.reduce((s, i) => s + (i.amount || 0), 0));
    const diff = target - taxable;
    const small = Math.abs(diff) <= others.length + 2;
    if (diff && discount && small) { discount -= diff; taxable = target; }
    else if (diff && (!roundingOnly || small)) { rows.push({ kind: 'ADJUST', location: 'Adjustment', qty: 1, price: diff }); taxable = target; }
  }
  if (discount) {
    const pct = order.discountFlat > 0 ? '' : ` (${order.discountPct}%)`;
    rows.push({ kind: 'DISCOUNT', location: `Less: Discount${pct}`, qty: 1, price: -discount, ...(order.discountFlat > 0 ? { flat: true } : {}) });
  }
  return {
    label: label !== undefined ? label : labelFor(order, start, end),
    periodStart: asStored(start), periodEnd: asStored(end),
    rows, taxable,
  };
}

// Check a requested range and draft its bill. Returns { draft } or { error }.
function draftForCustom(order, startIn, endIn) {
  const span = campaignSpan(order);
  if (!span) return { error: `${order.orderNo} has no billable sites.` };
  let start = day(startIn), end = day(endIn);
  if (!start.isValid() || !end.isValid()) return { error: 'Pick a valid From and To date.' };
  if (start.isAfter(end)) return { error: 'From date must be on or before the To date.' };
  if (end.isBefore(span.start) || start.isAfter(span.end)) {
    return { error: `The campaign runs ${fmt(span.start)} – ${fmt(span.end)}; pick dates inside it.` };
  }
  // Clamp to the campaign so the bill's period reads true.
  if (start.isBefore(span.start)) start = span.start;
  if (end.isAfter(span.end)) end = span.end;
  const live = liveInvoices(order);
  const clash = invoiceRanges(order, live).find((r) => overlaps(r, { start, end }));
  if (clash) {
    return { error: `${fmt(start)} – ${fmt(end)} overlaps ${clash.inv.invoiceNo} (${fmt(clash.start)} – ${fmt(clash.end)}). Pick dates outside it, or cancel that invoice first.` };
  }
  return { draft: draftForRange(order, start, end, live) };
}

function billingPlan(order, custom) {
  const periods = periodsFor(order);
  const live = liveInvoices(order);
  const ranges = invoiceRanges(order, live);
  // Previews assume the open periods are billed in order, so printing/extras
  // show on the first one and the last one settles the total.
  const simulated = [];
  const out = periods.map((p) => {
    const hits = ranges.filter((r) => overlaps(r, p));
    const full = covered(ranges, p.start, p.end);
    const exact = hits.find((r) => r.start.isSame(p.start) && r.end.isSame(p.end)) || (full && hits.length === 1 ? hits[0] : null);
    const summary = (r) => ({ id: r.inv.id, invoiceNo: r.inv.invoiceNo, status: r.inv.status, total: r.inv.total, amount: r.inv.amount });
    return {
      index: p.index, label: p.label || null,
      periodStart: asStored(p.start), periodEnd: asStored(p.end),
      status: full ? 'BILLED' : hits.length ? 'PARTLY' : 'OPEN',
      invoice: exact ? summary(exact) : null,
      invoices: hits.map(summary),
      // `billNow`: the bill if this period is raised NOW (priced against the
      // bills that exist). `draft`: the preview assuming open periods are
      // billed in order — used for the plan table.
      billNow: hits.length ? null : draftForRange(order, p.start, p.end, live, p.label || null),
      draft: hits.length ? null : (() => {
        const d = draftForRange(order, p.start, p.end, [...live, ...simulated], p.label || null);
        simulated.push({ id: `sim${p.index}`, periodStart: d.periodStart, periodEnd: d.periodEnd, amount: d.taxable, lines: d.rows });
        return d;
      })(),
    };
  });
  const span = campaignSpan(order);
  const gap = firstUncovered(order, ranges);
  // That gap runs until the next bill starts (or the campaign ends).
  const nextBilled = gap ? ranges.filter((r) => r.start.isAfter(gap)).sort((a, b) => a.start.valueOf() - b.start.valueOf())[0] : null;
  const gapEnd = gap ? (nextBilled ? nextBilled.start.subtract(1, 'day') : span.end) : null;
  return {
    cycle: order.billingCycle || null,
    campaignStart: span ? asStored(span.start) : null,
    campaignEnd: span ? asStored(span.end) : null,
    periods: out,
    next: out.find((p) => p.status === 'OPEN') || null,
    // First unbilled day (also catches gaps left between custom bills).
    nextUnbilledDate: gap ? asStored(gap) : null,
    nextUnbilledEnd: gapEnd ? asStored(gapEnd) : null,
    fullyBilled: !gap,
    custom: custom && custom.start && custom.end ? draftForCustom(order, custom.start, custom.end) : undefined,
  };
}

// Re-draft an existing invoice's own range from the campaign's current
// commercials (in-window edit). An invoice from before billing periods
// existed covered the whole run.
function redraftFor(order, invoice) {
  const span = campaignSpan(order);
  const start = invoice.periodStart ? day(invoice.periodStart) : span.start;
  const end = invoice.periodStart ? day(invoice.periodEnd || invoice.periodStart) : span.end;
  const others = liveInvoices(order).filter((i) => i.id !== invoice.id);
  return draftForRange(order, start, end, others, invoice.periodLabel || null, { roundingOnly: true });
}

module.exports = { billingPlan, periodsFor, draftForRange, draftForCustom, redraftFor, durationLabel, BILLABLE };
