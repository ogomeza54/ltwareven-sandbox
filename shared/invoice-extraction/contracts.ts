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
export const invoiceSourceAssetLifecycleSchema = z.enum([
  "staging",
  "verified",
  "attached",
  "deleted",
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
export type InvoiceSourceAssetLifecycle = z.infer<
  typeof invoiceSourceAssetLifecycleSchema
>;
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
export const invoiceAssetIdSchema = z.string().uuid();
export const invoiceDraftRevisionSchema = z.coerce.number().int().nonnegative();
export const invoiceAssetOrderSchema = z
  .object({
    assetIds: z.array(z.string().uuid()).max(10),
  })
  .strict();

const invoiceDetectedTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const invoicePublicAssetBaseSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(120),
  createdAt: z.string().datetime(),
});
export const invoicePublicAssetSchema = z.discriminatedUnion("state", [
  invoicePublicAssetBaseSchema.extend({
    state: z.literal("Uploading"),
    detectedType: invoiceDetectedTypeSchema.nullable(),
    byteSize: z.number().int().positive().nullable(),
    pageCount: z.number().int().positive().max(10).nullable(),
    position: z.number().int().positive().nullable(),
  }),
  invoicePublicAssetBaseSchema.extend({
    state: z.literal("Saved"),
    detectedType: invoiceDetectedTypeSchema,
    byteSize: z.number().int().positive(),
    pageCount: z.number().int().positive().max(10),
    position: z.number().int().positive(),
  }),
]);
export type InvoicePublicAssetDto = z.infer<
  typeof invoicePublicAssetSchema
>;

export const invoiceSourceDtoSchema = z.object({
  totalPages: z.number().int().nonnegative().max(10),
  assets: z.array(invoicePublicAssetSchema).max(10),
});
export type InvoiceSourceDto = z.infer<typeof invoiceSourceDtoSchema>;

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
  "INVOICE_ASSET_NOT_FOUND",
  "INVOICE_FILE_REQUIRED",
  "INVOICE_FILE_TOO_LARGE",
  "INVOICE_FILE_UNSUPPORTED",
  "INVOICE_FILE_INVALID",
  "INVOICE_FILE_COMPLEXITY_LIMIT",
  "INVOICE_PAGE_LIMIT",
  "INVOICE_ASSET_ORDER_CONFLICT",
  "INVOICE_STORAGE_UNAVAILABLE",
  "INVOICE_ASSET_HELD",
  "INVOICE_DUPLICATE_SOURCE",
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
  INVOICE_ASSET_NOT_FOUND: "Invoice source asset not found.",
  INVOICE_FILE_REQUIRED: "Choose an invoice image or PDF to upload.",
  INVOICE_FILE_TOO_LARGE: "The invoice file must be 10 MiB or smaller.",
  INVOICE_FILE_UNSUPPORTED:
    "Choose a JPEG, PNG, HEIC, HEIF or PDF invoice file.",
  INVOICE_FILE_INVALID:
    "The invoice file is damaged or contains unsupported content.",
  INVOICE_FILE_COMPLEXITY_LIMIT:
    "The invoice file is too complex to process safely.",
  INVOICE_PAGE_LIMIT: "An invoice can contain at most 10 pages.",
  INVOICE_ASSET_ORDER_CONFLICT:
    "The asset order changed. Refresh and try again.",
  INVOICE_STORAGE_UNAVAILABLE:
    "The private invoice document store is temporarily unavailable.",
  INVOICE_ASSET_HELD:
    "This invoice source is retained and cannot be deleted.",
  INVOICE_DUPLICATE_SOURCE:
    "This invoice source upload is already being processed.",
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
  source: invoiceSourceDtoSchema.nullable().optional(),
});
export type InvoiceDraftDto = z.infer<typeof invoiceDraftDtoSchema>;

export interface InvoiceFeatureResolution {
  manualReceiving: true;
  scanExtraction: boolean;
  stockConfirmation: boolean;
  engineActivation: boolean;
}
