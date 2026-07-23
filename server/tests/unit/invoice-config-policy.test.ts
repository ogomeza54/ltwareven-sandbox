import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import { loadInvoiceConfig } from "../../modules/invoice-extraction/config/invoice-config";
import { canUseInvoiceCapability } from "../../modules/invoice-extraction/domain/policies";
import type {
  InvoiceActorContext,
  InvoiceRole,
} from "@shared/invoice-extraction/contracts";

function actor(
  role: InvoiceRole,
  isProductAdministrator = false,
): InvoiceActorContext {
  return {
    actorUserId: "actor",
    actorCompanyId: "actor-company",
    effectiveCompanyId: "effective-company",
    role,
    isProductAdministrator,
  };
}

test("invoice pilot configuration has validated safe defaults", () => {
  const config = loadInvoiceConfig({});
  assert.deepEqual(config, {
    maxFileBytes: 10_485_760,
    maxSourcePages: 10,
    confirmedRetentionDays: 365,
    feedbackRetentionDays: 365,
    abandonedRetentionDays: 30,
    pilotLanguage: "en",
    pilotCurrency: "USD",
    workerMaxAttempts: 3,
    workerLeaseSeconds: 120,
    workerPollSeconds: 15,
    provider: "openai",
    openaiApiKey: undefined,
    openaiWebhookSecret: undefined,
    openaiModel: "gpt-5.6-terra",
    engineVersion: "invoice-v1",
    proposalSchemaVersion: "invoice-proposal-v1",
    executionMode: "background",
    storeResponse: true,
    privacyProfile: "standard",
    storageBackend: "filesystem",
    storageRoot: ".private/invoice-sources",
    storageBucket: undefined,
    allowedOrigin: undefined,
    maxImagePixels: 40_000_000,
    validationTimeoutMs: 15_000,
    validationConcurrency: 2,
    nodeEnvironment: "development",
  });
});

test("invoice configuration fails closed and ignores remote database settings", () => {
  assert.throws(
    () =>
      loadInvoiceConfig({
        INVOICE_MAX_SOURCE_PAGES: "11",
        REMOTE_DATABASE_URL: "postgresql://remote.invalid/production",
      }),
    ZodError,
  );
  assert.throws(
    () =>
      loadInvoiceConfig({
        INVOICE_OPENAI_EXECUTION_MODE: "background",
        INVOICE_OPENAI_STORE_RESPONSE: "false",
      }),
    /requires stored provider responses/,
  );
  assert.throws(
    () =>
      loadInvoiceConfig({
        INVOICE_OPENAI_EXECUTION_MODE: "background",
        INVOICE_OPENAI_PRIVACY_PROFILE: "zdr",
      }),
    /cannot claim a ZDR/,
  );
  assert.equal(
    loadInvoiceConfig({
      INVOICE_OPENAI_EXECUTION_MODE: "synchronous",
      INVOICE_OPENAI_STORE_RESPONSE: "false",
      INVOICE_OPENAI_PRIVACY_PROFILE: "zdr",
    }).storeResponse,
    false,
  );
  assert.throws(
    () =>
      loadInvoiceConfig({
        INVOICE_MAX_FILE_BYTES: String(10_485_761),
      }),
    ZodError,
  );
  assert.equal(
    loadInvoiceConfig({
      REMOTE_DATABASE_URL: "postgresql://remote.invalid/production",
    }).maxSourcePages,
    10,
  );
  assert.throws(
    () =>
      loadInvoiceConfig({
        NODE_ENV: "production",
        INVOICE_STORAGE_BACKEND: "filesystem",
      }),
    /Production invoice storage requires/,
  );
  assert.throws(
    () =>
      loadInvoiceConfig({
        NODE_ENV: "production",
        INVOICE_STORAGE_BACKEND: "replit",
        REPLIT_OBJECT_STORAGE_BUCKET: "private-invoices",
      }),
    /explicit allowed origin/,
  );
  assert.equal(
    loadInvoiceConfig({
      NODE_ENV: "production",
      INVOICE_STORAGE_BACKEND: "replit",
      REPLIT_OBJECT_STORAGE_BUCKET: "private-invoices",
      INVOICE_ALLOWED_ORIGIN: "https://haulmaster.example",
    }).storageBackend,
    "replit",
  );
  assert.throws(
    () =>
      loadInvoiceConfig({
        NODE_ENV: "production",
        INVOICE_STORAGE_BACKEND: "replit",
        REPLIT_OBJECT_STORAGE_BUCKET: "private-invoices",
        INVOICE_ALLOWED_ORIGIN: "http://haulmaster.example",
      }),
    /HTTPS/,
  );
});

test("invoice RBAC separates processing, quality and product administration", () => {
  for (const role of ["shop_user", "admin", "super_admin"] as const) {
    assert.equal(canUseInvoiceCapability(actor(role), "process_draft"), true);
  }
  for (const role of ["accounting", "technician"] as const) {
    assert.equal(canUseInvoiceCapability(actor(role), "process_draft"), false);
  }
  assert.equal(
    canUseInvoiceCapability(actor("shop_user"), "quality_read"),
    false,
  );
  assert.equal(canUseInvoiceCapability(actor("admin"), "quality_read"), true);
  assert.equal(
    canUseInvoiceCapability(actor("super_admin"), "duplicate_override"),
    true,
  );
  assert.equal(
    canUseInvoiceCapability(actor("super_admin"), "engine_activation"),
    false,
  );
  assert.equal(
    canUseInvoiceCapability(actor("technician", true), "engine_activation"),
    true,
  );
});
