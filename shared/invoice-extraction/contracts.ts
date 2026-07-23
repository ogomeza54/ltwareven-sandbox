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
export const invoiceRunIdSchema = z.string().uuid();
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
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
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
  "INVOICE_SOURCE_REQUIRED",
  "INVOICE_PROVIDER_UNAVAILABLE",
  "INVOICE_PROVIDER_INVALID_OUTPUT",
  "INVOICE_WEBHOOK_INVALID",
  "INVOICE_NUMERIC_INVALID",
  "INVOICE_RECONCILIATION_REQUIRED",
  "INVOICE_REVIEW_INCOMPLETE",
  "INVOICE_DUPLICATE_SUSPECTED",
  "INVOICE_IDEMPOTENCY_CONFLICT",
  "INVOICE_CONFIRMATION_NOT_FOUND",
  "INVOICE_CONFIRMATION_DISABLED",
  "INVOICE_CONFIRMATION_CONFLICT",
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
  INVOICE_SOURCE_REQUIRED: "Add an invoice image or PDF before starting extraction.",
  INVOICE_PROVIDER_UNAVAILABLE:
    "Invoice extraction is temporarily unavailable. Try again later.",
  INVOICE_PROVIDER_INVALID_OUTPUT:
    "The invoice could not be read reliably. Review it manually or try again.",
  INVOICE_WEBHOOK_INVALID: "The provider callback could not be verified.",
  INVOICE_NUMERIC_INVALID:
    "An invoice quantity or amount has an invalid value or precision.",
  INVOICE_RECONCILIATION_REQUIRED:
    "Correct the invoice totals before completing line review.",
  INVOICE_REVIEW_INCOMPLETE:
    "Complete the header, line, amount and part review before confirmation.",
  INVOICE_DUPLICATE_SUSPECTED:
    "This invoice may already have been received. An administrator must review it.",
  INVOICE_IDEMPOTENCY_CONFLICT:
    "This confirmation key was already used for different invoice data.",
  INVOICE_CONFIRMATION_NOT_FOUND:
    "The invoice confirmation could not be found.",
  INVOICE_CONFIRMATION_DISABLED:
    "Invoice stock confirmation is not enabled for this company.",
  INVOICE_CONFIRMATION_CONFLICT:
    "The reviewed invoice or catalog changed. Return to review before confirming.",
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

const nullableObservedString = z.object({
  observed: z.string().nullable(),
  normalized: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  sourceAssetId: z.string().uuid().nullable(),
  sourcePage: z.number().int().positive().nullable(),
});

const invoiceUncertaintySchema = z.object({
  path: z.string().min(1).max(160),
  reason: z.enum(["missing", "ambiguous", "low_confidence", "inconsistent"]),
  message: z.string().min(1).max(300),
});

export const invoiceProposalSchema = z.object({
  schemaVersion: z.literal("invoice-proposal-v1"),
  header: z.object({
    vendorName: nullableObservedString,
    invoiceNumber: nullableObservedString,
    invoiceDate: nullableObservedString,
    currency: nullableObservedString,
    subtotal: nullableObservedString,
    tax: nullableObservedString,
    freight: nullableObservedString,
    total: nullableObservedString,
  }),
  lines: z.array(
    z.object({
      description: nullableObservedString,
      vendorPartNumber: nullableObservedString,
      quantity: nullableObservedString,
      unitCost: nullableObservedString,
      lineTotal: nullableObservedString,
      classification: z
        .object({
          kind: z.enum(["inventory", "consumable", "unknown"]),
          confidence: z.number().min(0).max(1).nullable(),
        })
        .nullable(),
    }),
  ).max(500),
  uncertainties: z.array(invoiceUncertaintySchema).max(1000),
});
export type InvoiceProposal = z.infer<typeof invoiceProposalSchema>;

export const startInvoiceExtractionSchema = z
  .object({ revision: invoiceDraftRevisionSchema })
  .strict();

export const invoiceExtractionRunDtoSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  runNumber: z.number().int().positive(),
  status: invoiceRunStatusSchema,
  revision: z.number().int().nonnegative(),
  attemptStatus: invoiceAttemptStatusSchema.nullable(),
  failureCode: z.string().nullable(),
  engineVersion: z.string(),
  model: z.string(),
  schemaVersion: z.string(),
  executionMode: z.enum(["background", "synchronous"]),
  storeResponse: z.boolean(),
  proposal: invoiceProposalSchema.nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type InvoiceExtractionRunDto = z.infer<
  typeof invoiceExtractionRunDtoSchema
>;

export const invoiceReviewDecisionSchema = z.enum([
  "draft",
  "approved",
  "rejected",
]);
export const invoiceFinalHeaderSchema = z
  .object({
    vendorName: z.string().trim().max(240).nullable(),
    invoiceNumber: z.string().trim().max(120).nullable(),
    invoiceDate: z.string().trim().max(40).nullable(),
    currency: z.string().trim().max(8).nullable(),
    subtotal: z.string().trim().max(40).nullable(),
    tax: z.string().trim().max(40).nullable(),
    freight: z.string().trim().max(40).nullable(),
    total: z.string().trim().max(40).nullable(),
  })
  .strict();
export type InvoiceFinalHeader = z.infer<typeof invoiceFinalHeaderSchema>;
export const invoiceHeaderFieldSchema = z.enum([
  "vendorName",
  "invoiceNumber",
  "invoiceDate",
  "currency",
  "subtotal",
  "tax",
  "freight",
  "total",
]);
export type InvoiceHeaderField = z.infer<typeof invoiceHeaderFieldSchema>;

export const invoiceReviewIssueSchema = z.object({
  path: z.string(),
  reason: z.enum(["missing", "ambiguous", "low_confidence", "inconsistent"]),
  message: z.string(),
});
export type InvoiceReviewIssue = z.infer<typeof invoiceReviewIssueSchema>;

export const invoiceReviewWorkspaceDtoSchema = z.object({
  draftId: z.string().uuid(),
  draftRevision: z.number().int().nonnegative(),
  reviewRevision: z.number().int().nonnegative(),
  decision: invoiceReviewDecisionSchema,
  rejectionReason: z.string().nullable(),
  proposedHeader: invoiceProposalSchema.shape.header,
  finalHeader: invoiceFinalHeaderSchema,
  reviewedFields: z.array(invoiceHeaderFieldSchema),
  issues: z.array(invoiceReviewIssueSchema),
  lines: z.array(
    z.object({
      id: z.string().uuid(),
      sourceLineIndex: z.number().int().nonnegative().nullable(),
      position: z.number().int().positive(),
      description: z.string().nullable(),
      vendorPartNumber: z.string().nullable(),
      quantity: z.string().nullable(),
      unitCost: z.string().nullable(),
      calculatedLineTotal: z.string().nullable(),
      classification: z.enum(["inventory", "consumable", "unknown"]),
      proposed: invoiceProposalSchema.shape.lines.element.nullable(),
      match: z.object({
        decision: z.enum(["unresolved", "existing", "new"]),
        selectedPart: z
          .object({
            id: z.string().uuid(),
            name: z.string(),
            partNumber: z.string(),
            category: z.string().nullable(),
            itemType: z.enum(["inventory", "consumable"]),
          })
          .nullable(),
        proposedNewPart: z
          .object({
            name: z.string(),
            partNumber: z.string(),
            itemType: z.enum(["inventory", "consumable"]),
            category: z.string().nullable(),
            groupId: z.string().uuid().nullable(),
            subgroupId: z.string().uuid().nullable(),
          })
          .nullable(),
        originalSuggestion: z
          .object({
            partId: z.string().uuid(),
            score: z.number().int().min(0).max(100),
            signals: z.array(z.string()),
          })
          .nullable(),
      }),
    }),
  ),
  reconciliation: z.object({
    decision: z.enum(["draft", "approved"]),
    complete: z.boolean(),
    withinTolerance: z.boolean(),
    observedSubtotal: z.string().nullable(),
    observedTax: z.string().nullable(),
    observedFreight: z.string().nullable(),
    observedTotal: z.string().nullable(),
    calculatedSubtotal: z.string().nullable(),
    calculatedTax: z.string().nullable(),
    calculatedFreight: z.string().nullable(),
    calculatedTotal: z.string().nullable(),
    difference: z.string().nullable(),
  }),
  source: invoiceSourceDtoSchema,
  updatedAt: z.string().datetime(),
});
export type InvoiceReviewWorkspaceDto = z.infer<
  typeof invoiceReviewWorkspaceDtoSchema
>;

const invoiceEditableLineSchema = z
  .object({
    id: z.string().uuid().nullable(),
    description: z.string().trim().max(500).nullable(),
    vendorPartNumber: z.string().trim().max(160).nullable(),
    quantity: z.string().max(40).nullable(),
    unitCost: z.string().max(40).nullable(),
    classification: z.enum(["inventory", "consumable", "unknown"]),
  })
  .strict();

export const updateInvoiceLinesReviewSchema = z
  .object({
    revision: invoiceDraftRevisionSchema,
    lines: z.array(invoiceEditableLineSchema).max(500),
    decision: z.enum(["draft", "approved"]),
  })
  .strict();

export const invoicePartCandidateSchema = z.object({
  part: z.object({
    id: z.string().uuid(),
    name: z.string(),
    partNumber: z.string(),
    category: z.string().nullable(),
    itemType: z.enum(["inventory", "consumable"]),
  }),
  score: z.number().int().min(0).max(100),
  signals: z.array(z.string()),
});
export type InvoicePartCandidate = z.infer<typeof invoicePartCandidateSchema>;

const proposedNewInvoicePartSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    partNumber: z.string().trim().min(1).max(160),
    itemType: z.enum(["inventory", "consumable"]),
    category: z.string().trim().max(160).nullable(),
    groupId: z.string().uuid().nullable(),
    subgroupId: z.string().uuid().nullable(),
  })
  .strict();

export const updateInvoiceLineMatchesSchema = z
  .object({
    revision: invoiceDraftRevisionSchema,
    matches: z
      .array(
        z.discriminatedUnion("decision", [
          z
            .object({
              lineId: z.string().uuid(),
              decision: z.literal("unresolved"),
              selectedPartId: z.null(),
              proposedNewPart: z.null(),
            })
            .strict(),
          z
            .object({
              lineId: z.string().uuid(),
              decision: z.literal("existing"),
              selectedPartId: z.string().uuid(),
              proposedNewPart: z.null(),
            })
            .strict(),
          z
            .object({
              lineId: z.string().uuid(),
              decision: z.literal("new"),
              selectedPartId: z.null(),
              proposedNewPart: proposedNewInvoicePartSchema,
            })
            .strict(),
        ]),
      )
      .max(500),
  })
  .strict();

export const createInvoiceConfirmationIntentSchema = z
  .object({
    revision: invoiceDraftRevisionSchema,
  })
  .strict();

export const overrideInvoiceDuplicateSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

export const invoiceConfirmationIntentDtoSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  draftRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(["reserved", "completed", "invalidated"]),
  duplicateStatus: z.enum(["clear", "suspected", "overridden"]),
  duplicateSignals: z.array(
    z.object({
      kind: z.enum(["source_fingerprint", "supplier_invoice_number"]),
      intakeId: z.string().uuid(),
    }),
  ),
  overrideReason: z.string().nullable(),
  summary: z.object({
    vendor: z.string(),
    invoiceNumber: z.string().nullable(),
    invoiceDate: z.string().nullable(),
    currency: z.literal("USD"),
    subtotal: z.string(),
    tax: z.string(),
    freight: z.string(),
    total: z.string(),
    lines: z.array(
      z.object({
        lineId: z.string().uuid(),
        description: z.string(),
        partNumber: z.string(),
        itemType: z.enum(["inventory", "consumable"]),
        quantity: z.string(),
        unitCost: z.string(),
        lineTotal: z.string(),
        resolution: z.discriminatedUnion("kind", [
          z.object({
            kind: z.literal("existing"),
            partId: z.string().uuid(),
            partName: z.string(),
          }),
          z.object({
            kind: z.literal("new"),
            proposedPart: z.object({
              name: z.string(),
              partNumber: z.string(),
              itemType: z.enum(["inventory", "consumable"]),
              category: z.string().nullable(),
              groupId: z.string().uuid().nullable(),
              subgroupId: z.string().uuid().nullable(),
            }),
          }),
        ]),
      }),
    ),
    newPartCount: z.number().int().nonnegative(),
    stockUnitDelta: z.string(),
  }),
  intakeId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type InvoiceConfirmationIntentDto = z.infer<
  typeof invoiceConfirmationIntentDtoSchema
>;

export const invoiceHistoryQuerySchema = z
  .object({
    status: invoiceDraftStatusSchema.optional(),
    supplier: z.string().trim().max(160).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const invoiceHistoryItemSchema = z.object({
  draftId: z.string().uuid(),
  status: invoiceDraftStatusSchema,
  supplier: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  updatedByUserId: z.string(),
  updatedAt: z.string().datetime(),
  engineVersion: z.string().nullable(),
  resumable: z.boolean(),
  intakeId: z.string().uuid().nullable(),
});
export type InvoiceHistoryItem = z.infer<typeof invoiceHistoryItemSchema>;

export const updateInvoiceHeaderReviewSchema = z
  .object({
    revision: invoiceDraftRevisionSchema,
    header: invoiceFinalHeaderSchema,
    reviewedFields: z.array(invoiceHeaderFieldSchema),
    decision: z.enum(["draft", "approved"]),
  })
  .strict();

export const rejectInvoiceReviewSchema = z
  .object({
    revision: invoiceDraftRevisionSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export interface InvoiceFeatureResolution {
  manualReceiving: true;
  scanExtraction: boolean;
  stockConfirmation: boolean;
  engineActivation: boolean;
}
