import { z } from "zod";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
const environmentBoolean = (fallback: boolean) =>
  z.preprocess(
    (value) =>
      value === undefined
        ? fallback
        : value === true || value === "true"
          ? true
          : value === false || value === "false"
            ? false
            : value,
    z.boolean(),
  );

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
  workerPollSeconds: positiveInteger(15).pipe(z.number().max(300)),
  reconciliationToleranceCents: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(100)
    .default(1),
  provider: z.literal("openai").default("openai"),
  openaiApiKey: z.string().min(1).optional(),
  openaiWebhookSecret: z.string().min(1).optional(),
  openaiModel: z.string().min(1).default("gpt-5.6-terra"),
  reasoningEffort: z
    .enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"])
    .default("none"),
  engineVersion: z.string().min(1).default("invoice-v1"),
  proposalSchemaVersion: z.literal("invoice-proposal-v1").default("invoice-proposal-v1"),
  executionMode: z.enum(["background", "synchronous"]).default("background"),
  storeResponse: environmentBoolean(true),
  privacyProfile: z.enum(["standard", "zdr"]).default("standard"),
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
    workerPollSeconds: environment.INVOICE_WORKER_POLL_SECONDS,
    reconciliationToleranceCents:
      environment.INVOICE_RECONCILIATION_TOLERANCE_CENTS,
    provider: environment.INVOICE_EXTRACTION_PROVIDER,
    openaiApiKey: environment.OPENAI_API_KEY,
    openaiWebhookSecret: environment.OPENAI_WEBHOOK_SECRET,
    openaiModel: environment.INVOICE_OPENAI_MODEL,
    reasoningEffort: environment.INVOICE_OPENAI_REASONING_EFFORT,
    engineVersion: environment.INVOICE_ENGINE_VERSION,
    proposalSchemaVersion: environment.INVOICE_PROPOSAL_SCHEMA_VERSION,
    executionMode: environment.INVOICE_OPENAI_EXECUTION_MODE,
    storeResponse: environment.INVOICE_OPENAI_STORE_RESPONSE,
    privacyProfile: environment.INVOICE_OPENAI_PRIVACY_PROFILE,
    storageBackend: environment.INVOICE_STORAGE_BACKEND,
    storageRoot: environment.INVOICE_STORAGE_ROOT,
    storageBucket: environment.REPLIT_OBJECT_STORAGE_BUCKET,
    allowedOrigin: environment.INVOICE_ALLOWED_ORIGIN,
    maxImagePixels: environment.INVOICE_MAX_IMAGE_PIXELS,
    validationTimeoutMs: environment.INVOICE_VALIDATION_TIMEOUT_MS,
    validationConcurrency: environment.INVOICE_VALIDATION_CONCURRENCY,
    nodeEnvironment: environment.NODE_ENV,
  });
  if (config.executionMode === "background" && !config.storeResponse) {
    throw new Error("Background invoice extraction requires stored provider responses.");
  }
  if (config.privacyProfile === "zdr" && config.executionMode === "background") {
    throw new Error("Background invoice extraction cannot claim a ZDR privacy profile.");
  }
  if (
    config.nodeEnvironment === "production" &&
    config.openaiApiKey &&
    !config.openaiWebhookSecret
  ) {
    throw new Error("Production OpenAI extraction requires a webhook secret.");
  }
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
