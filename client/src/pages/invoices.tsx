import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, DollarSign, TrendingUp, Clock } from "lucide-react";

export default function Invoices() {
  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ["/api/repair-orders"],
  });

  const completedOrders = (orders as any[]).filter((o) => o.status === "completed");
  const totalRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.totalEstimate) || 0), 0);
  const pendingOrders = (orders as any[]).filter((o) => ["in_progress", "pending"].includes(o.status));
  const pendingRevenue = pendingOrders.reduce((sum, o) => sum + (Number(o.totalEstimate) || 0), 0);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Invoices" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-400">Total Invoiced</CardTitle>
                  <DollarSign className="w-4 h-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-slate-500 mt-1">{completedOrders.length} completed orders</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-400">Pending Revenue</CardTitle>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">${pendingRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-slate-500 mt-1">{pendingOrders.length} active orders</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-400">All Orders</CardTitle>
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{(orders as any[]).length}</p>
                <p className="text-xs text-slate-500 mt-1">total repair orders</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                Repair Orders — Invoice Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="text-left px-4 py-3 font-medium">Order #</th>
                      <th className="text-left px-4 py-3 font-medium">Customer</th>
                      <th className="text-left px-4 py-3 font-medium">Vehicle</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-right px-4 py-3 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orders as any[]).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-500">No orders found</td>
                      </tr>
                    ) : (
                      (orders as any[]).map((order) => (
                        <tr key={order.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">{order.orderNumber || order.id.slice(0, 8)}</td>
                          <td className="px-4 py-3 text-white">{order.customerName || "—"}</td>
                          <td className="px-4 py-3 text-slate-400">{[order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(" ") || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              order.status === "completed" ? "bg-green-500/10 text-green-400" :
                              order.status === "in_progress" ? "bg-amber-500/10 text-amber-400" :
                              "bg-slate-700 text-slate-400"
                            }`}>
                              {order.status?.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-white">
                            {order.totalEstimate ? `$${Number(order.totalEstimate).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
