import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  User, 
  Plus, 
  Trash2, 
  Search,
  Clock,
  DollarSign
} from "lucide-react";

const repairOrderSchema = z.object({
  status: z.enum(["pending", "in-progress", "waiting-parts", "ready-pickup", "completed"]),
  progressNotes: z.string().optional(),
  actualHours: z.string().optional(),
  totalEstimate: z.string().optional(),
});

type RepairOrderFormData = z.infer<typeof repairOrderSchema>;

interface RepairOrderFormProps {
  order: any;
  mechanic?: any;
  partsUsage?: any[];
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (updates: any) => void;
  isLoading: boolean;
}

export default function RepairOrderForm({
  order,
  mechanic,
  partsUsage = [],
  isEditing,
  onEdit,
  onCancel,
  onSave,
  isLoading
}: RepairOrderFormProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPart, setSelectedPart] = useState<any>(null);
  const [partQuantity, setPartQuantity] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<RepairOrderFormData>({
    resolver: zodResolver(repairOrderSchema),
    defaultValues: {
      status: order.status,
      progressNotes: order.progressNotes || "",
      actualHours: order.actualHours?.toString() || "",
      totalEstimate: order.totalEstimate?.toString() || "",
    },
  });

  const { data: searchResults = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/search", { q: searchTerm }],
    enabled: searchTerm.length > 2,
  });

  const addPartMutation = useMutation({
    mutationFn: async (partData: any) => {
      const response = await fetch(`/api/repair-orders/${order.id}/parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partData),
      });
      if (!response.ok) throw new Error("Failed to add part");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders", order.id, "parts"] });
      setSearchTerm("");
      setSelectedPart(null);
      setPartQuantity(1);
      toast({
        title: "Success",
        description: "Part added to repair order",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add part",
        variant: "destructive",
      });
    },
  });

  const removePartMutation = useMutation({
    mutationFn: async (usageId: string) => {
      const response = await fetch(`/api/parts-usage/${usageId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to remove part");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders", order.id, "parts"] });
      toast({
        title: "Success",
        description: "Part removed from repair order",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove part",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RepairOrderFormData) => {
    const updates = {
      ...data,
      actualHours: data.actualHours ? parseFloat(data.actualHours) : undefined,
      totalEstimate: data.totalEstimate ? parseFloat(data.totalEstimate) : undefined,
    };
    onSave(updates);
  };

  const handleAddPart = () => {
    if (!selectedPart) return;
    
    addPartMutation.mutate({
      partId: selectedPart.id,
      quantity: partQuantity,
      unitPrice: selectedPart.price,
    });
  };

  const totalPartsValue = partsUsage.reduce((sum, usage) => 
    sum + (Number(usage.quantity) * Number(usage.unitPrice)), 0
  );

  const laborCost = order.actualHours && mechanic?.hourlyRate 
    ? Number(order.actualHours) * Number(mechanic.hourlyRate)
    : 0;

  const totalEstimate = totalPartsValue + laborCost;

  // Update form when estimate changes
  useEffect(() => {
    if (isEditing && totalEstimate > 0) {
      form.setValue("totalEstimate", totalEstimate.toString());
    }
  }, [totalEstimate, isEditing, form]);

  return (
    <div className="space-y-6">
      {/* Assigned Mechanic */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Assigned Mechanic</h3>
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
            <User className="text-white" />
          </div>
          <div>
            <p className="font-medium text-gray-900">
              {mechanic?.name || "Auto-assigning..."}
            </p>
            <p className="text-sm text-gray-500">
              {mechanic?.specialization || ""}
            </p>
            {mechanic?.isAvailable && (
              <p className="text-xs text-green-600">Available</p>
            )}
          </div>
        </div>
      </div>

      {/* Parts & Materials */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Parts & Materials</CardTitle>
            {isEditing && (
              <Button
                size="sm"
                onClick={() => setSearchTerm(searchTerm || " ")}
                disabled={addPartMutation.isPending}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Part
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {partsUsage.map((usage: any) => (
            <div key={usage.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
              <div className="flex-1">
                <p className="font-medium text-gray-900">{usage.part?.name}</p>
                <p className="text-sm text-gray-500">Part #{usage.part?.partNumber}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-900">
                  ${Number(usage.unitPrice).toFixed(2)}
                </p>
                <p className="text-sm text-gray-500">Qty: {usage.quantity}</p>
              </div>
              {isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-3 text-red-600 hover:text-red-700"
                  onClick={() => removePartMutation.mutate(usage.id)}
                  disabled={removePartMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}

          {partsUsage.length === 0 && (
            <p className="text-gray-500 text-center py-4">No parts assigned yet</p>
          )}

          {/* Add Part Form */}
          {isEditing && searchTerm && (
            <div className="p-3 border-2 border-dashed border-gray-300 rounded-lg">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search parts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                {searchResults && searchResults.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border rounded">
                    {searchResults.map((part: any) => (
                      <div
                        key={part.id}
                        className={`p-2 cursor-pointer hover:bg-gray-50 ${
                          selectedPart?.id === part.id ? "bg-blue-50" : ""
                        }`}
                        onClick={() => setSelectedPart(part)}
                      >
                        <p className="font-medium text-sm">{part.name}</p>
                        <p className="text-xs text-gray-500">
                          #{part.partNumber} - ${Number(part.price).toFixed(2)} 
                          ({part.quantityInStock} in stock)
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {selectedPart && (
                  <div className="flex items-center space-x-2">
                    <Input
                      type="number"
                      value={partQuantity}
                      onChange={(e) => setPartQuantity(parseInt(e.target.value) || 1)}
                      min="1"
                      max={selectedPart.quantityInStock}
                      className="w-20"
                    />
                    <span className="text-sm text-gray-600">x {selectedPart.name}</span>
                    <Button
                      size="sm"
                      onClick={handleAddPart}
                      disabled={addPartMutation.isPending}
                    >
                      Add
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Labor & Time Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="w-5 h-5 mr-2" />
            Labor & Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Estimated Time:</span>
              <span className="font-medium">
                {order.estimatedHours ? `${order.estimatedHours} hours` : "Not set"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Time Worked:</span>
              <span className="font-medium text-blue-600">
                {order.actualHours ? `${order.actualHours} hours` : "0 hours"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Labor Rate:</span>
              <span className="font-medium">
                {mechanic?.hourlyRate ? `$${Number(mechanic.hourlyRate)}/hour` : "Not set"}
              </span>
            </div>
            <div className="border-t pt-3 mt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Parts Total:</span>
                <span className="font-medium">${totalPartsValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Labor Total:</span>
                <span className="font-medium">${laborCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center font-semibold text-lg border-t pt-2">
                <span>Total Estimate:</span>
                <span className="text-green-600">${totalEstimate.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Update */}
      {isEditing ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Update Order</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in-progress">In Progress</SelectItem>
                          <SelectItem value="waiting-parts">Waiting for Parts</SelectItem>
                          <SelectItem value="ready-pickup">Ready for Pickup</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="actualHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Actual Hours Worked</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.1"
                          placeholder="0.0" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalEstimate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Estimate</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="0.00" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="progressNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Progress Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Add progress notes..."
                          className="h-20"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex space-x-3">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
                className="bg-primary text-white hover:bg-blue-700"
              >
                {isLoading ? "Updating..." : "Update Order"}
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <Badge className={`${
                order.status === "pending" ? "bg-blue-100 text-blue-800" :
                order.status === "in-progress" ? "bg-yellow-100 text-yellow-800" :
                order.status === "ready-pickup" ? "bg-green-100 text-green-800" :
                order.status === "completed" ? "bg-gray-100 text-gray-800" :
                "bg-orange-100 text-orange-800"
              }`}>
                {order.status.replace("-", " ")}
              </Badge>
            </div>
            {order.progressNotes && (
              <div>
                <span className="text-gray-600">Progress Notes:</span>
                <p className="text-sm text-gray-900 mt-1">{order.progressNotes}</p>
              </div>
            )}
            <Button onClick={onEdit} className="w-full">
              Edit Order
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
