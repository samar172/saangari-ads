import { createContext, useContext, useState } from 'react';
import api from './api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// Role helpers mirror the backend permissions matrix
export function can(user, action) {
  if (!user) return false;
  const r = user.role;
  const isAdmin = r === 'SUPER_ADMIN';
  const map = {
    createBooking: ['SALES', 'MANAGER', 'FINANCE'],
    editBooking: ['MANAGER', 'FINANCE'],
    changeBookingStatus: ['SALES', 'MANAGER', 'FINANCE'],
    recordPayment: ['SALES', 'MANAGER', 'FINANCE'],
    uploadPhoto: ['OPS'],
    generateInvoice: ['FINANCE'],
    viewInvoices: ['FINANCE', 'MANAGER'],
    manageLedger: ['FINANCE'],
    managePartners: ['MANAGER', 'FINANCE'],
    manageCategories: ['MANAGER'],
    shiftOrStopBooking: ['MANAGER', 'FINANCE'],
    exportInventory: ['MANAGER', 'FINANCE'],
    viewReports: ['MANAGER', 'FINANCE'],
    manageUsers: [],
    manageSites: ['MANAGER'],
    viewAllBookings: ['MANAGER', 'FINANCE'],
  };
  return isAdmin || (map[action] || []).includes(r);
}
