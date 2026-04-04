import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Eye, Truck } from "lucide-react";
import { useState } from "react";
import RepairOrderModal from "@/components/modals/repair-order-modal";

export default function RepairOrders() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setIsModalOpen(true);
  };

  const { data: orders = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/repair-orders"],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "in-progress":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "ready-pickup":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "completed":
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
      case "waiting-parts":
        return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  };

  const filteredOrders = orders.filter((order: any) => {
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
          title="Work Orders"
          subtitle="Manage and track all active work orders"
        />

        <div className="p-6">
          {/* Filters */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by order number, client, or vehicle..."
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
          <div className="space-y-3">
            {isLoading ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground">Loading work orders...</p>
                </CardContent>
              </Card>
            ) : !filteredOrders || filteredOrders.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center py-8">
                    <Truck className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No work orders found</h3>
                    <p className="text-muted-foreground text-sm">
                      {orders.length === 0 
                        ? "Create your first work order by starting with a job intake."
                        : "Try adjusting your search or filter criteria."
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              filteredOrders.map((order: any) => (
                <Card key={order.id} className="hover:border-amber-500/30 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-11 h-11 bg-accent rounded-lg flex items-center justify-center">
                          <Truck className="text-muted-foreground w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">
                              {order.vehicle?.year} {order.vehicle?.make} {order.vehicle?.model}
                            </h3>
                            <Badge variant="outline" className="text-xs font-mono">
                              #{order.orderNumber}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{order.customer?.name}</p>
                          <p className="text-sm text-muted-foreground/70">{order.customer?.phone}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <Badge className={`${getStatusColor(order.status)} border`}>
                            {order.status.replace("-", " ")}
                          </Badge>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            {order.mechanic?.name || "Unassigned"}
                          </p>
                          {order.priority === "urgent" && (
                            <Badge variant="destructive" className="text-xs mt-1">
                              Urgent
                            </Badge>
                          )}
                        </div>
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewOrder(order.id)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                      </div>
                    </div>
                    
                    {order.description && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {order.description}
                        </p>
                      </div>
                    )}
                    
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground/60">
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
      
      <RepairOrderModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setSelectedOrderId(null);
        }}
        orderId={selectedOrderId}
      />
    </div>
  );
}
