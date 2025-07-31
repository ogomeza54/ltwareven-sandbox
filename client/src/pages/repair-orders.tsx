import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Eye, Car, Truck, Bike } from "lucide-react";
import { useState } from "react";

export default function RepairOrders() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["/api/repair-orders"],
  });

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
      return <Bike className="text-gray-600 w-5 h-5" />;
    }
    if (makeLower.includes("ford") && makeLower.includes("f-")) {
      return <Truck className="text-gray-600 w-5 h-5" />;
    }
    return <Car className="text-gray-600 w-5 h-5" />;
  };

  const filteredOrders = orders?.filter((order: any) => {
    const matchesSearch = 
      order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${order.vehicle?.year} ${order.vehicle?.make} ${order.vehicle?.model}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Repair Orders"
          subtitle="Manage and track all repair orders"
        />

        <div className="p-6">
          {/* Filters */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by order number, customer, or vehicle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="waiting-parts">Waiting for Parts</SelectItem>
                <SelectItem value="ready-pickup">Ready for Pickup</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders List */}
          <div className="space-y-4">
            {isLoading ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-gray-500">Loading repair orders...</p>
                </CardContent>
              </Card>
            ) : !filteredOrders || filteredOrders.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center py-8">
                    <Car className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No repair orders found</h3>
                    <p className="text-gray-500">
                      {orders?.length === 0 
                        ? "Create your first repair order by starting with an intake form."
                        : "Try adjusting your search or filter criteria."
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              filteredOrders.map((order: any) => (
                <Card key={order.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                          {getVehicleIcon(order.vehicle?.make || "")}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">
                              {order.vehicle?.year} {order.vehicle?.make} {order.vehicle?.model}
                            </h3>
                            <Badge variant="outline" className="text-xs">
                              {order.orderNumber}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">{order.customer?.name}</p>
                          <p className="text-sm text-gray-500">{order.customer?.phone}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <Badge className={getStatusColor(order.status)}>
                            {order.status.replace("-", " ")}
                          </Badge>
                          <p className="text-xs text-gray-500 mt-1">
                            {order.mechanic?.name || "Auto-assigning..."}
                          </p>
                          {order.priority === "urgent" && (
                            <Badge variant="destructive" className="text-xs mt-1">
                              Urgent
                            </Badge>
                          )}
                        </div>
                        
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                      </div>
                    </div>
                    
                    {order.description && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {order.description}
                        </p>
                      </div>
                    )}
                    
                    <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                      <span>Created: {new Date(order.createdAt).toLocaleDateString()}</span>
                      <span>
                        {order.totalEstimate && `Estimate: $${Number(order.totalEstimate).toLocaleString()}`}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
