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
