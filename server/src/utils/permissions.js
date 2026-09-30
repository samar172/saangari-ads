// Role-based access control (RBAC).
//
// A permission is (module, action) where action ∈ {view, add, edit, delete}.
// SUPER_ADMIN implicitly has everything and is never stored or editable.
// The other four roles (SALES, MANAGER, OPS, FINANCE) are configurable by the
// super admin from the Permissions matrix; whatever isn't overridden in the DB
// falls back to DEFAULTS below.
//
// DEFAULTS are hand-derived to mirror the app's historical requireRole() gates,
// so switching RBAC on changes nothing until an admin actually edits a box.

const ROLES = ['SALES', 'MANAGER', 'OPS', 'FINANCE']; // configurable roles (SUPER_ADMIN excluded)
const ACTIONS = ['view', 'add', 'edit', 'delete'];

// Modules shown in the matrix. `actions` lists which of the four apply to that
// module (a module that is read-only, like reports, only exposes `view`).
const MODULES = [
  { key: 'campaigns', label: 'Campaigns', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'quotations', label: 'Quotations', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'clients', label: 'Clients', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'inventory', label: 'Inventory (Sites)', actions: ['view', 'add', 'edit'] },
  { key: 'invoices', label: 'Invoices', actions: ['view', 'add', 'edit'] },
  { key: 'payments', label: 'Payments', actions: ['view', 'add', 'edit'] },
  { key: 'printingPartners', label: 'Printing Partners', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'reports', label: 'Reports', actions: ['view'] },
  { key: 'accounts', label: 'Accounts', actions: ['view', 'add'] },
  { key: 'bookingAnalysis', label: 'Booking Analysis', actions: ['view'] },
  { key: 'approvals', label: 'Approvals', actions: ['view', 'edit'] }, // edit = approve/reject
  { key: 'monitoring', label: 'Monitoring Photos', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'whatsapp', label: 'WhatsApp', actions: ['view', 'add', 'edit'] },
  { key: 'users', label: 'Users', actions: ['view'] }, // add/edit/delete stay SUPER_ADMIN-only
  { key: 'settings', label: 'Settings (Business/Media/Categories)', actions: ['view', 'add', 'edit', 'delete'] },
];

const MODULE_KEYS = new Set(MODULES.map((m) => m.key));

// Shorthand for building the defaults: which roles get each action, by module.
// Anything not listed is false. `view: '*'` means every configurable role.
const D = {
  campaigns: { view: '*', add: ['SALES', 'MANAGER', 'FINANCE'], edit: ['SALES', 'MANAGER', 'FINANCE'], delete: ['MANAGER'] },
  quotations: { view: '*', add: ['SALES', 'MANAGER', 'FINANCE'], edit: ['SALES', 'MANAGER', 'FINANCE'], delete: ['MANAGER'] },
  clients: { view: ['SALES', 'MANAGER', 'FINANCE'], add: ['SALES', 'MANAGER', 'FINANCE'], edit: ['MANAGER', 'FINANCE'], delete: ['MANAGER', 'FINANCE'] },
  inventory: { view: '*', add: ['MANAGER'], edit: ['MANAGER'] },
  invoices: { view: ['MANAGER', 'FINANCE'], add: ['FINANCE'], edit: ['MANAGER', 'FINANCE'] },
  payments: { view: ['MANAGER', 'FINANCE'], add: ['SALES', 'MANAGER', 'FINANCE'], edit: ['MANAGER'] },
  printingPartners: { view: '*', add: ['MANAGER', 'FINANCE'], edit: ['MANAGER', 'FINANCE'], delete: ['MANAGER', 'FINANCE'] },
  reports: { view: ['MANAGER', 'FINANCE'] },
  accounts: { view: ['MANAGER', 'FINANCE'], add: ['MANAGER', 'FINANCE'] },
  bookingAnalysis: { view: ['MANAGER', 'FINANCE'] },
  approvals: { view: '*', edit: ['MANAGER'] },
  monitoring: { view: '*', add: ['OPS', 'SALES', 'MANAGER', 'FINANCE'], edit: ['OPS', 'SALES', 'MANAGER', 'FINANCE'], delete: ['OPS', 'SALES', 'MANAGER', 'FINANCE'] },
  whatsapp: { view: ['SALES', 'MANAGER', 'FINANCE'], add: ['SALES', 'MANAGER', 'FINANCE'], edit: ['MANAGER'] },
  users: { view: ['MANAGER', 'FINANCE'] },
  settings: { view: '*', add: ['MANAGER'], edit: ['MANAGER'], delete: ['MANAGER'] },
};

// Expand D into DEFAULTS[role][module][action] = boolean for every configurable
// role, so a missing DB override always resolves to a concrete boolean.
function buildDefaults() {
  const out = {};
  for (const role of ROLES) {
    out[role] = {};
    for (const m of MODULES) {
      out[role][m.key] = {};
      for (const action of m.actions) {
        const grant = D[m.key]?.[action];
        out[role][m.key][action] = grant === '*' || (Array.isArray(grant) && grant.includes(role));
      }
    }
  }
  return out;
}

const DEFAULTS = buildDefaults();

// Merge a role's stored overrides (a partial {module:{action:bool}} map) over the
// defaults, ignoring any unknown module/action keys so stale data can't widen the
// surface. Returns a full {module:{action:bool}} matrix for the role.
function effectiveForRole(role, override) {
  const base = DEFAULTS[role];
  if (!base) return {}; // unknown / SUPER_ADMIN handled by callers
  const out = {};
  for (const m of MODULES) {
    out[m.key] = {};
    for (const action of m.actions) {
      const o = override?.[m.key]?.[action];
      out[m.key][action] = typeof o === 'boolean' ? o : base[m.key][action];
    }
  }
  return out;
}

// can(role, matrix, module, action): SUPER_ADMIN always true; otherwise read the
// already-resolved matrix. `matrix` is what effectiveForRole returned.
function can(role, matrix, module, action) {
  if (role === 'SUPER_ADMIN') return true;
  return !!matrix?.[module]?.[action];
}

module.exports = { ROLES, ACTIONS, MODULES, MODULE_KEYS, DEFAULTS, effectiveForRole, can };
