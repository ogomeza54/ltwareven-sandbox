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