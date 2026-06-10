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
  groupId?: string;
  subgroupId?: string;
  qty: number;
  lotPrice: string;  // user-entered total for the lot; unitCost is derived (lotPrice / qty)
  lineTotal: string; // = lotPrice
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
    groupId: undefined,
    subgroupId: undefined,
    qty: 1,
    lotPrice: "",
    lineTotal: "0.00",
  };
}

function derivedPerUnit(lotPrice: string, qty: number): string {
  const lp = parseFloat(lotPrice) || 0;
  const q = qty || 1;
  return (lp / q).toFixed(2);
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
  const { data: catalogTree = [] } = useQuery<any[]>({ queryKey: ["/api/catalog/tree"] });

  const subtotal = sumLines(items);
  const taxNum = parseFloat(taxAmount) || 0;
  const deliveryNum = parseFloat(deliveryFee) || 0;
  const calculatedTotal = subtotal + taxNum + deliveryNum;
  const reconciliation = getReconciliation(subtotal, taxNum, deliveryNum, totalAmount);

  // Get subgroups for a given groupId
  const getSubgroups = (groupId: string) => {
    const group = (catalogTree as any[]).find((g: any) => g.id === groupId);
    return group?.subgroups ?? [];
  };

  // Get catalog items (maintenanceItems) for a given subgroupId, for name suggestions
  const getCatalogItemsForSubgroup = (groupId: string | undefined, subgroupId: string | undefined) => {
    if (!groupId || !subgroupId) return [];
    const group = (catalogTree as any[]).find((g: any) => g.id === groupId);
    if (!group) return [];
    const subgroup = group.subgroups.find((sg: any) => sg.id === subgroupId);
    return subgroup?.items ?? [];
  };

  const getFilteredParts = (item: LineItem) => {
    const q = (partSearch[item.id] || "").toLowerCase();
    if (!q) return [];

    let pool = allParts as any[];
    // When a subgroup is selected, show only parts in that subgroup
    if (item.subgroupId) {
      pool = pool.filter((p: any) => p.subgroupId === item.subgroupId);
    }
    return pool.filter((p: any) =>
      p.name?.toLowerCase().includes(q) || p.partNumber?.toLowerCase().includes(q)
    ).slice(0, 8);
  };

  // Catalog item name suggestions (not yet linked to a part) for the selected subgroup
  const getCatalogSuggestions = (item: LineItem) => {
    const q = (partSearch[item.id] || "").toLowerCase();
    if (!q || !item.subgroupId) return [];
    const catalogItems = getCatalogItemsForSubgroup(item.groupId, item.subgroupId);
    return catalogItems.filter((ci: any) =>
      ci.name?.toLowerCase().includes(q)
    ).slice(0, 5);
  };

  const updateItem = useCallback((id: string, changes: Partial<LineItem>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const merged = { ...item, ...changes };
      // Lot price is the source of truth — lineTotal always equals lotPrice
      if ("lotPrice" in changes) {
        merged.lineTotal = (parseFloat(changes.lotPrice as string) || 0).toFixed(2);
      }
      // When groupId changes (including when cleared to undefined), reset subgroupId
      if ("groupId" in changes && changes.groupId !== item.groupId) {
        merged.subgroupId = undefined;
      }
      return merged;
    }));
  }, []);

  const addItem = () => setItems(prev => [...prev, newLineItem()]);
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const selectPart = (itemId: string, part: any) => {
    // Lot price = unit price × current qty
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const lotPrice = ((parseFloat(part.price || "0")) * item.qty).toFixed(2);
      return {
        ...item,
        partId: part.id,
        partNameSnapshot: part.name,
        partNumberSnapshot: part.partNumber || "",
        lotPrice,
        lineTotal: lotPrice,
        itemType: (part.itemType as ItemType) || "inventory",
        groupId: part.groupId || undefined,
        subgroupId: part.subgroupId || undefined,
      };
    }));
    setPartSearch(prev => ({ ...prev, [itemId]: part.name }));
    setSearchFocus(null);
  };

  // Select a catalog item (maintenanceItem) that has a linked part → fill from that part
  const selectCatalogItem = (itemId: string, ci: any) => {
    if (ci.partId) {
      const linkedPart = (allParts as any[]).find((p: any) => p.id === ci.partId);
      if (linkedPart) {
        selectPart(itemId, linkedPart);
        return;
      }
    }
    // No linked part — just fill the name; user can add cost/qty manually
    updateItem(itemId, { partNameSnapshot: ci.name });
    setPartSearch(prev => ({ ...prev, [itemId]: ci.name }));
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
        items: filledItems.map(item => {
          const lp = parseFloat(item.lotPrice) || 0;
          const qty = item.qty || 1;
          return {
            partId: item.partId,
            partNameSnapshot: item.partNameSnapshot,
            partNumberSnapshot: item.partNumberSnapshot || "",
            itemType: item.itemType,
            groupId: item.groupId || undefined,
            subgroupId: item.subgroupId || undefined,
            qty,
            unitCost: qty > 0 ? (lp / qty).toFixed(6) : "0",
            lineTotal: lp.toFixed(2),
          };
        }),
      };
      const res = await apiRequest("POST", "/api/inventory/intakes", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/intakes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/tree"] });
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
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
              Select a category and subgroup to scope the item search. Search to link to an existing part, or type a new name to auto-create it on save.
            </p>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-2 py-2 text-foreground font-medium w-6" title="Linked to catalog part" />
                    <th className="text-left px-3 py-2 text-foreground font-medium w-52">Type & Category</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium">Part / Item</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium w-24">Part #</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium w-16">Qty</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium w-28">Lot Price</th>
                    <th className="text-right px-3 py-2 text-foreground font-medium w-24">Line Total</th>
                    <th className="text-right px-3 py-2 text-amber-500 font-medium w-28" title="Unit cost after proportional tax & delivery allocation">Landed</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => {
                    const filteredParts = getFilteredParts(item);
                    const catalogSuggestions = getCatalogSuggestions(item);
                    const subgroups = item.groupId ? getSubgroups(item.groupId) : [];
                    const showDropdown = searchFocus === item.id && (filteredParts.length > 0 || catalogSuggestions.length > 0);

                    return (
                      <tr key={item.id} className="hover:bg-muted/20 align-top">
                        {/* Link status icon */}
                        <td className="px-2 pt-3">
                          {item.partId ? (
                            <span title="Linked to existing catalog part">
                              <Link2 className="h-3.5 w-3.5 text-green-500" />
                            </span>
                          ) : item.partNameSnapshot.trim() ? (
                            <span title="New part — will be created on save">
                              <Plus className="h-3.5 w-3.5 text-amber-500" />
                            </span>
                          ) : (
                            <span>
                              <Unlink className="h-3.5 w-3.5 text-muted-foreground/30" />
                            </span>
                          )}
                        </td>

                        {/* Type toggle + Group + Subgroup stacked */}
                        <td className="px-3 py-2 space-y-1.5">
                          {/* Type toggle */}
                          <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
                            <button
                              type="button"
                              onClick={() => updateItem(item.id, { itemType: "inventory" })}
                              className={`flex-1 px-1.5 py-1 transition-colors ${
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
                              className={`flex-1 px-1.5 py-1 transition-colors border-l border-border ${
                                item.itemType === "consumable"
                                  ? "bg-amber-500 text-white"
                                  : "bg-transparent text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Consumable
                            </button>
                          </div>

                          {/* Group dropdown */}
                          <select
                            value={item.groupId || ""}
                            onChange={e => updateItem(item.id, { groupId: e.target.value || undefined })}
                            className="w-full text-xs bg-muted/30 border border-border rounded px-2 py-1 text-foreground outline-none focus:border-amber-500/60"
                          >
                            <option value="">— Category —</option>
                            {(catalogTree as any[]).map((g: any) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>

                          {/* Subgroup dropdown — only shown when a group is selected */}
                          {item.groupId && (
                            <select
                              value={item.subgroupId || ""}
                              onChange={e => updateItem(item.id, { subgroupId: e.target.value || undefined })}
                              className="w-full text-xs bg-muted/30 border border-border rounded px-2 py-1 text-foreground outline-none focus:border-amber-500/60"
                            >
                              <option value="">— Subgroup —</option>
                              {subgroups.map((sg: any) => (
                                <option key={sg.id} value={sg.id}>{sg.name}</option>
                              ))}
                            </select>
                          )}
                        </td>

                        {/* Part name search */}
                        <td className="px-3 py-2 pt-3">
                          <div className="relative">
                            <div className="flex items-center gap-1">
                              <Search className="h-3 w-3 text-foreground/50 flex-shrink-0" />
                              <input
                                className="flex-1 bg-transparent outline-none text-foreground placeholder:text-foreground/50 min-w-0"
                                placeholder={item.subgroupId ? "Search within subgroup..." : "Search or type part name..."}
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
                                {/* Existing parts */}
                                {filteredParts.length > 0 && (
                                  <>
                                    {item.subgroupId && (
                                      <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border">
                                        Parts in this subgroup
                                      </div>
                                    )}
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
                                  </>
                                )}
                                {/* Catalog item name suggestions (not linked to a part) */}
                                {catalogSuggestions.filter((ci: any) => !filteredParts.find((p: any) => p.id === ci.partId)).length > 0 && (
                                  <>
                                    <div className="px-3 py-1 text-xs text-muted-foreground border-t border-border">
                                      Catalog suggestions
                                    </div>
                                    {catalogSuggestions
                                      .filter((ci: any) => !filteredParts.find((p: any) => p.id === ci.partId))
                                      .map((ci: any) => (
                                        <button
                                          key={ci.id}
                                          className="w-full text-left px-3 py-2 hover:bg-muted text-foreground text-sm flex justify-between items-center"
                                          onMouseDown={() => selectCatalogItem(item.id, ci)}
                                        >
                                          <span>{ci.name}</span>
                                          <span className="text-amber-500 text-xs ml-2">catalog</span>
                                        </button>
                                      ))
                                    }
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Part number */}
                        <td className="px-3 py-2 pt-3">
                          <input
                            className="w-full bg-transparent outline-none text-foreground placeholder:text-foreground/50"
                            placeholder="Part #"
                            value={item.partNumberSnapshot}
                            onChange={e => updateItem(item.id, { partNumberSnapshot: e.target.value })}
                          />
                        </td>

                        {/* Qty */}
                        <td className="px-3 py-2 pt-3">
                          <input
                            type="number"
                            min="1"
                            className="w-full bg-transparent outline-none text-foreground"
                            value={item.qty}
                            onChange={e => updateItem(item.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                          />
                        </td>

                        {/* Lot Price + per-unit derived display */}
                        <td className="px-3 py-2 pt-3">
                          <div className="flex items-center gap-1">
                            <span className="text-foreground/60">$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full bg-transparent outline-none text-foreground"
                              placeholder="0.00"
                              value={item.lotPrice}
                              onChange={e => updateItem(item.id, { lotPrice: e.target.value })}
                            />
                          </div>
                          {item.lotPrice && item.qty > 1 && (
                            <div className="text-xs text-muted-foreground mt-0.5 pl-3">
                              ${derivedPerUnit(item.lotPrice, item.qty)}/unit
                            </div>
                          )}
                        </td>

                        {/* Line Total */}
                        <td className="px-3 py-2 pt-3 text-right font-medium text-foreground">
                          ${parseFloat(item.lineTotal || "0").toFixed(2)}
                        </td>

                        {/* Landed Cost */}
                        <td className="px-3 py-2 pt-3 text-right">
                          {item.partNameSnapshot.trim() ? (
                            <span className={`font-semibold tabular-nums ${taxNum + deliveryNum > 0 ? "text-amber-400" : "text-foreground"}`}>
                              ${parseFloat(calcLandedCost(item.lineTotal, item.qty, subtotal, taxNum + deliveryNum)).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>

                        {/* Delete */}
                        <td className="px-2 py-2 pt-3">
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
