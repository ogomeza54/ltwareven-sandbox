import Decimal from "decimal.js";

export const AUTOMATIC_ENRICHMENT_REASON = "automatic_enrichment";

type FeedbackDecision = "accepted" | "corrected" | "added";

export interface FeedbackClassification {
  decision: FeedbackDecision;
  reason: typeof AUTOMATIC_ENRICHMENT_REASON | null;
}

interface InvoiceLineSnapshot {
  description: string | null;
  vendorPartNumber: string | null;
  quantity: string | null;
  unitCost: string | null;
  classification: string | null;
}

function decimalTextEqual(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  try {
    return new Decimal(left).eq(right);
  } catch {
    return false;
  }
}

export function classifyHeaderFeedback(
  field: string,
  proposed: string | null,
  finalValue: string | null,
): FeedbackClassification {
  if (proposed === finalValue) {
    return { decision: "accepted", reason: null };
  }
  const isDefaultCurrency =
    field === "currency" &&
    (proposed === null || proposed.trim() === "") &&
    finalValue === "USD";
  return {
    decision: "corrected",
    reason: isDefaultCurrency ? AUTOMATIC_ENRICHMENT_REASON : null,
  };
}

export function classifyLineFeedback(
  proposed: InvoiceLineSnapshot | null,
  finalValue: InvoiceLineSnapshot,
): FeedbackClassification {
  if (proposed === null) return { decision: "added", reason: null };

  const valuesMatch =
    proposed.description === finalValue.description &&
    proposed.vendorPartNumber === finalValue.vendorPartNumber &&
    decimalTextEqual(proposed.quantity, finalValue.quantity) &&
    decimalTextEqual(proposed.unitCost, finalValue.unitCost);
  if (valuesMatch && proposed.classification === finalValue.classification) {
    return { decision: "accepted", reason: null };
  }

  const classificationWasInferred =
    valuesMatch &&
    (proposed.classification === null || proposed.classification === "unknown") &&
    finalValue.classification !== null &&
    finalValue.classification !== "unknown";
  return {
    decision: "corrected",
    reason: classificationWasInferred ? AUTOMATIC_ENRICHMENT_REASON : null,
  };
}
