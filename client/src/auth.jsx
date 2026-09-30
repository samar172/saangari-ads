import { createContext, useContext, useEffect, useState } from 'react';
import api from './api';

const AuthContext = createContext();

// The resolved RBAC matrix for the signed-in user ({ module: { action: bool } }).
// Kept at module scope too so the pure can() helper below can read it without a
// hook — it's hydrated from localStorage and refreshed on login / app load.
function loadStoredMatrix() {
  try { return JSON.parse(localStorage.getItem('permissions')) || null; } catch { return null; }
}
let currentMatrix = loadStoredMatrix();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });
  const [permissions, setPermissions] = useState(loadStoredMatrix);

  function applyPermissions(matrix) {
    currentMatrix = matrix || null;
    setPermissions(currentMatrix);
    try {
      if (matrix) localStorage.setItem('permissions', JSON.stringify(matrix));
      else localStorage.removeItem('permissions');
    } catch { /* ignore */ }
  }

  // On load (and whenever the token changes elsewhere), refresh the user + matrix
  // so a role or permission change takes effect without forcing a re-login.
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api.get('/auth/me')
      .then(({ data }) => {
        if (data.user) { setUser(data.user); localStorage.setItem('user', JSON.stringify(data.user)); }
        applyPermissions(data.permissions);
      })
      .catch(() => { /* token invalid — interceptor/logout handles it */ });
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    applyPermissions(data.permissions);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    applyPermissions(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, permissions, login, logout, refreshPermissions: applyPermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// usePerms(): matrix-aware gate for new code — canDo('campaigns', 'add').
export function usePerms() {
  const { user, permissions } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const canDo = (module, action) => isAdmin || !!permissions?.[module]?.[action];
  return { matrix: permissions, canDo, isAdmin };
}

// Legacy action → (module, action) in the RBAC matrix. Actions not listed here
// (editCampaign, manageUsers, viewAllBookings) have no matrix equivalent and keep
// their original hard-coded role rule below.
const LEGACY_MAP = {
  createBooking: ['campaigns', 'add'],
  editBooking: ['campaigns', 'edit'],
  changeBookingStatus: ['campaigns', 'edit'],
  recordPayment: ['payments', 'add'],
  uploadPhoto: ['monitoring', 'add'],
  generateInvoice: ['invoices', 'add'],
  viewInvoices: ['invoices', 'view'],
  manageLedger: ['accounts', 'add'],
  managePartners: ['printingPartners', 'edit'],
  manageCategories: ['settings', 'edit'],
  shiftOrStopBooking: ['campaigns', 'edit'],
  exportInventory: ['inventory', 'view'],
  viewReports: ['reports', 'view'],
  manageSites: ['inventory', 'edit'],
  // View gates for nav visibility.
  viewCampaigns: ['campaigns', 'view'],
  viewQuotations: ['quotations', 'view'],
  viewInventory: ['inventory', 'view'],
  viewClients: ['clients', 'view'],
  viewPartners: ['printingPartners', 'view'],
  viewAccounts: ['accounts', 'view'],
  viewBookingAnalysis: ['bookingAnalysis', 'view'],
  viewPayments: ['payments', 'view'],
  viewWhatsapp: ['whatsapp', 'view'],
  manageSettings: ['settings', 'view'],
};

// Original static role rule — the fallback when the matrix isn't loaded yet and
// the source of truth for actions with no matrix mapping.
const ROLE_RULE = {
  createBooking: ['SALES', 'MANAGER', 'FINANCE'],
  editBooking: ['SALES', 'MANAGER', 'FINANCE'],
  changeBookingStatus: ['SALES', 'MANAGER', 'FINANCE'],
  recordPayment: ['SALES', 'MANAGER', 'FINANCE'],
  uploadPhoto: ['OPS', 'SALES', 'MANAGER', 'FINANCE'],
  generateInvoice: ['FINANCE'],
  viewInvoices: ['FINANCE', 'MANAGER'],
  manageLedger: ['FINANCE'],
  managePartners: ['MANAGER', 'FINANCE'],
  manageCategories: ['MANAGER'],
  shiftOrStopBooking: ['SALES', 'MANAGER', 'FINANCE'],
  editCampaign: [], // super admin only (isAdmin short-circuits)
  exportInventory: ['SALES', 'MANAGER', 'FINANCE'],
  viewReports: ['MANAGER', 'FINANCE'],
  manageUsers: [],
  manageSites: ['MANAGER'],
  viewAllBookings: ['MANAGER', 'FINANCE'],
  // View gates — fallbacks mirror the previous always-visible / role behaviour.
  viewCampaigns: ['SALES', 'MANAGER', 'OPS', 'FINANCE'],
  viewQuotations: ['SALES', 'MANAGER', 'OPS', 'FINANCE'],
  viewInventory: ['SALES', 'MANAGER', 'OPS', 'FINANCE'],
  viewClients: ['SALES', 'MANAGER', 'FINANCE'],
  viewPartners: ['SALES', 'MANAGER', 'OPS', 'FINANCE'],
  viewAccounts: ['MANAGER', 'FINANCE'],
  viewBookingAnalysis: ['MANAGER', 'FINANCE'],
  viewPayments: ['MANAGER', 'FINANCE'],
  viewWhatsapp: ['SALES', 'MANAGER', 'FINANCE'],
  manageSettings: ['MANAGER'],
};

// can(user, action): SUPER_ADMIN always passes. Mapped actions consult the live
// RBAC matrix (so the super admin's Permissions edits take effect); everything
// else — or a not-yet-loaded matrix — falls back to the static role rule.
export function can(user, action) {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  const mapped = LEGACY_MAP[action];
  if (mapped && currentMatrix) {
    const [module, act] = mapped;
    return !!currentMatrix?.[module]?.[act];
  }
  return (ROLE_RULE[action] || []).includes(user.role);
}
