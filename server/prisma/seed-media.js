const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const types = [
    { code: 'UNIPOLE', label: 'Unipole', sortOrder: 1 },
    { code: 'GANTRY', label: 'Gantry', sortOrder: 2 },
    { code: 'KIOSK', label: 'Kiosk', sortOrder: 3 },
    { code: 'HOARDING', label: 'Hoarding', sortOrder: 4 },
  ];
  for (const t of types) {
    await prisma.mediaType.upsert({
      where: { code: t.code },
      update: { label: t.label, sortOrder: t.sortOrder },
      create: t,
    });
  }
  console.log('Seeded media types');
}
run();
