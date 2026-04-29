import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ClipboardList, CheckCircle2, XCircle, ArrowUp, ArrowDown, Minus, Save, Send,
  AlertTriangle, Package, SlidersHorizontal,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface InventoryCountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string | null;
  isAdmin?: boolean;
}

export default function InventoryCountModal({
  open,
  onOpenChange,
  sessionId,
  isAdmin = false,
}: InventoryCountModalProps) {
  const { toast } = useToast();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId ?? null);
  const [localCounts, setLocalCounts] = useState<Record<string, string>>({});
  const [adminNotes, setAdminNotes] = useState("");
  const [scope, setScope] = useState<"all" | "low_stock" | "category">("all");
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => {
    setActiveSessionId(sessionId ?? null);
    setLocalCounts({});
    setAdminNotes("");
    setScope("all");
    setCategoryFilter("");
  }, [sessionId, open]);

  const { data: allParts = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
    enabled: !activeSessionId && open,
  });

  const availableCategories = Array.from(new Set(
    allParts.map((p: any) => p.category).filter(Boolean)
  )).sort();

  const { data: session, isLoading: sessionLoading } = useQuery<any>({
    queryKey: ["/api/inventory/count-sessions", activeSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/count-sessions/${activeSessionId}`);
      if (!res.ok) throw new Error("Failed to load session");
      return res.json();
    },
    enabled: !!activeSessionId && open,
  });

  const { data: sessionAdjustments = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/count-sessions", activeSessionId, "adjustments"],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/count-sessions/${activeSessionId}/adjustments`);
      if (!res.ok) throw new Error("Failed to load adjustments");
      return res.json();
    },
    enabled: !!activeSessionId && open && session?.status === "approved",
  });

  useEffect(() => {
    if (session?.items) {
      const initial: Record<string, string> = {};
      session.items.forEach((item: any) => {
        if (item.countedQty !== null && item.countedQty !== undefined) {
          initial[item.id] = String(item.countedQty);
        }
      });
      setLocalCounts(prev => {
        const merged = { ...initial };
        Object.keys(prev).forEach(k => {
          if (prev[k] !== "") merged[k] = prev[k];
        });
        return merged;
      });
    }
  }, [session]);

  const startCountMutation = useMutation({
    mutationFn: async () => {
      const body: any = { scope };
      if (scope === "category" && categoryFilter.trim()) {
        body.categoryFilter = categoryFilter.trim();
      }
      const res = await apiRequest("POST", "/api/inventory/count-sessions", body);
      return res.json();
    },
    onSuccess: (data) => {
      setActiveSessionId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/count-sessions"] });
    },
    onError: () => {
      toast({ title: "Failed to start count", variant: "destructive" });
    },
  });

  const saveItemsMutation = useMutation({
    mutationFn: async () => {
      const items = Object.entries(localCounts)
        .map(([itemId, val]) => ({
          itemId,
          countedQty: val === "" ? null : parseInt(val, 10),
        }))
        .filter(({ countedQty }) => countedQty === null || !isNaN(countedQty!));

      await apiRequest("PATCH", `/api/inventory/count-sessions/${activeSessionId}/items`, { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/count-sessions", activeSessionId] });
      toast({ title: "Progress saved" });
    },
    onError: () => {
      toast({ title: "Failed to save progress", variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const items = Object.entries(localCounts)
        .map(([itemId, val]) => ({
          itemId,
          countedQty: val === "" ? null : parseInt(val, 10),
        }))
        .filter(({ countedQty }) => countedQty === null || !isNaN(countedQty!));

      if (items.length > 0) {
        await apiRequest("PATCH", `/api/inventory/count-sessions/${activeSessionId}/items`, { items });
      }
      const res = await apiRequest("POST", `/api/inventory/count-sessions/${activeSessionId}/submit`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/count-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/count-sessions", activeSessionId] });
      toast({ title: "Count submitted for admin review" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to submit count", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/inventory/count-sessions/${activeSessionId}/approve`, { adminNotes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/count-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/adjustments"] });
      toast({ title: "Count approved — inventory updated" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to approve count", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/inventory/count-sessions/${activeSessionId}/reject`, { adminNotes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/count-sessions"] });
      toast({ title: "Count rejected" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to reject count", variant: "destructive" });
    },
  });

  const getVariance = (itemId: string, snapshot: number): number | null => {
    const val = localCounts[itemId];
    if (val === undefined || val === "") return null;
    const counted = parseInt(val, 10);
    if (isNaN(counted)) return null;
    return counted - snapshot;
  };

  const varianceIcon = (v: number | null) => {
    if (v === null) return null;
    if (v > 0) return <ArrowUp className="h-3 w-3 text-green-400" />;
    if (v < 0) return <ArrowDown className="h-3 w-3 text-red-400" />;
    return <Minus className="h-3 w-3 text-slate-400" />;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: "border-slate-500/40 text-slate-400",
      submitted: "border-amber-500/40 text-amber-400",
      approved: "border-green-500/40 text-green-400",
      rejected: "border-red-500/40 text-red-400",
    };
    return (
      <Badge variant="outline" className={map[status] ?? ""}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const totalEntered = session?.items
    ? Object.keys(localCounts).filter(k => localCounts[k] !== "").length
    : 0;
  const totalItems = session?.items?.length ?? 0;

  const isReadOnly = session?.status === "approved" || session?.status === "rejected";
  const isSubmitted = session?.status === "submitted";
  const isDraft = session?.status === "draft";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-amber-500" />
            {!activeSessionId
              ? "Start Inventory Count"
              : isDraft
              ? "Physical Count Sheet"
              : isAdmin && isSubmitted
              ? <span>Review Count — Approve or Reject</span>
              : <span className="flex items-center gap-2">Count Session {session && statusBadge(session.status)}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* No session yet — scope selector + start prompt */}
          {!activeSessionId && (
            <div className="flex flex-col gap-6 py-6 px-2 max-w-md mx-auto">
              <div className="flex flex-col items-center gap-3 text-center">
                <ClipboardList className="h-12 w-12 text-amber-500/50" />
                <div>
                  <p className="text-lg font-medium mb-1">Start a Physical Count</p>
                  <p className="text-sm text-muted-foreground">
                    Choose which parts to include. A stock snapshot will be taken at the moment you start.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Parts to count</Label>
                <RadioGroup value={scope} onValueChange={(v) => { setScope(v as "all" | "low_stock" | "category"); setCategoryFilter(""); }} className="space-y-2">
                  <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                    scope === "all" ? "border-amber-500/60 bg-amber-500/5" : "border-slate-700 hover:border-slate-600"
                  }`}>
                    <RadioGroupItem value="all" className="mt-0.5" />
                    <div className="flex items-start gap-2">
                      <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">All Parts</p>
                        <p className="text-xs text-muted-foreground">Count every item in the catalog</p>
                      </div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                    scope === "low_stock" ? "border-amber-500/60 bg-amber-500/5" : "border-slate-700 hover:border-slate-600"
                  }`}>
                    <RadioGroupItem value="low_stock" className="mt-0.5" />
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Low Stock Only</p>
                        <p className="text-xs text-muted-foreground">Only parts at or below their low-stock threshold</p>
                      </div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                    scope === "category" ? "border-amber-500/60 bg-amber-500/5" : "border-slate-700 hover:border-slate-600"
                  }`}>
                    <RadioGroupItem value="category" className="mt-0.5" />
                    <div className="flex items-start gap-2 flex-1">
                      <ClipboardList className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">By Category</p>
                        <p className="text-xs text-muted-foreground mb-2">Only parts in a specific category</p>
                        {scope === "category" && (
                          availableCategories.length > 0 ? (
                            <select
                              className="w-full rounded-md border border-slate-700 bg-slate-900 text-sm px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                              value={categoryFilter}
                              onChange={e => setCategoryFilter(e.target.value)}
                            >
                              <option value="">Select category...</option>
                              {availableCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              placeholder="Type category name..."
                              className="h-8 text-sm"
                              value={categoryFilter}
                              onChange={e => setCategoryFilter(e.target.value)}
                              onClick={e => e.preventDefault()}
                            />
                          )
                        )}
                      </div>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              <Button
                className="bg-amber-500 hover:bg-amber-600 text-white w-full"
                onClick={() => startCountMutation.mutate()}
                disabled={startCountMutation.isPending || (scope === "category" && !categoryFilter.trim())}
              >
                {startCountMutation.isPending ? "Starting..." : "Begin Count"}
              </Button>
            </div>
          )}

          {/* Loading */}
          {activeSessionId && sessionLoading && (
            <p className="text-muted-foreground p-6">Loading count sheet...</p>
          )}

          {/* Session loaded */}
          {activeSessionId && session && (
            <div className="space-y-4">
              {/* Session header info */}
              <div className="flex flex-wrap items-center gap-3 px-1 pb-2 border-b border-slate-700">
                {statusBadge(session.status)}
                {session.startedByName && (
                  <span className="text-sm text-muted-foreground">Started by {session.startedByName}</span>
                )}
                <span className="text-sm text-muted-foreground">
                  {new Date(session.createdAt).toLocaleDateString()} {new Date(session.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                {isDraft && (
                  <span className="text-sm text-muted-foreground ml-auto">
                    {totalEntered} / {totalItems} entered
                  </span>
                )}
              </div>

              {/* Admin notes (read-only display) */}
              {session.adminNotes && (
                <div className="rounded-md border border-slate-700 bg-slate-800/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Admin Notes</p>
                  <p className="text-sm">{session.adminNotes}</p>
                </div>
              )}

              {/* Count sheet table */}
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/50">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">Part</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">System Qty</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium w-32">
                        {isReadOnly || isSubmitted ? "Counted" : "Enter Count"}
                      </th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.items.map((item: any, i: number) => {
                      const variance = isDraft
                        ? getVariance(item.id, item.systemQtySnapshot)
                        : item.variance;
                      return (
                        <tr key={item.id} className={`border-b border-slate-800 ${i % 2 === 0 ? "" : "bg-slate-900/30"}`}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{item.partName}</div>
                            {item.partNumber && (
                              <div className="text-xs text-muted-foreground">#{item.partNumber}</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">{item.systemQtySnapshot}</td>
                          <td className="px-4 py-2.5">
                            {isDraft ? (
                              <Input
                                type="number"
                                min={0}
                                className="w-24 ml-auto text-right h-8 text-sm"
                                placeholder="—"
                                value={localCounts[item.id] ?? ""}
                                onChange={e => setLocalCounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                              />
                            ) : (
                              <div className="text-right font-mono">
                                {item.countedQty !== null ? item.countedQty : <span className="text-muted-foreground">—</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {variance !== null ? (
                              <span className={`flex items-center justify-end gap-1 font-mono ${
                                variance > 0 ? "text-green-400" : variance < 0 ? "text-red-400" : "text-muted-foreground"
                              }`}>
                                {varianceIcon(variance)}
                                {variance > 0 ? `+${variance}` : variance}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Admin review section */}
              {isAdmin && isSubmitted && (
                <div className="space-y-3 pt-2">
                  <Label>Admin Notes (optional)</Label>
                  <Textarea
                    placeholder="Add notes for the count submitter..."
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              )}

              {/* Adjustments created from this session (approved view) */}
              {isReadOnly && session.status === "approved" && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <SlidersHorizontal className="h-4 w-4" />
                    Adjustments Applied
                  </div>
                  {sessionAdjustments.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-1">No stock adjustments were applied (all variances were zero).</p>
                  ) : (
                    <div className="rounded-lg border border-slate-700 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 bg-slate-800/50">
                            <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Part</th>
                            <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Before</th>
                            <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">After</th>
                            <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessionAdjustments.map((adj: any, i: number) => (
                            <tr key={adj.id} className={`border-b border-slate-800 ${i % 2 === 0 ? "" : "bg-slate-900/30"}`}>
                              <td className="px-4 py-2.5">
                                <div className="font-medium">{adj.partName}</div>
                                {adj.partNumber && (
                                  <div className="text-xs text-muted-foreground">#{adj.partNumber}</div>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{adj.previousQty}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-semibold">{adj.newQty}</td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`flex items-center justify-end gap-1 font-mono font-medium ${
                                  adj.delta > 0 ? "text-green-400" : adj.delta < 0 ? "text-red-400" : "text-muted-foreground"
                                }`}>
                                  {adj.delta > 0 ? <ArrowUp className="h-3 w-3" /> : adj.delta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                  {adj.delta > 0 ? `+${adj.delta}` : adj.delta}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {activeSessionId && session && (
          <DialogFooter className="pt-4 border-t border-slate-700 gap-2">
            {isDraft && (
              <>
                <Button
                  variant="outline"
                  onClick={() => saveItemsMutation.mutate()}
                  disabled={saveItemsMutation.isPending || submitMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveItemsMutation.isPending ? "Saving..." : "Save Progress"}
                </Button>
                <Button
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending || saveItemsMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {submitMutation.isPending ? "Submitting..." : "Submit for Review"}
                </Button>
              </>
            )}

            {isAdmin && isSubmitted && (
              <>
                <Button
                  variant="outline"
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending || approveMutation.isPending}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  {rejectMutation.isPending ? "Rejecting..." : "Reject Count"}
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {approveMutation.isPending ? "Approving..." : "Approve & Apply"}
                </Button>
              </>
            )}

            {isReadOnly && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
