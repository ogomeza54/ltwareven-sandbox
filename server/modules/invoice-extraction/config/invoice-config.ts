import { z } from "zod";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const invoiceConfigSchema = z.object({
  maxFileBytes: positiveInteger(10_485_760),
  maxSourcePages: positiveInteger(10).pipe(z.number().max(10)),
  confirmedRetentionDays: positiveInteger(365),
  feedbackRetentionDays: positiveInteger(365),
  abandonedRetentionDays: positiveInteger(30),
  pilotLanguage: z.literal("en").default("en"),
  pilotCurrency: z.literal("USD").default("USD"),
  workerMaxAttempts: positiveInteger(3).pipe(z.number().max(10)),
  workerLeaseSeconds: positiveInteger(120).pipe(z.number().max(3600)),
});

export type InvoiceConfig = z.infer<typeof invoiceConfigSchema>;

export function loadInvoiceConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): InvoiceConfig {
  // REMOTE_DATABASE_URL is intentionally not observed by this module.
  return invoiceConfigSchema.parse({
    maxFileBytes: environment.INVOICE_MAX_FILE_BYTES,
    maxSourcePages: environment.INVOICE_MAX_SOURCE_PAGES,
    confirmedRetentionDays: environment.INVOICE_CONFIRMED_RETENTION_DAYS,
    feedbackRetentionDays: environment.INVOICE_FEEDBACK_RETENTION_DAYS,
    abandonedRetentionDays: environment.INVOICE_ABANDONED_RETENTION_DAYS,
    pilotLanguage: environment.INVOICE_PILOT_LANGUAGE,
    pilotCurrency: environment.INVOICE_PILOT_CURRENCY,
    workerMaxAttempts: environment.INVOICE_WORKER_MAX_ATTEMPTS,
    workerLeaseSeconds: environment.INVOICE_WORKER_LEASE_SECONDS,
  });
}
