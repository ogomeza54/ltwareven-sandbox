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
  Search, Package, AlertTriangle, Plus, Edit, Trash2, PackagePlus,
  CheckCircle2, Clock, FileText, SlidersHorizontal, ArrowUp, ArrowDown, Minus,
  ClipboardList, Eye, Download,
} from "lucide-react";
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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isCountModalOpen, setIsCountModalOpen] = useState(false);
  const [selectedCountSessionId, setSelectedCountSessionId] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<any>(null);

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

  const { data: parts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
  });

  const { data: intakes = [], isLoading: intakesLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory/intakes"],
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
  // Admins see any open draft; regular users only see their own draft
  const openCountSession = countSessions.find((s: any) =>
    s.status === "draft" && (isAdmin || s.startedByUserId === currentUser?.id)
  );

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
              </TabsList>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsAddModalOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Part
                </Button>
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
                  {intakes.map((intake: any) => (
                    <Card key={intake.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="font-semibold">{intake.vendor}</span>
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
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Inventory Counts Tab */}
            <TabsContent value="counts" className="space-y-4">
              {/* In-progress draft banner */}
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

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {openCountSession
                      ? "Continue where you left off or start a new count once the current one is submitted."
                      : isAdmin && pendingCountSessions.length > 0
                      ? `${pendingCountSessions.length} count${pendingCountSessions.length > 1 ? "s" : ""} pending your review.`
                      : "Start a physical count to verify stock levels against the system."}
                  </p>
                </div>
                {!openCountSession && (
                  <Button
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
                    onClick={handleStartCount}
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    Start Count
                  </Button>
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
          </Tabs>
        </div>
      </main>

      {/* Modals */}
      <InventoryPartModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
      />

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
