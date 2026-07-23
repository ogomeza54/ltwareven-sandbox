import { z } from "zod";

export const invoiceRoleSchema = z.enum([
  "super_admin",
  "admin",
  "accounting",
  "shop_user",
  "technician",
]);
export type InvoiceRole = z.infer<typeof invoiceRoleSchema>;

export const invoiceDraftStatusSchema = z.enum([
  "draft",
  "uploaded",
  "needs_review",
  "rejected",
  "confirming",
  "confirmed",
  "canceled",
]);
export const invoiceRunStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "canceled",
]);
export const invoiceAttemptStatusSchema = z.enum([
  "queued",
  "processing",
  "submitted",
  "completed",
  "failed",
  "canceled",
]);
export const invoicePersistedCapabilitySchema = z.enum([
  "scan_extraction",
  "stock_confirmation",
  "engine_activation",
]);
export const invoicePolicyCapabilitySchema = z.enum([
  "process_draft",
  "quality_read",
  "duplicate_override",
  "engine_activation",
]);

export type InvoiceDraftStatus = z.infer<typeof invoiceDraftStatusSchema>;
export type InvoiceRunStatus = z.infer<typeof invoiceRunStatusSchema>;
export type InvoiceAttemptStatus = z.infer<typeof invoiceAttemptStatusSchema>;
export type InvoicePersistedCapability = z.infer<
  typeof invoicePersistedCapabilitySchema
>;
export type InvoicePolicyCapability = z.infer<
  typeof invoicePolicyCapabilitySchema
>;

export const invoiceActorContextSchema = z.object({
  actorUserId: z.string().min(1),
  actorCompanyId: z.string().min(1),
  effectiveCompanyId: z.string().min(1),
  role: invoiceRoleSchema,
  isProductAdministrator: z.boolean(),
});
export type InvoiceActorContext = z.infer<typeof invoiceActorContextSchema>;

export const createInvoiceDraftSchema = z.object({}).strict();
export const invoiceDraftIdSchema = z.string().uuid();

export const invoiceErrorCodeSchema = z.enum([
  "INVOICE_INVALID_REQUEST",
  "INVOICE_FORBIDDEN",
  "INVOICE_FEATURE_DISABLED",
  "INVOICE_DRAFT_NOT_FOUND",
  "INVOICE_RUN_NOT_FOUND",
  "INVOICE_DRAFT_REVISION_CONFLICT",
  "INVOICE_INVALID_STATE",
  "INVOICE_LEASE_LOST",
  "INVOICE_PROVIDER_RESPONSE_CONFLICT",
]);
export type InvoiceErrorCode = z.infer<typeof invoiceErrorCodeSchema>;

const safeMessages: Record<InvoiceErrorCode, string> = {
  INVOICE_INVALID_REQUEST: "The invoice request is invalid.",
  INVOICE_FORBIDDEN: "You are not allowed to perform this invoice operation.",
  INVOICE_FEATURE_DISABLED: "Invoice scanning is not enabled for this company.",
  INVOICE_DRAFT_NOT_FOUND: "Invoice draft not found.",
  INVOICE_RUN_NOT_FOUND: "Invoice extraction run not found.",
  INVOICE_DRAFT_REVISION_CONFLICT:
    "The invoice draft changed. Refresh and try again.",
  INVOICE_INVALID_STATE:
    "The invoice operation is not valid in the current state.",
  INVOICE_LEASE_LOST: "The invoice work lease is no longer valid.",
  INVOICE_PROVIDER_RESPONSE_CONFLICT:
    "The provider response is already associated.",
};

export class InvoiceDomainError extends Error {
  constructor(
    public readonly code: InvoiceErrorCode,
    public readonly details?: Readonly<
      Record<string, string | number | boolean>
    >,
  ) {
    super(safeMessages[code]);
    this.name = "InvoiceDomainError";
  }
}

export const invoiceDraftDtoSchema = z.object({
  id: z.string().uuid(),
  status: invoiceDraftStatusSchema,
  revision: z.number().int().nonnegative(),
  activeRunId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
});
export type InvoiceDraftDto = z.infer<typeof invoiceDraftDtoSchema>;

export interface InvoiceFeatureResolution {
  manualReceiving: true;
  scanExtraction: boolean;
  stockConfirmation: boolean;
  engineActivation: boolean;
}
