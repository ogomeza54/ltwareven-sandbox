import assert from "node:assert/strict";
import test from "node:test";
import { InvoiceConfirmationService } from "../../modules/invoice-extraction/services/invoice-confirmation-service";
import type { InvoiceActorContext } from "@shared/invoice-extraction/contracts";

const actor: InvoiceActorContext = {
  actorUserId: "user",
  actorCompanyId: "company",
  effectiveCompanyId: "company",
  role: "admin",
  isProductAdministrator: false,
};

test("stock rollback flag stops AI confirmation before any stock write", async () => {
  let confirmationCalls = 0;
  const confirmations = {
    async confirm() {
      confirmationCalls += 1;
      throw new Error("must not be reached");
    },
  };
  const invoices = {
    async resolveFeatures() {
      return {
        manualReceiving: true as const,
        scanExtraction: true,
        stockConfirmation: false,
        engineActivation: false,
      };
    },
  };
  const service = new InvoiceConfirmationService(
    confirmations as never,
    invoices as never,
  );
  await assert.rejects(
    service.confirm(
      actor,
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "pilot-confirmation-key-0001",
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVOICE_CONFIRMATION_DISABLED",
  );
  assert.equal(confirmationCalls, 0);
});
