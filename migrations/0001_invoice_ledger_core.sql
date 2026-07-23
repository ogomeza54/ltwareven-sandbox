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
