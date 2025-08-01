import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Wrench, AlertCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface MechanicScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mechanic: any;
}

export default function MechanicScheduleModal({ open, onOpenChange, mechanic }: MechanicScheduleModalProps) {
  const { data: repairOrders = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/repair-orders", { mechanicId: mechanic?.id }],
    enabled: !!mechanic?.id && open,
  });

  const activeOrders = repairOrders.filter(order => 
    ['pending', 'in_progress', 'waiting_parts'].includes(order.status)
  );

  const completedOrders = repairOrders.filter(order => 
    ['completed', 'delivered'].includes(order.status)
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'waiting_parts':
        return 'bg-orange-100 text-orange-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'delivered':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (!mechanic) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-white">
                {mechanic.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-lg font-semibold">{mechanic.name}'s Schedule</div>
              <div className="text-sm text-muted-foreground">{mechanic.specialization}</div>
            </div>
          </DialogTitle>
          <DialogDescription>
            Current workload: {mechanic.currentWorkload}/{mechanic.maxWorkload} jobs
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Workload Overview */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Wrench className="h-5 w-5 text-primary" />
                  <span className="font-medium">Workload Status</span>
                </div>
                <Badge 
                  variant={mechanic.isAvailable ? "default" : "secondary"}
                  className={mechanic.isAvailable ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                >
                  {mechanic.isAvailable ? "Available" : "Unavailable"}
                </Badge>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div 
                  className={`h-3 rounded-full transition-all ${
                    mechanic.currentWorkload / mechanic.maxWorkload > 0.8 
                      ? "bg-red-500" 
                      : mechanic.currentWorkload / mechanic.maxWorkload > 0.6
                      ? "bg-yellow-500"
                      : "bg-green-500"
                  }`}
                  style={{ 
                    width: `${Math.min(100, (mechanic.currentWorkload / mechanic.maxWorkload) * 100)}%` 
                  }}
                />
              </div>
              
              <div className="flex justify-between text-sm text-gray-600">
                <span>{mechanic.currentWorkload} active jobs</span>
                <span>{mechanic.maxWorkload} max capacity</span>
              </div>
            </CardContent>
          </Card>

          {/* Active Jobs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>Active Jobs ({activeOrders.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-4 text-gray-500">Loading jobs...</div>
              ) : activeOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>No active jobs assigned</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeOrders.map((order: any) => (
                    <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">#{order.orderNumber}</div>
                        <div className="text-sm text-gray-600 truncate">
                          {order.description}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Est. {order.estimatedHours}h | $${order.totalEstimate}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={getStatusColor(order.status)}>
                          {formatStatus(order.status)}
                        </Badge>
                        <div className="text-xs text-gray-500 mt-1">
                          {order.priority} priority
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Completed Jobs */}
          {completedOrders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5" />
                  <span>Recent Completed Jobs ({completedOrders.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {completedOrders.slice(0, 5).map((order: any) => (
                    <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                      <div className="flex-1">
                        <div className="font-medium">#{order.orderNumber}</div>
                        <div className="text-sm text-gray-600 truncate">
                          {order.description}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Actual: {order.actualHours}h
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={getStatusColor(order.status)}>
                          {formatStatus(order.status)}
                        </Badge>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(order.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}