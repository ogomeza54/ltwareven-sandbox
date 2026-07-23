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
