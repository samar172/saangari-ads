const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const NON_CANCELLED = { notIn: ['CANCELLED'] };

// Super Admin analytics: occupancy, revenue, category profitability, GST, repeat clients
router.get('/overview', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const [siteCount, byStatus, byType, orders, lines, payments, clients] = await Promise.all([
    prisma.site.count({ where: { active: true } }),
    prisma.site.groupBy({ by: ['status'], where: { active: true }, _count: { _all: true } }),
    prisma.site.groupBy({ by: ['type'], where: { active: true }, _count: { _all: true } }),
    prisma.order.findMany({
      where: { status: NON_CANCELLED },
      select: {
        id: true, clientId: true, grandTotal: true, taxableAmount: true,
        cgst: true, sgst: true, igst: true, gstAmount: true, status: true,
        category: { select: { name: true } },
      },
    }),
    prisma.booking.findMany({
      where: { status: NON_CANCELLED },
      select: { subtotal: true, site: { select: { type: true, zone: true } } },
    }),
    prisma.payment.aggregate({ _sum: { amount: true, tdsAmount: true, netReceived: true } }),
    prisma.client.count(),
  ]);

  const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
  const booked = statusMap.BOOKED || 0;
  const occupancy = siteCount ? Math.round((booked / siteCount) * 100) : 0;

  const bookedValue = orders.reduce((s, o) => s + o.grandTotal, 0);
  // Payments credit the gross; TDS is the slice the client remitted to the government.
  const paidRevenue = payments._sum.amount || 0;
  const tdsDeducted = payments._sum.tdsAmount || 0;
  const netReceived = payments._sum.netReceived || 0;
  const outstanding = Math.max(0, bookedValue - paidRevenue);
  const gstCollected = orders.reduce((s, o) => s + o.gstAmount, 0);
  const cgst = orders.reduce((s, o) => s + o.cgst, 0);
  const sgst = orders.reduce((s, o) => s + o.sgst, 0);
  const igst = orders.reduce((s, o) => s + o.igst, 0);

  // Revenue + booking count by site category (from line items)
  const revByType = {}, cntByType = {};
  for (const l of lines) {
    revByType[l.site.type] = (revByType[l.site.type] || 0) + l.subtotal;
    cntByType[l.site.type] = (cntByType[l.site.type] || 0) + 1;
  }
  const topCategory = Object.entries(revByType).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Revenue by the client's booking category (institute, hospital, …)
  const revByCategory = {};
  for (const o of orders) {
    const name = o.category?.name || 'Uncategorised';
    revByCategory[name] = (revByCategory[name] || 0) + o.grandTotal;
  }

  // Repeat clients (2+ orders)
  const perClient = {};
  for (const o of orders) perClient[o.clientId] = (perClient[o.clientId] || 0) + 1;
  const repeatClients = Object.values(perClient).filter((n) => n >= 2).length;

  res.json({
    siteCount, occupancy, siteStatus: statusMap,
    siteByType: Object.fromEntries(byType.map((t) => [t.type, t._count._all])),
    bookedValue, paidRevenue, outstanding,
    tdsDeducted, netReceived,
    gstCollected, cgst, sgst, igst,
    totalOrders: orders.length, totalBookings: lines.length, totalClients: clients, repeatClients,
    revenueByType: revByType, bookingsByType: cntByType, topCategory,
    revenueByCategory: revByCategory,
  });
});

// Time-series booked value & orders, grouped by week/month/year (by booking date)
router.get('/timeseries', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const period = req.query.period || 'month';
  const orders = await prisma.order.findMany({
    where: { status: NON_CANCELLED },
    select: { bookingDate: true, grandTotal: true },
  });

  const keyFor = (d) => {
    const dt = new Date(d);
    if (period === 'year') return String(dt.getFullYear());
    if (period === 'week') {
      const onejan = new Date(dt.getFullYear(), 0, 1);
      const week = Math.ceil((((dt - onejan) / 86400000) + onejan.getDay() + 1) / 7);
      return `${dt.getFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  };

  const buckets = {};
  for (const o of orders) {
    const k = keyFor(o.bookingDate);
    buckets[k] = buckets[k] || { period: k, revenue: 0, bookings: 0 };
    buckets[k].revenue += o.grandTotal;
    buckets[k].bookings += 1;
  }
  res.json(Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period)));
});

// Top clients by booked value
router.get('/top-clients', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { status: NON_CANCELLED },
    select: { grandTotal: true, client: { select: { id: true, name: true } } },
  });
  const map = {};
  for (const o of orders) {
    const id = o.client.id;
    map[id] = map[id] || { id, name: o.client.name, revenue: 0, orders: 0 };
    map[id].revenue += o.grandTotal;
    map[id].orders += 1;
  }
  res.json(Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
});

module.exports = router;
