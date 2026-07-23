CREATE TABLE "invoice_review_headers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"draft_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"decision" varchar(16) DEFAULT 'draft' NOT NULL,
	"final_values" jsonb NOT NULL,
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
