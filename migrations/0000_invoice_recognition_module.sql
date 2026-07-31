-- Consolidated invoice recognition release migration.
-- Brownfield compatibility boundary
-- Controlled Brownfield adoption marker.
-- The guarded migration runner verifies only the Brownfield objects required by
-- invoice receiving before Drizzle records this no-op migration. Optional
-- accounting integration tables such as company_integrations are deliberately
-- outside this baseline and are never created or modified here.
select 1;

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Core ledger, feature flags and audit
CREATE TYPE "public"."invoice_draft_status" AS ENUM('draft', 'uploaded', 'needs_review', 'rejected', 'confirming', 'confirmed', 'canceled');
--> statement-breakpoint
CREATE TYPE "public"."invoice_run_status" AS ENUM('queued', 'processing', 'completed', 'failed', 'canceled');
--> statement-breakpoint
CREATE TYPE "public"."invoice_attempt_status" AS ENUM('queued', 'processing', 'submitted', 'completed', 'failed', 'canceled');
--> statement-breakpoint
CREATE TYPE "public"."invoice_feature_capability" AS ENUM('scan_extraction', 'stock_confirmation', 'engine_activation');
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "users_company_id_id_unique" ON "users" USING btree ("company_id","id");
--> statement-breakpoint
CREATE TABLE "invoice_review_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" varchar NOT NULL,
  "status" "invoice_draft_status" DEFAULT 'draft' NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "active_run_id" uuid,
  "created_by_company_id" varchar NOT NULL,
  "created_by_user_id" varchar NOT NULL,
  "updated_by_company_id" varchar NOT NULL,
  "updated_by_user_id" varchar NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
  "abandoned_at" timestamp with time zone,
  "retention_deadline" timestamp with time zone,
  CONSTRAINT "invoice_review_drafts_company_id_id_unique" UNIQUE("company_id","id"),
  CONSTRAINT "invoice_review_drafts_revision_nonnegative" CHECK ("revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_extraction_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" varchar NOT NULL,
  "draft_id" uuid NOT NULL,
  "run_number" integer NOT NULL,
  "status" "invoice_run_status" DEFAULT 'queued' NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "base_draft_revision" integer NOT NULL,
  "requested_by_company_id" varchar NOT NULL,
  "requested_by_user_id" varchar NOT NULL,
  "correlation_id" uuid NOT NULL,
  "failure_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  CONSTRAINT "invoice_extraction_runs_company_draft_id_unique" UNIQUE("company_id","draft_id","id"),
  CONSTRAINT "invoice_extraction_runs_company_id_unique" UNIQUE("company_id","id"),
  CONSTRAINT "invoice_extraction_runs_company_draft_number_unique" UNIQUE("company_id","draft_id","run_number"),
  CONSTRAINT "invoice_extraction_runs_revision_nonnegative" CHECK ("revision" >= 0),
  CONSTRAINT "invoice_extraction_runs_number_positive" CHECK ("run_number" > 0),
  CONSTRAINT "invoice_extraction_runs_base_revision_nonnegative" CHECK ("base_draft_revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_provider_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" varchar NOT NULL,
  "run_id" uuid NOT NULL,
  "ordinal" integer NOT NULL,
  "provider" text NOT NULL,
  "status" "invoice_attempt_status" DEFAULT 'queued' NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "provider_response_id" text,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_owner" text,
  "lease_token" uuid,
  "lease_expires_at" timestamp with time zone,
  "heartbeat_at" timestamp with time zone,
  "failure_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "invoice_provider_attempts_company_run_ordinal_unique" UNIQUE("company_id","run_id","ordinal"),
  CONSTRAINT "invoice_provider_attempts_ordinal_positive" CHECK ("ordinal" > 0),
  CONSTRAINT "invoice_provider_attempts_revision_nonnegative" CHECK ("revision" >= 0),
  CONSTRAINT "invoice_provider_attempts_lease_coherent" CHECK (
    ("lease_owner" IS NULL AND "lease_token" IS NULL AND "lease_expires_at" IS NULL AND "heartbeat_at" IS NULL)
    OR
    ("lease_owner" IS NOT NULL AND "lease_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL AND "heartbeat_at" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE TABLE "company_invoice_feature_flags" (
  "company_id" varchar NOT NULL,
  "capability" "invoice_feature_capability" NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "updated_by_company_id" varchar NOT NULL,
  "updated_by_user_id" varchar NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "company_invoice_feature_flags_company_id_capability_pk" PRIMARY KEY("company_id","capability"),
  CONSTRAINT "company_invoice_feature_flags_revision_nonnegative" CHECK ("revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" varchar NOT NULL,
  "actor_user_id" varchar NOT NULL,
  "actor_company_id" varchar NOT NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "correlation_id" uuid NOT NULL,
  "request_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invoice_audit_events_metadata_object" CHECK (jsonb_typeof("metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "invoice_review_drafts" ADD CONSTRAINT "invoice_review_drafts_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id");
--> statement-breakpoint
ALTER TABLE "invoice_review_drafts" ADD CONSTRAINT "invoice_review_drafts_creator_fk" FOREIGN KEY ("created_by_company_id","created_by_user_id") REFERENCES "users"("company_id","id");
--> statement-breakpoint
ALTER TABLE "invoice_review_drafts" ADD CONSTRAINT "invoice_review_drafts_updater_fk" FOREIGN KEY ("updated_by_company_id","updated_by_user_id") REFERENCES "users"("company_id","id");
--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD CONSTRAINT "invoice_extraction_runs_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id");
--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD CONSTRAINT "invoice_extraction_runs_draft_fk" FOREIGN KEY ("company_id","draft_id") REFERENCES "invoice_review_drafts"("company_id","id");
--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD CONSTRAINT "invoice_extraction_runs_requester_fk" FOREIGN KEY ("requested_by_company_id","requested_by_user_id") REFERENCES "users"("company_id","id");
--> statement-breakpoint
ALTER TABLE "invoice_review_drafts" ADD CONSTRAINT "invoice_review_drafts_active_run_fk" FOREIGN KEY ("company_id","id","active_run_id") REFERENCES "invoice_extraction_runs"("company_id","draft_id","id");
--> statement-breakpoint
ALTER TABLE "invoice_provider_attempts" ADD CONSTRAINT "invoice_provider_attempts_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id");
--> statement-breakpoint
ALTER TABLE "invoice_provider_attempts" ADD CONSTRAINT "invoice_provider_attempts_run_fk" FOREIGN KEY ("company_id","run_id") REFERENCES "invoice_extraction_runs"("company_id","id");
--> statement-breakpoint
ALTER TABLE "company_invoice_feature_flags" ADD CONSTRAINT "company_invoice_feature_flags_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id");
--> statement-breakpoint
ALTER TABLE "company_invoice_feature_flags" ADD CONSTRAINT "company_invoice_feature_flags_updater_fk" FOREIGN KEY ("updated_by_company_id","updated_by_user_id") REFERENCES "users"("company_id","id");
--> statement-breakpoint
ALTER TABLE "invoice_audit_events" ADD CONSTRAINT "invoice_audit_events_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id");
--> statement-breakpoint
ALTER TABLE "invoice_audit_events" ADD CONSTRAINT "invoice_audit_events_actor_company_fk" FOREIGN KEY ("actor_company_id") REFERENCES "companies"("id");
--> statement-breakpoint
ALTER TABLE "invoice_audit_events" ADD CONSTRAINT "invoice_audit_events_actor_fk" FOREIGN KEY ("actor_company_id","actor_user_id") REFERENCES "users"("company_id","id");
--> statement-breakpoint
CREATE INDEX "invoice_review_drafts_company_activity_idx" ON "invoice_review_drafts" USING btree ("company_id","last_activity_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_provider_attempts_response_unique" ON "invoice_provider_attempts" USING btree ("provider_response_id") WHERE "provider_response_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_provider_attempts_one_completed_per_run" ON "invoice_provider_attempts" USING btree ("company_id","run_id") WHERE "status" = 'completed';
--> statement-breakpoint
CREATE INDEX "invoice_provider_attempts_claim_idx" ON "invoice_provider_attempts" USING btree ("company_id","status","available_at","lease_expires_at","created_at");
--> statement-breakpoint
CREATE INDEX "invoice_audit_events_company_created_idx" ON "invoice_audit_events" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE FUNCTION reject_invoice_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'invoice audit events are append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_audit_events_append_only
BEFORE UPDATE OR DELETE ON invoice_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_invoice_audit_mutation();

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Private source documents
CREATE TYPE "public"."invoice_source_asset_lifecycle" AS ENUM('staging', 'verified', 'attached', 'deleted');
--> statement-breakpoint
CREATE TABLE "invoice_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" varchar NOT NULL,
  "draft_id" uuid NOT NULL,
  "fingerprint_sha256" varchar(64),
  "total_pages" integer DEFAULT 0 NOT NULL,
  "retention_deadline" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invoice_documents_company_draft_id_unique" UNIQUE("company_id","draft_id","id"),
  CONSTRAINT "invoice_documents_company_draft_unique" UNIQUE("company_id","draft_id"),
  CONSTRAINT "invoice_documents_pages_nonnegative" CHECK ("total_pages" >= 0),
  CONSTRAINT "invoice_documents_fingerprint_shape" CHECK ("fingerprint_sha256" IS NULL OR "fingerprint_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "invoice_source_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" varchar NOT NULL,
  "draft_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "lifecycle" "invoice_source_asset_lifecycle" DEFAULT 'staging' NOT NULL,
  "object_key" text,
  "display_name" varchar(120) NOT NULL,
  "detected_type" varchar(32),
  "byte_size" integer,
  "sha256" varchar(64),
  "page_count" integer,
  "position" integer,
  "hold_at" timestamp with time zone,
  "delete_attempts" integer DEFAULT 0 NOT NULL,
  "delete_failure_code" varchar(64),
  "delete_requested_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invoice_source_assets_company_id_id_unique" UNIQUE("company_id","id"),
  CONSTRAINT "invoice_source_assets_company_document_id_unique" UNIQUE("company_id","document_id","id"),
  CONSTRAINT "invoice_source_assets_size_positive" CHECK ("byte_size" IS NULL OR "byte_size" > 0),
  CONSTRAINT "invoice_source_assets_pages_positive" CHECK ("page_count" IS NULL OR "page_count" > 0),
  CONSTRAINT "invoice_source_assets_position_positive" CHECK ("position" IS NULL OR "position" > 0),
  CONSTRAINT "invoice_source_assets_delete_attempts_nonnegative" CHECK ("delete_attempts" >= 0),
  CONSTRAINT "invoice_source_assets_sha_shape" CHECK ("sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "invoice_source_assets_lifecycle_coherent" CHECK (
    ("lifecycle" = 'staging' AND "position" IS NULL AND "deleted_at" IS NULL)
    OR ("lifecycle" = 'verified' AND "object_key" IS NOT NULL AND "position" IS NULL AND "deleted_at" IS NULL)
    OR ("lifecycle" = 'attached' AND "object_key" IS NOT NULL AND "detected_type" IS NOT NULL AND "byte_size" IS NOT NULL AND "sha256" IS NOT NULL AND "page_count" IS NOT NULL AND "position" IS NOT NULL AND "deleted_at" IS NULL)
    OR ("lifecycle" = 'deleted' AND "position" IS NULL AND "deleted_at" IS NOT NULL)
  )
);
--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id");
--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_draft_fk" FOREIGN KEY ("company_id","draft_id") REFERENCES "invoice_review_drafts"("company_id","id");
--> statement-breakpoint
ALTER TABLE "invoice_source_assets" ADD CONSTRAINT "invoice_source_assets_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id");
--> statement-breakpoint
ALTER TABLE "invoice_source_assets" ADD CONSTRAINT "invoice_source_assets_draft_fk" FOREIGN KEY ("company_id","draft_id") REFERENCES "invoice_review_drafts"("company_id","id");
--> statement-breakpoint
ALTER TABLE "invoice_source_assets" ADD CONSTRAINT "invoice_source_assets_document_fk" FOREIGN KEY ("company_id","draft_id","document_id") REFERENCES "invoice_documents"("company_id","draft_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_source_assets_attached_position_unique" ON "invoice_source_assets" USING btree ("company_id","document_id","position") WHERE "lifecycle" = 'attached';
--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_source_assets_document_checksum_unique" ON "invoice_source_assets" USING btree ("company_id","document_id","sha256") WHERE "lifecycle" <> 'deleted' AND "sha256" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "invoice_source_assets_reconcile_idx" ON "invoice_source_assets" USING btree ("lifecycle","delete_requested_at","updated_at");

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Extraction proposals and optional provider events
CREATE TABLE "invoice_extraction_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"draft_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"schema_version" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_extraction_proposals_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_extraction_proposals_company_run_unique" UNIQUE("company_id","run_id"),
	CONSTRAINT "invoice_extraction_proposals_company_attempt_unique" UNIQUE("company_id","attempt_id"),
	CONSTRAINT "invoice_extraction_proposals_payload_object" CHECK (jsonb_typeof("invoice_extraction_proposals"."payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "invoice_provider_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_response_id" text NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "invoice_provider_webhook_events_provider_event_unique" UNIQUE("provider","provider_event_id")
);
--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD COLUMN "engine_version" varchar(64) DEFAULT 'invoice-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD COLUMN "model" varchar(120) DEFAULT 'gpt-5.6-luna' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD COLUMN "schema_version" varchar(64) DEFAULT 'invoice-proposal-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD COLUMN "execution_mode" varchar(16) DEFAULT 'synchronous' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD COLUMN "store_response" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD COLUMN "provider_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_extraction_proposals" ADD CONSTRAINT "invoice_extraction_proposals_run_fk" FOREIGN KEY ("company_id","draft_id","run_id") REFERENCES "public"."invoice_extraction_runs"("company_id","draft_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_extraction_proposals_company_draft_idx" ON "invoice_extraction_proposals" USING btree ("company_id","draft_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_provider_webhook_events_response_idx" ON "invoice_provider_webhook_events" USING btree ("provider","provider_response_id");--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD CONSTRAINT "invoice_extraction_runs_execution_mode_valid" CHECK ("invoice_extraction_runs"."execution_mode" in ('background', 'synchronous'));--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD CONSTRAINT "invoice_extraction_runs_provider_config_object" CHECK (jsonb_typeof("invoice_extraction_runs"."provider_config") = 'object');
--> statement-breakpoint
CREATE FUNCTION reject_invoice_proposal_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'invoice extraction proposals are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_extraction_proposals_immutable
BEFORE UPDATE ON "invoice_extraction_proposals"
FOR EACH ROW EXECUTE FUNCTION reject_invoice_proposal_mutation();

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Provider-attempt ownership
ALTER TABLE "invoice_provider_attempts" ADD CONSTRAINT "invoice_provider_attempts_company_run_id_unique" UNIQUE("company_id","run_id","id");
--> statement-breakpoint
ALTER TABLE "invoice_extraction_proposals" ADD CONSTRAINT "invoice_extraction_proposals_attempt_fk" FOREIGN KEY ("company_id","run_id","attempt_id") REFERENCES "public"."invoice_provider_attempts"("company_id","run_id","id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Header review
CREATE TABLE "invoice_review_headers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"draft_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"decision" varchar(16) DEFAULT 'draft' NOT NULL,
	"final_values" jsonb NOT NULL,
	"reviewed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejection_reason" text,
	"created_by_company_id" varchar NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"updated_by_company_id" varchar NOT NULL,
	"updated_by_user_id" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_review_headers_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_review_headers_company_draft_unique" UNIQUE("company_id","draft_id"),
	CONSTRAINT "invoice_review_headers_revision_nonnegative" CHECK ("invoice_review_headers"."revision" >= 0),
	CONSTRAINT "invoice_review_headers_decision_valid" CHECK ("invoice_review_headers"."decision" in ('draft', 'approved', 'rejected')),
	CONSTRAINT "invoice_review_headers_final_values_object" CHECK (jsonb_typeof("invoice_review_headers"."final_values") = 'object'),
	CONSTRAINT "invoice_review_headers_reviewed_fields_array" CHECK (jsonb_typeof("invoice_review_headers"."reviewed_fields") = 'array'),
	CONSTRAINT "invoice_review_headers_rejection_reason_coherent" CHECK (("invoice_review_headers"."decision" <> 'rejected' and "invoice_review_headers"."rejection_reason" is null)
          or ("invoice_review_headers"."decision" = 'rejected' and length(trim("invoice_review_headers"."rejection_reason")) >= 3))
);
--> statement-breakpoint
ALTER TABLE "invoice_review_headers" ADD CONSTRAINT "invoice_review_headers_draft_fk" FOREIGN KEY ("company_id","draft_id") REFERENCES "public"."invoice_review_drafts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_extraction_proposals" ADD CONSTRAINT "invoice_extraction_proposals_company_draft_id_unique" UNIQUE("company_id","draft_id","id");--> statement-breakpoint
ALTER TABLE "invoice_review_headers" ADD CONSTRAINT "invoice_review_headers_proposal_fk" FOREIGN KEY ("company_id","draft_id","proposal_id") REFERENCES "public"."invoice_extraction_proposals"("company_id","draft_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_review_headers" ADD CONSTRAINT "invoice_review_headers_creator_fk" FOREIGN KEY ("created_by_company_id","created_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_review_headers" ADD CONSTRAINT "invoice_review_headers_updater_fk" FOREIGN KEY ("updated_by_company_id","updated_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "invoice_review_headers" (
  company_id, draft_id, proposal_id, final_values,
  created_by_company_id, created_by_user_id,
  updated_by_company_id, updated_by_user_id
)
SELECT proposal.company_id, proposal.draft_id, proposal.id,
       jsonb_build_object(
         'vendorName', coalesce(nullif(proposal.payload #> '{header,vendorName,normalized}', 'null'::jsonb), proposal.payload #> '{header,vendorName,observed}', 'null'::jsonb),
         'invoiceNumber', coalesce(nullif(proposal.payload #> '{header,invoiceNumber,normalized}', 'null'::jsonb), proposal.payload #> '{header,invoiceNumber,observed}', 'null'::jsonb),
         'invoiceDate', coalesce(nullif(proposal.payload #> '{header,invoiceDate,normalized}', 'null'::jsonb), proposal.payload #> '{header,invoiceDate,observed}', 'null'::jsonb),
         'currency', coalesce(nullif(proposal.payload #> '{header,currency,normalized}', 'null'::jsonb), proposal.payload #> '{header,currency,observed}', 'null'::jsonb),
         'subtotal', coalesce(nullif(proposal.payload #> '{header,subtotal,normalized}', 'null'::jsonb), proposal.payload #> '{header,subtotal,observed}', 'null'::jsonb),
         'tax', coalesce(nullif(proposal.payload #> '{header,tax,normalized}', 'null'::jsonb), proposal.payload #> '{header,tax,observed}', 'null'::jsonb),
         'freight', coalesce(nullif(proposal.payload #> '{header,freight,normalized}', 'null'::jsonb), proposal.payload #> '{header,freight,observed}', 'null'::jsonb),
         'total', coalesce(nullif(proposal.payload #> '{header,total,normalized}', 'null'::jsonb), proposal.payload #> '{header,total,observed}', 'null'::jsonb)
       ),
       run.requested_by_company_id, run.requested_by_user_id,
       run.requested_by_company_id, run.requested_by_user_id
FROM "invoice_extraction_proposals" proposal
JOIN "invoice_extraction_runs" run
  ON run.company_id = proposal.company_id AND run.id = proposal.run_id
JOIN "invoice_review_drafts" draft
  ON draft.company_id = proposal.company_id
 AND draft.id = proposal.draft_id
 AND draft.active_run_id = proposal.run_id
WHERE draft.status = 'needs_review'
ON CONFLICT (company_id, draft_id) DO NOTHING;

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Line and total review
CREATE TABLE "invoice_review_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"draft_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"source_line_index" integer,
	"position" integer NOT NULL,
	"description" text,
	"vendor_part_number" text,
	"quantity" numeric(20, 6),
	"unit_cost" numeric(20, 4),
	"classification" varchar(16) DEFAULT 'unknown' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_review_lines_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_review_lines_company_draft_position_unique" UNIQUE("company_id","draft_id","position"),
	CONSTRAINT "invoice_review_lines_company_draft_source_unique" UNIQUE("company_id","draft_id","source_line_index"),
	CONSTRAINT "invoice_review_lines_position_positive" CHECK ("invoice_review_lines"."position" > 0),
	CONSTRAINT "invoice_review_lines_source_index_nonnegative" CHECK ("invoice_review_lines"."source_line_index" is null or "invoice_review_lines"."source_line_index" >= 0),
	CONSTRAINT "invoice_review_lines_quantity_nonzero" CHECK ("invoice_review_lines"."quantity" is null or "invoice_review_lines"."quantity" <> 0),
	CONSTRAINT "invoice_review_lines_unit_cost_nonnegative" CHECK ("invoice_review_lines"."unit_cost" is null or "invoice_review_lines"."unit_cost" >= 0),
	CONSTRAINT "invoice_review_lines_classification_valid" CHECK ("invoice_review_lines"."classification" in ('inventory', 'consumable', 'service', 'direct_expense', 'adjustment', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "invoice_review_totals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"draft_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"decision" varchar(16) DEFAULT 'draft' NOT NULL,
	"observed_subtotal" numeric(20, 2),
	"observed_tax" numeric(20, 2),
	"observed_freight" numeric(20, 2),
	"observed_total" numeric(20, 2),
	"calculated_subtotal" numeric(20, 2),
	"calculated_tax" numeric(20, 2),
	"calculated_freight" numeric(20, 2),
	"calculated_total" numeric(20, 2),
	"difference" numeric(20, 2),
	"complete" boolean DEFAULT false NOT NULL,
	"within_tolerance" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_by_company_id" varchar NOT NULL,
	"updated_by_user_id" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_review_totals_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_review_totals_company_draft_unique" UNIQUE("company_id","draft_id"),
	CONSTRAINT "invoice_review_totals_decision_valid" CHECK ("invoice_review_totals"."decision" in ('draft', 'approved')),
	CONSTRAINT "invoice_review_totals_revision_nonnegative" CHECK ("invoice_review_totals"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invoice_review_lines" ADD CONSTRAINT "invoice_review_lines_draft_fk" FOREIGN KEY ("company_id","draft_id") REFERENCES "public"."invoice_review_drafts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_review_lines" ADD CONSTRAINT "invoice_review_lines_proposal_fk" FOREIGN KEY ("company_id","draft_id","proposal_id") REFERENCES "public"."invoice_extraction_proposals"("company_id","draft_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_review_totals" ADD CONSTRAINT "invoice_review_totals_draft_fk" FOREIGN KEY ("company_id","draft_id") REFERENCES "public"."invoice_review_drafts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_review_totals" ADD CONSTRAINT "invoice_review_totals_proposal_fk" FOREIGN KEY ("company_id","draft_id","proposal_id") REFERENCES "public"."invoice_extraction_proposals"("company_id","draft_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_review_totals" ADD CONSTRAINT "invoice_review_totals_updater_fk" FOREIGN KEY ("updated_by_company_id","updated_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_review_lines_company_draft_idx" ON "invoice_review_lines" USING btree ("company_id","draft_id","position");
--> statement-breakpoint
INSERT INTO "invoice_review_lines" (
  company_id, draft_id, proposal_id, source_line_index, position,
  description, vendor_part_number, quantity, unit_cost, classification
)
SELECT header.company_id, header.draft_id, header.proposal_id,
       extracted.ordinality - 1, extracted.ordinality,
       coalesce(nullif(extracted.line #>> '{description,normalized}', ''), extracted.line #>> '{description,observed}'),
       coalesce(nullif(extracted.line #>> '{vendorPartNumber,normalized}', ''), extracted.line #>> '{vendorPartNumber,observed}'),
       CASE WHEN coalesce(nullif(extracted.line #>> '{quantity,normalized}', ''), extracted.line #>> '{quantity,observed}') ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'
            AND coalesce(nullif(extracted.line #>> '{quantity,normalized}', ''), extracted.line #>> '{quantity,observed}')::numeric > 0
            THEN coalesce(nullif(extracted.line #>> '{quantity,normalized}', ''), extracted.line #>> '{quantity,observed}')::numeric END,
       CASE WHEN coalesce(nullif(extracted.line #>> '{unitCost,normalized}', ''), extracted.line #>> '{unitCost,observed}') ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,4})?$'
            THEN coalesce(nullif(extracted.line #>> '{unitCost,normalized}', ''), extracted.line #>> '{unitCost,observed}')::numeric END,
       CASE WHEN extracted.line #>> '{classification,kind}' in ('inventory', 'consumable', 'unknown')
            THEN extracted.line #>> '{classification,kind}' ELSE 'unknown' END
FROM "invoice_review_headers" header
JOIN "invoice_extraction_proposals" proposal
  ON proposal.company_id = header.company_id AND proposal.id = header.proposal_id
CROSS JOIN LATERAL jsonb_array_elements(proposal.payload->'lines')
  WITH ORDINALITY AS extracted(line, ordinality)
ON CONFLICT (company_id, draft_id, source_line_index) DO NOTHING;
--> statement-breakpoint
INSERT INTO "invoice_review_totals" (
  company_id, draft_id, proposal_id,
  observed_subtotal, observed_tax, observed_freight, observed_total,
  updated_by_company_id, updated_by_user_id
)
SELECT header.company_id, header.draft_id, header.proposal_id,
       CASE WHEN header.final_values->>'subtotal' ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' THEN (header.final_values->>'subtotal')::numeric END,
       CASE WHEN header.final_values->>'tax' ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' THEN (header.final_values->>'tax')::numeric END,
       CASE WHEN header.final_values->>'freight' ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' THEN (header.final_values->>'freight')::numeric END,
       CASE WHEN header.final_values->>'total' ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' THEN (header.final_values->>'total')::numeric END,
       header.updated_by_company_id, header.updated_by_user_id
FROM "invoice_review_headers" header
ON CONFLICT (company_id, draft_id) DO NOTHING;

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Tenant-scoped inventory matching
CREATE TABLE "invoice_line_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"draft_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"decision" varchar(16) DEFAULT 'unresolved' NOT NULL,
	"selected_part_id" varchar,
	"proposed_new_part" jsonb,
	"original_suggestion" jsonb,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_by_company_id" varchar NOT NULL,
	"updated_by_user_id" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_matches_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_line_matches_company_line_unique" UNIQUE("company_id","line_id"),
	CONSTRAINT "invoice_line_matches_decision_valid" CHECK ("invoice_line_matches"."decision" in ('unresolved', 'existing', 'new')),
	CONSTRAINT "invoice_line_matches_revision_nonnegative" CHECK ("invoice_line_matches"."revision" >= 0),
	CONSTRAINT "invoice_line_matches_decision_coherent" CHECK (("invoice_line_matches"."decision" = 'unresolved' and "invoice_line_matches"."selected_part_id" is null and "invoice_line_matches"."proposed_new_part" is null)
          or ("invoice_line_matches"."decision" = 'existing' and "invoice_line_matches"."selected_part_id" is not null and "invoice_line_matches"."proposed_new_part" is null)
          or ("invoice_line_matches"."decision" = 'new' and "invoice_line_matches"."selected_part_id" is null and jsonb_typeof("invoice_line_matches"."proposed_new_part") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "invoice_part_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"part_id" varchar NOT NULL,
	"vendor_name_normalized" text,
	"vendor_part_number_normalized" text,
	"description_normalized" text,
	"confirmations" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_part_aliases_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_part_aliases_identity_unique" UNIQUE("company_id","part_id","vendor_name_normalized","vendor_part_number_normalized","description_normalized"),
	CONSTRAINT "invoice_part_aliases_confirmations_positive" CHECK ("invoice_part_aliases"."confirmations" > 0)
);
--> statement-breakpoint
ALTER TABLE "invoice_line_matches" ADD CONSTRAINT "invoice_line_matches_draft_fk" FOREIGN KEY ("company_id","draft_id") REFERENCES "public"."invoice_review_drafts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_matches" ADD CONSTRAINT "invoice_line_matches_line_fk" FOREIGN KEY ("company_id","line_id") REFERENCES "public"."invoice_review_lines"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_matches" ADD CONSTRAINT "invoice_line_matches_updater_fk" FOREIGN KEY ("updated_by_company_id","updated_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_part_aliases" ADD CONSTRAINT "invoice_part_aliases_company_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_line_matches_company_draft_idx" ON "invoice_line_matches" USING btree ("company_id","draft_id");--> statement-breakpoint
CREATE INDEX "invoice_part_aliases_lookup_idx" ON "invoice_part_aliases" USING btree ("company_id","vendor_part_number_normalized");

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Idempotent confirmation
CREATE TABLE "invoice_confirmation_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_revision" integer NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'reserved' NOT NULL,
	"duplicate_status" varchar(16) DEFAULT 'clear' NOT NULL,
	"duplicate_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"override_reason" text,
	"override_by_company_id" varchar,
	"override_by_user_id" varchar,
	"intake_id" varchar,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by_company_id" varchar NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "invoice_confirmation_intents_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_confirmation_intents_idempotency_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "invoice_confirmation_intents_revision_nonnegative" CHECK ("invoice_confirmation_intents"."revision" >= 0 and "invoice_confirmation_intents"."draft_revision" >= 0),
	CONSTRAINT "invoice_confirmation_intents_status_valid" CHECK ("invoice_confirmation_intents"."status" in ('reserved', 'completed', 'invalidated')),
	CONSTRAINT "invoice_confirmation_intents_duplicate_status_valid" CHECK ("invoice_confirmation_intents"."duplicate_status" in ('clear', 'suspected', 'overridden')),
	CONSTRAINT "invoice_confirmation_intents_payload_object" CHECK (jsonb_typeof("invoice_confirmation_intents"."canonical_payload") = 'object'
          and jsonb_typeof("invoice_confirmation_intents"."duplicate_signals") = 'array'),
	CONSTRAINT "invoice_confirmation_intents_override_coherent" CHECK (("invoice_confirmation_intents"."duplicate_status" <> 'overridden'
            and "invoice_confirmation_intents"."override_reason" is null
            and "invoice_confirmation_intents"."override_by_company_id" is null
            and "invoice_confirmation_intents"."override_by_user_id" is null)
          or ("invoice_confirmation_intents"."duplicate_status" = 'overridden'
            and length(trim("invoice_confirmation_intents"."override_reason")) >= 3
            and "invoice_confirmation_intents"."override_by_company_id" is not null
            and "invoice_confirmation_intents"."override_by_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "invoice_confirmation_intents" ADD CONSTRAINT "invoice_confirmation_intents_draft_fk" FOREIGN KEY ("company_id","draft_id") REFERENCES "public"."invoice_review_drafts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_confirmation_intents" ADD CONSTRAINT "invoice_confirmation_intents_creator_fk" FOREIGN KEY ("created_by_company_id","created_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_confirmation_intents_active_draft_unique" ON "invoice_confirmation_intents" USING btree ("company_id","draft_id") WHERE "invoice_confirmation_intents"."status" = 'reserved';--> statement-breakpoint
CREATE INDEX "invoice_confirmation_intents_duplicate_idx" ON "invoice_confirmation_intents" USING btree ("company_id","duplicate_status","created_at");

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Completed-confirmation uniqueness
CREATE UNIQUE INDEX "invoice_confirmation_intents_completed_draft_unique" ON "invoice_confirmation_intents" USING btree ("company_id","draft_id") WHERE "invoice_confirmation_intents"."status" = 'completed';

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Feedback and retention history
CREATE TABLE "invoice_feedback_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"draft_id" uuid NOT NULL,
	"run_id" uuid,
	"engine_version" varchar(64),
	"subject_type" varchar(24) NOT NULL,
	"subject_path" text NOT NULL,
	"decision" varchar(24) NOT NULL,
	"proposal" jsonb,
	"final_value" jsonb,
	"reason" text,
	"supplier_normalized" text,
	"actor_company_id" varchar NOT NULL,
	"actor_user_id" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_feedback_events_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_feedback_events_subject_valid" CHECK ("invoice_feedback_events"."subject_type" in ('document', 'header', 'line', 'match')),
	CONSTRAINT "invoice_feedback_events_decision_valid" CHECK ("invoice_feedback_events"."decision" in ('accepted', 'corrected', 'added', 'removed', 'unreviewed', 'rejected', 'confirmed'))
);
--> statement-breakpoint
ALTER TABLE "invoice_review_drafts" ADD COLUMN "retention_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_review_drafts" ADD COLUMN "purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_feedback_events" ADD CONSTRAINT "invoice_feedback_events_draft_fk" FOREIGN KEY ("company_id","draft_id") REFERENCES "public"."invoice_review_drafts"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_feedback_events" ADD CONSTRAINT "invoice_feedback_events_actor_fk" FOREIGN KEY ("actor_company_id","actor_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_feedback_events_quality_idx" ON "invoice_feedback_events" USING btree ("company_id","engine_version","subject_type","decision","created_at");--> statement-breakpoint
CREATE INDEX "invoice_feedback_events_draft_idx" ON "invoice_feedback_events" USING btree ("company_id","draft_id","created_at");
--> statement-breakpoint
CREATE FUNCTION reject_invoice_feedback_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'invoice feedback events are append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_feedback_events_append_only
BEFORE UPDATE OR DELETE ON invoice_feedback_events
FOR EACH ROW EXECUTE FUNCTION reject_invoice_feedback_mutation();

--> statement-breakpoint

-- Consolidated invoice recognition release migration.
-- Engine evaluation and activation
CREATE TABLE "invoice_engine_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"capability" varchar(32) NOT NULL,
	"engine_version" varchar(64) NOT NULL,
	"evaluation_run_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"activated_by_company_id" varchar NOT NULL,
	"activated_by_user_id" varchar NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_engine_activations_company_capability_unique" UNIQUE("company_id","capability"),
	CONSTRAINT "invoice_engine_activations_capability_valid" CHECK ("invoice_engine_activations"."capability" = 'scan_extraction'),
	CONSTRAINT "invoice_engine_activations_revision_positive" CHECK ("invoice_engine_activations"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_engine_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" varchar(64) NOT NULL,
	"model" varchar(120) NOT NULL,
	"schema_version" varchar(64) NOT NULL,
	"provider_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activation_eligible" boolean DEFAULT false NOT NULL,
	"eligibility_reason" text,
	"created_by_company_id" varchar NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_engine_versions_version_unique" UNIQUE("version"),
	CONSTRAINT "invoice_engine_versions_config_object" CHECK (jsonb_typeof("invoice_engine_versions"."provider_config") = 'object'),
	CONSTRAINT "invoice_engine_versions_eligibility_coherent" CHECK (("invoice_engine_versions"."activation_eligible" = false)
          or ("invoice_engine_versions"."activation_eligible" = true and length(trim("invoice_engine_versions"."eligibility_reason")) >= 3))
);
--> statement-breakpoint
CREATE TABLE "invoice_evaluation_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"set_id" uuid NOT NULL,
	"split" varchar(16) NOT NULL,
	"fixture_key" varchar(160) NOT NULL,
	"expected" jsonb NOT NULL,
	"input_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_evaluation_examples_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_evaluation_examples_set_fixture_unique" UNIQUE("company_id","set_id","fixture_key"),
	CONSTRAINT "invoice_evaluation_examples_split_valid" CHECK ("invoice_evaluation_examples"."split" in ('tuning', 'test')),
	CONSTRAINT "invoice_evaluation_examples_payload_objects" CHECK (jsonb_typeof("invoice_evaluation_examples"."expected") = 'object'
          and jsonb_typeof("invoice_evaluation_examples"."input_metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "invoice_evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"set_id" uuid NOT NULL,
	"engine_version" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"config_hash" varchar(64) NOT NULL,
	"metrics" jsonb NOT NULL,
	"predictions_hash" varchar(64) NOT NULL,
	"created_by_company_id" varchar NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "invoice_evaluation_runs_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_evaluation_runs_status_valid" CHECK ("invoice_evaluation_runs"."status" in ('completed', 'failed')),
	CONSTRAINT "invoice_evaluation_runs_hash_shape" CHECK ("invoice_evaluation_runs"."config_hash" ~ '^[0-9a-f]{64}$'
          and "invoice_evaluation_runs"."predictions_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "invoice_evaluation_runs_metrics_object" CHECK (jsonb_typeof("invoice_evaluation_runs"."metrics") = 'object')
);
--> statement-breakpoint
CREATE TABLE "invoice_evaluation_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" varchar(160) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source" varchar(32) NOT NULL,
	"consent_recorded" boolean DEFAULT false NOT NULL,
	"snapshot_hash" varchar(64) NOT NULL,
	"created_by_company_id" varchar NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_evaluation_sets_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_evaluation_sets_company_name_version_unique" UNIQUE("company_id","name","version"),
	CONSTRAINT "invoice_evaluation_sets_source_valid" CHECK ("invoice_evaluation_sets"."source" in ('synthetic', 'authorized_feedback')),
	CONSTRAINT "invoice_evaluation_sets_snapshot_hash_shape" CHECK ("invoice_evaluation_sets"."snapshot_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "invoice_evaluation_sets_consent_coherent" CHECK ("invoice_evaluation_sets"."source" = 'synthetic' or "invoice_evaluation_sets"."consent_recorded" = true)
);
--> statement-breakpoint
ALTER TABLE "invoice_engine_activations" ADD CONSTRAINT "invoice_engine_activations_company_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_engine_activations" ADD CONSTRAINT "invoice_engine_activations_engine_fk" FOREIGN KEY ("engine_version") REFERENCES "public"."invoice_engine_versions"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_engine_activations" ADD CONSTRAINT "invoice_engine_activations_evaluation_fk" FOREIGN KEY ("company_id","evaluation_run_id") REFERENCES "public"."invoice_evaluation_runs"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_engine_activations" ADD CONSTRAINT "invoice_engine_activations_actor_fk" FOREIGN KEY ("activated_by_company_id","activated_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_engine_versions" ADD CONSTRAINT "invoice_engine_versions_creator_fk" FOREIGN KEY ("created_by_company_id","created_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_evaluation_examples" ADD CONSTRAINT "invoice_evaluation_examples_set_fk" FOREIGN KEY ("company_id","set_id") REFERENCES "public"."invoice_evaluation_sets"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_evaluation_runs" ADD CONSTRAINT "invoice_evaluation_runs_set_fk" FOREIGN KEY ("company_id","set_id") REFERENCES "public"."invoice_evaluation_sets"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_evaluation_runs" ADD CONSTRAINT "invoice_evaluation_runs_engine_fk" FOREIGN KEY ("engine_version") REFERENCES "public"."invoice_engine_versions"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_evaluation_runs" ADD CONSTRAINT "invoice_evaluation_runs_creator_fk" FOREIGN KEY ("created_by_company_id","created_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_evaluation_sets" ADD CONSTRAINT "invoice_evaluation_sets_company_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_evaluation_sets" ADD CONSTRAINT "invoice_evaluation_sets_creator_fk" FOREIGN KEY ("created_by_company_id","created_by_user_id") REFERENCES "public"."users"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_evaluation_runs_comparison_idx" ON "invoice_evaluation_runs" USING btree ("company_id","set_id","engine_version","created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_invoice_evaluation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'invoice evaluation evidence is immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_engine_versions_immutable
BEFORE UPDATE OR DELETE ON invoice_engine_versions
FOR EACH ROW EXECUTE FUNCTION reject_invoice_evaluation_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_evaluation_sets_immutable
BEFORE UPDATE OR DELETE ON invoice_evaluation_sets
FOR EACH ROW EXECUTE FUNCTION reject_invoice_evaluation_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_evaluation_examples_immutable
BEFORE UPDATE OR DELETE ON invoice_evaluation_examples
FOR EACH ROW EXECUTE FUNCTION reject_invoice_evaluation_mutation();
--> statement-breakpoint
CREATE TRIGGER invoice_evaluation_runs_immutable
BEFORE UPDATE OR DELETE ON invoice_evaluation_runs
FOR EACH ROW EXECUTE FUNCTION reject_invoice_evaluation_mutation();
