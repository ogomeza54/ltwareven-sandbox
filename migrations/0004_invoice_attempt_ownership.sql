ALTER TABLE "invoice_provider_attempts" ADD CONSTRAINT "invoice_provider_attempts_company_run_id_unique" UNIQUE("company_id","run_id","id");
--> statement-breakpoint
ALTER TABLE "invoice_extraction_proposals" ADD CONSTRAINT "invoice_extraction_proposals_attempt_fk" FOREIGN KEY ("company_id","run_id","attempt_id") REFERENCES "public"."invoice_provider_attempts"("company_id","run_id","id") ON DELETE no action ON UPDATE no action;
