import type { InvoiceProposal } from "@shared/invoice-extraction/contracts";

export type InvoiceLineClassification =
  | "inventory"
  | "consumable"
  | "adjustment"
  | "unknown";

const ADJUSTMENT_TERMS =
  /\b(core|core[- ]?charge|core[- ]?return|credit|return|deposit|rebate|refund)\b/i;

function valueOf(
  value: InvoiceProposal["lines"][number]["description"],
): string {
  return value.normalized ?? value.observed ?? "";
}

export function classifyInvoiceProposalLine(
  line: InvoiceProposal["lines"][number],
): InvoiceLineClassification {
  const quantity = valueOf(line.quantity);
  const lineTotal = valueOf(line.lineTotal);
  const searchable = `${valueOf(line.description)} ${valueOf(line.vendorPartNumber)}`;
  if (
    quantity.trim().startsWith("-") ||
    lineTotal.trim().startsWith("-") ||
    ADJUSTMENT_TERMS.test(searchable)
  ) {
    return "adjustment";
  }
  return line.classification?.kind ?? "unknown";
}
