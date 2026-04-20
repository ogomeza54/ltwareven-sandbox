import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Search, Eye, Truck, Users, Package, RefreshCw, AlertTriangle, CheckCircle2, Clock, Ban, CircleDot, CircleCheck } from "lucide-react";
import { useState } from "react";
import RepairOrderModal from "@/components/modals/repair-order-modal";
import IntakeFormModal from "@/components/modals/intake-form-modal";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  "open":        { label: "Open",        color: "bg-blue-500/10 text-blue-400 border-blue-500/20",    icon: CircleDot },
  "in-progress": { label: "In Progress", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Clock },
  "on-hold":     { label: "On Hold",     color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: AlertTriangle },
  "completed":   { label: "Completed",   color: "bg-green-500/10 text-green-400 border-green-500/20",  icon: CheckCircle2 },
  "delivered":   { label: "Delivered",   color: "bg-teal-500/10 text-teal-400 border-teal-500/20",    icon: Truck },
  "closed":      { label: "Closed",      color: "bg-slate-500/10 text-slate-400 border-slate-500/20", icon: CircleCheck },
  "abandoned":   { label: "Abandoned",   color: "bg-red-500/10 text-red-400 border-red-500/20",       icon: Ban },
};

const PRIORITY_CONFIG: Record<string, string> = {
  "low":    "bg-slate-500/10 text-slate-400",
  "medium": "bg-blue-500/10 text-blue-400",
  "high":   "bg-orange-500/10 text-orange-400",
  "urgent": "bg-red-500/10 text-red-400",
};

export default function RepairOrders() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/repair-orders"],
  });

  const { data: mechanicsWorkload = [], isLoading: mechanicsLoading } = useQuery<any[]>({
    queryKey: ["/api/mechanics/workload"],
  });

  const { data: inventory = [], isLoading: inventoryLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
  });

  const rebalanceMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/repair-orders/rebalance", {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mechanics/workload"] });
      toast({ title: "Load Balanced", description: data.message });
    },
    onError: () => toast({ title: "Error", description: "Failed to rebalance", variant: "destructive" }),
  });

  const filteredOrders = orders.filter((order: any) => {
    const matchesSearch =
      order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${order.vehicle?.year} ${order.vehicle?.make} ${order.vehicle?.model}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.serviceType?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Summary counts
  const counts = orders.reduce((acc: Record<string, number>, o: any) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const activeCount = (counts["open"] || 0) + (counts["in-progress"] || 0) + (counts["on-hold"] || 0);
  const lowStockCount = inventory.filter((p: any) => p.quantityInStock <= p.lowStockThreshold).length;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Work Orders"
          subtitle="Manage, assign, and track all active work orders"
          onNewIntake={() => setShowIntakeModal(true)}
        />

        <div className="p-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Orders", value: orders.length, color: "text-white" },
              { label: "Active", value: activeCount, color: "text-amber-400" },
              { label: "Completed", value: (counts["completed"] || 0) + (counts["delivered"] || 0) + (counts["closed"] || 0), color: "text-green-400" },
              { label: "Low Stock Parts", value: lowStockCount, color: lowStockCount > 0 ? "text-red-400" : "text-slate-400" },
            ].map(stat => (
              <Card key={stat.label} className="bg-slate-900 border-slate-800">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Three-tab layout */}
          <Tabs defaultValue="orders">
            <div className="flex items-center justify-between mb-4">
              <TabsList className="bg-slate-900 border border-slate-800">
                <TabsTrigger value="orders" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
                  <Truck className="w-4 h-4 mr-2" />
                  Work Orders
                </TabsTrigger>
                <TabsTrigger value="mechanics" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
                  <Users className="w-4 h-4 mr-2" />
                  Mechanic Load
                </TabsTrigger>
                <TabsTrigger value="inventory" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
                  <Package className="w-4 h-4 mr-2" />
                  Parts Inventory
                </TabsTrigger>
              </TabsList>

              <Button
                variant="outline"
                size="sm"
                onClick={() => rebalanceMutation.mutate()}
                disabled={rebalanceMutation.isPending}
                className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${rebalanceMutation.isPending ? "animate-spin" : ""}`} />
                Auto-Balance Load
              </Button>
            </div>

            {/* ── Work Orders Tab ── */}
            <TabsContent value="orders" className="mt-0">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search orders, clients, vehicles, or service type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="abandoned">Abandoned</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Orders Table */}
              <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3">Work Order</th>
                        <th className="text-left px-4 py-3">Client / Vehicle</th>
                        <th className="text-left px-4 py-3 hidden md:table-cell">Service</th>
                        <th className="text-left px-4 py-3 hidden lg:table-cell">Assigned</th>
                        <th className="text-left px-4 py-3">Priority</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3 hidden md:table-cell">Estimate</th>
                        <th className="text-left px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersLoading ? (
                        <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Loading work orders...</td></tr>
                      ) : filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-12">
                            <Truck className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                            <p className="text-muted-foreground text-sm">
                              {orders.length === 0 ? "No work orders yet. Create one via Job Intake." : "No orders match your filter."}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map((order: any) => {
                          const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG["open"];
                          const StatusIcon = statusCfg.icon;
                          return (
                            <tr key={order.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-mono text-xs text-amber-400">{order.orderNumber}</div>
                                <div className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-white">{order.customer?.name}</div>
                                <div className="text-xs text-muted-foreground">{order.vehicle?.year} {order.vehicle?.make} {order.vehicle?.model}</div>
                                {order.vehicle?.licensePlate && (
                                  <div className="text-xs text-muted-foreground/60">{order.vehicle.licensePlate}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                <div className="text-sm">{order.serviceType || "—"}</div>
                                {order.truckType && <div className="text-xs text-muted-foreground">{order.truckType}</div>}
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell">
                                <div className="text-sm">{order.mechanic?.name || <span className="text-muted-foreground italic">Unassigned</span>}</div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge className={`${PRIORITY_CONFIG[order.priority] || ""} border-0 capitalize text-xs`}>
                                  {order.priority}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge className={`${statusCfg.color} border flex items-center gap-1 text-xs w-fit`}>
                                  <StatusIcon className="w-3 h-3" />
                                  {statusCfg.label}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                <div className="text-sm">
                                  {order.totalEstimate ? `$${Number(order.totalEstimate).toLocaleString()}` : "—"}
                                </div>
                                {order.estimatedHours && (
                                  <div className="text-xs text-muted-foreground">{order.estimatedHours}h est.</div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                                  onClick={() => { setSelectedOrderId(order.id); setIsModalOpen(true); }}
                                >
                                  <Eye className="w-4 h-4 mr-1" />
                                  View
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>

            {/* ── Mechanic Workload Tab ── */}
            <TabsContent value="mechanics" className="mt-0">
              <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                <CardHeader className="border-b border-slate-800 pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Technician Load Distribution
                    <span className="ml-auto text-xs text-amber-400 font-normal">
                      Load = active estimated hours / max hours capacity
                    </span>
                  </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3">Technician</th>
                        <th className="text-left px-4 py-3">Specialization</th>
                        <th className="text-left px-4 py-3 hidden md:table-cell">CDL Class</th>
                        <th className="text-left px-4 py-3">Active Orders</th>
                        <th className="text-left px-4 py-3">Active Hours</th>
                        <th className="text-left px-4 py-3">Capacity</th>
                        <th className="text-left px-4 py-3">Load</th>
                        <th className="text-left px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mechanicsLoading ? (
                        <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                      ) : mechanicsWorkload.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No technicians found. Add them in the Technicians section.</td></tr>
                      ) : (
                        mechanicsWorkload.map((m: any) => (
                          <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-white">{m.name}</div>
                              <div className="text-xs text-muted-foreground">${Number(m.hourlyRate).toFixed(0)}/hr</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{m.specialization}</td>
                            <td className="px-4 py-3 hidden md:table-cell text-sm">{m.cdlClass || "—"}</td>
                            <td className="px-4 py-3">
                              <span className="text-lg font-bold text-white">{m.activeOrderCount}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-lg font-bold text-amber-400">{Number(m.activeHours).toFixed(1)}h</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{m.maxWorkload}h max</td>
                            <td className="px-4 py-3 w-36">
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={m.loadPercent}
                                  className={`h-2 flex-1 ${m.loadPercent > 90 ? "[&>div]:bg-red-500" : m.loadPercent > 70 ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"}`}
                                />
                                <span className={`text-xs font-medium ${m.loadPercent > 90 ? "text-red-400" : m.loadPercent > 70 ? "text-amber-400" : "text-green-400"}`}>
                                  {m.loadPercent}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={m.isAvailable
                                ? "bg-green-500/10 text-green-400 border-green-500/20 border"
                                : "bg-red-500/10 text-red-400 border-red-500/20 border"
                              }>
                                {m.isAvailable ? "Available" : "Unavailable"}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="mt-4 p-4 bg-slate-900 border border-slate-800 rounded-lg">
                <h4 className="text-sm font-medium mb-2 text-muted-foreground">Load Balancing Algorithm</h4>
                <p className="text-xs text-muted-foreground/70 leading-relaxed">
                  When a new work order is created, the system automatically assigns it to the technician with the fewest active estimated hours.
                  For urgent or high-priority jobs, senior/specialist technicians are preferred. Click <strong className="text-amber-400">Auto-Balance Load</strong> above
                  to redistribute all open and in-progress orders evenly across available technicians, sorted by priority.
                </p>
              </div>
            </TabsContent>

            {/* ── Inventory Tab ── */}
            <TabsContent value="inventory" className="mt-0">
              <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                <CardHeader className="border-b border-slate-800 pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Parts Inventory
                    {lowStockCount > 0 && (
                      <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border ml-2">
                        {lowStockCount} low stock
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3">Part Name</th>
                        <th className="text-left px-4 py-3">Part Number</th>
                        <th className="text-left px-4 py-3">Unit Price</th>
                        <th className="text-left px-4 py-3">In Stock</th>
                        <th className="text-left px-4 py-3">Reorder At</th>
                        <th className="text-left px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryLoading ? (
                        <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                      ) : inventory.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No parts in inventory. Add parts in the Inventory section.</td></tr>
                      ) : (
                        inventory.map((part: any) => {
                          const isLow = part.quantityInStock <= part.lowStockThreshold;
                          const isOut = part.quantityInStock === 0;
                          return (
                            <tr key={part.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${isLow ? "bg-red-500/5" : ""}`}>
                              <td className="px-4 py-3">
                                <div className="font-medium text-white">{part.name}</div>
                                {part.description && <div className="text-xs text-muted-foreground truncate max-w-48">{part.description}</div>}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{part.partNumber}</td>
                              <td className="px-4 py-3 font-medium">${Number(part.price).toFixed(2)}</td>
                              <td className="px-4 py-3">
                                <span className={`text-lg font-bold ${isOut ? "text-red-400" : isLow ? "text-amber-400" : "text-green-400"}`}>
                                  {part.quantityInStock}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{part.lowStockThreshold}</td>
                              <td className="px-4 py-3">
                                {isOut ? (
                                  <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border">Out of Stock</Badge>
                                ) : isLow ? (
                                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 border">Low Stock</Badge>
                                ) : (
                                  <Badge className="bg-green-500/10 text-green-400 border-green-500/20 border">In Stock</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <RepairOrderModal
        open={isModalOpen}
        onOpenChange={(open) => { setIsModalOpen(open); if (!open) setSelectedOrderId(null); }}
        orderId={selectedOrderId}
      />

      <IntakeFormModal open={showIntakeModal} onOpenChange={setShowIntakeModal} />
    </div>
  );
}
