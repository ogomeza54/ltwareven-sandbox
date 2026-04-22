import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Package, DollarSign, Hash, AlertTriangle } from "lucide-react";

const inventoryPartSchema = z.object({
  name: z.string().optional().or(z.literal("")),
  partNumber: z.string().optional().or(z.literal("")),
  description: z.string().optional(),
  price: z.string().optional().or(z.literal("")),
  quantityInStock: z.string().optional().or(z.literal("")),
  lowStockThreshold: z.string().optional().or(z.literal("")),
});

type InventoryPartFormData = z.infer<typeof inventoryPartSchema>;

interface InventoryPartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part?: any; // For editing existing parts
}

export default function InventoryPartModal({ 
  open, 
  onOpenChange, 
  part 
}: InventoryPartModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = Boolean(part);

  const form = useForm<InventoryPartFormData>({
    resolver: zodResolver(inventoryPartSchema),
    defaultValues: {
      name: part?.name || "",
      partNumber: part?.partNumber || "",
      description: part?.description || "",
      price: part?.price?.toString() || "",
      quantityInStock: part?.quantityInStock?.toString() || "0",
      lowStockThreshold: part?.lowStockThreshold?.toString() || "5",
    },
  });

  const createPartMutation = useMutation({
    mutationFn: async (data: InventoryPartFormData) => {
      const partData = {
        name: data.name || "Unnamed Part",
        partNumber: data.partNumber || "",
        description: data.description || "",
        price: data.price || "0",
        quantityInStock: data.quantityInStock ? parseInt(data.quantityInStock) : 0,
        lowStockThreshold: data.lowStockThreshold ? parseInt(data.lowStockThreshold) : 5,
      };
      
      if (isEditing) {
        return await apiRequest("PATCH", `/api/inventory/${part.id}`, partData);
      } else {
        return await apiRequest("POST", "/api/inventory", partData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({
        title: "Success",
        description: `Inventory part ${isEditing ? 'updated' : 'created'} successfully`,
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || `Failed to ${isEditing ? 'update' : 'create'} inventory part`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InventoryPartFormData) => {
    createPartMutation.mutate(data);
  };

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {isEditing ? 'Edit Inventory Part' : 'Add New Inventory Part'}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Update the details of this inventory part'
              : 'Enter the details for the new inventory part'
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Part Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Brake Pad Set"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="partNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      Part Number
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., BP-2024-001"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Optional description of the part..."
                      className="min-h-[80px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      Price
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        step="0.01"
                        min="0"
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
                name="quantityInStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity in Stock</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        min="0"
                        placeholder="0"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lowStockThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Low Stock Alert
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        min="0"
                        placeholder="5"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                disabled={createPartMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createPartMutation.isPending}
              >
                {createPartMutation.isPending 
                  ? (isEditing ? 'Updating...' : 'Creating...') 
                  : (isEditing ? 'Update Part' : 'Create Part')
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}