import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import RepairOrderForm from "@/components/forms/repair-order-form";

interface RepairOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
}

export default function RepairOrderModal({ 
  open, 
  onOpenChange, 
  orderId 
}: RepairOrderModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["/api/repair-orders", orderId],
    enabled: !!orderId && open,
  });

  const { data: customer } = useQuery({
    queryKey: ["/api/customers", order?.customerId],
    enabled: !!order?.customerId,
  });

  const { data: vehicle } = useQuery({
    queryKey: ["/api/vehicles", order?.vehicleId],
    enabled: !!order?.vehicleId,
  });

  const { data: mechanic } = useQuery({
    queryKey: ["/api/mechanics", order?.mechanicId],
    enabled: !!order?.mechanicId,
  });

  const { data: partsUsage } = useQuery({
    queryKey: ["/api/repair-orders", orderId, "parts"],
    enabled: !!orderId && open,
  });

  const updateOrderMutation = useMutation({
    mutationFn: async (updates: any) => {
      const response = await fetch(`/api/repair-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to update order");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsEditing(false);
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-blue-100 text-blue-800";
      case "in-progress":
        return "bg-yellow-100 text-yellow-800";
      case "ready-pickup":
        return "bg-green-100 text-green-800";
      case "completed":
        return "bg-gray-100 text-gray-800";
      case "waiting-parts":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (!orderId || !open) return null;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <p className="text-gray-500">Loading repair order...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!order) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <p className="text-gray-500">Repair order not found.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Repair Order - {order.orderNumber}</DialogTitle>
              <p className="text-sm text-gray-500">
                {vehicle?.year} {vehicle?.make} {vehicle?.model} - {customer?.name}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge className={getStatusColor(order.status)}>
                {order.status.replace("-", " ")}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Damage Photos and Description */}
            <div className="space-y-6">
              {/* Damage Photos */}
              {order.damagePhotos && order.damagePhotos.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Damage Photos</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {order.damagePhotos.map((photo: string, index: number) => (
                      <img
                        key={index}
                        src={`/api/uploads/${photo}`}
                        alt={`Damage photo ${index + 1}`}
                        className="rounded-lg shadow-sm w-full h-48 object-cover cursor-pointer hover:opacity-75 transition-opacity"
                        onClick={() => {
                          // Open image in new tab for full view
                          window.open(`/api/uploads/${photo}`, '_blank');
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Repair Description */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Repair Description</h3>
                <p className="text-gray-700 leading-relaxed">
                  {order.description}
                </p>
              </div>

              {/* Customer Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Customer Information</h3>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">Name:</span> {customer?.name}</p>
                  <p><span className="font-medium">Phone:</span> {customer?.phone}</p>
                  {customer?.email && (
                    <p><span className="font-medium">Email:</span> {customer.email}</p>
                  )}
                  {vehicle?.licensePlate && (
                    <p><span className="font-medium">License Plate:</span> {vehicle.licensePlate}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Repair Order Form */}
            <div className="space-y-6">
              <RepairOrderForm
                order={order}
                mechanic={mechanic}
                partsUsage={partsUsage}
                isEditing={isEditing}
                onEdit={() => setIsEditing(true)}
                onCancel={() => setIsEditing(false)}
                onSave={(updates) => updateOrderMutation.mutate(updates)}
                isLoading={updateOrderMutation.isPending}
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-between items-center pt-6 border-t border-gray-200 mt-6">
            <div className="flex space-x-3">
              <Button 
                variant="outline"
                onClick={() => window.print()}
              >
                Print
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  const subject = `Repair Order Update - ${order.orderNumber}`;
                  const body = `Dear ${customer?.name},\n\nYour repair order ${order.orderNumber} has been updated.\n\nStatus: ${order.status}\n\nThank you for choosing our service.`;
                  window.location.href = `mailto:${customer?.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                }}
                disabled={!customer?.email}
              >
                Email Customer
              </Button>
            </div>
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
