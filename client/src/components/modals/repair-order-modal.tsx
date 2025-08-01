import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Car, 
  User, 
  Wrench, 
  Clock, 
  DollarSign, 
  FileText, 
  Image as ImageIcon,
  Phone,
  Mail,
  CheckCircle2
} from "lucide-react";

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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: orders = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/repair-orders"],
    enabled: open,
  });

  const order = orders.find((o: any) => o.id === orderId);

  const updateOrderMutation = useMutation({
    mutationFn: async (updates: any) => {
      const response = await apiRequest("PATCH", `/api/repair-orders/${orderId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Repair order updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update repair order",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-blue-100 text-blue-800";
      case "in_progress":
        return "bg-yellow-100 text-yellow-800";
      case "waiting_parts":
        return "bg-orange-100 text-orange-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "delivered":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (!orderId || !open) return null;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <div className="flex justify-center p-6">
            <p>Loading...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!order) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <div className="flex justify-center p-6">
            <p>Order not found</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Car className="h-6 w-6 text-primary" />
            <div>
              <div className="flex items-center gap-2">
                <span>Order #{order.orderNumber}</span>
                <Badge className={getStatusColor(order.status)}>
                  {formatStatus(order.status)}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground font-normal">
                {order.vehicle?.year} {order.vehicle?.make} {order.vehicle?.model}
              </div>
            </div>
          </DialogTitle>
          <DialogDescription>
            Created on {new Date(order.createdAt).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Vehicle & Customer Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Car className="h-4 w-4" />
                  Vehicle Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Year:</span>
                  <span>{order.vehicle?.year}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Make:</span>
                  <span>{order.vehicle?.make}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model:</span>
                  <span>{order.vehicle?.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">License Plate:</span>
                  <span>{order.vehicle?.licensePlate || "Not provided"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VIN:</span>
                  <span>{order.vehicle?.vin || "Not provided"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mileage:</span>
                  <span>{order.vehicle?.mileage ? `${order.vehicle.mileage.toLocaleString()} miles` : "Not provided"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span>{order.customer?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Phone:</span>
                  <div className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    <span>{order.customer?.phone}</span>
                  </div>
                </div>
                {order.customer?.email && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Email:</span>
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      <span>{order.customer.email}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Repair Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Repair Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{order.description}</p>
            </CardContent>
          </Card>

          {/* Photos */}
          {order.damagePhotos && order.damagePhotos.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImageIcon className="h-4 w-4" />
                  Damage Photos ({order.damagePhotos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {order.damagePhotos.map((photo: string, index: number) => (
                    <div key={index} className="relative group">
                      <img
                        src={`/uploads/${photo}`}
                        alt={`Damage photo ${index + 1}`}
                        className="w-full h-32 object-cover rounded-md border hover:border-primary transition-colors cursor-pointer"
                        onClick={() => window.open(`/uploads/${photo}`, '_blank')}
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded-md flex items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assignment & Progress */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="h-4 w-4" />
                  Assignment & Priority
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Assigned Mechanic:</span>
                  <span className="text-sm font-medium">{order.mechanic?.name || "Auto-assigning..."}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Priority:</span>
                  <Badge variant={order.priority === 'urgent' ? 'destructive' : order.priority === 'high' ? 'default' : 'secondary'}>
                    {order.priority}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge className={getStatusColor(order.status)}>
                    {formatStatus(order.status)}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-4 w-4" />
                  Time & Billing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.totalEstimate && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Estimate:</span>
                    <span className="text-sm font-medium">${Number(order.totalEstimate).toLocaleString()}</span>
                  </div>
                )}
                {order.estimatedHours && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Est. Hours:</span>
                    <span className="text-sm">{order.estimatedHours}h</span>
                  </div>
                )}
                {order.actualHours && Number(order.actualHours) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Actual Hours:</span>
                    <span className="text-sm">{order.actualHours}h</span>
                  </div>
                )}
                {order.laborRate && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Labor Rate:</span>
                    <span className="text-sm">${Number(order.laborRate)}/hr</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Progress Notes */}
          {order.progressNotes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4" />
                  Progress Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{order.progressNotes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button 
            onClick={() => {
              updateOrderMutation.mutate({ 
                status: order.status === 'completed' ? 'delivered' : 'completed' 
              });
            }}
            disabled={updateOrderMutation.isPending}
            className={order.status === 'completed' ? "bg-green-600 hover:bg-green-700" : ""}
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {order.status === 'completed' ? 'Mark as Delivered' : 'Mark as Complete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}