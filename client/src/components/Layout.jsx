import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth, can } from '../auth';

const NAV = [
  { to: '/', label: 'Inventory', icon: '🗺️', show: () => true },
  { to: '/bookings', label: 'Bookings', icon: '📋', show: () => true },
  { to: '/new-booking', label: 'New Booking', icon: '➕', show: (u) => can(u, 'createBooking') },
  { to: '/clients', label: 'Clients', icon: '👥', show: () => true },
  { to: '/invoices', label: 'Invoices', icon: '🧾', show: (u) => can(u, 'viewInvoices') },
  { to: '/reports', label: 'Reports', icon: '📊', show: (u) => can(u, 'viewReports') },
  { to: '/users', label: 'Users', icon: '⚙️', show: (u) => u.role === 'SUPER_ADMIN' },
];

const ROLE_LABEL = {
  SALES: 'Sales Executive', MANAGER: 'Manager', OPS: 'Ops / Field',
  FINANCE: 'Finance', SUPER_ADMIN: 'Super Admin',
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-brand text-white flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="text-lg font-bold tracking-tight">SAANGRI</div>
          <div className="text-[11px] uppercase tracking-widest text-brand-accent">Advertising CRM</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.filter((n) => n.show(user)).map((n) => (
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
              <span>{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="px-2 py-2">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-[11px] text-brand-accent">{ROLE_LABEL[user.role]}</div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white text-left"
          >
            ⏻ Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
