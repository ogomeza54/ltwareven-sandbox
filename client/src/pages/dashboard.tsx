import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import IntakeFormModal from "@/components/modals/intake-form-modal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ClipboardList, 
  Users, 
  AlertTriangle, 
  DollarSign,
  ArrowUp,
  ArrowDown,
  Car,
  Truck,
  Bike,
  Plus,
  Package,
  Calendar,
  FileText,
  Shield
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";

export default function Dashboard() {
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/repair-orders"],
  });

  const isSuperAdmin = user?.role === 'super_admin';
  
  console.log('User role:', user?.role);
  console.log('Is super admin:', isSuperAdmin);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-blue-100 text-blue-800";
      case "in-progress":
        return "bg-yellow-100 text-yellow-800";
      case "ready-pickup":
        return "bg-green-100 text-green-800";
      case "completed":
        return "bg-gray-100 text-gray-800";
      case "waiting-parts":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getVehicleIcon = (make: string) => {
    const makeLower = make.toLowerCase();
    if (makeLower.includes("harley") || makeLower.includes("motorcycle")) {
      return <Bike className="text-gray-600" />;
    }
    if (makeLower.includes("ford") && makeLower.includes("f-")) {
      return <Truck className="text-gray-600" />;
    }
    return <Car className="text-gray-600" />;
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Dashboard"
          subtitle="Welcome back, manage your repair operations"
          onNewIntake={() => setShowIntakeModal(true)}
        />

        <div className="p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Orders</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {statsLoading ? "..." : stats?.activeOrders || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <ClipboardList className="text-primary text-xl" />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-2">
                  <ArrowUp className="inline w-3 h-3 mr-1" />
                  12% from last week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Available Mechanics</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {statsLoading ? "..." : stats?.availableMechanics || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Users className="text-green-600 text-xl" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Out of 12 total mechanics</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {statsLoading ? "..." : stats?.lowStockItems || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="text-yellow-600 text-xl" />
                  </div>
                </div>
                <p className="text-xs text-yellow-600 mt-2">
                  <ArrowDown className="inline w-3 h-3 mr-1" />
                  Needs attention
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Monthly Revenue</p>
                    <p className="text-3xl font-bold text-gray-900">
                      ${statsLoading ? "..." : (stats?.monthlyRevenue || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-purple-600 text-xl" />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-2">
                  <ArrowUp className="inline w-3 h-3 mr-1" />
                  8% from last month
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Orders and Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Orders */}
            <div className="lg:col-span-2">
              <Card>
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Recent Orders</h3>
                    <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700">
                      View All
                    </Button>
                  </div>
                </div>
                <CardContent className="p-6">
                  {ordersLoading ? (
                    <p className="text-gray-500">Loading orders...</p>
                  ) : !recentOrders || recentOrders.length === 0 ? (
                    <p className="text-gray-500">No recent orders found.</p>
                  ) : (
                    <div className="space-y-4">
                      {recentOrders.slice(0, 5).map((order: any) => (
                        <div key={order.id} className="flex items-center justify-between py-4 border-b border-gray-100 last:border-b-0">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                              {getVehicleIcon(order.vehicle?.make || "")}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {order.vehicle?.year} {order.vehicle?.make} {order.vehicle?.model} - {order.orderNumber}
                              </p>
                              <p className="text-sm text-gray-500">{order.customer?.name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                              {order.status.replace("-", " ")}
                            </span>
                            <p className="text-xs text-gray-500 mt-1">
                              {order.mechanic?.name || "Auto-assigning..."}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
              </div>
              <CardContent className="p-6 space-y-4">
                <Button 
                  className="w-full bg-primary text-white p-4 h-auto justify-start hover:bg-blue-700"
                  onClick={() => setShowIntakeModal(true)}
                >
                  <div className="flex items-center space-x-3">
                    <Plus className="text-xl" />
                    <div className="text-left">
                      <p className="font-medium">New Intake Form</p>
                      <p className="text-sm opacity-90">Start vehicle inspection</p>
                    </div>
                  </div>
                </Button>

                <Button variant="secondary" className="w-full p-4 h-auto justify-start">
                  <div className="flex items-center space-x-3">
                    <Package className="text-xl" />
                    <div className="text-left">
                      <p className="font-medium">Check Inventory</p>
                      <p className="text-sm text-gray-600">View stock levels</p>
                    </div>
                  </div>
                </Button>

                <Button variant="secondary" className="w-full p-4 h-auto justify-start">
                  <div className="flex items-center space-x-3">
                    <Calendar className="text-xl" />
                    <div className="text-left">
                      <p className="font-medium">Mechanic Schedule</p>
                      <p className="text-sm text-gray-600">View assignments</p>
                    </div>
                  </div>
                </Button>

                <Button variant="secondary" className="w-full p-4 h-auto justify-start">
                  <div className="flex items-center space-x-3">
                    <FileText className="text-xl" />
                    <div className="text-left">
                      <p className="font-medium">Generate Report</p>
                      <p className="text-sm text-gray-600">Weekly summary</p>
                    </div>
                  </div>
                </Button>

                {isSuperAdmin && (
                  <Link href="/super-admin">
                    <Button variant="outline" className="w-full p-4 h-auto justify-start border-blue-200 hover:bg-blue-50">
                      <div className="flex items-center space-x-3">
                        <Shield className="text-xl text-blue-600" />
                        <div className="text-left">
                          <p className="font-medium text-blue-900">Super Admin</p>
                          <p className="text-sm text-blue-600">Manage companies</p>
                        </div>
                      </div>
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <IntakeFormModal
        open={showIntakeModal}
        onOpenChange={setShowIntakeModal}
      />
    </div>
  );
}
