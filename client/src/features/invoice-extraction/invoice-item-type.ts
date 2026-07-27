export type InvoiceItemType = "inventory" | "consumable" | "adjustment";
export type InvoiceLineClassification = InvoiceItemType | "unknown";

interface ResolveInvoiceItemTypeInput {
  classification: InvoiceLineClassification;
  selectedPartType?: "inventory" | "consumable" | null;
  proposedPartType?: "inventory" | "consumable" | null;
}

interface ResolvedInvoiceItemType {
  itemType: InvoiceItemType;
  needsReview: boolean;
}

/**
 * The company's existing catalog is authoritative. AI classification is used
 * only when no existing part has already been selected for the invoice line.
 */
export function resolveInvoiceItemType({
  classification,
  selectedPartType,
  proposedPartType,
}: ResolveInvoiceItemTypeInput): ResolvedInvoiceItemType {
  if (classification === "adjustment") {
    return { itemType: "adjustment", needsReview: false };
  }
  if (selectedPartType === "inventory" || selectedPartType === "consumable") {
    return { itemType: selectedPartType, needsReview: false };
  }
  if (classification === "inventory" || classification === "consumable") {
    return { itemType: classification, needsReview: false };
  }
  return {
    itemType: proposedPartType ?? "inventory",
    needsReview: true,
  };
}
