import { Link, useLocation } from "wouter";
import { useCompany } from "@/hooks/use-company";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { 
  Wrench, 
  Gauge, 
  ClipboardList, 
  Hammer, 
  Package, 
  Users, 
  BarChart3,
  User,
  Shield
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: Gauge },
  { name: "Intake Forms", href: "/intake", icon: ClipboardList },
  { name: "Repair Orders", href: "/repairs", icon: Hammer },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Mechanics", href: "/mechanics", icon: Users },
  { name: "Reports", href: "/reports", icon: BarChart3 },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { companyId } = useCompany();
  const { user } = useAuth();
  
  const companyName = "Company Name"; // Will be fetched later
  const plan = "Basic Plan"; // Will be fetched later

  return (
    <aside className="w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col">
      {/* Company Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Wrench className="text-white text-lg" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{companyName}</h2>
            <p className="text-xs text-gray-500">{plan}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            
            return (
              <li key={item.name}>
                <Link href={item.href}>
                  <a className={cn(
                    "flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                    isActive 
                      ? "sidebar-active text-primary" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </a>
                </Link>
              </li>
            );
          })}
          
          {/* Super Admin Menu */}
          {user?.role === 'super_admin' && (
            <li>
              <Link href="/super-admin">
                <a className={cn(
                  "flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                  location === "/super-admin"
                    ? "sidebar-active text-primary" 
                    : "text-gray-700 hover:bg-gray-100"
                )}>
                  <Shield className="w-5 h-5" />
                  <span>Super Admin</span>
                </a>
              </Link>
            </li>
          )}
        </ul>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
            <User className="text-gray-600 text-sm" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">John Smith</p>
            <p className="text-xs text-gray-500">Shop Manager</p>
          </div>
          <button>
            <ChevronDown className="text-gray-400 w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
