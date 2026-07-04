import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, 
  TrendingUp, 
  Calendar,
  Download,
  DollarSign,
  Clock,
  Users,
  Package
} from "lucide-react";
import { useState } from "react";

export default function Reports() {
  const [timeRange, setTimeRange] = useState("this-month");

  const { data: stats } = useQuery<{
    activeOrders: number;
    availableMechanics: number;
    lowStockItems: number;
    monthlyRevenue: number;
  }>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ["/api/repair-orders"],
  });

  const { data: mechanics = [] } = useQuery<any[]>({
    queryKey: ["/api/mechanics"],
  });

  const { data: inventory = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
  });

  const completedOrders = orders?.filter((order: any) =>
    ["completed", "delivered", "closed"].includes(order.status)
  ) || [];

  const totalRevenue = completedOrders.reduce((sum: number, order: any) =>
    sum + (Number(order.totalEstimate) || 0), 0
  );

  const averageCompletionTime = (() => {
    if (completedOrders.length === 0) return 0;
    const withDates = completedOrders.filter((o: any) => o.createdAt && (o.completedDate || o.closedDate || o.updatedAt));
    if (withDates.length === 0) return 0;
    const totalDays = withDates.reduce((sum: number, o: any) => {
      const start = new Date(o.createdAt).getTime();
      const end = new Date(o.completedDate || o.closedDate || o.updatedAt).getTime();
      return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
    }, 0);
    return Math.round((totalDays / withDates.length) * 10) / 10;
  })();

  const statusCounts = orders?.reduce((acc: any, order: any) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {}) || {};

  const topMechanics = mechanics?.sort((a: any, b: any) => b.currentWorkload - a.currentWorkload).slice(0, 5) || [];

  const topParts = inventory?.sort((a: any, b: any) => b.quantityInStock - a.quantityInStock).slice(0, 5) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-blue-500";
      case "in-progress": return "bg-amber-500";
      case "on-hold": return "bg-red-500";
      case "completed":
      case "delivered":
      case "closed": return "bg-green-500";
      case "abandoned": return "bg-slate-500";
      default: return "bg-slate-600";
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          title="Reports & Analytics"
          subtitle="Fleet operations insights and performance metrics"
        />

        <main className="flex-1 overflow-y-auto p-6">
          {/* Report Controls */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex items-center space-x-4">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-week">This Week</SelectItem>
                  <SelectItem value="this-month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="this-quarter">This Quarter</SelectItem>
                  <SelectItem value="this-year">This Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
              <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                <Download className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">Total Revenue</p>
                    <p className="text-3xl font-bold text-white">
                      ${totalRevenue.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-green-400 w-6 h-6" />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  From {completedOrders.length} completed orders
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">Avg. Completion Time</p>
                    <p className="text-3xl font-bold text-white">
                      {averageCompletionTime > 0 ? `${averageCompletionTime}d` : "—"}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                    <Clock className="text-blue-400 w-6 h-6" />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Across completed orders
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">Orders Completed</p>
                    <p className="text-3xl font-bold text-white">
                      {completedOrders.length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
                    <BarChart3 className="text-purple-400 w-6 h-6" />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Of {orders.length} total orders
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">Avg. Order Value</p>
                    <p className="text-3xl font-bold text-white">
                      ${completedOrders.length > 0
                        ? Math.round(totalRevenue / completedOrders.length).toLocaleString()
                        : 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center">
                    <TrendingUp className="text-amber-400 w-6 h-6" />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Per completed order
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts and Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Order Status Distribution */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2 text-amber-400" />
                  Order Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(statusCounts).length === 0 ? (
                  <p className="text-slate-500 text-center py-4">No order data available</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(statusCounts).map(([status, count]) => {
                      const total = Object.values(statusCounts).reduce((sum: number, val: any) => sum + val, 0);
                      const percentage = total > 0 ? Math.round((count as number / total) * 100) : 0;
                      return (
                        <div key={status} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded ${getStatusColor(status)}`} />
                            <span className="text-sm font-medium text-slate-300 capitalize">
                              {status.replaceAll("-", " ")}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-slate-300">{count as number}</span>
                            <span className="text-xs text-slate-500">({percentage}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Mechanics */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Users className="w-5 h-5 mr-2 text-amber-400" />
                  Top Performing Technicians
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topMechanics.map((mechanic: any, index: number) => (
                    <div key={mechanic.id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-400 text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{mechanic.name}</p>
                          <p className="text-xs text-slate-500">{mechanic.specialization}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">{mechanic.currentWorkload} jobs</p>
                        <p className="text-xs text-slate-500">${Number(mechanic.hourlyRate)}/hr</p>
                      </div>
                    </div>
                  ))}
                  {topMechanics.length === 0 && (
                    <p className="text-slate-500 text-center py-4">No technician data available</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Additional Reports */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inventory Summary */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Package className="w-5 h-5 mr-2 text-amber-400" />
                  Inventory Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Total Parts:</span>
                    <span className="font-medium text-white">{inventory?.length || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Low Stock Items:</span>
                    <span className="font-medium text-yellow-400">
                      {inventory?.filter((part: any) => part.quantityInStock <= part.lowStockThreshold).length || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Total Inventory Value:</span>
                    <span className="font-medium text-white">
                      ${inventory?.reduce((sum: number, part: any) =>
                        sum + (Number(part.price) * part.quantityInStock), 0
                      ).toLocaleString() || 0}
                    </span>
                  </div>

                  {topParts.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-slate-800">
                      <h4 className="text-sm font-medium text-slate-300 mb-3">Top Inventory Items</h4>
                      <div className="space-y-2">
                        {topParts.slice(0, 3).map((part: any) => (
                          <div key={part.id} className="flex justify-between text-sm">
                            <span className="text-slate-400 truncate">{part.name}</span>
                            <span className="font-medium text-white">{part.quantityInStock} units</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Monthly Trends */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-amber-400" />
                  Order Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Total Orders:</span>
                    <span className="font-medium text-white">{orders?.length || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Active Orders:</span>
                    <span className="font-medium text-amber-400">
                      {orders?.filter((o: any) => ["open", "in-progress", "on-hold"].includes(o.status)).length || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Completed Orders:</span>
                    <span className="font-medium text-green-400">{completedOrders.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Avg Order Value:</span>
                    <span className="font-medium text-white">
                      ${completedOrders.length > 0
                        ? Math.round(totalRevenue / completedOrders.length).toLocaleString()
                        : 0}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Quick Actions</h4>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                      Generate Monthly Report
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                      Schedule Automated Reports
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                      Export Customer Data
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
