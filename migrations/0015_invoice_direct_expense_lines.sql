ALTER TABLE "invoice_review_lines" DROP CONSTRAINT "invoice_review_lines_classification_valid";--> statement-breakpoint
ALTER TABLE "invoice_review_lines" ADD CONSTRAINT "invoice_review_lines_classification_valid" CHECK ("invoice_review_lines"."classification" in ('inventory', 'consumable', 'service', 'direct_expense', 'adjustment', 'unknown'));
