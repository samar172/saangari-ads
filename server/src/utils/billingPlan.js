const dayjs = require('dayjs');
const { computeLine, applyOrderCharges } = require('./pricing');

// Billing plan: how a campaign is split into bills.
//   • One-time (no billing cycle) → a single bill for the whole run.
//   • MONTHLY / QUARTERLY → one bill per cycle period, anchored on the
//     campaign's first start date (17 Jul → 16 Aug, 17 Aug → 16 Sep, …).
// Each period bills only the days of each site that fall inside it. Printing,
// mounting and add-ons go on the first bill; a % discount applies to every
// bill, a flat discount to the first. The last bill absorbs any rounding (and
// any re-pricing after earlier bills were issued) so the bills always add up to
// the campaign's taxable value exactly.

const BILLABLE = ['TENTATIVE', 'CONFIRMED', 'LIVE', 'COMPLETED', 'STOPPED'];
const CYCLE_MONTHS = { MONTHLY: 1, QUARTERLY: 3 };

const day = (d) => dayjs(d).startOf('day');
// Stored dates follow the bookings' convention: UTC midnight of the calendar
// day ('2027-01-01' → 2027-01-01T00:00Z), whatever the server's timezone.
const asStored = (d) => new Date(d.format('YYYY-MM-DD'));

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

function periodsFor(order) {
  const lines = billableLines(order);
  if (!lines.length) return [];
  const anchor = lines.map((l) => day(l.startDate)).reduce((a, b) => (b.isBefore(a) ? b : a));
  const last = lines.map((l) => day(l.endDate)).reduce((a, b) => (b.isAfter(a) ? b : a));
  const step = CYCLE_MONTHS[order.billingCycle];
  if (!step) return [{ index: 0, start: anchor, end: last }];

  const out = [];
  for (let i = 0; ; i++) {
    const start = anchor.add(i * step, 'month');
    if (start.isAfter(last)) break;
    let end = anchor.add((i + 1) * step, 'month').subtract(1, 'day');
    if (end.isAfter(last)) end = last;
    out.push({ index: i, start, end });
  }
  const unit = step === 3 ? 'Quarter' : 'Month';
  if (out.length > 1) out.forEach((p) => { p.label = `${unit} ${p.index + 1} of ${out.length}`; });
  return out;
}

// Rent for the part of a line that falls inside [pStart, pEnd]. Whole months
// bill at the line's own monthly rate; loose (per-day) lines at their day rate.
function overlapOf(line, p) {
  const s = day(line.startDate).isAfter(p.start) ? day(line.startDate) : p.start;
  const e = day(line.endDate).isBefore(p.end) ? day(line.endDate) : p.end;
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

// Rental rows for every period, with each line's last slice taking the
// remainder so a site's slices sum exactly to its subtotal.
function rentalRowsByPeriod(order, periods) {
  const rows = periods.map(() => []);
  for (const line of billableLines(order)) {
    const slices = periods.map((p) => overlapOf(line, p));
    const lastIdx = slices.map((x, i) => (x ? i : -1)).filter((i) => i >= 0).pop();
    if (lastIdx === undefined) continue;
    const before = slices.reduce((s, x, i) => s + (x && i !== lastIdx ? x.amount : 0), 0);
    slices[lastIdx].amount = Math.round(line.subtotal) - before;
    slices.forEach((x, i) => {
      if (!x) return;
      rows[i].push({
        kind: 'SITE', bookingId: line.id,
        location: line.site?.location || line.site?.code || '', code: line.site?.code || '',
        from: x.from.format('YYYY-MM-DD'), till: x.till.format('YYYY-MM-DD'),
        duration: durationLabel(x.days), qty: 1, price: x.amount,
      });
    });
  }
  return rows;
}

// Printing & mounting rows for the first bill. Per-site charges list per site
// (collapsed to "Qty × Price" when every site costs the same); otherwise the
// campaign's lump printing/mounting, as Qty × per-unit when it divides evenly.
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

// Build the bill for one period. `othersTaxable` = taxable already billed on
// the campaign's other live invoices (used by the last bill to land exactly).
function draftFor(order, periods, index, othersTaxable = 0) {
  const p = periods[index];
  const rows = [...rentalRowsByPeriod(order, periods)[index]];
  if (index === 0) {
    rows.push(...printMountRows(order));
    for (const a of order.addOns || []) {
      if (Number(a.amount)) rows.push({ kind: 'ADDON', location: a.label, qty: 1, price: Math.round(a.amount) });
    }
  }
  const pre = rows.reduce((s, r) => s + r.qty * r.price, 0);
  const flat = index === 0 ? Math.round(order.discountFlat || 0) : 0;
  const charges = applyOrderCharges({
    rentalSubtotal: pre, addOnTotal: 0, printingTotal: 0, mountingTotal: 0,
    discountPct: order.discountFlat > 0 ? 0 : order.discountPct, discountFlat: flat,
    taxCategory: order.taxCategory, interState: order.interState,
  });
  let discount = charges.discountAmount;
  let taxable = charges.taxableAmount;

  // The last bill settles the campaign exactly.
  if (index === periods.length - 1) {
    const target = Math.round(order.taxableAmount) - Math.round(othersTaxable);
    const diff = target - taxable;
    if (diff && discount && Math.abs(diff) <= periods.length) { discount -= diff; taxable = target; }
    else if (diff) { rows.push({ kind: 'ADJUST', location: 'Adjustment', qty: 1, price: diff }); taxable = target; }
  }
  if (discount) {
    const pct = order.discountFlat > 0 ? '' : ` (${order.discountPct}%)`;
    rows.push({ kind: 'DISCOUNT', location: `Less: Discount${pct}`, qty: 1, price: -discount });
  }
  return {
    index, label: p.label || null,
    periodStart: asStored(p.start), periodEnd: asStored(p.end),
    rows, taxable,
  };
}

// Taxable of every OTHER period: the amount already invoiced where a period
// has a live bill, else what its bill would be. The last period subtracts this
// from the campaign's taxable so the bills always add up exactly.
function othersTaxable(order, periods, index, liveInvoices) {
  return periods.reduce((sum, p) => {
    if (p.index === index) return sum;
    const inv = invoiceForPeriod(liveInvoices, p);
    if (inv) return sum + (inv.amount || 0);
    if (p.index === periods.length - 1) return sum; // never needed: only the last period settles
    return sum + draftFor(order, periods, p.index, 0).taxable;
  }, 0);
}

// Which live invoice (if any) covers each period. An invoice issued before
// periods existed (no periodStart) covered the whole campaign.
function invoiceForPeriod(invoices, p) {
  return invoices.find((i) => i.periodStart && day(i.periodStart).isSame(p.start));
}

function billingPlan(order) {
  const periods = periodsFor(order);
  const live = (order.invoices || []).filter((i) => i.status !== 'CANCELLED');
  const legacy = live.find((i) => !i.periodStart);
  const out = periods.map((p) => {
    const invoice = legacy || invoiceForPeriod(live, p) || null;
    return {
      index: p.index, label: p.label || null,
      periodStart: asStored(p.start), periodEnd: asStored(p.end),
      invoice: invoice ? { id: invoice.id, invoiceNo: invoice.invoiceNo, status: invoice.status, total: invoice.total, amount: invoice.amount } : null,
      // Preview of the bill that would be raised now for an open period.
      draft: invoice ? null : draftFor(order, periods, p.index, othersTaxable(order, periods, p.index, live)),
    };
  });
  return { cycle: order.billingCycle || null, periods: out, next: out.find((p) => !p.invoice) || null };
}

module.exports = { billingPlan, periodsFor, draftFor, othersTaxable, invoiceForPeriod, durationLabel, BILLABLE };
