import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface InventoryAdjustmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: any | null;
}

export default function InventoryAdjustmentModal({
  open,
  onOpenChange,
  part,
}: InventoryAdjustmentModalProps) {
  const { toast } = useToast();
  const [adjustmentType, setAdjustmentType] = useState<"add" | "subtract" | "set">("add");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [referenceNote, setReferenceNote] = useState("");

  useEffect(() => {
    if (open) {
      setAdjustmentType("add");
      setQuantity("");
      setReason("");
      setReferenceNote("");
    }
  }, [open, part]);

  const currentQty = part?.quantityInStock ?? 0;
  const qty = parseInt(quantity, 10);
  const validQty = !isNaN(qty) && qty >= 0;

  const previewQty = validQty
    ? adjustmentType === "add"
      ? currentQty + qty
      : adjustmentType === "subtract"
      ? currentQty - qty
      : qty
    : null;

  const delta = previewQty !== null ? previewQty - currentQty : null;
  const wouldGoNegative = previewQty !== null && previewQty < 0;

  const mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/inventory/adjustments", {
        partId: part.id,
        adjustmentType,
        quantity: qty,
        reason: reason.trim(),
        referenceNote: referenceNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/adjustments"] });
      toast({ title: "Inventory adjusted successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      let msg = "Failed to adjust inventory";
      try {
        const raw: string = error?.message ?? "";
        const jsonPart = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1).trim() : raw;
        const parsed = JSON.parse(jsonPart);
        if (parsed?.message) msg = parsed.message;
      } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validQty || !reason.trim() || wouldGoNegative) return;
    mutation.mutate();
  };

  if (!part) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Inventory</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-lg bg-slate-800/60 border border-slate-700 px-4 py-3 space-y-1">
            <p className="text-sm font-semibold">{part.name}</p>
            <p className="text-xs text-muted-foreground">Part #{part.partNumber}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Current Stock:</span>
              <Badge
                variant="outline"
                className={
                  currentQty <= part.lowStockThreshold
                    ? "border-amber-500/50 text-amber-400"
                    : "border-green-500/50 text-green-400"
                }
              >
                {currentQty} units
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Adjustment Type</Label>
            <RadioGroup
              value={adjustmentType}
              onValueChange={(v) => setAdjustmentType(v as "add" | "subtract" | "set")}
              className="grid grid-cols-3 gap-2"
            >
              <Label
                htmlFor="type-add"
                className={`flex flex-col items-center gap-1 cursor-pointer rounded-lg border p-3 transition-colors ${
                  adjustmentType === "add"
                    ? "border-green-500 bg-green-500/10 text-green-400"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <RadioGroupItem value="add" id="type-add" className="sr-only" />
                <ArrowUp className="h-4 w-4" />
                <span className="text-xs font-medium">Add</span>
              </Label>
              <Label
                htmlFor="type-subtract"
                className={`flex flex-col items-center gap-1 cursor-pointer rounded-lg border p-3 transition-colors ${
                  adjustmentType === "subtract"
                    ? "border-red-500 bg-red-500/10 text-red-400"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <RadioGroupItem value="subtract" id="type-subtract" className="sr-only" />
                <ArrowDown className="h-4 w-4" />
                <span className="text-xs font-medium">Subtract</span>
              </Label>
              <Label
                htmlFor="type-set"
                className={`flex flex-col items-center gap-1 cursor-pointer rounded-lg border p-3 transition-colors ${
                  adjustmentType === "set"
                    ? "border-amber-500 bg-amber-500/10 text-amber-400"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <RadioGroupItem value="set" id="type-set" className="sr-only" />
                <Target className="h-4 w-4" />
                <span className="text-xs font-medium">Set to</span>
              </Label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">
              {adjustmentType === "add"
                ? "Quantity to Add"
                : adjustmentType === "subtract"
                ? "Quantity to Subtract"
                : "New Quantity"}
            </Label>
            <Input
              id="quantity"
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
            />
          </div>

          {previewQty !== null && (
            <div
              className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm ${
                wouldGoNegative
                  ? "bg-red-500/10 border border-red-500/30"
                  : "bg-slate-800/60 border border-slate-700"
              }`}
            >
              <span className="text-muted-foreground">New quantity:</span>
              <div className="flex items-center gap-2">
                {delta !== null && delta !== 0 && (
                  <span
                    className={`text-xs font-medium ${
                      delta > 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
                <span
                  className={`font-bold text-base ${
                    wouldGoNegative ? "text-red-400" : "text-white"
                  }`}
                >
                  {previewQty}
                </span>
              </div>
            </div>
          )}

          {wouldGoNegative && (
            <p className="text-xs text-red-400">Quantity cannot go below zero.</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason <span className="text-red-400">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Physical count correction, damaged goods write-off, cycle count..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference-note">Reference Note (optional)</Label>
            <Input
              id="reference-note"
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              placeholder="e.g. PO-1234, audit ref #, work order #..."
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
              disabled={
                mutation.isPending ||
                !validQty ||
                !reason.trim() ||
                wouldGoNegative
              }
            >
              {mutation.isPending ? "Saving..." : "Apply Adjustment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
