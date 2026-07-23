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
ALTER TABLE "invoice_extraction_runs" ADD COLUMN "model" varchar(120) DEFAULT 'gpt-5.6-terra' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD COLUMN "schema_version" varchar(64) DEFAULT 'invoice-proposal-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_extraction_runs" ADD COLUMN "execution_mode" varchar(16) DEFAULT 'background' NOT NULL;--> statement-breakpoint
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
