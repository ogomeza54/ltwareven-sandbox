import { useQuery, useMutation } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Search, Package, AlertTriangle, Plus, Edit, Trash2 } from "lucide-react";
import { useState } from "react";
import InventoryPartModal from "@/components/modals/inventory-part-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Inventory() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
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

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Inventory Management"
          subtitle="Track parts and stock levels"
        />

        <div className="p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Parts</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {isLoading ? "..." : parts.length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Package className="text-primary text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {isLoading ? "..." : lowStockParts.length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="text-yellow-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Value</p>
                    <p className="text-3xl font-bold text-gray-900">
                      ${isLoading ? "..." : (parts?.reduce((sum: number, part: any) => 
                        sum + (Number(part.price) * part.quantityInStock), 0
                      ) || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Package className="text-green-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions and Search */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search parts by name or part number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button 
              className="bg-primary text-white hover:bg-blue-700 whitespace-nowrap"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Part
            </Button>
          </div>

          {/* Low Stock Alert */}
          {lowStockParts && lowStockParts.length > 0 && (
            <Card className="mb-6 border-yellow-200 bg-yellow-50">
              <CardHeader>
                <CardTitle className="text-yellow-800 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Low Stock Alert
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-yellow-700 mb-3">
                  {lowStockParts.length} parts are running low on stock and may need reordering.
                </p>
                <div className="flex flex-wrap gap-2">
                  {lowStockParts.slice(0, 5).map((part: any) => (
                    <Badge key={part.id} variant="outline" className="border-yellow-300 text-yellow-800">
                      {part.name} ({part.quantityInStock} left)
                    </Badge>
                  ))}
                  {lowStockParts.length > 5 && (
                    <Badge variant="outline" className="border-yellow-300 text-yellow-800">
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
                  <p className="text-gray-500">Loading inventory...</p>
                </CardContent>
              </Card>
            ) : !filteredParts || filteredParts.length === 0 ? (
              <div className="col-span-full">
                <Card>
                  <CardContent className="p-6">
                    <div className="text-center py-8">
                      <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No parts found</h3>
                      <p className="text-gray-500">
                        {parts?.length === 0 
                          ? "Start by adding your first inventory part."
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
                        <h3 className="font-semibold text-gray-900 mb-1">{part.name}</h3>
                        <p className="text-sm text-gray-500 mb-2">Part #{part.partNumber}</p>
                        {part.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">{part.description}</p>
                        )}
                      </div>
                      {part.quantityInStock <= part.lowStockThreshold && (
                        <Badge variant="outline" className="border-yellow-300 text-yellow-800 ml-2">
                          Low Stock
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Price:</span>
                        <span className="font-medium">${Number(part.price).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">In Stock:</span>
                        <span className={`font-medium ${
                          part.quantityInStock <= part.lowStockThreshold 
                            ? "text-yellow-600" 
                            : "text-green-600"
                        }`}>
                          {part.quantityInStock}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Low Stock Alert:</span>
                        <span className="text-gray-900">{part.lowStockThreshold}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-600">Total Value:</span>
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
