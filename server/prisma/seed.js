const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const sites = require('./sites.json');

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);

  const users = [
    { name: 'Super Admin', email: 'admin@saangri.com', role: 'SUPER_ADMIN' },
    { name: 'Manoj Manager', email: 'manager@saangri.com', role: 'MANAGER' },
    { name: 'Suresh Sales', email: 'sales@saangri.com', role: 'SALES' },
    { name: 'Omprakash Ops', email: 'ops@saangri.com', role: 'OPS' },
    { name: 'Fatima Finance', email: 'finance@saangri.com', role: 'FINANCE' },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, password },
    });
  }

  for (const s of sites) {
    await prisma.site.upsert({
      where: { code: s.code },
      update: {},
      create: {
        code: s.code,
        srNo: s.srNo,
        zone: s.zone,
        city: s.city,
        location: s.location,
        light: s.light,
        width: s.width,
        height: s.height,
        qty: s.qty,
        sqft: s.sqft,
        type: s.type,
        printingCost: s.printingCost,
        mountingCost: s.mountingCost,
        monthlyRate: s.monthlyRate,
        gstOnRate: s.gstOnRate,
        latitude: s.latitude,
        longitude: s.longitude,
      },
    });
  }

  console.log(`Seeded ${users.length} users and ${sites.length} sites.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
