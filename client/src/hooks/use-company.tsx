import { createContext, useContext, ReactNode } from 'react';
import { useAuth } from './useAuth';

interface CompanyContextType {
  companyId: string | null;
  userRole: string | null;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  const value: CompanyContextType = {
    companyId: user?.companyId || null,
    userRole: user?.role || null,
    isLoading,
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}