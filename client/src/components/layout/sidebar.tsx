import { Link, useLocation } from "wouter";
import { useCompany } from "@/hooks/use-company";
import { useAuth } from "@/hooks/useAuth";
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
  Fuel,
  UserCircle
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: Gauge },
  { name: "Job Intake", href: "/intake-form", icon: ClipboardList },
  { name: "Work Orders", href: "/repair-orders", icon: Wrench },
  { name: "Parts & Inventory", href: "/inventory", icon: Package },
  { name: "Drivers", href: "/mechanics", icon: Users },
  { name: "Clients", href: "/customers", icon: UserCircle },
  { name: "Fleet", href: "/vehicles", icon: Truck },
  { name: "Reports", href: "/reports", icon: BarChart3 },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { companyId } = useCompany();
  const { user } = useAuth();
  
  const companyName = "Company Name";
  const plan = "Fleet Operations";

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Company Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
            <Truck className="text-white w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-white text-sm">{companyName}</h2>
            <p className="text-xs text-slate-500">{plan}</p>
          </div>
        </div>
      </div>

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
          {user?.role === 'super_admin' && (
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
