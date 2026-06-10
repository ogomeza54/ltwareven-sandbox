import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Package, BookOpen, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CatalogPartPickerProps {
  orderId: string;
  onAdded: () => void;
}

export default function CatalogPartPicker({ orderId, onAdded }: CatalogPartPickerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Catalog cascade state
  const [mode, setMode] = useState<"catalog" | "inventory">("catalog");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedSubgroupId, setSelectedSubgroupId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [addQty, setAddQty] = useState("1");

  // Flat inventory state
  const [flatPartId, setFlatPartId] = useState("");
  const [flatQty, setFlatQty] = useState("1");

  const { data: catalogTree = [] } = useQuery<any[]>({
    queryKey: ["/api/catalog/tree"],
  });

  const { data: inventory = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
  });

  // Derived selections
  const selectedGroup = catalogTree.find((g: any) => g.id === selectedGroupId);
  const subgroups: any[] = selectedGroup?.subgroups ?? [];
  const selectedSubgroup = subgroups.find((sg: any) => sg.id === selectedSubgroupId);
  const items: any[] = selectedSubgroup?.items ?? [];
  const selectedItem = items.find((i: any) => i.id === selectedItemId);

  const addPartMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/repair-orders/${orderId}/parts`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parts-usage", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      // Reset selections
      setSelectedGroupId("");
      setSelectedSubgroupId("");
      setSelectedItemId("");
      setAddQty("1");
      setFlatPartId("");
      setFlatQty("1");
      toast({ title: "Part added", description: "Inventory decremented." });
      onAdded();
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message || "Failed to add part", variant: "destructive" }),
  });

  const handleAddFromCatalog = () => {
    if (!selectedItem?.partId) return;
    const qty = parseInt(addQty) || 1;
    addPartMutation.mutate({
      partId: selectedItem.partId,
      repairOrderId: orderId,
      quantity: qty,
      unitPrice: String(selectedItem.partPrice ?? "0"),
      groupSnapshot: selectedGroup?.name ?? null,
      subgroupSnapshot: selectedSubgroup?.name ?? null,
    });
  };

  const handleAddFromInventory = () => {
    if (!flatPartId) return;
    const part = inventory.find((p: any) => p.id === flatPartId);
    if (!part) return;
    addPartMutation.mutate({
      partId: flatPartId,
      repairOrderId: orderId,
      quantity: parseInt(flatQty) || 1,
      unitPrice: String(part.price),
      groupSnapshot: null,
      subgroupSnapshot: null,
    });
  };

  const canAddCatalog = !!selectedItem?.partId && parseInt(addQty) > 0;
  const canAddFlat = !!flatPartId && parseInt(flatQty) > 0;

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
        <button
          onClick={() => setMode("catalog")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            mode === "catalog"
              ? "bg-amber-500 text-white"
              : "text-muted-foreground hover:text-white"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          From Catalog
        </button>
        <button
          onClick={() => setMode("inventory")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            mode === "inventory"
              ? "bg-amber-500 text-white"
              : "text-muted-foreground hover:text-white"
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          From Inventory
        </button>
      </div>

      {mode === "catalog" ? (
        <div className="space-y-2">
          {/* Breadcrumb hint */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className={selectedGroupId ? "text-amber-400" : ""}>Group</span>
            <ChevronRight className="w-3 h-3" />
            <span className={selectedSubgroupId ? "text-amber-400" : ""}>Subgroup</span>
            <ChevronRight className="w-3 h-3" />
            <span className={selectedItemId ? "text-amber-400" : ""}>Item</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {/* Group */}
            <Select
              value={selectedGroupId}
              onValueChange={(v) => {
                setSelectedGroupId(v);
                setSelectedSubgroupId("");
                setSelectedItemId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="1. Select group..." />
              </SelectTrigger>
              <SelectContent>
                {catalogTree.map((g: any) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Subgroup */}
            <Select
              value={selectedSubgroupId}
              onValueChange={(v) => {
                setSelectedSubgroupId(v);
                setSelectedItemId("");
              }}
              disabled={!selectedGroupId}
            >
              <SelectTrigger>
                <SelectValue placeholder="2. Select subgroup..." />
              </SelectTrigger>
              <SelectContent>
                {subgroups.map((sg: any) => (
                  <SelectItem key={sg.id} value={sg.id}>
                    {sg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Item */}
            <Select
              value={selectedItemId}
              onValueChange={setSelectedItemId}
              disabled={!selectedSubgroupId}
            >
              <SelectTrigger>
                <SelectValue placeholder="3. Select item..." />
              </SelectTrigger>
              <SelectContent>
                {items.map((item: any) => (
                  <SelectItem key={item.id} value={item.id} disabled={!item.partId}>
                    <span className={!item.partId ? "text-muted-foreground" : ""}>
                      {item.name}
                      {item.partId
                        ? ` — $${Number(item.partPrice ?? 0).toFixed(2)} (${item.partQty ?? 0} in stock)`
                        : " — no part linked"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Selected item preview */}
            {selectedItem && selectedItem.partId && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs">
                <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-amber-300">{selectedItem.partName}</span>
                  <span className="text-muted-foreground ml-1">#{selectedItem.partNumber}</span>
                </div>
                <Badge className="bg-amber-500/20 text-amber-400 border-0 text-xs shrink-0">
                  ${Number(selectedItem.partPrice ?? 0).toFixed(2)} ea.
                </Badge>
              </div>
            )}

            {/* Qty + add */}
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                className="w-20"
                placeholder="Qty"
              />
              <Button
                onClick={handleAddFromCatalog}
                disabled={!canAddCatalog || addPartMutation.isPending}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
              >
                <Plus className="w-4 h-4 mr-1" />
                {addPartMutation.isPending ? "Adding..." : "Add Part"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <Select value={flatPartId} onValueChange={setFlatPartId}>
              <SelectTrigger>
                <SelectValue placeholder="Select from inventory..." />
              </SelectTrigger>
              <SelectContent>
                {inventory
                  .filter((p: any) => p.quantityInStock > 0)
                  .map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — ${Number(p.price).toFixed(2)} ({p.quantityInStock} in stock)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="1"
              value={flatQty}
              onChange={(e) => setFlatQty(e.target.value)}
              className="w-20"
              placeholder="Qty"
            />
            <Button
              onClick={handleAddFromInventory}
              disabled={!canAddFlat || addPartMutation.isPending}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
