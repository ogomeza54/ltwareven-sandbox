import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
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
