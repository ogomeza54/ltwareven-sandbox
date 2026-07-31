import assert from "node:assert/strict";
import test from "node:test";
import type {
  InvoiceActorContext,
  InvoiceDraftDto,
  InvoiceFeatureResolution,
} from "@shared/invoice-extraction/contracts";
import {
  createInvoiceDraftSchema,
  InvoiceDomainError,
} from "@shared/invoice-extraction/contracts";
import {
  InvoiceDraftService,
  type InvoiceDraftRepositoryPort,
} from "../../modules/invoice-extraction/services/invoice-draft-service";
import {
  mayCaptureJsonResponse,
  resolveRequestId,
  safeApiLogPath,
} from "../../request-logging";

const actor: InvoiceActorContext = {
  actorUserId: "user",
  actorCompanyId: "company",
  effectiveCompanyId: "company",
  role: "shop_user",
  isProductAdministrator: false,
};
const draft: InvoiceDraftDto = {
  id: "91d99f8a-18dd-4b1e-87d7-01a772c88df6",
  status: "draft",
  revision: 0,
  activeRunId: null,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
  lastActivityAt: "2026-07-23T00:00:00.000Z",
};

function repository(
  flags: InvoiceFeatureResolution,
): InvoiceDraftRepositoryPort {
  return {
    async resolveFeatures() {
      return flags;
    },
    async createDraft(context) {
      assert.equal(context.actor.effectiveCompanyId, "company");
      return draft;
    },
    async listDrafts() {
      return [draft];
    },
    async getDraft(_context, id) {
      return id === draft.id ? draft : null;
    },
    async transitionDraft(_context, id, revision, status, nextStatus) {
      assert.equal(id, draft.id);
      assert.equal(revision, draft.revision);
      assert.equal(status, draft.status);
      assert.equal(nextStatus, "canceled");
      return { ...draft, status: nextStatus, revision: revision + 1 };
    },
  };
}

test("draft create is server-authorized and feature-disabled by default", async () => {
  const service = new InvoiceDraftService(
    repository({
      manualReceiving: true,
      scanExtraction: false,
      stockConfirmation: false,
      engineActivation: false,
    }),
  );
  await assert.rejects(
    service.create(actor),
    (error: unknown) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_FEATURE_DISABLED",
  );
});

test("draft create/list/read preserve the tenant repository boundary", async () => {
  const service = new InvoiceDraftService(
    repository({
      manualReceiving: true,
      scanExtraction: true,
      stockConfirmation: false,
      engineActivation: false,
    }),
  );
  assert.deepEqual(await service.create(actor), draft);
  assert.deepEqual(await service.list(actor), [draft]);
  assert.deepEqual(await service.get(actor, draft.id), draft);
  await assert.rejects(
    service.get(actor, "2db61421-d8d2-4522-92e8-e5488fc12b2b"),
    (error: unknown) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_DRAFT_NOT_FOUND",
  );
});

test("draft listing includes saved source metadata for deterministic resume", async () => {
  const source = { totalPages: 0, assets: [] };
  const service = new InvoiceDraftService(
    repository({
      manualReceiving: true,
      scanExtraction: true,
      stockConfirmation: false,
      engineActivation: false,
    }),
    {
      async getSource(_actor, draftId) {
        assert.equal(draftId, draft.id);
        return source;
      },
    },
  );
  assert.deepEqual((await service.list(actor))[0].source, source);
});

test("draft cancellation closes review without deleting its audit record", async () => {
  const reviewDraft: InvoiceDraftDto = {
    ...draft,
    status: "needs_review",
    revision: 4,
  };
  const service = new InvoiceDraftService({
    ...repository({
      manualReceiving: true,
      scanExtraction: true,
      stockConfirmation: false,
      engineActivation: false,
    }),
    async getDraft() {
      return reviewDraft;
    },
    async transitionDraft(_context, id, revision, status, nextStatus) {
      assert.equal(id, reviewDraft.id);
      assert.equal(revision, 4);
      assert.equal(status, "needs_review");
      assert.equal(nextStatus, "canceled");
      return { ...reviewDraft, status: "canceled", revision: 5 };
    },
  });
  const canceled = await service.cancel(actor, reviewDraft.id, 4);
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.revision, 5);
});

test("draft list and read enforce processing RBAC", async () => {
  const service = new InvoiceDraftService(
    repository({
      manualReceiving: true,
      scanExtraction: true,
      stockConfirmation: false,
      engineActivation: false,
    }),
  );
  const deniedActor: InvoiceActorContext = { ...actor, role: "technician" };
  for (const operation of [
    () => service.list(deniedActor),
    () => service.get(deniedActor, draft.id),
  ]) {
    await assert.rejects(
      operation(),
      (error: unknown) =>
        error instanceof InvoiceDomainError &&
        error.code === "INVOICE_FORBIDDEN",
    );
  }
});

test("invoice HTTP responses are excluded from body logging", () => {
  assert.equal(mayCaptureJsonResponse("/api/invoice-drafts"), false);
  assert.equal(
    mayCaptureJsonResponse("/api/invoice-drafts/secret-target"),
    false,
  );
  assert.equal(
    safeApiLogPath("/api/invoice-drafts/91d99f8a-18dd-4b1e-87d7-01a772c88df6"),
    "/api/invoice-drafts/:draftId",
  );
  assert.equal(mayCaptureJsonResponse("/api/inventory"), true);
  assert.equal(
    safeApiLogPath(
      "/api/invoice-extraction-runs/91d99f8a-18dd-4b1e-87d-01a772c88df6",
    ),
    "/api/invoice-extraction-runs/:runId",
  );
});

test("request IDs remain UUID-safe for audit persistence", () => {
  const uuid = "91d99f8a-18dd-4b1e-87d7-01a772c88df6";
  assert.equal(resolveRequestId(uuid), uuid);
  assert.match(resolveRequestId("trace-1234"), /^[0-9a-f-]{36}$/i);
});

test("draft create contract rejects unknown request fields", () => {
  assert.equal(createInvoiceDraftSchema.safeParse({}).success, true);
  assert.equal(
    createInvoiceDraftSchema.safeParse({ companyId: "untrusted" }).success,
    false,
  );
});
