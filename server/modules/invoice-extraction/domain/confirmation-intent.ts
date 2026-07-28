import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import type { InvoiceConfirmationIntentDto } from "@shared/invoice-extraction/contracts";

export type InvoiceConfirmationSummary =
  InvoiceConfirmationIntentDto["summary"];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalPayloadHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function normalizedInvoiceIdentity(
  vendor: string,
  invoiceNumber: string | null,
): string | null {
  if (!invoiceNumber?.trim()) return null;
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const supplier = normalize(vendor);
  const number = normalize(invoiceNumber);
  return supplier && number ? `${supplier}:${number}` : null;
}

export function stockUnitDelta(
  lines: readonly {
    quantity: string;
    resolution?: { kind: "existing" | "new" | "service" | "direct_expense" | "adjustment" };
  }[],
): string {
  return lines
    .filter(
      (line) =>
        line.resolution?.kind !== "adjustment" &&
        line.resolution?.kind !== "service" &&
        line.resolution?.kind !== "direct_expense",
    )
    .reduce((sum, line) => sum.add(line.quantity), new Decimal(0))
    .toFixed(6)
    .replace(/\.?0+$/, "");
}
