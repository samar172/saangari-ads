// One-time repair: mirror every order's category onto its client's CURRENT
// category. Client category edits now cascade to orders going forward, but
// orders booked before that fix kept their stale snapshot — this repairs them
// (e.g. "Bhoj advertising" whose ₹29,736 order stayed Uncategorised after the
// client was categorised). Idempotent. Dry-run by default.
//
//   node scripts/backfill-order-categories.js            # preview changes
//   node scripts/backfill-order-categories.js --apply    # write changes
//
// ALWAYS take a DB backup before running with --apply.
const prisma = require('../src/db');

async function main() {
  const apply = process.argv.includes('--apply');
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, company: true, categoryId: true },
  });
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const orders = await prisma.order.findMany({
    select: { id: true, orderNo: true, categoryId: true, clientId: true },
  });

  const targetFor = (o) => {
    const c = clientById.get(o.clientId);
    return c ? (c.categoryId ?? null) : null;
  };
  const mismatched = orders.filter((o) => targetFor(o) !== (o.categoryId ?? null));

  if (mismatched.length === 0) {
    console.log('All orders already match their client category. Nothing to do.');
    return;
  }

  for (const o of mismatched) {
    const c = clientById.get(o.clientId);
    console.log(`${apply ? 'UPDATE' : 'would update'} ${o.orderNo}: category ${o.categoryId ?? 'NULL'} -> ${targetFor(o) ?? 'NULL'}  (${c?.company || c?.name || 'client ' + o.clientId})`);
  }

  if (apply) {
    // Group by target category so it's a handful of bulk updates, not one per order.
    const byTarget = new Map();
    for (const o of mismatched) {
      const target = targetFor(o);
      const key = target ?? 'null';
      if (!byTarget.has(key)) byTarget.set(key, { target, ids: [] });
      byTarget.get(key).ids.push(o.id);
    }
    for (const { target, ids } of byTarget.values()) {
      await prisma.order.updateMany({ where: { id: { in: ids } }, data: { categoryId: target } });
    }
  }

  console.log(`\n${apply ? 'Updated' : 'Would update'} ${mismatched.length} order(s).`);
  if (!apply) console.log('Dry run only. Re-run with --apply to write the changes.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
