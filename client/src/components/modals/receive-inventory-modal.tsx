import { useState, useCallback, useRef } from "react";
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
import { InvoiceSourceUpload } from "@/features/invoice-extraction/invoice-source-upload";
import {
  confirmInvoiceIntent,
  createInvoiceConfirmationIntent,
  overrideInvoiceDuplicate,
  updateInvoiceHeaderReview,
  updateInvoiceLineMatches,
  updateInvoiceLinesReview,
} from "@/features/invoice-extraction/invoice-source-api";
import type {
  InvoiceConfirmationIntentDto,
  InvoiceHeaderField,
  InvoiceReviewWorkspaceDto,
} from "@shared/invoice-extraction/contracts";

type ItemType = "inventory" | "consumable";

interface LineItem {
  id: string;
  reviewLineId?: string;
  classificationNeedsReview?: boolean;
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

const allInvoiceHeaderFields: readonly InvoiceHeaderField[] = [
  "vendorName",
  "invoiceNumber",
  "invoiceDate",
  "currency",
  "subtotal",
  "tax",
  "freight",
  "total",
];

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
  const vendorInputRef = useRef<HTMLInputElement>(null);
  const [invoiceSourceBusy, setInvoiceSourceBusy] = useState(false);
  const [preparedInvoiceIntent, setPreparedInvoiceIntent] =
    useState<InvoiceConfirmationIntentDto | null>(null);
  const [aiReviewWorkspace, setAiReviewWorkspace] =
    useState<InvoiceReviewWorkspaceDto | null>(null);
  const [invoiceSourceSession, setInvoiceSourceSession] = useState(0);
  const confirmationKeyRef = useRef<string | null>(null);
  const [duplicateReason, setDuplicateReason] = useState("");

  const [partSearch, setPartSearch] = useState<Record<string, string>>({});
  const [searchFocus, setSearchFocus] = useState<string | null>(null);
  const { data: allParts = [] } = useQuery<any[]>({ queryKey: ["/api/inventory"] });
  const { data: catalogTree = [] } = useQuery<any[]>({ queryKey: ["/api/catalog/tree"] });

  const subtotal = sumLines(items);
  const taxNum = parseFloat(taxAmount) || 0;
  const deliveryNum = parseFloat(deliveryFee) || 0;
  const calculatedTotal = subtotal + taxNum + deliveryNum;
  const reconciliation = getReconciliation(subtotal, taxNum, deliveryNum, totalAmount);
  const aiIssueFor = (field: string) =>
    aiReviewWorkspace?.issues.find(
      (issue) => issue.path === `header.${field}`,
    );

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
    setPreparedInvoiceIntent(null);
    setAiReviewWorkspace(null);
    setDuplicateReason("");
    confirmationKeyRef.current = null;
  };

  const applyAiReview = useCallback(
    (workspace: InvoiceReviewWorkspaceDto) => {
      const mappedItems: LineItem[] = workspace.lines.map((line) => {
        const existingPart = line.match.selectedPart
          ? (allParts as any[]).find(
              (part: any) => part.id === line.match.selectedPart?.id,
            )
          : null;
        const proposedPart = line.match.proposedNewPart;
        const quantity = Number(line.quantity ?? "1") || 1;
        const lineTotal =
          line.calculatedLineTotal ??
          ((Number(line.unitCost ?? "0") || 0) * quantity).toFixed(2);
        return {
          id: `ai-${line.id}`,
          reviewLineId: line.id,
          partId: line.match.selectedPart?.id,
          partNameSnapshot:
            line.match.selectedPart?.name ??
            proposedPart?.name ??
            line.description ??
            "",
          partNumberSnapshot:
            line.vendorPartNumber ||
            proposedPart?.partNumber ||
            line.match.selectedPart?.partNumber ||
            "",
          itemType:
            line.classification === "consumable"
              ? "consumable"
              : proposedPart?.itemType ?? "inventory",
          classificationNeedsReview: line.classification === "unknown",
          groupId:
            existingPart?.groupId || proposedPart?.groupId || undefined,
          subgroupId:
            existingPart?.subgroupId || proposedPart?.subgroupId || undefined,
          qty: quantity,
          lotPrice: lineTotal,
          lineTotal,
        };
      });
      setAiReviewWorkspace(workspace);
      setPreparedInvoiceIntent(null);
      setVendor(workspace.finalHeader.vendorName ?? "");
      setInvoiceNumber(workspace.finalHeader.invoiceNumber ?? "");
      setInvoiceDate(workspace.finalHeader.invoiceDate ?? todayValue());
      setTaxAmount(
        workspace.reconciliation.calculatedTax ??
          workspace.finalHeader.tax ??
          "0.00",
      );
      setDeliveryFee(
        workspace.reconciliation.calculatedFreight ??
          workspace.finalHeader.freight ??
          "0.00",
      );
      setTotalAmount(
        workspace.reconciliation.calculatedTotal ??
          workspace.finalHeader.total ??
          "",
      );
      setItems(mappedItems);
      setPartSearch(
        Object.fromEntries(
          mappedItems.map((item) => [item.id, item.partNameSnapshot]),
        ),
      );
      requestAnimationFrame(() =>
        vendorInputRef.current?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        }),
      );
    },
    [allParts],
  );

  const handleClose = () => {
    if (invoiceSourceBusy) {
      toast({
        title: "Invoice upload in progress",
        description: "Wait for the source document operation to finish before closing.",
        variant: "destructive",
      });
      return;
    }
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
        invoicePhotoUrl: undefined,
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

  const confirmPreparedMutation = useMutation({
    mutationFn: async () => {
      if (
        preparedInvoiceIntent &&
        preparedInvoiceIntent.duplicateStatus !== "suspected"
      ) {
        return confirmInvoiceIntent(preparedInvoiceIntent);
      }
      if (!aiReviewWorkspace) {
        throw new Error("The AI invoice review is not ready.");
      }
      let current = await updateInvoiceHeaderReview(
        aiReviewWorkspace,
        {
          vendorName: vendor.trim() || null,
          invoiceNumber: invoiceNumber.trim() || null,
          invoiceDate: invoiceDate || null,
          currency: "USD",
          subtotal: subtotal.toFixed(2),
          tax: (taxNum || 0).toFixed(2),
          freight: (deliveryNum || 0).toFixed(2),
          total: (parseFloat(totalAmount) || calculatedTotal).toFixed(2),
        },
        allInvoiceHeaderFields,
        "approved",
      );
      current = await updateInvoiceLinesReview(
        current,
        items.map((item) => ({
          id: item.reviewLineId ?? null,
          description: item.partNameSnapshot.trim() || null,
          vendorPartNumber: item.partNumberSnapshot.trim() || null,
          quantity: String(item.qty || 1),
          unitCost: derivedPerUnit(item.lotPrice, item.qty),
          classification: item.itemType,
        })),
        "approved",
      );
      const itemByReviewId = new Map(
        items
          .filter((item) => item.reviewLineId)
          .map((item) => [item.reviewLineId!, item]),
      );
      current = await updateInvoiceLineMatches(
        current,
        current.lines.map((line, index) => {
          const item = itemByReviewId.get(line.id) ?? items[index];
          if (!item) throw new Error("An invoice line could not be resolved.");
          if (item.partId) {
            return {
              lineId: line.id,
              decision: "existing" as const,
              selectedPartId: item.partId,
              proposedNewPart: null,
            };
          }
          if (!item.partNameSnapshot.trim() || !item.partNumberSnapshot.trim()) {
            throw new Error(
              `Choose an existing stock part or provide a name and reference for ${item.partNameSnapshot || "the unresolved line"}.`,
            );
          }
          return {
            lineId: line.id,
            decision: "new" as const,
            selectedPartId: null,
            proposedNewPart: {
              name: item.partNameSnapshot.trim(),
              partNumber: item.partNumberSnapshot.trim(),
              itemType: item.itemType,
              category: null,
              groupId: item.groupId ?? null,
              subgroupId: item.subgroupId ?? null,
            },
          };
        }),
      );
      confirmationKeyRef.current ??= globalThis.crypto.randomUUID();
      const intent = await createInvoiceConfirmationIntent(
        current,
        confirmationKeyRef.current,
      );
      setPreparedInvoiceIntent(intent);
      if (intent.duplicateStatus === "suspected") return intent;
      return confirmInvoiceIntent(intent);
    },
    onSuccess: (intent) => {
      if (intent.duplicateStatus === "suspected") {
        toast({
          title: "Possible duplicate",
          description:
            "This invoice may already have been received. Stock was not updated.",
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/intakes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/tree"] });
      queryClient.invalidateQueries({
        queryKey: ["invoice-drafts-for-receiving"],
      });
      setInvoiceSourceSession((session) => session + 1);
      toast({
        title: "Inventory received",
        description: "The reviewed invoice updated stock exactly once.",
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to confirm invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!vendor.trim()) {
      toast({ title: "Vendor required", description: "Please enter a vendor name.", variant: "destructive" });
      vendorInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      vendorInputRef.current?.focus();
      return;
    }
    const filledItems = items.filter(i => i.partNameSnapshot.trim());
    if (filledItems.length === 0) {
      toast({ title: "Items required", description: "Add at least one line item.", variant: "destructive" });
      return;
    }
    if (aiReviewWorkspace && reconciliation !== "matched") {
      toast({
        title: "Invoice totals need review",
        description: "Correct the subtotal, tax, freight or invoice total before confirmation.",
        variant: "destructive",
      });
      return;
    }
    const classificationIssue = items.find(
      (item) => item.classificationNeedsReview,
    );
    if (aiReviewWorkspace && classificationIssue) {
      toast({
        title: "Part type needs review",
        description: `Choose Inventory or Consumable for ${classificationIssue.partNameSnapshot || "the highlighted line"}.`,
        variant: "destructive",
      });
      return;
    }
    if (preparedInvoiceIntent?.duplicateStatus === "suspected") {
      toast({
        title: "Possible duplicate",
        description:
          "Review or override the duplicate warning before updating stock.",
        variant: "destructive",
      });
      return;
    }
    if (aiReviewWorkspace || preparedInvoiceIntent) {
      confirmPreparedMutation.mutate();
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
    >
      <DialogContent className="flex h-screen w-screen max-w-none flex-col gap-0 overflow-hidden border-0 p-0 motion-reduce:duration-0 supports-[height:100dvh]:h-[100dvh] [&>button]:min-h-11 [&>button]:min-w-11 sm:h-[90vh] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:rounded-lg sm:border">
        <DialogHeader className="shrink-0 border-b bg-background px-4 py-4 pr-14 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <PackagePlus className="h-5 w-5 text-amber-500" />
            Receive Inventory
          </DialogTitle>
          <DialogDescription className="text-foreground/70">
            Enter vendor invoice details and line items. Part quantities will be updated on save.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <InvoiceSourceUpload
            key={invoiceSourceSession}
            open={open}
            onBusyChange={setInvoiceSourceBusy}
            onReviewReady={applyAiReview}
            onEnterManual={() => {
              vendorInputRef.current?.scrollIntoView({
                block: "center",
                behavior: "auto",
              });
              vendorInputRef.current?.focus();
            }}
          />

          {aiReviewWorkspace ? (
            <div
              role="status"
              className="rounded border border-green-500/50 bg-green-500/5 p-3 text-sm text-green-500"
            >
              Invoice scanned · {items.length} line{items.length === 1 ? "" : "s"} detected. Review the highlighted stock links and edit any value directly below.
            </div>
          ) : null}

          {preparedInvoiceIntent?.duplicateStatus === "suspected" ? (
            <div className="space-y-2 rounded border border-destructive bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">
                Possible duplicate invoice. Stock has not been updated.
              </p>
              <p className="text-xs text-muted-foreground">
                An administrator can provide a reason to confirm this receipt anyway.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  aria-label="Duplicate override reason"
                  value={duplicateReason}
                  onChange={(event) => setDuplicateReason(event.target.value)}
                  placeholder="Reason for receiving this duplicate"
                />
                <Button
                  type="button"
                  variant="destructive"
                  disabled={duplicateReason.trim().length < 3}
                  onClick={async () => {
                    try {
                      const overridden = await overrideInvoiceDuplicate(
                        preparedInvoiceIntent,
                        duplicateReason,
                      );
                      setPreparedInvoiceIntent(overridden);
                    } catch (error) {
                      toast({
                        title: "Duplicate override failed",
                        description:
                          error instanceof Error ? error.message : "Try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Approve duplicate
                </Button>
              </div>
            </div>
          ) : null}

          <fieldset
            disabled={confirmPreparedMutation.isPending}
            className="contents disabled:opacity-80"
          >
          {/* Vendor — only field needed before entering items */}
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="receive-inventory-vendor" className="text-foreground font-medium">Vendor / Supplier *</Label>
            <Input
              ref={vendorInputRef}
              id="receive-inventory-vendor"
              placeholder="e.g., FleetParts Wholesale"
              value={vendor}
              onChange={e => setVendor(e.target.value)}
              className={`text-foreground placeholder:text-foreground/50 ${aiIssueFor("vendorName") ? "border-amber-500" : ""}`}
            />
            {aiIssueFor("vendorName") ? (
              <p className="text-xs text-amber-500">
                {aiIssueFor("vendorName")?.message}
              </p>
            ) : null}
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground">Line Items</h3>
              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Select a category and subgroup to scope the item search. Search to link to an existing part, or type a new name to auto-create it on save.
            </p>

            <div className="rounded-lg border">
              <table className="block w-full text-sm md:table">
                <thead className="hidden bg-muted/50 md:table-header-group">
                  <tr>
                    <th className="text-left px-2 py-2 text-foreground font-medium w-6" title="Linked to catalog part" />
                    <th className="text-left px-3 py-2 text-foreground font-medium w-52">Type & Category</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium">Part / Item</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium w-24">Part #</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium w-16">Qty</th>
                    <th className="text-left px-3 py-2 text-foreground font-medium w-28">Lot Price</th>
                    <th className="text-right px-3 py-2 text-foreground font-medium w-24">Line Total</th>
                    <th className="text-right px-3 py-2 text-amber-500 font-medium w-28" title="Per-unit cost after proportional tax and freight allocation">Landed / unit</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="block space-y-3 p-3 md:table-row-group md:space-y-0 md:p-0">
                  {items.map((item) => {
                    const filteredParts = getFilteredParts(item);
                    const catalogSuggestions = getCatalogSuggestions(item);
                    const subgroups = item.groupId ? getSubgroups(item.groupId) : [];
                    const showDropdown = searchFocus === item.id && (filteredParts.length > 0 || catalogSuggestions.length > 0);

                    return (
                      <tr key={item.id} className="block rounded-lg border border-border p-3 align-top hover:bg-muted/20 md:table-row md:rounded-none md:border-0 md:p-0">
                        {/* Link status icon */}
                        <td className="mb-2 flex items-center gap-2 md:table-cell md:px-2 md:pt-3">
                          <span className="font-medium md:hidden">Catalog status</span>
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
                        <td className="block space-y-1.5 py-2 md:table-cell md:px-3">
                          <span className="font-medium md:hidden">Type &amp; Category</span>
                          {/* Type toggle */}
                          <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
                            <button
                              type="button"
                              onClick={() => updateItem(item.id, { itemType: "inventory", classificationNeedsReview: false })}
                              aria-pressed={item.itemType === "inventory"}
                              className={`min-h-11 flex-1 px-1.5 py-1 transition-colors ${
                                item.itemType === "inventory"
                                  ? "bg-blue-600 text-white"
                                  : "bg-transparent text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Inventory
                            </button>
                            <button
                              type="button"
                              onClick={() => updateItem(item.id, { itemType: "consumable", classificationNeedsReview: false })}
                              aria-pressed={item.itemType === "consumable"}
                              className={`min-h-11 flex-1 px-1.5 py-1 transition-colors border-l border-border ${
                                item.itemType === "consumable"
                                  ? "bg-amber-500 text-white"
                                  : "bg-transparent text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Consumable
                            </button>
                          </div>
                          {item.classificationNeedsReview ? (
                            <p className="text-xs text-amber-500" role="alert">
                              Choose Inventory or Consumable for this line.
                            </p>
                          ) : null}

                          {/* Group dropdown */}
                          <select
                            value={item.groupId || ""}
                            onChange={e => updateItem(item.id, { groupId: e.target.value || undefined })}
                            aria-label="Item category"
                            style={{ colorScheme: "dark" }}
                            className="min-h-11 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40"
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
                              aria-label="Item subgroup"
                              style={{ colorScheme: "dark" }}
                              className="min-h-11 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-100 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40"
                            >
                              <option value="">— Subgroup —</option>
                              {subgroups.map((sg: any) => (
                                <option key={sg.id} value={sg.id}>{sg.name}</option>
                              ))}
                            </select>
                          )}
                        </td>

                        {/* Part name search */}
                        <td className="block py-2 md:table-cell md:px-3 md:pt-3">
                          <span className="font-medium md:hidden">Part / Item</span>
                          <div className="relative">
                            <div className="flex items-center gap-1">
                              <Search className="h-3 w-3 text-foreground/50 flex-shrink-0" />
                              <input
                                aria-label="Part or item name"
                                className="min-h-11 min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-foreground/50"
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
                                <button type="button" aria-label="Clear linked part" onClick={() => clearPart(item.id)} className="min-h-11 min-w-11 flex-shrink-0 text-foreground/40 hover:text-foreground">
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            {aiReviewWorkspace ? (
                              <p
                                className={`mt-1 text-xs ${item.partId ? "text-green-500" : "text-amber-500"}`}
                              >
                                {item.partId
                                  ? "Matched to existing stock"
                                  : "New stock part — verify its name and reference"}
                              </p>
                            ) : null}
                            {showDropdown && (
                              <div className="absolute left-0 top-full z-50 mt-1 w-full max-w-[calc(100vw-3rem)] rounded-md border border-border bg-popover shadow-lg md:w-80">
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
                                        type="button"
                                        className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
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
                                          type="button"
                                          className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
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
                        <td className="block py-2 md:table-cell md:px-3 md:pt-3">
                          <span className="font-medium md:hidden">Part number</span>
                          <input
                            aria-label="Part number"
                            className="min-h-11 w-full rounded border border-border bg-transparent px-2 text-foreground outline-none placeholder:text-foreground/50 md:min-h-0 md:rounded-none md:border-0 md:px-0"
                            placeholder="Part #"
                            value={item.partNumberSnapshot}
                            onChange={e => updateItem(item.id, { partNumberSnapshot: e.target.value })}
                          />
                        </td>

                        {/* Qty */}
                        <td className="block py-2 md:table-cell md:px-3 md:pt-3">
                          <span className="font-medium md:hidden">Quantity</span>
                          <input
                            type="number"
                            min="1"
                            aria-label="Quantity"
                            className="min-h-11 w-full rounded border border-border bg-transparent px-2 text-foreground outline-none md:min-h-0 md:rounded-none md:border-0 md:px-0"
                            value={item.qty}
                            onChange={e => updateItem(item.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                          />
                        </td>

                        {/* Lot Price + per-unit derived display */}
                        <td className="block py-2 md:table-cell md:px-3 md:pt-3">
                          <span className="font-medium md:hidden">Lot price</span>
                          <div className="flex items-center gap-1">
                            <span className="text-foreground/60">$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              aria-label="Lot price"
                              className="min-h-11 w-full rounded border border-border bg-transparent px-2 text-foreground outline-none md:min-h-0 md:rounded-none md:border-0 md:px-0"
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
                        <td className="flex justify-between py-2 font-medium text-foreground md:table-cell md:px-3 md:pt-3 md:text-right">
                          <span className="md:hidden">Line Total</span>
                          <span>${parseFloat(item.lineTotal || "0").toFixed(2)}</span>
                        </td>

                        {/* Landed Cost */}
                        <td className="flex justify-between py-2 md:table-cell md:px-3 md:pt-3 md:text-right">
                          <span className="font-medium text-amber-500 md:hidden">Landed / unit</span>
                          {item.partNameSnapshot.trim() ? (
                            <span className={`font-semibold tabular-nums ${taxNum + deliveryNum > 0 ? "text-amber-400" : "text-foreground"}`}>
                              ${parseFloat(calcLandedCost(item.lineTotal, item.qty, subtotal, taxNum + deliveryNum)).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>

                        {/* Delete */}
                        <td className="flex justify-end py-2 md:table-cell md:px-2 md:pt-3">
                          {items.length > 1 && (
                            <button type="button" aria-label="Remove line item" onClick={() => removeItem(item.id)} className="min-h-11 min-w-11 text-foreground/40 hover:text-red-500">
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
            <p className="mt-2 text-xs text-muted-foreground">
              Landed / unit = (line total + proportional tax and freight) ÷ quantity.
            </p>
          </div>

          {/* Footer — Invoice reference fields + ancillary costs */}
          <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
            {/* Invoice details row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="receive-inventory-invoice-number" className="text-foreground font-medium">Invoice Number</Label>
                <Input
                  id="receive-inventory-invoice-number"
                  placeholder="e.g., INV-2024-00821"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  className={`text-foreground placeholder:text-foreground/50 ${aiIssueFor("invoiceNumber") ? "border-amber-500" : ""}`}
                />
                {aiIssueFor("invoiceNumber") ? (
                  <p className="text-xs text-amber-500">
                    {aiIssueFor("invoiceNumber")?.message}
                  </p>
                ) : null}
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

            <div className="border-t border-border/50 pt-3">
            <div className="ml-auto grid max-w-sm grid-cols-[minmax(0,1fr)_minmax(6rem,auto)] gap-x-4 gap-y-3 sm:gap-x-8">
              <div className="text-foreground font-medium text-right">Parts Subtotal</div>
              <div className="text-foreground text-right font-semibold">${subtotal.toFixed(2)}</div>

              <Label htmlFor="receive-inventory-tax" className="text-foreground font-medium text-right self-center">Tax</Label>
              <div className="flex items-center justify-end gap-1">
                <span className="text-foreground/60">$</span>
                <input
                  id="receive-inventory-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-24 bg-transparent border-b border-border outline-none text-right text-foreground placeholder:text-foreground/50"
                  value={taxAmount}
                  onChange={e => setTaxAmount(e.target.value)}
                />
              </div>

              <Label htmlFor="receive-inventory-freight" className="text-foreground font-medium text-right self-center">Delivery / Freight</Label>
              <div className="flex items-center justify-end gap-1">
                <span className="text-foreground/60">$</span>
                <input
                  id="receive-inventory-freight"
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

              <Label htmlFor="receive-inventory-total" className="text-foreground font-semibold text-right self-center">Invoice Total</Label>
              <div className="flex items-center justify-end gap-1">
                <span className="text-foreground/60">$</span>
                <input
                  id="receive-inventory-total"
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
          </fieldset>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end sm:gap-3 sm:px-6 sm:pb-4">
          <Button variant="outline" className="min-h-11" onClick={handleClose} disabled={createMutation.isPending || confirmPreparedMutation.isPending || invoiceSourceBusy}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || confirmPreparedMutation.isPending || invoiceSourceBusy}
            className="min-h-11 bg-amber-500 font-semibold text-white hover:bg-amber-600"
          >
            {confirmPreparedMutation.isPending
              ? "Confirming..."
              : preparedInvoiceIntent || aiReviewWorkspace
                ? "Confirm & Update Stock"
                : createMutation.isPending
              ? "Saving..."
              : invoiceSourceBusy
                ? "Saving invoice source…"
                : "Receive & Update Stock"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
