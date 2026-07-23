import assert from "node:assert/strict";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoiceDraftDto,
} from "@shared/invoice-extraction/contracts";
import { loadInvoiceConfig } from "../../modules/invoice-extraction/config/invoice-config";
import type { PrivateStoragePort } from "../../modules/invoice-extraction/providers/private-storage";
import { PrivateStorageError } from "../../modules/invoice-extraction/providers/private-storage";
import {
  InvoiceAssetService,
  type InvoiceAssetDraftRepositoryPort,
  type InvoiceDocumentRepositoryPort,
} from "../../modules/invoice-extraction/services/invoice-asset-service";
import type { SourceDocumentValidatorPort } from "../../modules/invoice-extraction/validation/source-document-validator";

const actor: InvoiceActorContext = {
  actorUserId: "user",
  actorCompanyId: "company",
  effectiveCompanyId: "company",
  role: "admin",
  isProductAdministrator: false,
};

const draft: InvoiceDraftDto = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "draft",
  revision: 0,
  activeRunId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastActivityAt: "2026-01-01T00:00:00.000Z",
  source: null,
};

function baseDocuments(): InvoiceDocumentRepositoryPort {
  return {
    async reserve() {
      return {
        assetId: "00000000-0000-4000-8000-000000000002",
        documentId: "00000000-0000-4000-8000-000000000003",
        displayName: "invoice.png",
      };
    },
    async findDuplicate() {
      return null;
    },
    async abandonReservation() {},
    async markVerified() {},
    async abandonVerified() {},
    async attach() {
      return draft;
    },
    async getSource() {
      return null;
    },
    async getAssetForRead() {
      return null;
    },
    async auditView() {},
    async prepareDelete() {
      return null;
    },
    async markDeleteFailure() {},
    async finalizeDelete() {
      return draft;
    },
    async reorder() {
      return draft;
    },
    async listReconciliationCandidates() {
      return [];
    },
    async abandonReconciliationCandidate() {},
  };
}

const drafts: InvoiceAssetDraftRepositoryPort = {
  async resolveFeatures() {
    return {
      manualReceiving: true,
      scanExtraction: true,
      stockConfirmation: false,
      engineActivation: false,
    };
  },
  async getDraft() {
    return draft;
  },
};

const validator: SourceDocumentValidatorPort = {
  async validate() {
    return {
      detectedType: "image/png",
      byteSize: 8,
      sha256: "a".repeat(64),
      pageCount: 1,
    };
  },
};

test("asset service compensates a stored object when attach CAS fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "invoice-service-test-"));
  const filename = join(root, "quarantine");
  await writeFile(filename, "12345678");
  let objectDeleted = false;
  let verifiedAbandoned = false;
  const storage: PrivateStoragePort = {
    async putFromFile() {},
    async openStream() {
      throw new Error("not used");
    },
    async delete() {
      objectDeleted = true;
    },
    async exists() {
      return !objectDeleted;
    },
  };
  const documents = baseDocuments();
  documents.attach = async () => {
    throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
  };
  documents.abandonVerified = async () => {
    verifiedAbandoned = true;
  };
  const service = new InvoiceAssetService(
    documents,
    drafts,
    storage,
    validator,
    loadInvoiceConfig({ NODE_ENV: "test" }),
  );
  await assert.rejects(
    service.upload({
      actor,
      draftId: draft.id,
      expectedRevision: 0,
      filename,
      displayName: "invoice.png",
    }),
    (error) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_DRAFT_REVISION_CONFLICT",
  );
  assert.equal(objectDeleted, true);
  assert.equal(verifiedAbandoned, true);
  await assert.rejects(() => stat(filename), { code: "ENOENT" });
});

test("asset service retains a discoverable staging row when object state is uncertain", async () => {
  const root = await mkdtemp(join(tmpdir(), "invoice-service-test-"));
  const filename = join(root, "quarantine");
  await writeFile(filename, "12345678");
  let reservationAbandoned = false;
  const storage: PrivateStoragePort = {
    async putFromFile() {
      throw new Error("provider unavailable");
    },
    async openStream() {
      throw new Error("not used");
    },
    async delete() {},
    async exists() {
      throw new Error("provider unavailable");
    },
  };
  const documents = baseDocuments();
  documents.abandonReservation = async () => {
    reservationAbandoned = true;
  };
  const service = new InvoiceAssetService(
    documents,
    drafts,
    storage,
    validator,
    loadInvoiceConfig({ NODE_ENV: "test" }),
  );
  await assert.rejects(() =>
    service.upload({
      actor,
      draftId: draft.id,
      expectedRevision: 0,
      filename,
      displayName: "invoice.png",
    }),
  );
  assert.equal(reservationAbandoned, false);
  await assert.rejects(() => stat(filename), { code: "ENOENT" });
});

test("asset service maps provider write failures to a retryable domain error", async () => {
  const root = await mkdtemp(join(tmpdir(), "invoice-service-test-"));
  const filename = join(root, "quarantine");
  await writeFile(filename, "12345678");
  const storage: PrivateStoragePort = {
    async putFromFile() {
      throw new PrivateStorageError();
    },
    async openStream() {
      throw new Error("not used");
    },
    async delete() {},
    async exists() {
      return false;
    },
  };
  const service = new InvoiceAssetService(
    baseDocuments(),
    drafts,
    storage,
    validator,
    loadInvoiceConfig({ NODE_ENV: "test" }),
  );
  await assert.rejects(
    service.upload({
      actor,
      draftId: draft.id,
      expectedRevision: 0,
      filename,
      displayName: "invoice.png",
    }),
    (error) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_STORAGE_UNAVAILABLE",
  );
});

test("asset service never deletes storage before the deletion reservation commits", async () => {
  let storageDeleted = false;
  const storage: PrivateStoragePort = {
    async putFromFile() {},
    async openStream() {
      throw new Error("not used");
    },
    async delete() {
      storageDeleted = true;
    },
    async exists() {
      return true;
    },
  };
  const documents = baseDocuments();
  documents.prepareDelete = async () => {
    throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
  };
  const service = new InvoiceAssetService(
    documents,
    drafts,
    storage,
    validator,
    loadInvoiceConfig({ NODE_ENV: "test" }),
  );
  await assert.rejects(
    service.delete({
      actor,
      draftId: draft.id,
      assetId: "00000000-0000-4000-8000-000000000002",
      expectedRevision: 99,
    }),
    (error) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_DRAFT_REVISION_CONFLICT",
  );
  assert.equal(storageDeleted, false);
});

test("asset service keeps failed physical deletion discoverable and retries it", async () => {
  let deleteAttempts = 0;
  let failureRecorded = false;
  let tombstoneCommitted = false;
  const storage: PrivateStoragePort = {
    async putFromFile() {},
    async openStream() {
      throw new Error("not used");
    },
    async delete() {
      deleteAttempts += 1;
      if (deleteAttempts === 1) throw new Error("temporary failure");
    },
    async exists() {
      return true;
    },
  };
  const documents = baseDocuments();
  documents.prepareDelete = async () => ({
    status: "pending",
    objectKey: "invoice-sources/object",
    documentId: "00000000-0000-4000-8000-000000000003",
    revision: 1,
  });
  documents.markDeleteFailure = async () => {
    failureRecorded = true;
  };
  documents.finalizeDelete = async () => {
    tombstoneCommitted = true;
    return draft;
  };
  const service = new InvoiceAssetService(
    documents,
    drafts,
    storage,
    validator,
    loadInvoiceConfig({ NODE_ENV: "test" }),
  );
  const input = {
    actor,
    draftId: draft.id,
    assetId: "00000000-0000-4000-8000-000000000002",
    expectedRevision: 0,
  };
  await assert.rejects(
    service.delete(input),
    (error) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_STORAGE_UNAVAILABLE",
  );
  assert.equal(failureRecorded, true);
  assert.equal(tombstoneCommitted, false);
  await service.delete(input);
  assert.equal(deleteAttempts, 2);
  assert.equal(tombstoneCommitted, true);
});

test("asset reconciliation repairs orphan storage without crossing tenants", async () => {
  const deleted: string[] = [];
  const abandoned: string[] = [];
  const storage: PrivateStoragePort = {
    async putFromFile() {},
    async openStream() {
      throw new Error("not used");
    },
    async delete(key) {
      deleted.push(key);
    },
    async exists() {
      return true;
    },
  };
  const documents = baseDocuments();
  documents.listReconciliationCandidates = async (companyId) => {
    assert.equal(companyId, actor.effectiveCompanyId);
    return [
      {
        companyId,
        draftId: draft.id,
        documentId: "00000000-0000-4000-8000-000000000003",
        assetId: "00000000-0000-4000-8000-000000000002",
        objectKey: "invoice-sources/orphan",
        lifecycle: "verified",
        draftRevision: 0,
      },
    ];
  };
  documents.abandonReconciliationCandidate = async (candidate) => {
    abandoned.push(candidate.assetId);
  };
  const service = new InvoiceAssetService(
    documents,
    drafts,
    storage,
    validator,
    loadInvoiceConfig({ NODE_ENV: "test" }),
  );
  assert.deepEqual(await service.reconcile(actor), { repaired: 1, failed: 0 });
  assert.deepEqual(deleted, ["invoice-sources/orphan"]);
  assert.deepEqual(abandoned, ["00000000-0000-4000-8000-000000000002"]);
});

test("asset service records a discoverable failure when tombstoning fails", async () => {
  let failureCode: string | undefined;
  const storage: PrivateStoragePort = {
    async putFromFile() {},
    async openStream() {
      throw new Error("not used");
    },
    async delete() {},
    async exists() {
      return false;
    },
  };
  const documents = baseDocuments();
  documents.prepareDelete = async () => ({
    status: "pending",
    objectKey: "invoice-sources/object",
    documentId: "00000000-0000-4000-8000-000000000003",
    revision: 1,
  });
  documents.finalizeDelete = async () => {
    throw new Error("database unavailable");
  };
  documents.markDeleteFailure = async (
    _actor,
    _draftId,
    _assetId,
    code,
  ) => {
    failureCode = code;
  };
  const service = new InvoiceAssetService(
    documents,
    drafts,
    storage,
    validator,
    loadInvoiceConfig({ NODE_ENV: "test" }),
  );
  await assert.rejects(() =>
    service.delete({
      actor,
      draftId: draft.id,
      assetId: "00000000-0000-4000-8000-000000000002",
      expectedRevision: 0,
    }),
  );
  assert.equal(failureCode, "TOMBSTONE_FAILED");
});
