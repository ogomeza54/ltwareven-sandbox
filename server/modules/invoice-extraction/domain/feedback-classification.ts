import Decimal from "decimal.js";

export const AUTOMATIC_ENRICHMENT_REASON = "automatic_enrichment";

type FeedbackDecision = "accepted" | "corrected" | "added" | "removed";

export interface FeedbackClassification {
  decision: FeedbackDecision;
  reason: typeof AUTOMATIC_ENRICHMENT_REASON | null;
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
  const isDefaultZero =
    (field === "tax" || field === "freight") &&
    (proposed === null || proposed.trim() === "") &&
    finalValue !== null &&
    decimalTextEqual(finalValue, "0");
  return {
    decision: proposed === null ? "added" : finalValue === null ? "removed" : "corrected",
    reason:
      isDefaultCurrency || isDefaultZero
        ? AUTOMATIC_ENRICHMENT_REASON
        : null,
  };
}

export function classifyLineFieldFeedback(
  field: string,
  proposed: string | null,
  finalValue: string | null,
  automaticallyEnriched = false,
): FeedbackClassification {
  const valuesMatch =
    field === "quantity" || field === "unitCost"
      ? decimalTextEqual(proposed, finalValue)
      : proposed === finalValue;
  if (valuesMatch) {
    return { decision: "accepted", reason: null };
  }
  return {
    decision: proposed === null ? "added" : finalValue === null ? "removed" : "corrected",
    reason: automaticallyEnriched ? AUTOMATIC_ENRICHMENT_REASON : null,
  };
}
