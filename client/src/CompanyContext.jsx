import { createContext, useContext, useEffect, useState } from 'react';
import api from './api';
import { useAuth } from './auth';

const CompanyContext = createContext();

export function CompanyProvider({ children }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [activeCompany, setActiveCompanyState] = useState(null);

  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setActiveCompanyState(null);
      return;
    }
    api.get('/companies')
      .then((r) => {
        setCompanies(r.data);
        // Restore from localStorage or default to the first company
        const saved = localStorage.getItem('activeCompanyId');
        const savedCompany = saved ? r.data.find((c) => c.id === Number(saved)) : null;
        setActiveCompanyState(savedCompany || r.data[0] || null);
      })
      .catch(() => {});
  }, [user]);

  function setActiveCompany(company) {
    setActiveCompanyState(company);
    if (company) localStorage.setItem('activeCompanyId', company.id);
  }

  return (
    <CompanyContext.Provider value={{ companies, activeCompany, setActiveCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
