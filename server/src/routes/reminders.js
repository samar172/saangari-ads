const router = require('express').Router();
const prisma = require('../db');

// In-app monitoring reminders. `scope=due` returns everything due today or overdue
// and still open; otherwise upcoming open reminders are returned too.
router.get('/', async (req, res) => {
  const { scope } = req.query;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const where = { done: false };
  if (scope === 'due') where.dueDate = { lte: endOfToday };

  const reminders = await prisma.reminder.findMany({
    where,
    orderBy: { dueDate: 'asc' },
    include: {
      order: {
        select: {
          id: true, orderNo: true, status: true,
          client: { select: { name: true } },
          items: { select: { site: { select: { code: true } } } },
        },
      },
    },
  });

  const now = new Date();
  res.json(reminders.map((r) => ({
    ...r,
    overdue: new Date(r.dueDate) < new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    dueToday: new Date(r.dueDate).toDateString() === now.toDateString(),
  })));
});

router.get('/count', async (req, res) => {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const count = await prisma.reminder.count({ where: { done: false, dueDate: { lte: endOfToday } } });
  res.json({ count });
});

router.post('/:id/done', async (req, res) => {
  const reminder = await prisma.reminder.update({ where: { id: Number(req.params.id) }, data: { done: true } });
  res.json(reminder);
});

module.exports = router;
