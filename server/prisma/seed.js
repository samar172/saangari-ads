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

  const partners = [
    { name: 'Bikaner Flex & Vinyl', contact: 'Rakesh', phone: '9414012345', ratePerSqft: 12, address: 'Rani Bazar, Bikaner' },
    { name: 'Marudhar Digital Prints', contact: 'Sunil', phone: '9829067890', ratePerSqft: 14, address: 'Gangashahar Road, Bikaner' },
    { name: 'Star Signage Works', contact: 'Imran', phone: '9660098765', ratePerSqft: 16, address: 'KEM Road, Bikaner' },
  ];
  for (const p of partners) {
    const exists = await prisma.printingPartner.findFirst({ where: { name: p.name } });
    if (!exists) await prisma.printingPartner.create({ data: p });
  }

  console.log(`Seeded ${users.length} users, ${sites.length} sites, ${partners.length} printing partners.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
