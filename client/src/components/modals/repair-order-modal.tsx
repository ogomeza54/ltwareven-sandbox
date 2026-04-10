import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { 
  Truck, User, Wrench, Package, Clock, AlertTriangle, CheckCircle2, 
  CircleDot, CircleCheck, Ban, Save, Trash2, Plus, X
} from "lucide-react";
import { SERVICE_TYPES, TRUCK_TYPES, WORK_ORDER_STATUSES } from "@shared/schema";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  "open":        { label: "Open",        color: "bg-blue-500/10 text-blue-400 border-blue-500/20",    icon: CircleDot },
  "in-progress": { label: "In Progress", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Clock },
  "on-hold":     { label: "On Hold",     color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: AlertTriangle },
  "completed":   { label: "Completed",   color: "bg-green-500/10 text-green-400 border-green-500/20",  icon: CheckCircle2 },
  "delivered":   { label: "Delivered",   color: "bg-teal-500/10 text-teal-400 border-teal-500/20",    icon: Truck },
  "closed":      { label: "Closed",      color: "bg-slate-500/10 text-slate-400 border-slate-500/20", icon: CircleCheck },
  "abandoned":   { label: "Abandoned",   color: "bg-red-500/10 text-red-400 border-red-500/20",       icon: Ban },
};

interface RepairOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
}

export default function RepairOrderModal({ open, onOpenChange, orderId }: RepairOrderModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery<any>({
    queryKey: ["/api/repair-orders", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const res = await fetch(`/api/repair-orders/${orderId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!orderId && open,
  });

  const { data: allOrders = [] } = useQuery<any[]>({ queryKey: ["/api/repair-orders"] });
  const fullOrder = allOrders.find((o: any) => o.id === orderId);
  const displayOrder = fullOrder || order;

  const { data: mechanics = [] } = useQuery<any[]>({ queryKey: ["/api/mechanics"] });
  const { data: inventory = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"] });
  const { data: partsUsage = [] } = useQuery<any[]>({
    queryKey: ["/api/parts-usage", orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const res = await fetch(`/api/parts-usage/${orderId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orderId && open,
  });

  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [addPartId, setAddPartId] = useState("");
  const [addPartQty, setAddPartQty] = useState("1");
  const [progressNote, setProgressNote] = useState("");

  useEffect(() => {
    if (displayOrder) {
      setEditFields({
        status: displayOrder.status || "open",
        mechanicId: displayOrder.mechanic?.id || displayOrder.mechanicId || "",
        priority: displayOrder.priority || "medium",
        serviceType: displayOrder.serviceType || "",
        truckType: displayOrder.truckType || "",
        trailerNumber: displayOrder.trailerNumber || "",
        odometerIn: displayOrder.odometerIn ?? "",
        odometerOut: displayOrder.odometerOut ?? "",
        estimatedHours: displayOrder.estimatedHours ?? "",
        actualHours: displayOrder.actualHours ?? "",
        laborRate: displayOrder.laborRate ?? "",
        totalEstimate: displayOrder.totalEstimate ?? "",
        dotInspectionRequired: displayOrder.dotInspectionRequired ?? false,
        scheduledDate: displayOrder.scheduledDate ? new Date(displayOrder.scheduledDate).toISOString().slice(0, 16) : "",
        description: displayOrder.description || "",
      });
    }
  }, [displayOrder?.id, open]);

  const updateMutation = useMutation({
    mutationFn: (updates: any) =>
      apiRequest("PATCH", `/api/repair-orders/${orderId}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/mechanics/workload"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Work order updated successfully" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update work order", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/repair-orders/${orderId}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mechanics/workload"] });
      toast({ title: "Work order deleted" });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to delete work order", variant: "destructive" }),
  });

  const addPartMutation = useMutation({
    mutationFn: async () => {
      const part = inventory.find((p: any) => p.id === addPartId);
      if (!part) throw new Error("Part not found");
      const res = await apiRequest("POST", `/api/repair-orders/${orderId}/parts`, {
        partId: addPartId,
        repairOrderId: orderId,
        quantity: parseInt(addPartQty),
        unitPrice: String(part.price),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parts-usage", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setAddPartId("");
      setAddPartQty("1");
      toast({ title: "Part added", description: "Inventory automatically decremented." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to add part", variant: "destructive" }),
  });

  const removePartMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/parts-usage/${id}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parts-usage", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Part removed", description: "Inventory restored." });
    },
  });

  const handleSave = () => {
    const updates: any = {};
    if (editFields.status !== displayOrder?.status) updates.status = editFields.status;
    if (editFields.mechanicId !== (displayOrder?.mechanic?.id || displayOrder?.mechanicId || "")) updates.mechanicId = editFields.mechanicId || null;
    if (editFields.priority !== displayOrder?.priority) updates.priority = editFields.priority;
    if (editFields.serviceType !== (displayOrder?.serviceType || "")) updates.serviceType = editFields.serviceType || null;
    if (editFields.truckType !== (displayOrder?.truckType || "")) updates.truckType = editFields.truckType || null;
    if (editFields.trailerNumber !== (displayOrder?.trailerNumber || "")) updates.trailerNumber = editFields.trailerNumber || null;
    if (String(editFields.odometerIn) !== String(displayOrder?.odometerIn ?? "")) updates.odometerIn = editFields.odometerIn ? parseInt(editFields.odometerIn) : null;
    if (String(editFields.odometerOut) !== String(displayOrder?.odometerOut ?? "")) updates.odometerOut = editFields.odometerOut ? parseInt(editFields.odometerOut) : null;
    if (String(editFields.estimatedHours) !== String(displayOrder?.estimatedHours ?? "")) updates.estimatedHours = editFields.estimatedHours ? String(editFields.estimatedHours) : null;
    if (String(editFields.actualHours) !== String(displayOrder?.actualHours ?? "")) updates.actualHours = editFields.actualHours ? String(editFields.actualHours) : null;
    if (String(editFields.laborRate) !== String(displayOrder?.laborRate ?? "")) updates.laborRate = editFields.laborRate ? String(editFields.laborRate) : null;
    if (String(editFields.totalEstimate) !== String(displayOrder?.totalEstimate ?? "")) updates.totalEstimate = editFields.totalEstimate ? String(editFields.totalEstimate) : null;
    if (editFields.description !== displayOrder?.description) updates.description = editFields.description;
    if (editFields.scheduledDate !== (displayOrder?.scheduledDate ? new Date(displayOrder.scheduledDate).toISOString().slice(0, 16) : "")) {
      updates.scheduledDate = editFields.scheduledDate ? new Date(editFields.scheduledDate) : null;
    }
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    } else {
      toast({ title: "No changes to save" });
    }
  };

  const addProgressNote = () => {
    if (!progressNote.trim()) return;
    let existing: any[] = [];
    try { existing = displayOrder?.progressNotes ? JSON.parse(displayOrder.progressNotes) : []; } catch {}
    const updated = [...existing, { note: progressNote, timestamp: new Date().toISOString() }];
    updateMutation.mutate({ progressNotes: JSON.stringify(updated) });
    setProgressNote("");
  };

  if (!open) return null;

  const statusCfg = STATUS_CONFIG[editFields.status || "open"] || STATUS_CONFIG["open"];
  const StatusIcon = statusCfg.icon;

  const partsTotal = partsUsage.reduce((sum: number, pu: any) =>
    sum + (Number(pu.unitPrice) * Number(pu.quantity)), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950 border-slate-800">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl font-mono text-amber-400">
                {displayOrder?.orderNumber || "Loading..."}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Created {displayOrder ? new Date(displayOrder.createdAt).toLocaleDateString() : "—"}
              </p>
            </div>
            <Badge className={`${statusCfg.color} border flex items-center gap-1.5 mt-1`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusCfg.label}
            </Badge>
          </div>
        </DialogHeader>

        {isLoading || !displayOrder ? (
          <div className="text-center py-12 text-muted-foreground">Loading work order details...</div>
        ) : (
          <Tabs defaultValue="details" className="mt-2">
            <TabsList className="bg-slate-900 border border-slate-800">
              <TabsTrigger value="details" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white text-xs">Details</TabsTrigger>
              <TabsTrigger value="assignment" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white text-xs">Assignment</TabsTrigger>
              <TabsTrigger value="parts" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white text-xs">
                Parts {partsUsage.length > 0 && `(${partsUsage.length})`}
              </TabsTrigger>
              <TabsTrigger value="notes" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white text-xs">Notes</TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 p-4 bg-slate-900 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-amber-400" />
                    <h3 className="font-medium text-sm">Client</h3>
                  </div>
                  <p className="font-semibold">{displayOrder.customer?.name}</p>
                  <p className="text-sm text-muted-foreground">{displayOrder.customer?.phone}</p>
                  {displayOrder.customer?.email && <p className="text-sm text-muted-foreground">{displayOrder.customer.email}</p>}
                </div>
                <div className="space-y-2 p-4 bg-slate-900 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Truck className="w-4 h-4 text-amber-400" />
                    <h3 className="font-medium text-sm">Vehicle</h3>
                  </div>
                  <p className="font-semibold">{displayOrder.vehicle?.year} {displayOrder.vehicle?.make} {displayOrder.vehicle?.model}</p>
                  {displayOrder.vehicle?.vin && <p className="text-xs text-muted-foreground font-mono">VIN: {displayOrder.vehicle.vin}</p>}
                  {displayOrder.vehicle?.licensePlate && <p className="text-sm text-muted-foreground">Plate: {displayOrder.vehicle.licensePlate}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editFields.status} onValueChange={v => setEditFields(f => ({ ...f, status: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_ORDER_STATUSES.map(s => {
                        const cfg = STATUS_CONFIG[s];
                        const Icon = cfg?.icon;
                        return (
                          <SelectItem key={s} value={s}>
                            <span className="flex items-center gap-2">
                              {Icon && <Icon className="w-3.5 h-3.5" />}
                              {cfg?.label || s}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={editFields.priority} onValueChange={v => setEditFields(f => ({ ...f, priority: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 p-4 bg-slate-900 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-400" />
                  <h3 className="font-medium text-sm">Service Details</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Service Type</Label>
                    <Select value={editFields.serviceType || "__none__"} onValueChange={v => setEditFields(f => ({ ...f, serviceType: v === "__none__" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— None —</SelectItem>
                        {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Truck Type</Label>
                    <Select value={editFields.truckType || "__none__"} onValueChange={v => setEditFields(f => ({ ...f, truckType: v === "__none__" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— None —</SelectItem>
                        {TRUCK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Trailer Number</Label>
                    <Input placeholder="TR-8821" value={editFields.trailerNumber} onChange={e => setEditFields(f => ({ ...f, trailerNumber: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>DOT Inspection</Label>
                    <Select value={editFields.dotInspectionRequired ? "yes" : "no"} onValueChange={v => setEditFields(f => ({ ...f, dotInspectionRequired: v === "yes" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">Not Required</SelectItem>
                        <SelectItem value="yes">Required</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 p-4 bg-slate-900 rounded-lg border border-slate-800">
                <h3 className="font-medium text-sm text-muted-foreground">Odometer, Hours &amp; Estimates</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Odometer In</Label>
                    <Input type="number" placeholder="284500" value={editFields.odometerIn} onChange={e => setEditFields(f => ({ ...f, odometerIn: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Odometer Out</Label>
                    <Input type="number" placeholder="284510" value={editFields.odometerOut} onChange={e => setEditFields(f => ({ ...f, odometerOut: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Scheduled Date</Label>
                    <Input type="datetime-local" value={editFields.scheduledDate} onChange={e => setEditFields(f => ({ ...f, scheduledDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Est. Hours</Label>
                    <Input type="number" step="0.5" placeholder="4.0" value={editFields.estimatedHours} onChange={e => setEditFields(f => ({ ...f, estimatedHours: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Actual Hours</Label>
                    <Input type="number" step="0.5" placeholder="3.5" value={editFields.actualHours} onChange={e => setEditFields(f => ({ ...f, actualHours: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Labor Rate ($/hr)</Label>
                    <Input type="number" step="0.01" placeholder="125.00" value={editFields.laborRate} onChange={e => setEditFields(f => ({ ...f, laborRate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 col-span-2 md:col-span-3">
                    <Label>Total Estimate ($)</Label>
                    <Input type="number" step="0.01" placeholder="0.00" value={editFields.totalEstimate} onChange={e => setEditFields(f => ({ ...f, totalEstimate: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description / Work Notes</Label>
                <Textarea className="h-24" value={editFields.description} onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleteMutation.isPending ? "Deleting..." : "Delete Order"}
                </Button>
                <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-white">
                  <Save className="w-4 h-4 mr-2" />
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </TabsContent>

            {/* Assignment Tab */}
            <TabsContent value="assignment" className="mt-4 space-y-4">
              <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-400" />
                  <h3 className="font-medium text-sm">Assigned Technician</h3>
                </div>
                <Select value={editFields.mechanicId || "__none__"} onValueChange={v => setEditFields(f => ({ ...f, mechanicId: v === "__none__" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select technician" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Unassigned —</SelectItem>
                    {mechanics.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} — {m.specialization}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {displayOrder.mechanic && (
                  <div className="p-3 bg-slate-800 rounded border border-slate-700">
                    <p className="font-semibold text-sm">{displayOrder.mechanic.name}</p>
                    <p className="text-xs text-muted-foreground">{displayOrder.mechanic.specialization}</p>
                    {displayOrder.mechanic.phone && <p className="text-xs text-muted-foreground">{displayOrder.mechanic.phone}</p>}
                    <p className="text-xs text-muted-foreground">${Number(displayOrder.mechanic.hourlyRate).toFixed(2)}/hr</p>
                  </div>
                )}

                <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-white w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {updateMutation.isPending ? "Saving..." : "Save Assignment"}
                </Button>
              </div>

              <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground">Timeline</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{new Date(displayOrder.createdAt).toLocaleString()}</span>
                  </div>
                  {displayOrder.scheduledDate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scheduled</span>
                      <span>{new Date(displayOrder.scheduledDate).toLocaleString()}</span>
                    </div>
                  )}
                  {displayOrder.completedDate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Completed</span>
                      <span className="text-green-400">{new Date(displayOrder.completedDate).toLocaleString()}</span>
                    </div>
                  )}
                  {displayOrder.closedDate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Closed</span>
                      <span className="text-slate-400">{new Date(displayOrder.closedDate).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Parts Tab */}
            <TabsContent value="parts" className="mt-4 space-y-4">
              <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-400" />
                  <h3 className="font-medium text-sm">Parts Used</h3>
                  {partsTotal > 0 && (
                    <span className="ml-auto text-amber-400 font-semibold text-sm">
                      Total: ${partsTotal.toFixed(2)}
                    </span>
                  )}
                </div>

                {partsUsage.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No parts added yet.</p>
                ) : (
                  <div className="space-y-2">
                    {partsUsage.map((pu: any) => (
                      <div key={pu.id} className="flex items-center justify-between p-3 bg-slate-800 rounded border border-slate-700">
                        <div>
                          <p className="font-medium text-sm">{pu.part?.name}</p>
                          <p className="text-xs text-muted-foreground">{pu.part?.partNumber} × {pu.quantity} @ ${Number(pu.unitPrice).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-sm">${(Number(pu.unitPrice) * Number(pu.quantity)).toFixed(2)}</span>
                          <Button variant="ghost" size="sm" className="text-red-400 hover:bg-red-500/10" onClick={() => removePartMutation.mutate(pu.id)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Separator className="bg-slate-800" />
                <h4 className="text-sm font-medium">Add Part</h4>
                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                  <Select value={addPartId} onValueChange={setAddPartId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select from inventory" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventory.filter((p: any) => p.quantityInStock > 0).map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — ${Number(p.price).toFixed(2)} ({p.quantityInStock} in stock)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" min="1" value={addPartQty} onChange={e => setAddPartQty(e.target.value)} className="w-20" placeholder="Qty" />
                  <Button onClick={() => addPartMutation.mutate()} disabled={!addPartId || addPartMutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-white">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes" className="mt-4 space-y-4">
              <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-3">
                <h3 className="font-medium text-sm">Progress Notes</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(() => {
                    try {
                      const notes = displayOrder.progressNotes ? JSON.parse(displayOrder.progressNotes) : [];
                      if (notes.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>;
                      return notes.map((n: any, i: number) => (
                        <div key={i} className="p-3 bg-slate-800 rounded border border-slate-700">
                          <p className="text-xs text-muted-foreground mb-1">{new Date(n.timestamp).toLocaleString()}</p>
                          <p className="text-sm">{n.note}</p>
                        </div>
                      ));
                    } catch {
                      return <p className="text-sm text-muted-foreground">{displayOrder.progressNotes}</p>;
                    }
                  })()}
                </div>
                <Separator className="bg-slate-800" />
                <h4 className="text-sm font-medium">Add Note</h4>
                <Textarea placeholder="Enter progress note..." value={progressNote} onChange={e => setProgressNote(e.target.value)} className="h-20" />
                <Button onClick={addProgressNote} disabled={!progressNote.trim() || updateMutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-white w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Note
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
