const router = require('express').Router();
const prisma = require('../db');

// Global search across clients, campaigns, invoices and sites. Authenticated
// (mounted under the /api auth gate); open to any signed-in internal user.
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ clients: [], orders: [], invoices: [], sites: [] });
  const ci = { contains: q, mode: 'insensitive' };
  const who = (c) => c?.company?.trim() || c?.name || '';

  const [clients, orders, invoices, sites] = await Promise.all([
    prisma.client.findMany({
      where: { OR: [{ name: ci }, { company: ci }, { phone: { contains: q } }] },
      take: 6, orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, company: true, phone: true },
    }),
    prisma.order.findMany({
      where: { OR: [{ orderNo: ci }, { client: { name: ci } }, { client: { company: ci } }] },
      take: 6, orderBy: { createdAt: 'desc' },
      select: { id: true, orderNo: true, status: true, client: { select: { name: true, company: true } } },
    }),
    prisma.invoice.findMany({
      where: { OR: [{ invoiceNo: ci }, { client: { name: ci } }, { client: { company: ci } }] },
      take: 6, orderBy: { issuedAt: 'desc' },
      select: { id: true, invoiceNo: true, total: true, client: { select: { name: true, company: true } } },
    }),
    prisma.site.findMany({
      where: { OR: [{ code: ci }, { location: ci }] },
      take: 6, orderBy: { code: 'asc' },
      select: { id: true, code: true, location: true, zone: true },
    }),
  ]);

  res.json({
    clients: clients.map((c) => ({ id: c.id, name: c.name, company: c.company, phone: c.phone })),
    orders: orders.map((o) => ({ id: o.id, orderNo: o.orderNo, status: o.status, client: who(o.client) })),
    invoices: invoices.map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, total: i.total, client: who(i.client) })),
    sites: sites.map((s) => ({ id: s.id, code: s.code, location: s.location, zone: s.zone })),
  });
});

module.exports = router;
