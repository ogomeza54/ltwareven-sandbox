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
  assert.equal(
    loadInvoiceConfig({
      REMOTE_DATABASE_URL: "postgresql://remote.invalid/production",
    }).maxSourcePages,
    10,
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
