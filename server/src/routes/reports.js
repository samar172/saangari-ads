const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

// Super Admin analytics: occupancy, revenue, top categories, repeat clients, time-series
router.get('/overview', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const [siteCount, byStatus, byType, invoices, bookings, clients] = await Promise.all([
    prisma.site.count({ where: { active: true } }),
    prisma.site.groupBy({ by: ['status'], where: { active: true }, _count: { _all: true } }),
    prisma.site.groupBy({ by: ['type'], where: { active: true }, _count: { _all: true } }),
    prisma.invoice.findMany({ select: { total: true, taxCategory: true, status: true, issuedAt: true, booking: { select: { site: { select: { type: true } } } } } }),
    prisma.booking.findMany({ select: { id: true, clientId: true, totalAmount: true, createdAt: true, status: true, site: { select: { type: true, zone: true } } } }),
    prisma.client.count(),
  ]);

  const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
  const booked = (statusMap.BOOKED || 0);
  const occupancy = siteCount ? Math.round((booked / siteCount) * 100) : 0;

  const totalRevenue = invoices.reduce((s, i) => s + i.total, 0);
  const paidRevenue = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.total, 0);
  const outstanding = totalRevenue - paidRevenue;

  // Revenue by category (from bookings)
  const revByType = {};
  const cntByType = {};
  for (const b of bookings) {
    revByType[b.site.type] = (revByType[b.site.type] || 0) + b.totalAmount;
    cntByType[b.site.type] = (cntByType[b.site.type] || 0) + 1;
  }

  // Repeat clients (2+ bookings)
  const perClient = {};
  for (const b of bookings) perClient[b.clientId] = (perClient[b.clientId] || 0) + 1;
  const repeatClients = Object.values(perClient).filter((n) => n >= 2).length;

  res.json({
    siteCount, occupancy, siteStatus: statusMap, siteByType: Object.fromEntries(byType.map((t) => [t.type, t._count._all])),
    totalRevenue, paidRevenue, outstanding,
    totalBookings: bookings.length, totalClients: clients, repeatClients,
    revenueByType: revByType, bookingsByType: cntByType,
  });
});

// Time-series revenue & bookings, grouped by week/month/year
router.get('/timeseries', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const period = req.query.period || 'month';
  const bookings = await prisma.booking.findMany({
    where: { status: { notIn: ['CANCELLED'] } },
    select: { createdAt: true, totalAmount: true },
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
  for (const b of bookings) {
    const k = keyFor(b.createdAt);
    buckets[k] = buckets[k] || { period: k, revenue: 0, bookings: 0 };
    buckets[k].revenue += b.totalAmount;
    buckets[k].bookings += 1;
  }
  res.json(Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period)));
});

// Top clients by revenue
router.get('/top-clients', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { status: { notIn: ['CANCELLED'] } },
    select: { totalAmount: true, client: { select: { id: true, name: true } } },
  });
  const map = {};
  for (const b of bookings) {
    const id = b.client.id;
    map[id] = map[id] || { id, name: b.client.name, revenue: 0, bookings: 0 };
    map[id].revenue += b.totalAmount;
    map[id].bookings += 1;
  }
  res.json(Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
});

module.exports = router;
