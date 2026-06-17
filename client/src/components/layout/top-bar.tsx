import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Plus, AlertTriangle, ClipboardList, Wrench } from "lucide-react";
import { useLocation } from "wouter";

interface TopBarProps {
  title: string;
  subtitle?: string;
  onNewIntake?: () => void;
}

interface Notifications {
  lowStock: { id: string; name: string; quantityInStock: number; lowStockThreshold: number }[];
  pendingCountReviews: { id: string; createdAt: string; startedByName?: string }[];
  pendingRepairOrders: { id: string; orderNumber: string; priority?: string }[];
}

export default function TopBar({ title, subtitle, onNewIntake }: TopBarProps) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery<Notifications>({
    queryKey: ["/api/notifications"],
    refetchInterval: 60_000,
  });

  const totalCount =
    (notifications?.lowStock.length ?? 0) +
    (notifications?.pendingCountReviews.length ?? 0) +
    (notifications?.pendingRepairOrders.length ?? 0);

  const handleNewIntake = () => {
    if (onNewIntake) {
      onNewIntake();
    } else {
      navigate("/intake");
    }
  };

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex items-center space-x-3">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button className="relative p-2 text-slate-400 hover:text-slate-200 transition-colors">
                <Bell className="w-5 h-5" />
                {totalCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-bold px-0.5">
                    {totalCount > 99 ? "99+" : totalCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0 bg-slate-900 border-slate-700 text-white"
              align="end"
              sideOffset={8}
            >
              <div className="px-4 py-3 border-b border-slate-700">
                <h3 className="font-semibold text-sm text-white">Notifications</h3>
                {totalCount > 0 && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {totalCount} item{totalCount !== 1 ? "s" : ""} need attention
                  </p>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {totalCount === 0 && (
                  <div className="px-4 py-8 text-center">
                    <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">All caught up!</p>
                    <p className="text-xs text-slate-500 mt-0.5">No alerts right now.</p>
                  </div>
                )}

                {(notifications?.lowStock.length ?? 0) > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700">
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" />
                        Low Stock ({notifications!.lowStock.length})
                      </p>
                    </div>
                    {notifications!.lowStock.map((part) => (
                      <button
                        key={part.id}
                        onClick={() => go("/inventory")}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0"
                      >
                        <p className="text-sm text-white font-medium truncate">{part.name}</p>
                        <p className="text-xs text-amber-400/80 mt-0.5">
                          {part.quantityInStock} in stock · threshold {part.lowStockThreshold}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {(notifications?.pendingCountReviews.length ?? 0) > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700">
                      <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                        <ClipboardList className="w-3 h-3" />
                        Count Review ({notifications!.pendingCountReviews.length})
                      </p>
                    </div>
                    {notifications!.pendingCountReviews.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => go("/inventory?tab=counts")}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0"
                      >
                        <p className="text-sm text-white font-medium">Count session pending review</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {session.startedByName
                            ? `Submitted by ${session.startedByName}`
                            : "Awaiting admin approval"}
                          {" · "}{new Date(session.createdAt).toLocaleDateString()}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {(notifications?.pendingRepairOrders.length ?? 0) > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700">
                      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                        <Wrench className="w-3 h-3" />
                        Pending Orders ({notifications!.pendingRepairOrders.length})
                      </p>
                    </div>
                    {notifications!.pendingRepairOrders.map((order) => (
                      <button
                        key={order.id}
                        onClick={() => go("/repair-orders")}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0"
                      >
                        <p className="text-sm text-white font-medium">Work Order #{order.orderNumber}</p>
                        {order.priority && (
                          <p className="text-xs text-slate-400 mt-0.5 capitalize">Priority: {order.priority}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            onClick={handleNewIntake}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Intake
          </Button>
        </div>
      </div>
    </header>
  );
}
