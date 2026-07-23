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
	CONSTRAINT "invoice_review_lines_quantity_positive" CHECK ("invoice_review_lines"."quantity" is null or "invoice_review_lines"."quantity" > 0),
	CONSTRAINT "invoice_review_lines_unit_cost_nonnegative" CHECK ("invoice_review_lines"."unit_cost" is null or "invoice_review_lines"."unit_cost" >= 0),
	CONSTRAINT "invoice_review_lines_classification_valid" CHECK ("invoice_review_lines"."classification" in ('inventory', 'consumable', 'unknown'))
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
