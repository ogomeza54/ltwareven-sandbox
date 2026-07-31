import type { InvoiceProposal } from "@shared/invoice-extraction/contracts";

type ProposalLine = InvoiceProposal["lines"][number];
type ObservedValue = ProposalLine["description"];

function valueOf(value: ObservedValue): string {
  return value.normalized ?? value.observed ?? "";
}

function normalizeReference(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeDescription(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameCommercialValue(left: ObservedValue, right: ObservedValue): boolean {
  const leftValue = valueOf(left).trim().replace(",", ".");
  const rightValue = valueOf(right).trim().replace(",", ".");
  if (!leftValue || !rightValue) return true;
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return Math.abs(leftNumber - rightNumber) < 0.000_001;
  }
  return leftValue === rightValue;
}

function compatibleOccurrence(left: ProposalLine, right: ProposalLine): boolean {
  return (
    sameCommercialValue(left.quantity, right.quantity) &&
    sameCommercialValue(left.unitCost, right.unitCost) &&
    sameCommercialValue(left.lineTotal, right.lineTotal)
  );
}

function isMoreCompleteDescription(
  current: ObservedValue,
  candidate: ObservedValue,
): boolean {
  const currentText = normalizeDescription(valueOf(current));
  const candidateText = normalizeDescription(valueOf(candidate));
  if (!currentText || candidateText.length <= currentText.length) return false;

  // Only extend a visibly truncated value. Do not replace it with a different
  // description merely because the other description is longer.
  return (
    candidateText.startsWith(currentText) ||
    currentText.split(" ").every((token) => candidateText.includes(token))
  );
}

/**
 * Enrich descriptions repeated across PDF pages without changing transactional
 * quantities or prices. Exact normalized vendor reference and compatible money
 * values are required before provenance can be borrowed from another occurrence.
 */
export function reconcileInvoiceDescriptions(
  proposal: InvoiceProposal,
): InvoiceProposal {
  const byReference = new Map<string, ProposalLine[]>();
  for (const line of proposal.lines) {
    const reference = normalizeReference(valueOf(line.vendorPartNumber));
    if (!reference) continue;
    const occurrences = byReference.get(reference) ?? [];
    occurrences.push(line);
    byReference.set(reference, occurrences);
  }

  return {
    ...proposal,
    lines: proposal.lines.map((line) => {
      const reference = normalizeReference(valueOf(line.vendorPartNumber));
      const candidates = reference ? byReference.get(reference) ?? [] : [];
      const bestDescription = candidates
        .filter((candidate) => compatibleOccurrence(line, candidate))
        .map((candidate) => candidate.description)
        .reduce(
          (best, candidate) =>
            isMoreCompleteDescription(best, candidate) ? candidate : best,
          line.description,
        );
      return bestDescription === line.description
        ? line
        : { ...line, description: { ...bestDescription } };
    }),
  };
}
