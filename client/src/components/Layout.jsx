import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, can } from '../auth';
import { useCompany } from '../CompanyContext';
import NotificationBar from './NotificationBar';
import { Map, ClipboardList, PlusSquare, Bell, Users, Printer, Receipt, Banknote, BarChart3, Building2, Settings, LogOut, FileText, Menu, X } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Inventory', icon: Map, show: () => true },
  { to: '/orders', label: 'Campaigns', icon: ClipboardList, show: () => true },
  { to: '/quotations', label: 'Quotations', icon: FileText, show: () => true },
  { to: '/new-booking', label: 'New Booking', icon: PlusSquare, show: (u) => can(u, 'createBooking') },
  { to: '/clients', label: 'Clients', icon: Users, show: () => true },
  { to: '/printing-partners', label: 'Printing Partners', icon: Printer, show: () => true },
  { to: '/invoices', label: 'Invoices', icon: Receipt, show: (u) => can(u, 'viewInvoices') },
  { to: '/payments', label: 'Payments', icon: Banknote, show: (u) => can(u, 'viewReports') },
  { to: '/reports', label: 'Reports', icon: BarChart3, show: (u) => can(u, 'viewReports') },
  { to: '/settings/companies', label: 'Business Setup', icon: Building2, show: (u) => can(u, 'manageCategories') },
  { to: '/users', label: 'Users', icon: Settings, show: (u) => u.role === 'SUPER_ADMIN' },
];

const ROLE_LABEL = {
  SALES: 'Sales Executive', MANAGER: 'Manager', OPS: 'Ops / Field',
  FINANCE: 'Finance', SUPER_ADMIN: 'Super Admin',
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { companies, activeCompany, setActiveCompany } = useCompany();
  const navigate = useNavigate();
  const location = useLocation();
  // The notification bar already polls; reuse its critical+pending tally for the badge.
  const [dueCount, setDueCount] = useState(0);
  // On phones the sidebar is an off-canvas drawer; on lg+ it is always docked
  // and this flag is ignored.
  const [navOpen, setNavOpen] = useState(false);

  // Navigating on a phone should reveal the page, not leave the drawer covering it.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  // Escape closes the drawer, matching the backdrop tap.
  useEffect(() => {
    if (!navOpen) return;
    const h = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [navOpen]);

  return (
    <div className="flex min-h-screen">
      {/* Backdrop only exists while the drawer is open on small screens. */}
      {navOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setNavOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 bg-slate-900 text-white flex flex-col overflow-y-auto transition-transform duration-200 lg:static lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-5 border-b border-white/10 flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-bold tracking-tight">SAANGRI</div>
            <div className="text-[11px] uppercase tracking-widest text-brand-accent">Advertising CRM</div>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            className="lg:hidden -mr-1 rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white transition"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Company selector */}
        {companies.length > 1 && (
          <div className="px-3 pt-3 pb-1">
            <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1 px-1">Company</div>
            <select
              className="w-full rounded-lg bg-white/10 border border-white/15 text-white text-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-accent"
              value={activeCompany?.id || ''}
              onChange={(e) => {
                const c = companies.find((x) => x.id === Number(e.target.value));
                if (c) setActiveCompany(c);
              }}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1">
          {NAV.filter((n) => n.show(user)).map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon size={18} />
                <span className="flex-1">{n.label}</span>
                {n.badge && dueCount > 0 && (
                  <span className="rounded-full bg-brand-accent text-brand text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center">{dueCount}</span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="px-2 py-2">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-[11px] text-brand-accent">{ROLE_LABEL[user.role]}</div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full mt-1 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-white/70 hover:bg-white/10 hover:text-white text-left transition"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden flex flex-col bg-slate-50/50">
        <header className="h-16 px-4 sm:px-6 bg-white border-b border-slate-200 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setNavOpen(true)}
            className="lg:hidden -ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 transition"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="lg:hidden font-bold tracking-tight text-slate-800">SAANGRI</div>
          <div className="flex-1" />
          <NotificationBar onCount={setDueCount} />
        </header>
        <div className="flex-1 p-4 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
