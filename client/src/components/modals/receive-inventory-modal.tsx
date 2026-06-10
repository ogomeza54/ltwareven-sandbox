import { useState, useCallback } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  PackagePlus, Plus, Trash2, CheckCircle2, AlertTriangle, Search, X, Link2, Unlink
} from "lucide-react";
import DateInput, { todayValue } from "@/components/ui/date-input";

type ItemType = "inventory" | "consumable";

interface LineItem {
  id: string;
  partId?: string;
  partNameSnapshot: string;
  partNumberSnapshot: string;
  itemType: ItemType;
  qty: number;
  unitCost: string;
  lineTotal: string;
}

interface ReceiveInventoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function newLineItem(): LineItem {
  return {
    id: Math.random().toString(36).slice(2),
    partId: undefined,
    partNameSnapshot: "",
    partNumberSnapshot: "",
    itemType: "inventory",
    qty: 1,
    unitCost: "",
    lineTotal: "0.00",
  };
}

function calcLineTotal(qty: number, unitCost: string): string {
  const cost = parseFloat(unitCost) || 0;
  return (qty * cost).toFixed(2);
}

function sumLines(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0);
}

function calcLandedCost(lineTotal: string, qty: number, invoiceSubtotal: number, totalAncillary: number): string {
  const lt = parseFloat(lineTotal || "0");
  const q = qty || 1;
  const weight = invoiceSubtotal > 0 ? lt / invoiceSubtotal : 0;
  const ancillaryShare = weight * totalAncillary;
  return ((lt + ancillaryShare) / q).toFixed(4);
}

type ReconciliationStatus = "matched" | "warning" | "empty";

function getReconciliation(subtotal: number, tax: number, delivery: number, total: string): ReconciliationStatus {
  const entered = parseFloat(total);
  if (!total || isNaN(entered) || entered === 0) return "empty";
  const calculated = subtotal + tax + delivery;
  const diff = Math.abs(calculated - entered);
  if (diff <= 0.01) return "matched";
  return "warning";
}

export default function ReceiveInventoryModal({ open, onOpenChange }: ReceiveInventoryModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayValue());
  const [notes, setNotes] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [items, setItems] = useState<LineItem[]>([newLineItem()]);

  const [partSearch, setPartSearch] = useState<Record<string, string>>({});
  const [searchFocus, setSearchFocus] = useState<string | null>(null);

  const { data: allParts = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"] });

  const subtotal = sumLines(items);
  const taxNum = parseFloat(taxAmount) || 0;
  const deliveryNum = parseFloat(deliveryFee) || 0;
  const calculatedTotal = subtotal + taxNum + deliveryNum;
  const reconciliation = getReconciliation(subtotal, taxNum, deliveryNum, totalAmount);

  const getFilteredParts = (itemId: string) => {
    const q = (partSearch[itemId] || "").toLowerCase();
    if (!q) return [];
    return allParts.filter((p: any) =>
      p.name?.toLowerCase().includes(q) || p.partNumber?.toLowerCase().includes(q)
    ).slice(0, 8);
  };

  const updateItem = useCallback((id: string, changes: Partial<LineItem>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const merged = { ...item, ...changes };
      if (changes.qty !== undefined || changes.unitCost !== undefined) {
        merged.lineTotal = calcLineTotal(merged.qty, merged.unitCost);
      }
      return merged;
    }));
  }, []);

  const addItem = () => setItems(prev => [...prev, newLineItem()]);
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const selectPart = (itemId: string, part: any) => {
    updateItem(itemId, {
      partId: part.id,
      partNameSnapshot: part.name,
      partNumberSnapshot: part.partNumber || "",
      unitCost: part.price?.toString() || "",
    });
    setPartSearch(prev => ({ ...prev, [itemId]: part.name }));
    setSearchFocus(null);
  };

  const clearPart = (itemId: string) => {
    updateItem(itemId, { partId: undefined, partNameSnapshot: "", partNumberSnapshot: "" });
    setPartSearch(prev => ({ ...prev, [itemId]: "" }));
  };

  const resetForm = () => {
    setVendor("");
    setInvoiceNumber("");
    setInvoiceDate("");
    setNotes("");
    setTaxAmount("");
    setDeliveryFee("");
    setTotalAmount("");
    setItems([newLineItem()]);
    setPartSearch({});
    setSearchFocus(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Only send rows that have content (ignore blank trailing rows)
      const filledItems = items.filter(i => i.partNameSnapshot.trim());
      const payload = {
        vendor,
        invoiceNumber: invoiceNumber || undefined,
        invoiceDate: invoiceDate || undefined,
        notes: notes || undefined,
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount || "0",
        deliveryFee: deliveryFee || "0",
        totalAmount: totalAmount || calculatedTotal.toFixed(2),
        items: filledItems.map(item => ({
          partId: item.partId,
          partNameSnapshot: item.partNameSnapshot,
          partNumberSnapshot: item.partNumberSnapshot || "",
          itemType: item.itemType,
          qty: item.qty,
          unitCost: item.unitCost || "0",
          lineTotal: item.lineTotal || "0",
        })),
      };
      const res = await apiRequest("POST", "/api/inventory/intakes", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/intakes"] });
      toast({ title: "Inventory received", description: "Parts stock updated successfully." });
      handleClose();
    },
    onError: (error: any) => {
      toast({ title: "Failed to save intake", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!vendor.trim()) {
      toast({ title: "Vendor required", description: "Please enter a vendor name.", variant: "destructive" });
      return;
    }
    const filledItems = items.filter(i => i.partNameSnapshot.trim());
    if (filledItems.length === 0) {
      toast({ title: "Items required", description: "Add at least one line item.", variant: "destructive" });
      return;
    }
    createMutation.mutate();
  };

  const ReconciliationBadge = () => {
    if (reconciliation === "empty") return null;
    if (reconciliation === "matched") return (
      <Badge className="bg-green-600 text-white gap-1">
        <CheckCircle2 className="h-3 w-3" /> Totals Match
      </Badge>
    );
    return (
      <Badge className="bg-amber-500 text-white gap-1">
        <AlertTriangle className="h-3 w-3" /> Invoice Total Differs
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <PackagePlus className="h-5 w-5 text-amber-500" />
            Receive Inventory
          </DialogTitle>
          <DialogDescription className="text-foreground/70">
            Enter vendor invoice details and line items. Part quantities will be updated on save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Invoice Header */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-foreground font-medium">Vendor / Supplier *</Label>
              <Input
                placeholder="e.g., FleetParts Wholesale"
                value={vendor}
                onChange={e => setVendor(e.target.value)}
                className="text-foreground placeholder:text-foreground/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground font-medium">Invoice Number</Label>
              <Input
                placeholder="e.g., INV-2024-00821"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                className="text-foreground placeholder:text-foreground/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground font-medium">Invoice Date</Label>
              <DateInput
                type="date"
                value={invoiceDate}
                onChange={setInvoiceDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground font-medium">Notes</Label>
              <Input
                placeholder="Optional notes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="text-foreground placeholder:text-foreground/50"
              />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground">Line Items</h3>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Search to link a line item to an existing catalog part. If the part doesn't exist yet, just type the name and part number — it will be created automatically when you save.
            </p>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-foreground font-medium w-6" title="Linked to catalog part = stock will update" />
                    <th className="text-left px-3 py-2 text-foreground font-medium w-36">Type</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium">Part / Item</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium w-28">Part #</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium w-20">Qty</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium w-28">Unit Cost</th>
                    <th className="text-right px-3 py-2 text-foreground font-medium w-28">Line Total</th>
                    <th className="text-right px-3 py-2 text-amber-500 font-medium w-32" title="Unit cost after proportional tax & delivery allocation">Landed Cost</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => {
                    const filteredParts = getFilteredParts(item.id);
                    const showDropdown = searchFocus === item.id && filteredParts.length > 0;

                    return (
                      <tr key={item.id} className="hover:bg-muted/20">
                        <td className="px-2 py-2">
                          {item.partId ? (
                            <span aria-label="Linked to existing catalog part">
                              <Link2 className="h-3.5 w-3.5 text-green-500" />
                            </span>
                          ) : item.partNameSnapshot.trim() ? (
                            <span aria-label="New part — will be created on save" title="New part — will be created on save">
                              <Plus className="h-3.5 w-3.5 text-amber-500" />
                            </span>
                          ) : (
                            <span aria-label="Enter a part name">
                              <Unlink className="h-3.5 w-3.5 text-muted-foreground/30" />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
                            <button
                              type="button"
                              onClick={() => updateItem(item.id, { itemType: "inventory" })}
                              className={`px-2 py-1 transition-colors ${
                                item.itemType === "inventory"
                                  ? "bg-blue-600 text-white"
                                  : "bg-transparent text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Inventory
                            </button>
                            <button
                              type="button"
                              onClick={() => updateItem(item.id, { itemType: "consumable" })}
                              className={`px-2 py-1 transition-colors border-l border-border ${
                                item.itemType === "consumable"
                                  ? "bg-amber-500 text-white"
                                  : "bg-transparent text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Consumable
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <div className="flex items-center gap-1">
                              <Search className="h-3 w-3 text-foreground/50 flex-shrink-0" />
                              <input
                                className="flex-1 bg-transparent outline-none text-foreground placeholder:text-foreground/50 min-w-0"
                                placeholder="Search or type part name..."
                                value={partSearch[item.id] ?? item.partNameSnapshot}
                                onChange={e => {
                                  setPartSearch(prev => ({ ...prev, [item.id]: e.target.value }));
                                  updateItem(item.id, { partNameSnapshot: e.target.value, partId: undefined });
                                }}
                                onFocus={() => setSearchFocus(item.id)}
                                onBlur={() => setTimeout(() => setSearchFocus(null), 150)}
                              />
                              {item.partId && (
                                <button onClick={() => clearPart(item.id)} className="text-foreground/40 hover:text-foreground flex-shrink-0">
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            {showDropdown && (
                              <div className="absolute left-0 top-full z-50 w-80 bg-popover border border-border rounded-md shadow-lg mt-1">
                                {filteredParts.map((part: any) => (
                                  <button
                                    key={part.id}
                                    className="w-full text-left px-3 py-2 hover:bg-muted text-foreground text-sm flex justify-between items-center"
                                    onMouseDown={() => selectPart(item.id, part)}
                                  >
                                    <span className="font-medium">{part.name}</span>
                                    <span className="text-foreground/60 text-xs ml-2">{part.partNumber}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-full bg-transparent outline-none text-foreground placeholder:text-foreground/50"
                            placeholder="Part #"
                            value={item.partNumberSnapshot}
                            onChange={e => updateItem(item.id, { partNumberSnapshot: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            className="w-full bg-transparent outline-none text-foreground"
                            value={item.qty}
                            onChange={e => updateItem(item.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <span className="text-foreground/60">$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full bg-transparent outline-none text-foreground"
                              placeholder="0.00"
                              value={item.unitCost}
                              onChange={e => updateItem(item.id, { unitCost: e.target.value })}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">
                          ${parseFloat(item.lineTotal || "0").toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {item.partNameSnapshot.trim() ? (
                            <span className={`font-semibold tabular-nums ${taxNum + deliveryNum > 0 ? "text-amber-400" : "text-foreground"}`}>
                              ${parseFloat(calcLandedCost(item.lineTotal, item.qty, subtotal, taxNum + deliveryNum)).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {items.length > 1 && (
                            <button onClick={() => removeItem(item.id)} className="text-foreground/40 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Totals */}
          <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 max-w-sm ml-auto">
              <div className="text-foreground font-medium text-right">Parts Subtotal</div>
              <div className="text-foreground text-right font-semibold">${subtotal.toFixed(2)}</div>

              <Label className="text-foreground font-medium text-right self-center">Tax</Label>
              <div className="flex items-center justify-end gap-1">
                <span className="text-foreground/60">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-24 bg-transparent border-b border-border outline-none text-right text-foreground placeholder:text-foreground/50"
                  value={taxAmount}
                  onChange={e => setTaxAmount(e.target.value)}
                />
              </div>

              <Label className="text-foreground font-medium text-right self-center">Delivery / Freight</Label>
              <div className="flex items-center justify-end gap-1">
                <span className="text-foreground/60">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-24 bg-transparent border-b border-border outline-none text-right text-foreground placeholder:text-foreground/50"
                  value={deliveryFee}
                  onChange={e => setDeliveryFee(e.target.value)}
                />
              </div>

              <div className="text-foreground/60 text-right text-sm">Calculated Total</div>
              <div className="text-foreground text-right text-sm">${calculatedTotal.toFixed(2)}</div>

              <Label className="text-foreground font-semibold text-right self-center">Invoice Total</Label>
              <div className="flex items-center justify-end gap-1">
                <span className="text-foreground/60">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-24 bg-transparent border-b-2 border-amber-500 outline-none text-right text-foreground font-semibold placeholder:text-foreground/50"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                />
              </div>
            </div>

            {reconciliation !== "empty" && (
              <div className="flex justify-end pt-1">
                <ReconciliationBadge />
              </div>
            )}

            {reconciliation === "warning" && totalAmount && (
              <p className="text-right text-xs text-amber-500">
                Difference: ${Math.abs(calculatedTotal - parseFloat(totalAmount || "0")).toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
          >
            {createMutation.isPending ? "Saving..." : "Receive & Update Stock"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
