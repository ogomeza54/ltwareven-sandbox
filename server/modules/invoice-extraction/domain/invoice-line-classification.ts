import type { InvoiceProposal } from "@shared/invoice-extraction/contracts";

export type InvoiceLineClassification =
  | "inventory"
  | "consumable"
  | "service"
  | "direct_expense"
  | "adjustment"
  | "unknown";

type ProposalLine = InvoiceProposal["lines"][number];

function valueOf(value: ProposalLine["description"]): string {
  return value.normalized ?? value.observed ?? "";
}

function normalizeIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function numericQuantity(line: ProposalLine): number | null {
  const raw = valueOf(line.quantity).trim().replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

function identityKey(line: ProposalLine): string | null {
  const reference = normalizeIdentity(valueOf(line.vendorPartNumber));
  const description = normalizeIdentity(valueOf(line.description));
  // Both values are required: a repeated generic description or reference alone
  // is not strong enough evidence that two invoice rows describe an exchange.
  return reference && description ? `${reference}\u0000${description}` : null;
}

/**
 * Classify invoice lines using document-level context.
 *
 * A quantity-bearing financial adjustment is accepted only when it can be paired
 * with an opposite-sign row for the same normalized product and vendor reference.
 * Product words (including vendor-specific terminology) never decide the result.
 */
export function classifyInvoiceProposalLines(
  lines: InvoiceProposal["lines"],
): InvoiceLineClassification[] {
  const classifications = lines.map(
    (line) => line.classification?.kind ?? "unknown",
  );
  const groups = new Map<string, number[]>();

  lines.forEach((line, index) => {
    const quantity = numericQuantity(line);
    const key = identityKey(line);
    if (quantity === null || !key) return;
    const indexes = groups.get(key) ?? [];
    indexes.push(index);
    groups.set(key, indexes);
  });

  // A numeric adjustment without a matching opposite-sign line is ambiguous.
  // Do not silently suppress its stock impact based on the provider label alone.
  lines.forEach((line, index) => {
    if (
      classifications[index] === "adjustment" &&
      numericQuantity(line) !== null
    ) {
      classifications[index] = "unknown";
    }
  });

  groups.forEach((indexes: number[]) => {
    const positive = indexes.filter((index) => numericQuantity(lines[index])! > 0);
    const negative = indexes.filter((index) => numericQuantity(lines[index])! < 0);
    if (!positive.length || !negative.length) return;

    const availablePositive = new Set(positive);
    for (const negativeIndex of negative) {
      const negativeQuantity = Math.abs(numericQuantity(lines[negativeIndex])!);
      const candidates = Array.from(availablePositive).sort((left, right) => {
        const leftQuantity = numericQuantity(lines[left])!;
        const rightQuantity = numericQuantity(lines[right])!;
        const leftProviderAdjustment =
          lines[left].classification?.kind === "adjustment" ? 1 : 0;
        const rightProviderAdjustment =
          lines[right].classification?.kind === "adjustment" ? 1 : 0;
        if (leftProviderAdjustment !== rightProviderAdjustment) {
          return rightProviderAdjustment - leftProviderAdjustment;
        }
        const leftExact = leftQuantity === negativeQuantity ? 1 : 0;
        const rightExact = rightQuantity === negativeQuantity ? 1 : 0;
        if (leftExact !== rightExact) return rightExact - leftExact;
        return (
          Math.abs(left - negativeIndex) - Math.abs(right - negativeIndex)
        );
      });
      const positiveIndex = candidates[0];
      if (positiveIndex === undefined) break;
      availablePositive.delete(positiveIndex);
      classifications[positiveIndex] = "adjustment";
      classifications[negativeIndex] = "adjustment";
    }
  });

  return classifications;
}

/** Kept for callers that genuinely have no document-level context. */
export function classifyInvoiceProposalLine(
  line: ProposalLine,
): InvoiceLineClassification {
  return classifyInvoiceProposalLines([line])[0];
}
