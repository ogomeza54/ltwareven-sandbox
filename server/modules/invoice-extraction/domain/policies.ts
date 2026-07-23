import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoiceDraftStatus,
  type InvoicePolicyCapability,
} from "@shared/invoice-extraction/contracts";

const allowedDraftTransitions: Readonly<
  Record<InvoiceDraftStatus, readonly InvoiceDraftStatus[]>
> = {
  draft: ["uploaded", "canceled"],
  uploaded: ["needs_review", "canceled"],
  needs_review: ["rejected", "confirming"],
  rejected: [],
  confirming: ["confirmed", "needs_review"],
  confirmed: [],
  canceled: [],
};

export function canUseInvoiceCapability(
  actor: InvoiceActorContext,
  capability: InvoicePolicyCapability,
): boolean {
  if (capability === "engine_activation") {
    return actor.isProductAdministrator === true;
  }
  if (capability === "process_draft") {
    return ["shop_user", "admin", "super_admin"].includes(actor.role);
  }
  return ["admin", "super_admin"].includes(actor.role);
}

export function requireInvoiceCapability(
  actor: InvoiceActorContext,
  capability: InvoicePolicyCapability,
): void {
  if (!canUseInvoiceCapability(actor, capability)) {
    throw new InvoiceDomainError("INVOICE_FORBIDDEN");
  }
}

export function requireDraftTransition(
  from: InvoiceDraftStatus,
  to: InvoiceDraftStatus,
): void {
  if (!allowedDraftTransitions[from].includes(to)) {
    throw new InvoiceDomainError("INVOICE_INVALID_STATE");
  }
}

export function requireExtractionStart(status: InvoiceDraftStatus): void {
  if (status !== "uploaded") {
    throw new InvoiceDomainError("INVOICE_INVALID_STATE");
  }
}
