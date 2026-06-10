import { useQuery, useMutation } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Package, AlertTriangle, Edit, Trash2, PackagePlus,
  CheckCircle2, Clock, FileText, SlidersHorizontal, ArrowUp, ArrowDown, Minus,
  ClipboardList, Eye, Download, Info, ChevronDown, ChevronRight,
  BookOpen, Plus, X, Layers, Tag,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import InventoryPartModal from "@/components/modals/inventory-part-modal";
import ReceiveInventoryModal from "@/components/modals/receive-inventory-modal";
import InventoryAdjustmentModal from "@/components/modals/inventory-adjustment-modal";
import InventoryCountModal from "@/components/modals/inventory-count-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Inventory() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isCountModalOpen, setIsCountModalOpen] = useState(false);
  const [selectedCountSessionId, setSelectedCountSessionId] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<any>(null);
  const [expandedIntakeId, setExpandedIntakeId] = useState<string | null>(null);

  const handleEditPart = (part: any) => {
    setSelectedPart(part);
    setIsEditModalOpen(true);
  };

  const handleDeletePart = (part: any) => {
    setSelectedPart(part);
    setIsDeleteDialogOpen(true);
  };

  const handleAdjustPart = (part: any) => {
    setSelectedPart(part);
    setIsAdjustModalOpen(true);
  };

  const { data: currentUser } = useQuery<any>({ queryKey: ["/api/auth/user"] });
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  // Catalog state
  const [expandedCatalogGroup, setExpandedCatalogGroup] = useState<string | null>(null);
  const [expandedCatalogSubgroup, setExpandedCatalogSubgroup] = useState<string | null>(null);
  const [addingGroupName, setAddingGroupName] = useState("");
  const [addingSubgroupName, setAddingSubgroupName] = useState<Record<string, string>>({});
  const [addingItemName, setAddingItemName] = useState<Record<string, string>>({});
  const [editingCatalogItem, setEditingCatalogItem] = useState<{ type: string; id: string; name: string } | null>(null);
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null);

  const { data: catalogTree = [], isLoading: catalogLoading } = useQuery<any[]>({
    queryKey: ["/api/catalog/tree"],
  });

  const catalogGroupMutation = useMutation({
    mutationFn: async ({ action, id, name }: { action: string; id?: string; name?: string }) => {
      if (action === "create") return apiRequest("POST", "/api/catalog/groups", { name, sortOrder: 0 });
      if (action === "rename") return apiRequest("PATCH", `/api/catalog/groups/${id}`, { name });
      if (action === "delete") return apiRequest("DELETE", `/api/catalog/groups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/tree"] });
      setAddingGroupName("");
      setEditingCatalogItem(null);
    },
    onError: () => toast({ title: "Failed to update group", variant: "destructive" }),
  });

  const catalogSubgroupMutation = useMutation({
    mutationFn: async ({ action, id, name, groupId }: { action: string; id?: string; name?: string; groupId?: string }) => {
      if (action === "create") return apiRequest("POST", "/api/catalog/subgroups", { name, groupId, sortOrder: 0 });
      if (action === "rename") return apiRequest("PATCH", `/api/catalog/subgroups/${id}`, { name });
      if (action === "delete") return apiRequest("DELETE", `/api/catalog/subgroups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/tree"] });
      setAddingSubgroupName({});
      setEditingCatalogItem(null);
    },
    onError: () => toast({ title: "Failed to update subgroup", variant: "destructive" }),
  });

  const catalogItemMutation = useMutation({
    mutationFn: async ({ action, id, name, subgroupId }: { action: string; id?: string; name?: string; subgroupId?: string }) => {
      if (action === "create") return apiRequest("POST", "/api/catalog/items", { name, subgroupId, sortOrder: 0 });
      if (action === "rename") return apiRequest("PATCH", `/api/catalog/items/${id}`, { name });
      if (action === "delete") return apiRequest("DELETE", `/api/catalog/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/tree"] });
      setAddingItemName({});
      setEditingCatalogItem(null);
    },
    onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
  });

  const linkPartMutation = useMutation({
    mutationFn: async ({ itemId, partId }: { itemId: string; partId: string | null }) =>
      apiRequest("PATCH", `/api/catalog/items/${itemId}`, { partId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/tree"] });
      setLinkingItemId(null);
      toast({ title: "Part linked to catalog item" });
    },
    onError: () => toast({ title: "Failed to link part", variant: "destructive" }),
  });

  const { data: parts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
  });

  const { data: intakes = [], isLoading: intakesLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory/intakes"],
  });

  const { data: expandedIntake } = useQuery<any>({
    queryKey: ["/api/inventory/intakes", expandedIntakeId],
    enabled: !!expandedIntakeId,
  });

  const { data: adjustments = [], isLoading: adjustmentsLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory/adjustments"],
    enabled: isAdmin,
  });

  const { data: countSessions = [], isLoading: countSessionsLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory/count-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/inventory/count-sessions");
      if (!res.ok) throw new Error("Failed to load count sessions");
      return res.json();
    },
  });

  const pendingCountSessions = countSessions.filter((s: any) => s.status === "submitted");
  // Any active draft regardless of owner (used to notify all users)
  const anyDraftCountSession = countSessions.find((s: any) => s.status === "draft");
  // Admins see any open draft; regular users only see their own draft
  const openCountSession = countSessions.find((s: any) =>
    s.status === "draft" && (isAdmin || s.startedByUserId === currentUser?.id)
  );
  // True when there's a draft open but the current user can't edit it
  const isOtherUsersDraft = !!anyDraftCountSession && !openCountSession;

  const handleOpenCountSession = (session: any) => {
    setSelectedCountSessionId(session.id);
    setIsCountModalOpen(true);
  };

  const handleStartCount = () => {
    if (openCountSession) {
      handleOpenCountSession(openCountSession);
    } else {
      setSelectedCountSessionId(null);
      setIsCountModalOpen(true);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/inventory/${selectedPart?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setIsDeleteDialogOpen(false);
      setSelectedPart(null);
      toast({ title: "Part deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete part", variant: "destructive" });
    },
  });

  const filteredParts = parts.filter((part: any) =>
    part.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    part.partNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockParts = parts.filter((part: any) =>
    part.quantityInStock <= part.lowStockThreshold
  );

  const totalValue = parts.reduce(
    (sum: number, part: any) => sum + Number(part.price) * part.quantityInStock,
    0
  );

  const reconciliationIcon = (status: string) => {
    if (status === "matched") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <Clock className="h-4 w-4 text-slate-400" />;
  };

  const deltaIcon = (delta: number) => {
    if (delta > 0) return <ArrowUp className="h-3 w-3 text-green-400" />;
    if (delta < 0) return <ArrowDown className="h-3 w-3 text-red-400" />;
    return <Minus className="h-3 w-3 text-slate-400" />;
  };

  const handleExportAdjustmentsCSV = () => {
    const headers = [
      "Date",
      "Time",
      "Part",
      "Part Number",
      "Type",
      "Before",
      "After",
      "Delta",
      "Reason",
      "Performed By",
      "Source Count Session",
    ];

    const escapeCell = (value: any) => {
      const str = value == null ? "" : String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = adjustments.map((adj: any) => {
      const date = new Date(adj.createdAt);
      return [
        date.toLocaleDateString(),
        date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        adj.partName ?? "",
        adj.partNumber ?? "",
        adj.adjustmentType === "add" ? "Add" : adj.adjustmentType === "subtract" ? "Subtract" : "Set to",
        adj.previousQty,
        adj.newQty,
        adj.delta,
        adj.reason ?? "",
        adj.performedBy ?? "",
        adj.countSessionId ?? "",
      ].map(escapeCell).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `adjustment-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Parts & Inventory"
          subtitle="Track parts and stock levels for your fleet"
        />

        <div className="p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Parts</p>
                    <p className="text-3xl font-bold">
                      {isLoading ? "..." : parts.length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center">
                    <Package className="text-amber-500 w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Low Stock Items</p>
                    <p className="text-3xl font-bold text-amber-500">
                      {isLoading ? "..." : lowStockParts.length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="text-amber-500 w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Value</p>
                    <p className="text-3xl font-bold">
                      ${isLoading ? "..." : totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                    <Package className="text-green-500 w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="parts">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="parts">Parts Catalog</TabsTrigger>
                <TabsTrigger value="intakes">
                  Receiving Log
                  {intakes.length > 0 && (
                    <Badge className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0">
                      {intakes.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="counts">
                  Inventory Counts
                  {openCountSession && (
                    <Badge className="ml-2 bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs px-1.5 py-0">
                      In Progress
                    </Badge>
                  )}
                  {isAdmin && pendingCountSessions.length > 0 && (
                    <Badge className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0">
                      {pendingCountSessions.length}
                    </Badge>
                  )}
                </TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="adjustments">
                    Adjustment History
                    {adjustments.length > 0 && (
                      <Badge className="ml-2 bg-slate-600 text-white text-xs px-1.5 py-0">
                        {adjustments.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
                <TabsTrigger value="catalog">
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                  Maintenance Catalog
                </TabsTrigger>
              </TabsList>

              <div className="flex gap-2">
                <Button
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                  onClick={() => setIsReceiveModalOpen(true)}
                >
                  <PackagePlus className="w-4 h-4 mr-2" />
                  Receive Inventory
                </Button>
              </div>
            </div>

            {/* Parts Catalog Tab */}
            <TabsContent value="parts" className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search parts by name or part number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {lowStockParts.length > 0 && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-amber-500 flex items-center text-sm">
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Low Stock Alert — {lowStockParts.length} items need attention
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {lowStockParts.slice(0, 5).map((part: any) => (
                        <Badge key={part.id} variant="outline" className="border-amber-500/40 text-amber-400">
                          {part.name} ({part.quantityInStock} left)
                        </Badge>
                      ))}
                      {lowStockParts.length > 5 && (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                          +{lowStockParts.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                  <Card>
                    <CardContent className="p-6">
                      <p className="text-muted-foreground">Loading inventory...</p>
                    </CardContent>
                  </Card>
                ) : !filteredParts || filteredParts.length === 0 ? (
                  <div className="col-span-full">
                    <Card>
                      <CardContent className="p-6">
                        <div className="text-center py-8">
                          <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className="text-lg font-medium mb-2">No parts found</h3>
                          <p className="text-muted-foreground">
                            {parts?.length === 0
                              ? "Start by adding parts or receiving an inventory shipment."
                              : "Try adjusting your search criteria."
                            }
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  filteredParts.map((part: any) => (
                    <Card key={part.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">{part.name}</h3>
                            <p className="text-sm text-muted-foreground mb-2">Part #{part.partNumber}</p>
                            {part.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{part.description}</p>
                            )}
                          </div>
                          {part.quantityInStock <= part.lowStockThreshold && (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-400 ml-2">
                              Low Stock
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Price:</span>
                            <span className="font-medium">${Number(part.price).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">In Stock:</span>
                            <span className={`font-medium ${
                              part.quantityInStock <= part.lowStockThreshold
                                ? "text-amber-500"
                                : "text-green-500"
                            }`}>
                              {part.quantityInStock}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Low Stock Alert:</span>
                            <span>{part.lowStockThreshold}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="text-muted-foreground">Total Value:</span>
                            <span className="font-semibold">
                              ${(Number(part.price) * part.quantityInStock).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 flex space-x-2">
                          {isAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                              onClick={() => handleAdjustPart(part)}
                            >
                              <SlidersHorizontal className="w-3 h-3 mr-1" />
                              Adjust
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className={isAdmin ? "" : "flex-1"}
                            onClick={() => handleEditPart(part)}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeletePart(part)}
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Receiving Log Tab */}
            <TabsContent value="intakes" className="space-y-4">
              {intakesLoading ? (
                <p className="text-muted-foreground">Loading receiving log...</p>
              ) : intakes.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No receiving records yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Use "Receive Inventory" to record incoming shipments and automatically update stock.
                    </p>
                    <Button
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={() => setIsReceiveModalOpen(true)}
                    >
                      <PackagePlus className="w-4 h-4 mr-2" />
                      Receive Inventory
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {intakes.map((intake: any) => {
                    const isExpanded = expandedIntakeId === intake.id;
                    const detail = isExpanded ? expandedIntake : null;
                    const hasAncillary = Number(intake.taxAmount) > 0 || Number(intake.deliveryFee) > 0;
                    return (
                    <Card key={intake.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <button
                                className="flex items-center gap-1.5 font-semibold hover:text-amber-400 transition-colors"
                                onClick={() => setExpandedIntakeId(isExpanded ? null : intake.id)}
                              >
                                {isExpanded
                                  ? <ChevronDown className="h-4 w-4 text-amber-400" />
                                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                {intake.vendor}
                              </button>
                              {intake.invoiceNumber && (
                                <Badge variant="outline" className="text-xs">
                                  #{intake.invoiceNumber}
                                </Badge>
                              )}
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {reconciliationIcon(intake.reconciliationStatus)}
                                <span className="capitalize">{intake.reconciliationStatus}</span>
                              </div>
                            </div>
                            <div className="flex gap-6 text-sm text-muted-foreground">
                              <span>{intake.itemCount} line item{intake.itemCount !== 1 ? "s" : ""}</span>
                              {intake.invoiceDate && (
                                <span>Invoice: {new Date(intake.invoiceDate).toLocaleDateString()}</span>
                              )}
                              <span>Received: {new Date(intake.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-lg">
                              ${Number(intake.totalAmount || intake.subtotal || 0).toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Subtotal ${Number(intake.subtotal || 0).toFixed(2)}
                              {Number(intake.taxAmount) > 0 && ` · Tax $${Number(intake.taxAmount).toFixed(2)}`}
                              {Number(intake.deliveryFee) > 0 && ` · Freight $${Number(intake.deliveryFee).toFixed(2)}`}
                            </div>
                          </div>
                        </div>
                        {intake.notes && (
                          <p className="text-sm text-muted-foreground mt-2 border-t pt-2">{intake.notes}</p>
                        )}

                        {/* Expandable line items with landed cost */}
                        {isExpanded && (
                          <div className="mt-3 border-t pt-3">
                            {!detail ? (
                              <p className="text-xs text-muted-foreground">Loading…</p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-muted-foreground border-b">
                                    <th className="text-left pb-1.5 font-medium">Part</th>
                                    <th className="text-left pb-1.5 font-medium w-24">Part #</th>
                                    <th className="text-right pb-1.5 font-medium w-14">Qty</th>
                                    <th className="text-right pb-1.5 font-medium w-24">Unit Cost</th>
                                    <th className="text-right pb-1.5 font-medium w-24">Line Total</th>
                                    <th className={`text-right pb-1.5 font-medium w-28 ${hasAncillary ? "text-amber-400" : ""}`}>
                                      Landed Cost
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                  {detail.items?.map((item: any) => (
                                    <tr key={item.id} className="text-foreground/80">
                                      <td className="py-1.5">{item.partNameSnapshot}</td>
                                      <td className="py-1.5 font-mono text-xs text-muted-foreground">{item.partNumberSnapshot || "—"}</td>
                                      <td className="py-1.5 text-right">{item.qty}</td>
                                      <td className="py-1.5 text-right">${Number(item.unitCost).toFixed(2)}</td>
                                      <td className="py-1.5 text-right">${Number(item.lineTotal).toFixed(2)}</td>
                                      <td className={`py-1.5 text-right font-semibold tabular-nums ${hasAncillary ? "text-amber-400" : ""}`}>
                                        {item.landedCost != null
                                          ? `$${Number(item.landedCost).toFixed(4)}`
                                          : `$${Number(item.unitCost).toFixed(4)}`}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Inventory Counts Tab */}
            <TabsContent value="counts" className="space-y-4">
              {/* In-progress draft banner — shown to session owner or admin */}
              {openCountSession && (
                <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <ClipboardList className="h-5 w-5 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-300">Count session in progress</p>
                      <p className="text-xs text-amber-400/80">
                        A draft physical count is already open
                        {openCountSession.startedByName ? ` by ${openCountSession.startedByName}` : ""}.
                        Resume it to continue counting.
                      </p>
                    </div>
                  </div>
                  <Button
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold shrink-0"
                    onClick={handleStartCount}
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    Resume Count
                  </Button>
                </div>
              )}

              {/* Read-only notice for users who don't own the active draft */}
              {isOtherUsersDraft && (
                <div className="flex items-center gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-3">
                  <Info className="h-5 w-5 text-blue-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-300">A count is in progress</p>
                    <p className="text-xs text-blue-400/80">
                      {anyDraftCountSession?.startedByName
                        ? `${anyDraftCountSession.startedByName} is currently running a physical count.`
                        : "Someone is currently running a physical count."}{" "}
                      Quantities may change until it is submitted.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {openCountSession
                      ? "Continue where you left off or start a new count once the current one is submitted."
                      : isOtherUsersDraft
                      ? "Another count session must be submitted before you can start a new one."
                      : isAdmin && pendingCountSessions.length > 0
                      ? `${pendingCountSessions.length} count${pendingCountSessions.length > 1 ? "s" : ""} pending your review.`
                      : "Start a physical count to verify stock levels against the system."}
                  </p>
                </div>
                {!openCountSession && (
                  isOtherUsersDraft ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>
                          <Button
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
                            disabled
                          >
                            <ClipboardList className="w-4 h-4 mr-2" />
                            Start Count
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {anyDraftCountSession?.startedByName
                          ? `${anyDraftCountSession.startedByName} has a count session open. Wait for it to be submitted before starting a new one.`
                          : "A count session is already open. Wait for it to be submitted before starting a new one."}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
                      onClick={handleStartCount}
                    >
                      <ClipboardList className="w-4 h-4 mr-2" />
                      Start Count
                    </Button>
                  )
                )}
              </div>

              {countSessionsLoading ? (
                <p className="text-muted-foreground">Loading count sessions...</p>
              ) : countSessions.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No count sessions yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Physical inventory counts help you reconcile system quantities against what's actually on the shelf.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {countSessions.map((session: any) => {
                    const statusColors: Record<string, string> = {
                      draft: "border-slate-500/40 text-slate-400",
                      submitted: "border-amber-500/40 text-amber-400",
                      approved: "border-green-500/40 text-green-400",
                      rejected: "border-red-500/40 text-red-400",
                    };
                    const canReview = isAdmin && session.status === "submitted";
                    const canEdit = session.status === "draft";
                    return (
                      <Card key={session.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <Badge variant="outline" className={statusColors[session.status] ?? ""}>
                                  {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                                </Badge>
                                {session.startedByName && (
                                  <span className="text-sm text-muted-foreground">by {session.startedByName}</span>
                                )}
                                <span className="text-sm text-muted-foreground">
                                  {new Date(session.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="flex gap-6 text-sm text-muted-foreground">
                                <span>{session.itemsEntered} / {session.totalItems} parts counted</span>
                                {session.itemsWithVariance > 0 && (
                                  <span className="text-amber-400">
                                    {session.itemsWithVariance} variance{session.itemsWithVariance > 1 ? "s" : ""} (±{session.totalVariance} units)
                                  </span>
                                )}
                              </div>
                              {session.status === "approved" && session.adjustedPartsCount !== null && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <Badge variant="outline" className="border-green-500/40 text-green-400 text-xs font-normal">
                                    {session.adjustedPartsCount} part{session.adjustedPartsCount !== 1 ? "s" : ""} adjusted
                                    {session.netDelta !== null && (
                                      <span className="ml-1">
                                        &middot; net {session.netDelta >= 0 ? "+" : ""}{session.netDelta} units
                                      </span>
                                    )}
                                  </Badge>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 ml-4">
                              {(canEdit || canReview || session.status === "approved" || session.status === "rejected") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={canReview ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10" : ""}
                                  onClick={() => handleOpenCountSession(session)}
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  {canEdit ? "Continue" : canReview ? "Review" : "View"}
                                </Button>
                              )}
                            </div>
                          </div>
                          {session.adminNotes && (
                            <p className="text-xs text-muted-foreground mt-2 border-t border-slate-800 pt-2">
                              Note: {session.adminNotes}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Adjustment History Tab (admin only) */}
            {isAdmin && (
              <TabsContent value="adjustments" className="space-y-4">
                {!adjustmentsLoading && adjustments.length > 0 && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      onClick={handleExportAdjustmentsCSV}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                )}
                {adjustmentsLoading ? (
                  <p className="text-muted-foreground">Loading adjustment history...</p>
                ) : adjustments.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <SlidersHorizontal className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No adjustments yet</h3>
                      <p className="text-muted-foreground">
                        Use the "Adjust" button on any part to make a stock correction. All adjustments are logged here for audit purposes.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="rounded-lg border border-slate-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-800/50">
                          <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
                          <th className="text-left px-4 py-3 text-muted-foreground font-medium">Part</th>
                          <th className="text-left px-4 py-3 text-muted-foreground font-medium">Type</th>
                          <th className="text-right px-4 py-3 text-muted-foreground font-medium">Before</th>
                          <th className="text-right px-4 py-3 text-muted-foreground font-medium">After</th>
                          <th className="text-right px-4 py-3 text-muted-foreground font-medium">Delta</th>
                          <th className="text-left px-4 py-3 text-muted-foreground font-medium">Reason</th>
                          <th className="text-left px-4 py-3 text-muted-foreground font-medium">By</th>
                          <th className="text-left px-4 py-3 text-muted-foreground font-medium">Source Count Session</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adjustments.map((adj: any, i: number) => (
                          <tr
                            key={adj.id}
                            className={`border-b border-slate-800 ${i % 2 === 0 ? "" : "bg-slate-900/30"}`}
                          >
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {new Date(adj.createdAt).toLocaleDateString()}{" "}
                              <span className="text-xs">
                                {new Date(adj.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{adj.partName}</div>
                              {adj.partNumber && (
                                <div className="text-xs text-muted-foreground">#{adj.partNumber}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={
                                  adj.adjustmentType === "add"
                                    ? "border-green-500/40 text-green-400"
                                    : adj.adjustmentType === "subtract"
                                    ? "border-red-500/40 text-red-400"
                                    : "border-amber-500/40 text-amber-400"
                                }
                              >
                                {adj.adjustmentType === "add"
                                  ? "Add"
                                  : adj.adjustmentType === "subtract"
                                  ? "Subtract"
                                  : "Set to"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-mono">{adj.previousQty}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">{adj.newQty}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {deltaIcon(adj.delta)}
                                <span
                                  className={`font-mono font-medium ${
                                    adj.delta > 0
                                      ? "text-green-400"
                                      : adj.delta < 0
                                      ? "text-red-400"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {adj.delta > 0 ? `+${adj.delta}` : adj.delta}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 max-w-[200px]">
                              <div className="truncate" title={adj.reason}>{adj.reason}</div>
                              {adj.referenceNote && (
                                <div className="text-xs text-muted-foreground truncate" title={adj.referenceNote}>
                                  Ref: {adj.referenceNote}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                              {adj.performedBy}
                            </td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              {adj.countSessionId ? (
                                <button
                                  className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1"
                                  onClick={() => handleOpenCountSession({ id: adj.countSessionId })}
                                >
                                  <FileText className="h-3 w-3" />
                                  #{adj.countSessionId.slice(0, 8)}
                                </button>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            )}

            {/* ── Maintenance Catalog Tab ── */}
            <TabsContent value="catalog" className="space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-400" />
                    Maintenance Catalog
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    3-level hierarchy used to classify work order parts. Seeded with trucking defaults.
                  </p>
                </div>
              </div>

              {catalogLoading ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Loading catalog...</div>
              ) : (
                <div className="space-y-3">
                  {/* Add Group (admin only) */}
                  {isAdmin && (
                    <div className="flex gap-2">
                      <input
                        className="flex-1 px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded text-white placeholder:text-muted-foreground focus:outline-none focus:border-amber-500"
                        placeholder="New group name..."
                        value={addingGroupName}
                        onChange={e => setAddingGroupName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && addingGroupName.trim()) {
                            catalogGroupMutation.mutate({ action: "create", name: addingGroupName.trim() });
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={!addingGroupName.trim() || catalogGroupMutation.isPending}
                        onClick={() => catalogGroupMutation.mutate({ action: "create", name: addingGroupName.trim() })}
                        className="bg-amber-500 hover:bg-amber-600 text-white"
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add Group
                      </Button>
                    </div>
                  )}

                  {catalogTree.map((group: any) => (
                    <Card key={group.id} className="bg-slate-900 border-slate-800">
                      {/* Group header */}
                      <div
                        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-slate-800/50 rounded-t-lg"
                        onClick={() => setExpandedCatalogGroup(expandedCatalogGroup === group.id ? null : group.id)}
                      >
                        <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                        {editingCatalogItem && editingCatalogItem.id === group.id && editingCatalogItem.type === "group" ? (
                          <input
                            autoFocus
                            className="flex-1 px-2 py-0.5 text-sm bg-slate-800 border border-amber-500 rounded text-white focus:outline-none"
                            value={editingCatalogItem.name}
                            onChange={e => setEditingCatalogItem(v => v ? { ...v, name: e.target.value } : null)}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === "Enter") catalogGroupMutation.mutate({ action: "rename", id: group.id, name: editingCatalogItem.name });
                              if (e.key === "Escape") setEditingCatalogItem(null);
                            }}
                            onBlur={() => catalogGroupMutation.mutate({ action: "rename", id: group.id, name: editingCatalogItem.name })}
                          />
                        ) : (
                          <span className="flex-1 font-semibold text-sm text-white">{group.name}</span>
                        )}
                        <span className="text-xs text-muted-foreground mr-2">{group.subgroups?.length ?? 0} subgroups</span>
                        {isAdmin && (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              className="p-1 text-muted-foreground hover:text-amber-400 rounded"
                              onClick={() => setEditingCatalogItem({ type: "group", id: group.id, name: group.name })}
                            ><Edit className="w-3.5 h-3.5" /></button>
                            <button
                              className="p-1 text-muted-foreground hover:text-red-400 rounded"
                              onClick={() => { if (confirm(`Delete group "${group.name}" and all its contents?`)) catalogGroupMutation.mutate({ action: "delete", id: group.id }); }}
                            ><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                        {expandedCatalogGroup === group.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </div>

                      {expandedCatalogGroup === group.id && (
                        <div className="border-t border-slate-800 px-4 py-3 space-y-3">
                          {/* Add Subgroup */}
                          {isAdmin && (
                            <div className="flex gap-2 pl-6">
                              <input
                                className="flex-1 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-white placeholder:text-muted-foreground focus:outline-none focus:border-amber-500"
                                placeholder="New subgroup name..."
                                value={addingSubgroupName[group.id] ?? ""}
                                onChange={e => setAddingSubgroupName(v => ({ ...v, [group.id]: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && (addingSubgroupName[group.id] ?? "").trim()) {
                                    catalogSubgroupMutation.mutate({ action: "create", name: addingSubgroupName[group.id].trim(), groupId: group.id });
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!(addingSubgroupName[group.id] ?? "").trim()}
                                onClick={() => catalogSubgroupMutation.mutate({ action: "create", name: addingSubgroupName[group.id].trim(), groupId: group.id })}
                                className="text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                              >
                                <Plus className="w-3 h-3 mr-1" /> Add
                              </Button>
                            </div>
                          )}

                          {group.subgroups?.map((sg: any) => (
                            <div key={sg.id} className="pl-6 space-y-2">
                              {/* Subgroup header */}
                              <div
                                className="flex items-center gap-2 cursor-pointer group"
                                onClick={() => setExpandedCatalogSubgroup(expandedCatalogSubgroup === sg.id ? null : sg.id)}
                              >
                                <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {editingCatalogItem && editingCatalogItem.id === sg.id && editingCatalogItem.type === "subgroup" ? (
                                  <input
                                    autoFocus
                                    className="flex-1 px-2 py-0.5 text-xs bg-slate-800 border border-amber-500 rounded text-white focus:outline-none"
                                    value={editingCatalogItem.name}
                                    onChange={e => setEditingCatalogItem(v => v ? { ...v, name: e.target.value } : null)}
                                    onClick={e => e.stopPropagation()}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") catalogSubgroupMutation.mutate({ action: "rename", id: sg.id, name: editingCatalogItem.name });
                                      if (e.key === "Escape") setEditingCatalogItem(null);
                                    }}
                                    onBlur={() => catalogSubgroupMutation.mutate({ action: "rename", id: sg.id, name: editingCatalogItem.name })}
                                  />
                                ) : (
                                  <span className="flex-1 text-xs font-medium text-slate-200">{sg.name}</span>
                                )}
                                <span className="text-xs text-muted-foreground/60 mr-1">{sg.items?.length ?? 0} items</span>
                                {isAdmin && (
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                    <button className="p-0.5 text-muted-foreground hover:text-amber-400" onClick={() => setEditingCatalogItem({ type: "subgroup", id: sg.id, name: sg.name })}>
                                      <Edit className="w-3 h-3" />
                                    </button>
                                    <button className="p-0.5 text-muted-foreground hover:text-red-400" onClick={() => { if (confirm(`Delete subgroup "${sg.name}"?`)) catalogSubgroupMutation.mutate({ action: "delete", id: sg.id }); }}>
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                                {expandedCatalogSubgroup === sg.id ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                              </div>

                              {expandedCatalogSubgroup === sg.id && (
                                <div className="pl-5 space-y-1">
                                  {sg.items?.map((item: any) => (
                                    <div key={item.id} className="flex items-center gap-2 group py-1">
                                      <div className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                                      {editingCatalogItem && editingCatalogItem.id === item.id && editingCatalogItem.type === "item" ? (
                                        <input
                                          autoFocus
                                          className="flex-1 px-2 py-0.5 text-xs bg-slate-800 border border-amber-500 rounded text-white focus:outline-none"
                                          value={editingCatalogItem.name}
                                          onChange={e => setEditingCatalogItem(v => v ? { ...v, name: e.target.value } : null)}
                                          onKeyDown={e => {
                                            if (e.key === "Enter") catalogItemMutation.mutate({ action: "rename", id: item.id, name: editingCatalogItem.name });
                                            if (e.key === "Escape") setEditingCatalogItem(null);
                                          }}
                                          onBlur={() => catalogItemMutation.mutate({ action: "rename", id: item.id, name: editingCatalogItem.name })}
                                        />
                                      ) : (
                                        <span className="flex-1 text-xs text-slate-300">{item.name}</span>
                                      )}
                                      {linkingItemId === item.id ? (
                                        <div className="flex items-center gap-1 flex-1">
                                          <select
                                            autoFocus
                                            className="flex-1 text-xs bg-slate-800 border border-amber-500 rounded px-1.5 py-0.5 text-white focus:outline-none"
                                            defaultValue={item.partId ?? ""}
                                            onChange={e => {
                                              linkPartMutation.mutate({ itemId: item.id, partId: e.target.value || null });
                                            }}
                                          >
                                            <option value="">— unlink —</option>
                                            {parts.map((p: any) => (
                                              <option key={p.id} value={p.id}>
                                                {p.name} (#{p.partNumber}) · ${Number(p.price).toFixed(2)}
                                              </option>
                                            ))}
                                          </select>
                                          <button className="p-0.5 text-muted-foreground hover:text-red-400" onClick={() => setLinkingItemId(null)}>
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          {item.partId ? (
                                            <Badge className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-400 border-green-500/20 border shrink-0">
                                              {item.partName ?? "Linked"} · ${Number(item.partPrice ?? 0).toFixed(2)}
                                            </Badge>
                                          ) : (
                                            <Badge className="text-[10px] px-1.5 py-0 bg-slate-700/50 text-slate-500 border-0 shrink-0">
                                              no part
                                            </Badge>
                                          )}
                                          {isAdmin && (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <button className="p-0.5 text-muted-foreground hover:text-amber-400" title="Link inventory part" onClick={() => setLinkingItemId(item.id)}>
                                                <Tag className="w-3 h-3" />
                                              </button>
                                              <button className="p-0.5 text-muted-foreground hover:text-amber-400" onClick={() => setEditingCatalogItem({ type: "item", id: item.id, name: item.name })}>
                                                <Edit className="w-3 h-3" />
                                              </button>
                                              <button className="p-0.5 text-muted-foreground hover:text-red-400" onClick={() => { if (confirm(`Delete item "${item.name}"?`)) catalogItemMutation.mutate({ action: "delete", id: item.id }); }}>
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  ))}

                                  {/* Add Item */}
                                  {isAdmin && (
                                    <div className="flex gap-2 pt-1">
                                      <input
                                        className="flex-1 px-2 py-0.5 text-xs bg-slate-800 border border-dashed border-slate-600 rounded text-white placeholder:text-muted-foreground/60 focus:outline-none focus:border-amber-500"
                                        placeholder="Add item..."
                                        value={addingItemName[sg.id] ?? ""}
                                        onChange={e => setAddingItemName(v => ({ ...v, [sg.id]: e.target.value }))}
                                        onKeyDown={e => {
                                          if (e.key === "Enter" && (addingItemName[sg.id] ?? "").trim()) {
                                            catalogItemMutation.mutate({ action: "create", name: addingItemName[sg.id].trim(), subgroupId: sg.id });
                                          }
                                        }}
                                      />
                                      <button
                                        disabled={!(addingItemName[sg.id] ?? "").trim()}
                                        onClick={() => catalogItemMutation.mutate({ action: "create", name: addingItemName[sg.id].trim(), subgroupId: sg.id })}
                                        className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 disabled:opacity-40"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  ))}

                  {catalogTree.length === 0 && !catalogLoading && (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p>No catalog groups yet. Defaults will be seeded automatically.</p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Modals */}
      <InventoryPartModal
        open={isEditModalOpen}
        onOpenChange={(open) => {
          setIsEditModalOpen(open);
          if (!open) setSelectedPart(null);
        }}
        part={selectedPart}
      />

      <ReceiveInventoryModal
        open={isReceiveModalOpen}
        onOpenChange={setIsReceiveModalOpen}
      />

      <InventoryAdjustmentModal
        open={isAdjustModalOpen}
        onOpenChange={(open) => {
          setIsAdjustModalOpen(open);
          if (!open) setSelectedPart(null);
        }}
        part={selectedPart}
      />

      <InventoryCountModal
        open={isCountModalOpen}
        onOpenChange={(open) => {
          setIsCountModalOpen(open);
          if (!open) {
            setSelectedCountSessionId(null);
            queryClient.invalidateQueries({ queryKey: ["/api/inventory/count-sessions"] });
          }
        }}
        sessionId={selectedCountSessionId}
        isAdmin={isAdmin}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Part</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPart?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
