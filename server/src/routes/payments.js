const router = require('express').Router();
const dayjs = require('dayjs');
const ExcelJS = require('exceljs');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const INR = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN');

// All payments, optionally filtered by company and date range
router.get('/', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
  const { companyId, from, to } = req.query;
  const where = {};
  if (companyId) where.companyId = Number(companyId);
  if (from || to) {
    where.receivedAt = {};
    if (from) where.receivedAt.gte = new Date(from);
    if (to) where.receivedAt.lte = dayjs(to).endOf('day').toDate();
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      order: { select: { id: true, orderNo: true } },
      company: { select: { id: true, name: true, code: true } },
      recordedBy: { select: { name: true } },
    },
  });
  res.json(payments);
});

// Date-wise aggregated payments
router.get('/datewise', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
  const { companyId, from, to } = req.query;
  const where = {};
  if (companyId) where.companyId = Number(companyId);
  if (from || to) {
    where.receivedAt = {};
    if (from) where.receivedAt.gte = new Date(from);
    if (to) where.receivedAt.lte = dayjs(to).endOf('day').toDate();
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      order: { select: { id: true, orderNo: true } },
      company: { select: { id: true, name: true, code: true } },
      recordedBy: { select: { name: true } },
    },
  });

  // Group by date (local day)
  const buckets = {};
  for (const p of payments) {
    const dateKey = dayjs(p.receivedAt).format('YYYY-MM-DD');
    if (!buckets[dateKey]) {
      buckets[dateKey] = { date: dateKey, count: 0, totalGross: 0, totalTds: 0, totalNet: 0, payments: [] };
    }
    buckets[dateKey].count += 1;
    buckets[dateKey].totalGross += p.amount;
    buckets[dateKey].totalTds += p.tdsAmount || 0;
    buckets[dateKey].totalNet += p.netReceived || p.amount;
    buckets[dateKey].payments.push(p);
  }

  // Sort by date descending
  const result = Object.values(buckets).sort((a, b) => b.date.localeCompare(a.date));
  res.json(result);
});

// Excel export of payments
router.get('/export/excel', requireRole('FINANCE', 'MANAGER'), async (req, res) => {
  const { companyId, from, to } = req.query;
  const where = {};
  if (companyId) where.companyId = Number(companyId);
  if (from || to) {
    where.receivedAt = {};
    if (from) where.receivedAt.gte = new Date(from);
    if (to) where.receivedAt.lte = dayjs(to).endOf('day').toDate();
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    include: {
      client: { select: { name: true } },
      order: { select: { orderNo: true } },
      company: { select: { name: true } },
      recordedBy: { select: { name: true } },
    },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payments');
  ws.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Client', key: 'client', width: 22 },
    { header: 'Order', key: 'order', width: 14 },
    { header: 'Company', key: 'company', width: 18 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Mode', key: 'mode', width: 10 },
    { header: 'TDS %', key: 'tdsPct', width: 8 },
    { header: 'TDS Amount', key: 'tdsAmount', width: 14 },
    { header: 'Net Received', key: 'netReceived', width: 14 },
    { header: 'Reference', key: 'reference', width: 20 },
    { header: 'Recorded By', key: 'recordedBy', width: 16 },
  ];
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const p of payments) {
    ws.addRow({
      date: new Date(p.receivedAt).toLocaleDateString('en-IN'),
      client: p.client.name,
      order: p.order.orderNo,
      company: p.company.name,
      amount: p.amount,
      mode: p.mode,
      tdsPct: p.tdsApplicable ? p.tdsPct : '',
      tdsAmount: p.tdsAmount || 0,
      netReceived: p.netReceived || p.amount,
      reference: p.reference || '',
      recordedBy: p.recordedBy.name,
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="payments.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
