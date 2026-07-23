import { z } from "zod";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const invoiceConfigSchema = z.object({
  maxFileBytes: positiveInteger(10_485_760).pipe(
    z.number().max(10_485_760),
  ),
  maxSourcePages: positiveInteger(10).pipe(z.number().max(10)),
  confirmedRetentionDays: positiveInteger(365),
  feedbackRetentionDays: positiveInteger(365),
  abandonedRetentionDays: positiveInteger(30),
  pilotLanguage: z.literal("en").default("en"),
  pilotCurrency: z.literal("USD").default("USD"),
  workerMaxAttempts: positiveInteger(3).pipe(z.number().max(10)),
  workerLeaseSeconds: positiveInteger(120).pipe(z.number().max(3600)),
  storageBackend: z.enum(["filesystem", "replit"]).default("filesystem"),
  storageRoot: z.string().min(1).default(".private/invoice-sources"),
  storageBucket: z.string().min(1).optional(),
  allowedOrigin: z.string().url().optional(),
  maxImagePixels: positiveInteger(40_000_000).pipe(
    z.number().max(100_000_000),
  ),
  validationTimeoutMs: positiveInteger(15_000).pipe(z.number().max(60_000)),
  validationConcurrency: positiveInteger(2).pipe(z.number().max(8)),
  nodeEnvironment: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type InvoiceConfig = z.infer<typeof invoiceConfigSchema>;

export function loadInvoiceConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): InvoiceConfig {
  // REMOTE_DATABASE_URL is intentionally not observed by this module.
  const config = invoiceConfigSchema.parse({
    maxFileBytes: environment.INVOICE_MAX_FILE_BYTES,
    maxSourcePages: environment.INVOICE_MAX_SOURCE_PAGES,
    confirmedRetentionDays: environment.INVOICE_CONFIRMED_RETENTION_DAYS,
    feedbackRetentionDays: environment.INVOICE_FEEDBACK_RETENTION_DAYS,
    abandonedRetentionDays: environment.INVOICE_ABANDONED_RETENTION_DAYS,
    pilotLanguage: environment.INVOICE_PILOT_LANGUAGE,
    pilotCurrency: environment.INVOICE_PILOT_CURRENCY,
    workerMaxAttempts: environment.INVOICE_WORKER_MAX_ATTEMPTS,
    workerLeaseSeconds: environment.INVOICE_WORKER_LEASE_SECONDS,
    storageBackend: environment.INVOICE_STORAGE_BACKEND,
    storageRoot: environment.INVOICE_STORAGE_ROOT,
    storageBucket: environment.REPLIT_OBJECT_STORAGE_BUCKET,
    allowedOrigin: environment.INVOICE_ALLOWED_ORIGIN,
    maxImagePixels: environment.INVOICE_MAX_IMAGE_PIXELS,
    validationTimeoutMs: environment.INVOICE_VALIDATION_TIMEOUT_MS,
    validationConcurrency: environment.INVOICE_VALIDATION_CONCURRENCY,
    nodeEnvironment: environment.NODE_ENV,
  });
  if (
    config.nodeEnvironment === "production" &&
    (config.storageBackend !== "replit" ||
      !config.storageBucket ||
      !config.allowedOrigin)
  ) {
    throw new Error(
      "Production invoice storage requires the Replit backend, a bucket, and an explicit allowed origin.",
    );
  }
  if (config.allowedOrigin) {
    const origin = new URL(config.allowedOrigin);
    if (
      origin.username ||
      origin.password ||
      !["http:", "https:"].includes(origin.protocol)
    ) {
      throw new Error("Invoice allowed origin must be an HTTP(S) origin.");
    }
    if (
      config.nodeEnvironment === "production" &&
      origin.protocol !== "https:"
    ) {
      throw new Error("Production invoice origin must use HTTPS.");
    }
  }
  return config;
}
