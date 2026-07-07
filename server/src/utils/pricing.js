const dayjs = require('dayjs');

const GST_RATE = 18;

// Day rate is derived from the site's monthly rate (30-day month).
function computePrice({ monthlyRate, startDate, endDate, discountPct = 0, gstApplicable = false, dayRateOverride }) {
  const start = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).startOf('day');
  const days = end.diff(start, 'day') + 1;
  if (days < 1) throw new Error('End date must be on or after start date');

  const dayRate = dayRateOverride != null ? Number(dayRateOverride) : Math.round(monthlyRate / 30);
  const subtotal = Math.round(dayRate * days);
  const discount = Math.round(subtotal * (Number(discountPct) || 0) / 100);
  const taxable = subtotal - discount;
  const gstAmount = gstApplicable ? Math.round(taxable * GST_RATE / 100) : 0;
  const totalAmount = taxable + gstAmount;

  return { days, dayRate, subtotal, discount, taxable, gstAmount, totalAmount, gstRate: GST_RATE };
}

module.exports = { computePrice, GST_RATE };
