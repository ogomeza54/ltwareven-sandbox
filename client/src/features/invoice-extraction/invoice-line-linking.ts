export interface LinkableInvoiceLine {
  partId?: string;
  partNameSnapshot: string;
  partNumberSnapshot: string;
  itemType: "inventory" | "consumable" | "adjustment";
  classificationNeedsReview?: boolean;
  groupId?: string;
  subgroupId?: string;
  lotPrice: string;
  lineTotal: string;
}

export interface InvoiceStockPart {
  id: string;
  name: string;
  partNumber?: string | null;
  itemType?: "inventory" | "consumable" | null;
  groupId?: string | null;
  subgroupId?: string | null;
}

export function linkInvoiceLineToStock<T extends LinkableInvoiceLine>(
  item: T,
  part: InvoiceStockPart,
): T {
  return {
    ...item,
    partId: part.id,
    partNameSnapshot: part.name,
    partNumberSnapshot: part.partNumber || "",
    itemType: part.itemType || "inventory",
    classificationNeedsReview: false,
    groupId: part.groupId || undefined,
    subgroupId: part.subgroupId || undefined,
  };
}
