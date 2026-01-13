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

  // Calculate revenue by status
  const completedOrders = orders?.filter((order: any) => order.status === "completed") || [];
  const totalRevenue = completedOrders.reduce((sum: number, order: any) => 
    sum + (Number(order.totalEstimate) || 0), 0
  );

  // Calculate average completion time (mock calculation)
  const averageCompletionTime = completedOrders.length > 0 ? 4.2 : 0;

  // Status distribution
  const statusCounts = orders?.reduce((acc: any, order: any) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {}) || {};

  // Top mechanics by workload
  const topMechanics = mechanics?.sort((a: any, b: any) => b.currentWorkload - a.currentWorkload).slice(0, 5) || [];

  // Most used parts (mock data based on inventory)
  const topParts = inventory?.sort((a: any, b: any) => b.quantityInStock - a.quantityInStock).slice(0, 5) || [];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Reports & Analytics"
          subtitle="Comprehensive business insights and performance metrics"
        />

        <div className="p-6">
          {/* Report Controls */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex items-center space-x-4">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-48">
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
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                    <p className="text-3xl font-bold text-gray-900">
                      ${totalRevenue.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-green-600 text-xl" />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-2">
                  <TrendingUp className="inline w-3 h-3 mr-1" />
                  +12% from last period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Avg. Completion Time</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {averageCompletionTime} days
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Clock className="text-primary text-xl" />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-2">
                  -8% from last period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Orders Completed</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {completedOrders.length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="text-purple-600 text-xl" />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-2">
                  +15% from last period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Customer Satisfaction</p>
                    <p className="text-3xl font-bold text-gray-900">
                      98%
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="text-yellow-600 text-xl" />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-2">
                  +2% from last period
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts and Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Order Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Order Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(statusCounts).map(([status, count]) => {
                    const total = Object.values(statusCounts).reduce((sum: number, val: any) => sum + val, 0);
                    const percentage = total > 0 ? Math.round((count as number / total) * 100) : 0;
                    
                    const getStatusColor = (status: string) => {
                      switch (status) {
                        case "pending": return "bg-blue-500";
                        case "in-progress": return "bg-yellow-500";
                        case "ready-pickup": return "bg-green-500";
                        case "completed": return "bg-gray-500";
                        case "waiting-parts": return "bg-orange-500";
                        default: return "bg-gray-300";
                      }
                    };

                    return (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded ${getStatusColor(status)}`} />
                          <span className="text-sm font-medium text-gray-700 capitalize">
                            {status.replace("-", " ")}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-600">{count as number}</span>
                          <span className="text-xs text-gray-500">({percentage}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Top Mechanics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Top Performing Mechanics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topMechanics.map((mechanic: any, index: number) => (
                    <div key={mechanic.id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{mechanic.name}</p>
                          <p className="text-xs text-gray-500">{mechanic.specialization}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{mechanic.currentWorkload} jobs</p>
                        <p className="text-xs text-gray-500">${Number(mechanic.hourlyRate)}/hr</p>
                      </div>
                    </div>
                  ))}
                  {topMechanics.length === 0 && (
                    <p className="text-gray-500 text-center py-4">No mechanics data available</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Additional Reports */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inventory Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  Inventory Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Parts:</span>
                    <span className="font-medium">{inventory?.length || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Low Stock Items:</span>
                    <span className="font-medium text-yellow-600">
                      {inventory?.filter((part: any) => part.quantityInStock <= part.lowStockThreshold).length || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Inventory Value:</span>
                    <span className="font-medium">
                      ${inventory?.reduce((sum: number, part: any) => 
                        sum + (Number(part.price) * part.quantityInStock), 0
                      ).toLocaleString() || 0}
                    </span>
                  </div>
                  
                  {topParts.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Top Inventory Items</h4>
                      <div className="space-y-2">
                        {topParts.slice(0, 3).map((part: any) => (
                          <div key={part.id} className="flex justify-between text-sm">
                            <span className="text-gray-600 truncate">{part.name}</span>
                            <span className="font-medium">{part.quantityInStock} units</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Monthly Trends */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="w-5 h-5 mr-2" />
                  Monthly Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Orders This Month:</span>
                    <span className="font-medium">{orders?.length || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Revenue Growth:</span>
                    <span className="font-medium text-green-600">+12%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Customer Retention:</span>
                    <span className="font-medium">94%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Avg Order Value:</span>
                    <span className="font-medium">
                      ${completedOrders.length > 0 
                        ? Math.round(totalRevenue / completedOrders.length) 
                        : 0}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h4>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      Generate Monthly Report
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      Schedule Automated Reports
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      Export Customer Data
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
