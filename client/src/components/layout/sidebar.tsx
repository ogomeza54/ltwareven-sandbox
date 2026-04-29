import { Link, useLocation } from "wouter";
import { useCompany } from "@/hooks/use-company";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { 
  Truck, 
  Gauge, 
  ClipboardList, 
  Wrench, 
  Package, 
  Users, 
  BarChart3,
  User,
  Shield,
  ChevronDown,
  UserCircle,
  Building2,
} from "lucide-react";

interface CompanyOption {
  id: string;
  name: string;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: Gauge },
  { name: "Job Intake", href: "/intake-form", icon: ClipboardList },
  { name: "Work Orders", href: "/repair-orders", icon: Wrench },
  { name: "Parts & Inventory", href: "/inventory", icon: Package },
  { name: "Technicians", href: "/mechanics", icon: Users },
  { name: "Clients", href: "/customers", icon: UserCircle },
  { name: "Fleet", href: "/vehicles", icon: Truck },
  { name: "Reports", href: "/reports", icon: BarChart3 },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const { data: companies = [] } = useQuery<CompanyOption[]>({
    queryKey: ["/api/admin/companies"],
    enabled: isSuperAdmin,
  });

  const switchMutation = useMutation({
    mutationFn: async (targetCompanyId: string | null) => {
      await apiRequest("POST", "/api/admin/switch-company", { companyId: targetCompanyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  // effectiveCompanyId comes directly from user.companyId (which is already set to the effective one)
  const effectiveCompanyId = user?.companyId ?? null;

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Navigation */}
      <nav className="flex-1 p-3">
        <ul className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            
            return (
              <li key={item.name}>
                <Link href={item.href} className={cn(
                  "flex items-center space-x-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors",
                  isActive 
                    ? "sidebar-active" 
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
          
          {/* Super Admin Menu */}
          {isSuperAdmin && (
            <li>
              <Link href="/super-admin" className={cn(
                "flex items-center space-x-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors",
                location === "/super-admin"
                  ? "sidebar-active" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}>
                <Shield className="w-4 h-4 flex-shrink-0" />
                <span>Super Admin</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>

      {/* Super Admin Company Switcher */}
      {isSuperAdmin && companies.length > 0 && (
        <div className="px-3 pb-3 border-t border-slate-800 pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">View as Company</p>
          </div>
          <div className="relative">
            <select
              className="w-full rounded-md border border-slate-700 bg-slate-800 text-xs px-2.5 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 appearance-none pr-7"
              value={effectiveCompanyId ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                switchMutation.mutate(val);
              }}
              disabled={switchMutation.isPending}
            >
              <option value="">— My Account —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          </div>
          {user?.activeCompanyName && (
            <p className="text-xs text-amber-400/70 mt-1.5 truncate">
              Active: {user.activeCompanyName}
            </p>
          )}
        </div>
      )}

      {/* User Profile */}
      <div className="p-3 border-t border-slate-800">
        <div className="flex items-center space-x-3 px-2 py-2">
          <div className="w-8 h-8 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center">
            <User className="text-amber-400 w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.firstName || user?.email}</p>
            <p className="text-xs text-slate-500 capitalize">{user?.role || 'User'}</p>
          </div>
          <button>
            <ChevronDown className="text-slate-600 w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
