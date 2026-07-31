import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/use-company";
import SuperAdminBanner from "@/components/layout/super-admin-banner";
import ForcePasswordChangeModal from "@/components/modals/force-password-change-modal";
import Dashboard from "@/pages/dashboard";
import IntakeForm from "@/pages/intake-form";
import RepairOrders from "@/pages/repair-orders";
import Inventory from "@/pages/inventory";
import Mechanics from "@/pages/mechanics";
import Customers from "@/pages/customers";
import Vehicles from "@/pages/vehicles";
import Reports from "@/pages/reports";
import Invoices from "@/pages/invoices";
import InvoiceQuality from "@/pages/invoice-quality";
import UsersPage from "@/pages/users";
import IntegrationsPage from "@/pages/integrations";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import SuperAdmin from "@/pages/super-admin";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={Landing} />
      </Switch>
    );
  }

  const mustChangePassword = !!(user?.mustChangePassword);

  return (
    <CompanyProvider>
      <SuperAdminBanner />
      <ForcePasswordChangeModal open={mustChangePassword} />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/intake-form" component={IntakeForm} />
        <Route path="/repair-orders" component={RepairOrders} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/mechanics" component={Mechanics} />
        <Route path="/customers" component={Customers} />
        <Route path="/vehicles" component={Vehicles} />
        <Route path="/reports" component={Reports} />
        <Route path="/invoices" component={Invoices} />
        {(user?.role === "admin" || user?.role === "super_admin") && (
          <Route path="/invoice-quality" component={InvoiceQuality} />
        )}
        {(user?.role === "admin" || user?.role === "super_admin") && (
          <Route path="/users" component={UsersPage} />
        )}
        {(user?.role === "admin" || user?.role === "super_admin") && (
          <Route path="/integrations" component={IntegrationsPage} />
        )}
        {user?.role === "super_admin" && (
          <Route path="/super-admin" component={SuperAdmin} />
        )}
        <Route component={NotFound} />
      </Switch>
    </CompanyProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
