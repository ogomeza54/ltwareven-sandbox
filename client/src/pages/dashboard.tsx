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
  Truck,
  Plus,
  Package,
  Calendar,
  FileText,
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
      case "in-progress":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "ready-pickup":
        return "bg-green-500/10 text-green-400 border border-green-500/20";
      case "completed":
        return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
      case "waiting-parts":
        return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
    }
  };

  return (
    <div className="flex h-screen bg-slate-950">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-slate-950">
        <TopBar
          title="Dashboard"
          subtitle="Fleet operations overview"
          onNewIntake={() => setShowIntakeModal(true)}
        />

        <div className="p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">Active Orders</p>
                    <p className="text-3xl font-bold text-white mt-1">
                      {statsLoading ? "—" : stats?.activeOrders || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center">
                    <ClipboardList className="text-amber-400 w-6 h-6" />
                  </div>
                </div>
                <p className="text-xs text-green-400 mt-3 flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" />
                  12% from last week
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">Available Drivers</p>
                    <p className="text-3xl font-bold text-white mt-1">
                      {statsLoading ? "—" : stats?.availableMechanics || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                    <Users className="text-green-400 w-6 h-6" />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">Available for assignment</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">Low Stock Items</p>
                    <p className="text-3xl font-bold text-white mt-1">
                      {statsLoading ? "—" : stats?.lowStockItems || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="text-yellow-400 w-6 h-6" />
                  </div>
                </div>
                <p className="text-xs text-yellow-400 mt-3 flex items-center gap-1">
                  <ArrowDown className="w-3 h-3" />
                  Needs attention
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">Monthly Revenue</p>
                    <p className="text-3xl font-bold text-white mt-1">
                      ${statsLoading ? "—" : (stats?.monthlyRevenue || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-purple-400 w-6 h-6" />
                  </div>
                </div>
                <p className="text-xs text-green-400 mt-3 flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" />
                  8% from last month
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Orders and Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Orders */}
            <div className="lg:col-span-2">
              <Card className="bg-slate-900 border-slate-800">
                <div className="px-6 py-4 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-white">Recent Work Orders</h3>
                    <Link href="/repair-orders">
                      <Button variant="ghost" size="sm" className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
                        View All
                      </Button>
                    </Link>
                  </div>
                </div>
                <CardContent className="p-6">
                  {ordersLoading ? (
                    <p className="text-slate-500">Loading orders...</p>
                  ) : !recentOrders || recentOrders.length === 0 ? (
                    <div className="text-center py-8">
                      <Truck className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                      <p className="text-slate-500">No recent work orders found.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {recentOrders.slice(0, 5).map((order: any) => (
                        <div key={order.id} className="flex items-center justify-between py-3 border-b border-slate-800 last:border-b-0">
                          <div className="flex items-center space-x-4">
                            <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center">
                              <Truck className="text-slate-500 w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-medium text-white text-sm">
                                {order.vehicle?.year} {order.vehicle?.make} {order.vehicle?.model}
                                <span className="text-slate-500 ml-2 font-normal text-xs">#{order.orderNumber}</span>
                              </p>
                              <p className="text-xs text-slate-500">{order.customer?.name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                              {order.status.replace("-", " ")}
                            </span>
                            <p className="text-xs text-slate-600 mt-1">
                              {order.mechanic?.name || "Unassigned"}
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
            <Card className="bg-slate-900 border-slate-800">
              <div className="px-6 py-4 border-b border-slate-800">
                <h3 className="text-base font-semibold text-white">Quick Actions</h3>
              </div>
              <CardContent className="p-4 space-y-2">
                <Button 
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white p-4 h-auto justify-start"
                  onClick={() => setShowIntakeModal(true)}
                >
                  <div className="flex items-center space-x-3">
                    <Plus className="w-5 h-5" />
                    <div className="text-left">
                      <p className="font-semibold text-sm">New Job Intake</p>
                      <p className="text-xs opacity-80">Start vehicle inspection</p>
                    </div>
                  </div>
                </Button>

                <Link href="/inventory">
                  <Button variant="ghost" className="w-full p-4 h-auto justify-start text-slate-300 hover:bg-slate-800 hover:text-white">
                    <div className="flex items-center space-x-3">
                      <Package className="w-5 h-5 text-slate-500" />
                      <div className="text-left">
                        <p className="font-medium text-sm">Check Inventory</p>
                        <p className="text-xs text-slate-500">View stock levels</p>
                      </div>
                    </div>
                  </Button>
                </Link>

                <Link href="/mechanics">
                  <Button variant="ghost" className="w-full p-4 h-auto justify-start text-slate-300 hover:bg-slate-800 hover:text-white">
                    <div className="flex items-center space-x-3">
                      <Calendar className="w-5 h-5 text-slate-500" />
                      <div className="text-left">
                        <p className="font-medium text-sm">Driver Schedule</p>
                        <p className="text-xs text-slate-500">View assignments</p>
                      </div>
                    </div>
                  </Button>
                </Link>

                <Link href="/reports">
                  <Button variant="ghost" className="w-full p-4 h-auto justify-start text-slate-300 hover:bg-slate-800 hover:text-white">
                    <div className="flex items-center space-x-3">
                      <FileText className="w-5 h-5 text-slate-500" />
                      <div className="text-left">
                        <p className="font-medium text-sm">Generate Report</p>
                        <p className="text-xs text-slate-500">Weekly summary</p>
                      </div>
                    </div>
                  </Button>
                </Link>
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
