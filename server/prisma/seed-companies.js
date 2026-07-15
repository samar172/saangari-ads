const prisma = require('../src/db');

async function seedCompanies() {
  const companies = [
    {
      code: 'SAANGARI_ADS',
      name: 'Saangari Ads',
      legalName: 'Saangari Ads',
      gstMandatory: false,
      gstHidden: true,   // GST option hidden — always Non-GST
    },
    {
      code: 'SAANGARI_COMPANY',
      name: 'Saangari Company',
      legalName: 'Saangari Company',
      gstMandatory: true, // GST is mandatory — always GST 18%
      gstHidden: false,
    },
  ];

  for (const c of companies) {
    await prisma.company.upsert({
      where: { code: c.code },
      update: { name: c.name, legalName: c.legalName, gstMandatory: c.gstMandatory, gstHidden: c.gstHidden },
      create: c,
    });
    console.log(`✓ Company "${c.name}" seeded`);
  }

  console.log('Done.');
  await prisma.$disconnect();
}

seedCompanies().catch((e) => { console.error(e); process.exit(1); });
