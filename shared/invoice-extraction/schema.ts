import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";
import { companies, users } from "../schema";

export const invoiceDraftStatus = pgEnum("invoice_draft_status", [
  "draft",
  "uploaded",
  "needs_review",
  "rejected",
  "confirming",
  "confirmed",
  "canceled",
]);
export const invoiceRunStatus = pgEnum("invoice_run_status", [
  "queued",
  "processing",
  "completed",
  "failed",
  "canceled",
]);
export const invoiceAttemptStatus = pgEnum("invoice_attempt_status", [
  "queued",
  "processing",
  "submitted",
  "completed",
  "failed",
  "canceled",
]);
export const invoiceFeatureCapability = pgEnum("invoice_feature_capability", [
  "scan_extraction",
  "stock_confirmation",
  "engine_activation",
]);
export const invoiceSourceAssetLifecycle = pgEnum(
  "invoice_source_asset_lifecycle",
  ["staging", "verified", "attached", "deleted"],
);

export const invoiceReviewDrafts = pgTable(
  "invoice_review_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: varchar("company_id").notNull(),
    status: invoiceDraftStatus("status").default("draft").notNull(),
    revision: integer("revision").default(0).notNull(),
    activeRunId: uuid("active_run_id"),
    createdByCompanyId: varchar("created_by_company_id").notNull(),
    createdByUserId: varchar("created_by_user_id").notNull(),
    updatedByCompanyId: varchar("updated_by_company_id").notNull(),
    updatedByUserId: varchar("updated_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    retentionDeadline: timestamp("retention_deadline", { withTimezone: true }),
  },
  (table): PgTableExtraConfigValue[] => [
    unique("invoice_review_drafts_company_id_id_unique").on(
      table.companyId,
      table.id,
    ),
    check(
      "invoice_review_drafts_revision_nonnegative",
      sql`${table.revision} >= 0`,
    ),
    index("invoice_review_drafts_company_activity_idx").on(
      table.companyId,
      table.lastActivityAt,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: "invoice_review_drafts_company_fk",
    }),
    foreignKey({
      columns: [table.createdByCompanyId, table.createdByUserId],
      foreignColumns: [users.companyId, users.id],
      name: "invoice_review_drafts_creator_fk",
    }),
    foreignKey({
      columns: [table.updatedByCompanyId, table.updatedByUserId],
      foreignColumns: [users.companyId, users.id],
      name: "invoice_review_drafts_updater_fk",
    }),
    foreignKey({
      columns: [table.companyId, table.id, table.activeRunId],
      foreignColumns: [
        invoiceExtractionRuns.companyId,
        invoiceExtractionRuns.draftId,
        invoiceExtractionRuns.id,
      ],
      name: "invoice_review_drafts_active_run_fk",
    }),
  ],
);

export const invoiceExtractionRuns = pgTable(
  "invoice_extraction_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: varchar("company_id").notNull(),
    draftId: uuid("draft_id").notNull(),
    runNumber: integer("run_number").notNull(),
    status: invoiceRunStatus("status").default("queued").notNull(),
    revision: integer("revision").default(0).notNull(),
    baseDraftRevision: integer("base_draft_revision").notNull(),
    requestedByCompanyId: varchar("requested_by_company_id").notNull(),
    requestedByUserId: varchar("requested_by_user_id").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    engineVersion: varchar("engine_version", { length: 64 }).notNull().default("invoice-v1"),
    model: varchar("model", { length: 120 }).notNull().default("gpt-5.6-terra"),
    schemaVersion: varchar("schema_version", { length: 64 }).notNull().default("invoice-proposal-v1"),
    executionMode: varchar("execution_mode", { length: 16 }).notNull().default("background"),
    storeResponse: boolean("store_response").notNull().default(true),
    providerConfig: jsonb("provider_config").notNull().default({}),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table): PgTableExtraConfigValue[] => [
    unique("invoice_extraction_runs_company_draft_id_unique").on(
      table.companyId,
      table.draftId,
      table.id,
    ),
    unique("invoice_extraction_runs_company_id_unique").on(
      table.companyId,
      table.id,
    ),
    unique("invoice_extraction_runs_company_draft_number_unique").on(
      table.companyId,
      table.draftId,
      table.runNumber,
    ),
    check(
      "invoice_extraction_runs_revision_nonnegative",
      sql`${table.revision} >= 0`,
    ),
    check(
      "invoice_extraction_runs_number_positive",
      sql`${table.runNumber} > 0`,
    ),
    check(
      "invoice_extraction_runs_base_revision_nonnegative",
      sql`${table.baseDraftRevision} >= 0`,
    ),
    check(
      "invoice_extraction_runs_execution_mode_valid",
      sql`${table.executionMode} in ('background', 'synchronous')`,
    ),
    check(
      "invoice_extraction_runs_provider_config_object",
      sql`jsonb_typeof(${table.providerConfig}) = 'object'`,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: "invoice_extraction_runs_company_fk",
    }),
    foreignKey({
      columns: [table.companyId, table.draftId],
      foreignColumns: [invoiceReviewDrafts.companyId, invoiceReviewDrafts.id],
      name: "invoice_extraction_runs_draft_fk",
    }),
    foreignKey({
      columns: [table.requestedByCompanyId, table.requestedByUserId],
      foreignColumns: [users.companyId, users.id],
      name: "invoice_extraction_runs_requester_fk",
    }),
  ],
);

export const invoiceExtractionProposals = pgTable(
  "invoice_extraction_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: varchar("company_id").notNull(),
    draftId: uuid("draft_id").notNull(),
    runId: uuid("run_id").notNull(),
    attemptId: uuid("attempt_id").notNull(),
    schemaVersion: varchar("schema_version", { length: 64 }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("invoice_extraction_proposals_company_id_unique").on(
      table.companyId,
      table.id,
    ),
    unique("invoice_extraction_proposals_company_draft_id_unique").on(
      table.companyId,
      table.draftId,
      table.id,
    ),
    unique("invoice_extraction_proposals_company_run_unique").on(
      table.companyId,
      table.runId,
    ),
    unique("invoice_extraction_proposals_company_attempt_unique").on(
      table.companyId,
      table.attemptId,
    ),
    index("invoice_extraction_proposals_company_draft_idx").on(
      table.companyId,
      table.draftId,
      table.createdAt,
    ),
    check(
      "invoice_extraction_proposals_payload_object",
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
    foreignKey({
      columns: [table.companyId, table.draftId, table.runId],
      foreignColumns: [
        invoiceExtractionRuns.companyId,
        invoiceExtractionRuns.draftId,
        invoiceExtractionRuns.id,
      ],
      name: "invoice_extraction_proposals_run_fk",
    }),
  ],
);

export const invoiceReviewHeaders = pgTable(
  "invoice_review_headers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: varchar("company_id").notNull(),
    draftId: uuid("draft_id").notNull(),
    proposalId: uuid("proposal_id").notNull(),
    revision: integer("revision").default(0).notNull(),
    decision: varchar("decision", { length: 16 }).default("draft").notNull(),
    finalValues: jsonb("final_values").notNull(),
    reviewedFields: jsonb("reviewed_fields").notNull().default([]),
    rejectionReason: text("rejection_reason"),
    createdByCompanyId: varchar("created_by_company_id").notNull(),
    createdByUserId: varchar("created_by_user_id").notNull(),
    updatedByCompanyId: varchar("updated_by_company_id").notNull(),
    updatedByUserId: varchar("updated_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("invoice_review_headers_company_id_unique").on(
      table.companyId,
      table.id,
    ),
    unique("invoice_review_headers_company_draft_unique").on(
      table.companyId,
      table.draftId,
    ),
    check(
      "invoice_review_headers_revision_nonnegative",
      sql`${table.revision} >= 0`,
    ),
    check(
      "invoice_review_headers_decision_valid",
      sql`${table.decision} in ('draft', 'approved', 'rejected')`,
    ),
    check(
      "invoice_review_headers_final_values_object",
      sql`jsonb_typeof(${table.finalValues}) = 'object'`,
    ),
    check(
      "invoice_review_headers_reviewed_fields_array",
      sql`jsonb_typeof(${table.reviewedFields}) = 'array'`,
    ),
    check(
      "invoice_review_headers_rejection_reason_coherent",
      sql`(${table.decision} <> 'rejected' and ${table.rejectionReason} is null)
          or (${table.decision} = 'rejected' and length(trim(${table.rejectionReason})) >= 3)`,
    ),
    foreignKey({
      columns: [table.companyId, table.draftId],
      foreignColumns: [invoiceReviewDrafts.companyId, invoiceReviewDrafts.id],
      name: "invoice_review_headers_draft_fk",
    }),
    foreignKey({
      columns: [table.companyId, table.draftId, table.proposalId],
      foreignColumns: [
        invoiceExtractionProposals.companyId,
        invoiceExtractionProposals.draftId,
        invoiceExtractionProposals.id,
      ],
      name: "invoice_review_headers_proposal_fk",
    }),
    foreignKey({
      columns: [table.createdByCompanyId, table.createdByUserId],
      foreignColumns: [users.companyId, users.id],
      name: "invoice_review_headers_creator_fk",
    }),
    foreignKey({
      columns: [table.updatedByCompanyId, table.updatedByUserId],
      foreignColumns: [users.companyId, users.id],
      name: "invoice_review_headers_updater_fk",
    }),
  ],
);

export const invoiceReviewLines = pgTable(
  "invoice_review_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: varchar("company_id").notNull(),
    draftId: uuid("draft_id").notNull(),
    proposalId: uuid("proposal_id").notNull(),
    sourceLineIndex: integer("source_line_index"),
    position: integer("position").notNull(),
    description: text("description"),
    vendorPartNumber: text("vendor_part_number"),
    quantity: numeric("quantity", { precision: 20, scale: 6 }),
    unitCost: numeric("unit_cost", { precision: 20, scale: 4 }),
    classification: varchar("classification", { length: 16 })
      .default("unknown")
      .notNull(),
    revision: integer("revision").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("invoice_review_lines_company_id_unique").on(table.companyId, table.id),
    unique("invoice_review_lines_company_draft_position_unique").on(
      table.companyId,
      table.draftId,
      table.position,
    ),
    unique("invoice_review_lines_company_draft_source_unique").on(
      table.companyId,
      table.draftId,
      table.sourceLineIndex,
    ),
    index("invoice_review_lines_company_draft_idx").on(
      table.companyId,
      table.draftId,
      table.position,
    ),
    check("invoice_review_lines_position_positive", sql`${table.position} > 0`),
    check(
      "invoice_review_lines_source_index_nonnegative",
      sql`${table.sourceLineIndex} is null or ${table.sourceLineIndex} >= 0`,
    ),
    check(
      "invoice_review_lines_quantity_positive",
      sql`${table.quantity} is null or ${table.quantity} > 0`,
    ),
    check(
      "invoice_review_lines_unit_cost_nonnegative",
      sql`${table.unitCost} is null or ${table.unitCost} >= 0`,
    ),
    check(
      "invoice_review_lines_classification_valid",
      sql`${table.classification} in ('inventory', 'consumable', 'unknown')`,
    ),
    foreignKey({
      columns: [table.companyId, table.draftId],
      foreignColumns: [invoiceReviewDrafts.companyId, invoiceReviewDrafts.id],
      name: "invoice_review_lines_draft_fk",
    }),
    foreignKey({
      columns: [table.companyId, table.draftId, table.proposalId],
      foreignColumns: [
        invoiceExtractionProposals.companyId,
        invoiceExtractionProposals.draftId,
        invoiceExtractionProposals.id,
      ],
      name: "invoice_review_lines_proposal_fk",
    }),
  ],
);

export const invoiceReviewTotals = pgTable(
  "invoice_review_totals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: varchar("company_id").notNull(),
    draftId: uuid("draft_id").notNull(),
    proposalId: uuid("proposal_id").notNull(),
    decision: varchar("decision", { length: 16 }).default("draft").notNull(),
    observedSubtotal: numeric("observed_subtotal", { precision: 20, scale: 2 }),
    observedTax: numeric("observed_tax", { precision: 20, scale: 2 }),
    observedFreight: numeric("observed_freight", { precision: 20, scale: 2 }),
    observedTotal: numeric("observed_total", { precision: 20, scale: 2 }),
    calculatedSubtotal: numeric("calculated_subtotal", { precision: 20, scale: 2 }),
    calculatedTax: numeric("calculated_tax", { precision: 20, scale: 2 }),
    calculatedFreight: numeric("calculated_freight", { precision: 20, scale: 2 }),
    calculatedTotal: numeric("calculated_total", { precision: 20, scale: 2 }),
    difference: numeric("difference", { precision: 20, scale: 2 }),
    complete: boolean("complete").default(false).notNull(),
    withinTolerance: boolean("within_tolerance").default(false).notNull(),
    revision: integer("revision").default(0).notNull(),
    updatedByCompanyId: varchar("updated_by_company_id").notNull(),
    updatedByUserId: varchar("updated_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("invoice_review_totals_company_id_unique").on(table.companyId, table.id),
    unique("invoice_review_totals_company_draft_unique").on(
      table.companyId,
      table.draftId,
    ),
    check(
      "invoice_review_totals_decision_valid",
      sql`${table.decision} in ('draft', 'approved')`,
    ),
    check("invoice_review_totals_revision_nonnegative", sql`${table.revision} >= 0`),
    foreignKey({
      columns: [table.companyId, table.draftId],
      foreignColumns: [invoiceReviewDrafts.companyId, invoiceReviewDrafts.id],
      name: "invoice_review_totals_draft_fk",
    }),
    foreignKey({
      columns: [table.companyId, table.draftId, table.proposalId],
      foreignColumns: [
        invoiceExtractionProposals.companyId,
        invoiceExtractionProposals.draftId,
        invoiceExtractionProposals.id,
      ],
      name: "invoice_review_totals_proposal_fk",
    }),
    foreignKey({
      columns: [table.updatedByCompanyId, table.updatedByUserId],
      foreignColumns: [users.companyId, users.id],
      name: "invoice_review_totals_updater_fk",
    }),
  ],
);

export const invoiceProviderWebhookEvents = pgTable(
  "invoice_provider_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerResponseId: text("provider_response_id").notNull(),
    eventType: text("event_type").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    unique("invoice_provider_webhook_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    index("invoice_provider_webhook_events_response_idx").on(
      table.provider,
      table.providerResponseId,
    ),
  ],
);

export const invoiceProviderAttempts = pgTable(
  "invoice_provider_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: varchar("company_id").notNull(),
    runId: uuid("run_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    provider: text("provider").notNull(),
    status: invoiceAttemptStatus("status").default("queued").notNull(),
    revision: integer("revision").default(0).notNull(),
    providerResponseId: text("provider_response_id"),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseOwner: text("lease_owner"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("invoice_provider_attempts_company_run_id_unique").on(
      table.companyId,
      table.runId,
      table.id,
    ),
    unique("invoice_provider_attempts_company_run_ordinal_unique").on(
      table.companyId,
      table.runId,
      table.ordinal,
    ),
    uniqueIndex("invoice_provider_attempts_response_unique")
      .on(table.providerResponseId)
      .where(sql`${table.providerResponseId} is not null`),
    uniqueIndex("invoice_provider_attempts_one_completed_per_run")
      .on(table.companyId, table.runId)
      .where(sql`${table.status} = 'completed'`),
    index("invoice_provider_attempts_claim_idx").on(
      table.companyId,
      table.status,
      table.availableAt,
      table.leaseExpiresAt,
      table.createdAt,
    ),
    check(
      "invoice_provider_attempts_ordinal_positive",
      sql`${table.ordinal} > 0`,
    ),
    check(
      "invoice_provider_attempts_revision_nonnegative",
      sql`${table.revision} >= 0`,
    ),
    check(
      "invoice_provider_attempts_lease_coherent",
      sql`(
    (${table.leaseOwner} is null and ${table.leaseToken} is null and ${table.leaseExpiresAt} is null and ${table.heartbeatAt} is null)
    or
    (${table.leaseOwner} is not null and ${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null and ${table.heartbeatAt} is not null)
  )`,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: "invoice_provider_attempts_company_fk",
    }),
    foreignKey({
      columns: [table.companyId, table.runId],
      foreignColumns: [
        invoiceExtractionRuns.companyId,
        invoiceExtractionRuns.id,
      ],
      name: "invoice_provider_attempts_run_fk",
    }),
  ],
);

export const companyInvoiceFeatureFlags = pgTable(
  "company_invoice_feature_flags",
  {
    companyId: varchar("company_id").notNull(),
    capability: invoiceFeatureCapability("capability").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    revision: integer("revision").default(0).notNull(),
    updatedByCompanyId: varchar("updated_by_company_id").notNull(),
    updatedByUserId: varchar("updated_by_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.capability] }),
    check(
      "company_invoice_feature_flags_revision_nonnegative",
      sql`${table.revision} >= 0`,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: "company_invoice_feature_flags_company_fk",
    }),
    foreignKey({
      columns: [table.updatedByCompanyId, table.updatedByUserId],
      foreignColumns: [users.companyId, users.id],
      name: "company_invoice_feature_flags_updater_fk",
    }),
  ],
);

export const invoiceAuditEvents = pgTable(
  "invoice_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: varchar("company_id").notNull(),
    actorUserId: varchar("actor_user_id").notNull(),
    actorCompanyId: varchar("actor_company_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    requestId: uuid("request_id"),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("invoice_audit_events_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    check(
      "invoice_audit_events_metadata_object",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: "invoice_audit_events_company_fk",
    }),
    foreignKey({
      columns: [table.actorCompanyId],
      foreignColumns: [companies.id],
      name: "invoice_audit_events_actor_company_fk",
    }),
    foreignKey({
      columns: [table.actorCompanyId, table.actorUserId],
      foreignColumns: [users.companyId, users.id],
      name: "invoice_audit_events_actor_fk",
    }),
  ],
);

export const invoiceDocuments = pgTable(
  "invoice_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: varchar("company_id").notNull(),
    draftId: uuid("draft_id").notNull(),
    fingerprintSha256: varchar("fingerprint_sha256", { length: 64 }),
    totalPages: integer("total_pages").default(0).notNull(),
    retentionDeadline: timestamp("retention_deadline", { withTimezone: true })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("invoice_documents_company_draft_id_unique").on(
      table.companyId,
      table.draftId,
      table.id,
    ),
    unique("invoice_documents_company_draft_unique").on(
      table.companyId,
      table.draftId,
    ),
    check("invoice_documents_pages_nonnegative", sql`${table.totalPages} >= 0`),
    check(
      "invoice_documents_fingerprint_shape",
      sql`${table.fingerprintSha256} is null or ${table.fingerprintSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: "invoice_documents_company_fk",
    }),
    foreignKey({
      columns: [table.companyId, table.draftId],
      foreignColumns: [invoiceReviewDrafts.companyId, invoiceReviewDrafts.id],
      name: "invoice_documents_draft_fk",
    }),
  ],
);

export const invoiceSourceAssets = pgTable(
  "invoice_source_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: varchar("company_id").notNull(),
    draftId: uuid("draft_id").notNull(),
    documentId: uuid("document_id").notNull(),
    lifecycle: invoiceSourceAssetLifecycle("lifecycle")
      .default("staging")
      .notNull(),
    objectKey: text("object_key"),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    detectedType: varchar("detected_type", { length: 32 }),
    byteSize: integer("byte_size"),
    sha256: varchar("sha256", { length: 64 }),
    pageCount: integer("page_count"),
    position: integer("position"),
    holdAt: timestamp("hold_at", { withTimezone: true }),
    deleteAttempts: integer("delete_attempts").default(0).notNull(),
    deleteFailureCode: varchar("delete_failure_code", { length: 64 }),
    deleteRequestedAt: timestamp("delete_requested_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("invoice_source_assets_company_id_id_unique").on(
      table.companyId,
      table.id,
    ),
    unique("invoice_source_assets_company_document_id_unique").on(
      table.companyId,
      table.documentId,
      table.id,
    ),
    uniqueIndex("invoice_source_assets_attached_position_unique")
      .on(table.companyId, table.documentId, table.position)
      .where(sql`${table.lifecycle} = 'attached'`),
    uniqueIndex("invoice_source_assets_document_checksum_unique")
      .on(table.companyId, table.documentId, table.sha256)
      .where(sql`${table.lifecycle} <> 'deleted' and ${table.sha256} is not null`),
    index("invoice_source_assets_reconcile_idx").on(
      table.lifecycle,
      table.deleteRequestedAt,
      table.updatedAt,
    ),
    check(
      "invoice_source_assets_size_positive",
      sql`${table.byteSize} is null or ${table.byteSize} > 0`,
    ),
    check(
      "invoice_source_assets_pages_positive",
      sql`${table.pageCount} is null or ${table.pageCount} > 0`,
    ),
    check(
      "invoice_source_assets_position_positive",
      sql`${table.position} is null or ${table.position} > 0`,
    ),
    check(
      "invoice_source_assets_delete_attempts_nonnegative",
      sql`${table.deleteAttempts} >= 0`,
    ),
    check(
      "invoice_source_assets_sha_shape",
      sql`${table.sha256} is null or ${table.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "invoice_source_assets_lifecycle_coherent",
      sql`(
        (${table.lifecycle} = 'staging' and ${table.position} is null and ${table.deletedAt} is null)
        or
        (${table.lifecycle} = 'verified' and ${table.objectKey} is not null and ${table.position} is null and ${table.deletedAt} is null)
        or
        (${table.lifecycle} = 'attached' and ${table.objectKey} is not null and ${table.detectedType} is not null and ${table.byteSize} is not null and ${table.sha256} is not null and ${table.pageCount} is not null and ${table.position} is not null and ${table.deletedAt} is null)
        or
        (${table.lifecycle} = 'deleted' and ${table.position} is null and ${table.deletedAt} is not null)
      )`,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: "invoice_source_assets_company_fk",
    }),
    foreignKey({
      columns: [table.companyId, table.draftId],
      foreignColumns: [invoiceReviewDrafts.companyId, invoiceReviewDrafts.id],
      name: "invoice_source_assets_draft_fk",
    }),
    foreignKey({
      columns: [table.companyId, table.draftId, table.documentId],
      foreignColumns: [
        invoiceDocuments.companyId,
        invoiceDocuments.draftId,
        invoiceDocuments.id,
      ],
      name: "invoice_source_assets_document_fk",
    }),
  ],
);
