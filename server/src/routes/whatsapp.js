const router = require('express').Router();
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

// Default message templates. Placeholders are filled client-side when opening a
// wa.me link (manual) and server-side when auto-sending (API phase).
const DEFAULTS = {
  tplInvoice: 'Dear {{client}}, please find invoice {{invoiceNo}} for {{amount}} due by {{dueDate}}. — {{company}}',
  tplBooking: 'Dear {{client}}, your booking {{orderNo}} ({{sites}} site(s)) is confirmed. — {{company}}',
  tplPayment: 'Dear {{client}}, we have received your payment of {{amount}} against {{orderNo}}. Thank you. — {{company}}',
  tplExpiry: 'Dear {{client}}, your campaign {{orderNo}} ends on {{endDate}}. Reply to renew. — {{company}}',
  tplBillingDue: 'Dear {{client}}, a bill for {{orderNo}} is due. Kindly arrange payment. — {{company}}',
};

async function getOrCreate() {
  let s = await prisma.whatsAppSetting.findUnique({ where: { id: 1 } });
  if (!s) s = await prisma.whatsAppSetting.create({ data: { id: 1, ...DEFAULTS } });
  return s;
}

// Read config. Managers/Finance can read (the manual send buttons need templates).
router.get('/', requireRole('MANAGER', 'FINANCE'), async (req, res) => {
  const s = await getOrCreate();
  // Never leak the raw API token to the browser — expose only whether it's set.
  res.json({ ...s, apiToken: undefined, hasApiToken: !!s.apiToken });
});

// Save config. Only Manager / Super-Admin.
router.put('/', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  const b = req.body || {};
  const provider = ['MANUAL', 'CLOUD_API', 'BSP'].includes(b.provider) ? b.provider : 'MANUAL';
  const data = {
    provider,
    fromNumber: b.fromNumber ?? null,
    phoneNumberId: b.phoneNumberId ?? null,
    bspBaseUrl: b.bspBaseUrl ?? null,
    onInvoice: !!b.onInvoice, onBooking: !!b.onBooking, onPayment: !!b.onPayment,
    onExpiry: !!b.onExpiry, onBillingDue: !!b.onBillingDue,
    tplInvoice: b.tplInvoice ?? null, tplBooking: b.tplBooking ?? null, tplPayment: b.tplPayment ?? null,
    tplExpiry: b.tplExpiry ?? null, tplBillingDue: b.tplBillingDue ?? null,
  };
  // Only overwrite the token when a new non-empty one is supplied (blank keeps existing).
  if (b.apiToken) data.apiToken = String(b.apiToken);
  await getOrCreate();
  const s = await prisma.whatsAppSetting.update({ where: { id: 1 }, data });
  res.json({ ...s, apiToken: undefined, hasApiToken: !!s.apiToken });
});

module.exports = router;
