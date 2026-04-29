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
import { Search, Package, AlertTriangle, Plus, Edit, Trash2, PackagePlus, CheckCircle2, Clock, FileText } from "lucide-react";
import { useState } from "react";
import InventoryPartModal from "@/components/modals/inventory-part-modal";
import ReceiveInventoryModal from "@/components/modals/receive-inventory-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Inventory() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<any>(null);

  const handleEditPart = (part: any) => {
    setSelectedPart(part);
    setIsEditModalOpen(true);
  };

  const handleDeletePart = (part: any) => {
    setSelectedPart(part);
    setIsDeleteDialogOpen(true);
  };

  const { data: parts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
  });

  const { data: intakes = [], isLoading: intakesLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory/intakes"],
  });

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
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search parts by name or part number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Low Stock Alert */}
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

              {/* Parts Grid */}
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
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
