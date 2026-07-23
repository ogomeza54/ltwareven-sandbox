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
