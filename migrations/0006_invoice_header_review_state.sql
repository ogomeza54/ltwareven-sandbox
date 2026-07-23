ALTER TABLE "invoice_review_headers" ADD COLUMN "reviewed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_review_headers" ADD CONSTRAINT "invoice_review_headers_reviewed_fields_array" CHECK (jsonb_typeof("invoice_review_headers"."reviewed_fields") = 'array');
