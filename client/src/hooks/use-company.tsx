import { create } from "zustand";

interface CompanyState {
  companyId: string;
  companyName: string;
  plan: string;
  setCompany: (companyId: string, companyName: string, plan: string) => void;
}

export const useCompany = create<CompanyState>((set) => ({
  companyId: "company-1", // Mock company ID for demo
  companyName: "AutoFix Pro",
  plan: "Premium Plan",
  setCompany: (companyId: string, companyName: string, plan: string) =>
    set({ companyId, companyName, plan }),
}));
