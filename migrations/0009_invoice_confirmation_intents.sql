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