import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/use-company";
import Dashboard from "@/pages/dashboard";
import IntakeForm from "@/pages/intake-form";
import RepairOrders from "@/pages/repair-orders";
import Inventory from "@/pages/inventory";
import Mechanics from "@/pages/mechanics";
import Customers from "@/pages/customers";
import Vehicles from "@/pages/vehicles";
import Reports from "@/pages/reports";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import SuperAdmin from "@/pages/super-admin";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <CompanyProvider>
          <Route path="/" component={Home} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/intake-form" component={IntakeForm} />
          <Route path="/repair-orders" component={RepairOrders} />
          <Route path="/inventory" component={Inventory} />
          <Route path="/mechanics" component={Mechanics} />
          <Route path="/customers" component={Customers} />
          <Route path="/vehicles" component={Vehicles} />
          <Route path="/reports" component={Reports} />
          {user?.role === 'super_admin' && (
            <Route path="/super-admin" component={SuperAdmin} />
          )}
        </CompanyProvider>
      )}
      <Route component={NotFound} />
    </Switch>
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
