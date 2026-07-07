import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Inventory from './pages/Inventory';
import NewBooking from './pages/NewBooking';
import Bookings from './pages/Bookings';
import Clients from './pages/Clients';
import Invoices from './pages/Invoices';
import Reports from './pages/Reports';
import Users from './pages/Users';

function Protected({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Inventory /></Protected>} />
          <Route path="/new-booking" element={<Protected><NewBooking /></Protected>} />
          <Route path="/bookings" element={<Protected><Bookings /></Protected>} />
          <Route path="/clients" element={<Protected><Clients /></Protected>} />
          <Route path="/invoices" element={<Protected><Invoices /></Protected>} />
          <Route path="/reports" element={<Protected><Reports /></Protected>} />
          <Route path="/users" element={<Protected><Users /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
