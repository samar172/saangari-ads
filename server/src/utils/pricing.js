const dayjs = require('dayjs');

const GST_RATE = 18;

// Day rate is derived from the site's monthly rate (30-day month).
function dayRateOf(monthlyRate) {
  return Math.round(monthlyRate / 30);
}

// Price a single site line: rental for the display period.
// endDate is the *inclusive* last active day of the display. Billing uses flat
// 30-day months: a display from the 23rd for one month runs 23rd → 22nd of the
// next month and bills 30 days, regardless of the calendar length of that month.
//
// To count consistently we work off the exclusive take-down day (end + 1): whole
// months then contribute exactly 30 each and any leftover days are added on. This
// avoids the old off-by-one where a full calendar month billed 30 but a 31-day
// span billed 31.
function computeLine({ monthlyRate, startDate, endDate, dayRateOverride, monthlyRateOverride }) {
  const start = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).startOf('day');
  if (end.isBefore(start)) throw new Error('End date must be on or after start date');

  const takeDown = end.add(1, 'day'); // exclusive day the hoarding comes down
  const months = takeDown.diff(start, 'month');
  const remainingDays = takeDown.diff(start.add(months, 'month'), 'day');
  const days = Math.max(1, (months * 30) + remainingDays);

  const hasDayOverride = dayRateOverride != null && dayRateOverride !== '';
  const effMonthly = monthlyRateOverride != null && monthlyRateOverride !== ''
    ? Number(monthlyRateOverride) : Number(monthlyRate);
  const dayRate = hasDayOverride ? Number(dayRateOverride) : dayRateOf(effMonthly);

  // An explicit day-rate override (e.g. a stopped display billed for the days it
  // actually ran) is priced straight at day-rate × days. Otherwise bill whole
  // months at the full monthly rate and only the leftover days at the day rate,
  // so a one-month display equals exactly one month's rent — never short by the
  // few rupees lost to rounding monthlyRate/30.
  const subtotal = hasDayOverride
    ? Math.round(dayRate * days)
    : Math.round(months * effMonthly + remainingDays * (effMonthly / 30));

  return { days, dayRate, subtotal };
}

// Given a rental subtotal already in hand, layer on the order-level charges,
// the discount and the GST split. Shared by computeOrder (which prices lines
// from scratch) and recomputeOrderTotals (which re-prices a saved order from
// its existing line subtotals, after a stop or a shift changed the dates).
function applyOrderCharges({ rentalSubtotal, addOnTotal, printingTotal, mountingTotal, discountPct, taxCategory, interState }) {
  const preDiscount = rentalSubtotal + addOnTotal + printingTotal + mountingTotal;
  const discountAmount = Math.round(preDiscount * (Number(discountPct) || 0) / 100);
  const taxableAmount = preDiscount - discountAmount;

  const gstApplicable = taxCategory === 'GST';
  const gstAmount = gstApplicable ? Math.round(taxableAmount * GST_RATE / 100) : 0;

  let cgst = 0, sgst = 0, igst = 0;
  if (gstApplicable) {
    if (interState) {
      igst = gstAmount;
    } else {
      cgst = Math.round(gstAmount / 2);
      sgst = gstAmount - cgst; // keep the split exactly summing to gstAmount
    }
  }

  return {
    rentalSubtotal, addOnTotal, printingTotal, mountingTotal,
    discountAmount, taxableAmount,
    cgst, sgst, igst, gstAmount,
    grandTotal: taxableAmount + gstAmount,
    gstRate: gstApplicable ? GST_RATE : 0,
  };
}

// Re-price a saved order from its surviving line subtotals. Cancelled and
// waitlisted lines contribute nothing; a stopped line contributes only the
// days it actually ran (its subtotal was already rewritten).
function recomputeOrderTotals(order, lines) {
  const BILLABLE = ['TENTATIVE', 'CONFIRMED', 'LIVE', 'COMPLETED', 'STOPPED'];
  const rentalSubtotal = lines
    .filter((l) => BILLABLE.includes(l.status))
    .reduce((s, l) => s + l.subtotal, 0);

  return applyOrderCharges({
    rentalSubtotal,
    addOnTotal: order.addOnTotal || 0,
    printingTotal: order.printingTotal || 0,
    mountingTotal: order.mountingCost || 0,
    discountPct: order.discountPct || 0,
    taxCategory: order.taxCategory,
    interState: order.interState,
  });
}

// Price a whole order: rental (many sites) + add-ons + printing + mounting,
// then discount, then GST split (CGST+SGST intra-state / IGST inter-state).
function computeOrder({
  items = [],            // [{ monthlyRate, startDate, endDate, dayRateOverride, siteId }]
  addOns = [],           // [{ label, amount }]
  noOfPrints = 0,
  printRate = 0,
  mountingCost = 0,
  discountPct = 0,
  taxCategory = 'NON_GST',
  interState = false,
}) {
  const lines = items.map((it) => ({ ...computeLine(it), siteId: it.siteId }));

  const totals = applyOrderCharges({
    rentalSubtotal: lines.reduce((s, l) => s + l.subtotal, 0),
    addOnTotal: (addOns || []).reduce((s, a) => s + (Number(a.amount) || 0), 0),
    printingTotal: Math.round((Number(noOfPrints) || 0) * (Number(printRate) || 0)),
    mountingTotal: Math.round(Number(mountingCost) || 0),
    discountPct, taxCategory, interState,
  });

  return { lines, ...totals };
}

module.exports = { computeOrder, computeLine, recomputeOrderTotals, dayRateOf, GST_RATE };
