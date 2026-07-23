import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoiceDraftDto,
} from "@shared/invoice-extraction/contracts";
import type { InvoiceConfig } from "../config/invoice-config";
import { requireInvoiceCapability } from "../domain/policies";
import {
  PrivateStorageError,
  type PrivateStoragePort,
} from "../providers/private-storage";
import { opaqueInvoiceObjectKey } from "../providers/storage-factory";
import type { PostgresInvoiceDocumentRepository } from "../repositories/invoice-document-repository";
import type { PostgresInvoiceRepository } from "../repositories/invoice-repository";
import type { SourceDocumentValidatorPort } from "../validation/source-document-validator";
import { removeQuarantineFile } from "../validation/source-document-validator";

export type InvoiceDocumentRepositoryPort = Pick<
  PostgresInvoiceDocumentRepository,
  | "reserve"
  | "findDuplicate"
  | "abandonReservation"
  | "markVerified"
  | "abandonVerified"
  | "attach"
  | "getSource"
  | "getAssetForRead"
  | "auditView"
  | "prepareDelete"
  | "markDeleteFailure"
  | "finalizeDelete"
  | "reorder"
  | "listReconciliationCandidates"
  | "abandonReconciliationCandidate"
>;

export type InvoiceAssetDraftRepositoryPort = Pick<
  PostgresInvoiceRepository,
  "resolveFeatures" | "getDraft"
>;

export class InvoiceAssetService {
  constructor(
    private readonly documents: InvoiceDocumentRepositoryPort,
    private readonly drafts: InvoiceAssetDraftRepositoryPort,
    private readonly storage: PrivateStoragePort,
    private readonly validator: SourceDocumentValidatorPort,
    private readonly config: InvoiceConfig,
  ) {}

  private async authorize(actor: InvoiceActorContext): Promise<void> {
    requireInvoiceCapability(actor, "process_draft");
    const flags = await this.drafts.resolveFeatures(actor.effectiveCompanyId);
    if (!flags.scanExtraction) {
      throw new InvoiceDomainError("INVOICE_FEATURE_DISABLED");
    }
  }

  async upload(input: {
    actor: InvoiceActorContext;
    draftId: string;
    expectedRevision: number;
    filename: string;
    displayName: string;
    requestId?: string;
  }): Promise<InvoiceDraftDto> {
    await this.authorize(input.actor);
    if (
      /\.(?:exe|com|scr|js|mjs|html?|svg|php|sh|bat|cmd|ps1|jar|zip)$/i.test(
        input.displayName.trim(),
      )
    ) {
      throw new InvoiceDomainError("INVOICE_FILE_UNSUPPORTED");
    }
    const objectKey = opaqueInvoiceObjectKey();
    const context = {
      actor: input.actor,
      correlationId: randomUUID(),
      requestId: input.requestId,
    };
    const reservation = await this.documents.reserve(
      context,
      input.draftId,
      input.expectedRevision,
      input.displayName,
      objectKey,
    );
    try {
      const validated = await this.validator.validate(input.filename);
      const duplicate = await this.documents.findDuplicate(
        input.actor,
        input.draftId,
        reservation.documentId,
        validated.sha256,
      );
      if (duplicate) {
        await this.documents.abandonReservation(
          input.actor,
          input.draftId,
          reservation.documentId,
          reservation.assetId,
        );
        const current = await this.drafts.getDraft(input.actor, input.draftId);
        if (!current) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
        current.source = await this.documents.getSource(
          input.actor,
          input.draftId,
        );
        return current;
      }
      try {
        await this.storage.putFromFile(objectKey, input.filename);
      } catch (error) {
        if (error instanceof PrivateStorageError) {
          throw new InvoiceDomainError("INVOICE_STORAGE_UNAVAILABLE");
        }
        throw error;
      }
      try {
        await this.documents.markVerified(
          input.actor,
          input.draftId,
          reservation.documentId,
          reservation.assetId,
          objectKey,
          validated,
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw new InvoiceDomainError("INVOICE_DUPLICATE_SOURCE");
        }
        throw error;
      }
      try {
        return await this.documents.attach(
          context,
          input.draftId,
          reservation.documentId,
          reservation.assetId,
          input.expectedRevision,
          this.config.maxSourcePages,
        );
      } catch (error) {
        try {
          await this.storage.delete(objectKey);
          await this.documents.abandonVerified(
            input.actor,
            input.draftId,
            reservation.documentId,
            reservation.assetId,
          );
        } catch {
          // The verified row retains the opaque key for explicit reconciliation.
        }
        throw error;
      }
    } catch (error) {
      const exists = await this.storage.exists(objectKey).catch(() => true);
      if (!exists) {
        await this.documents
          .abandonReservation(
            input.actor,
            input.draftId,
            reservation.documentId,
            reservation.assetId,
          )
          .catch(() => undefined);
      }
      throw error;
    } finally {
      await removeQuarantineFile(input.filename);
    }
  }

  async open(
    actor: InvoiceActorContext,
    draftId: string,
    assetId: string,
    requestId?: string,
  ): Promise<{
    stream: Readable;
    detectedType: string;
    displayName: string;
  }> {
    await this.authorize(actor);
    const asset = await this.documents.getAssetForRead(actor, draftId, assetId);
    if (!asset) throw new InvoiceDomainError("INVOICE_ASSET_NOT_FOUND");
    try {
      const stream = await this.storage.openStream(asset.objectKey);
      try {
        await this.documents.auditView(
          { actor, correlationId: randomUUID(), requestId },
          assetId,
        );
      } catch (error) {
        stream.destroy();
        throw error;
      }
      return {
        stream,
        detectedType: asset.detectedType,
        displayName: asset.displayName,
      };
    } catch (error) {
      if (error instanceof InvoiceDomainError) throw error;
      throw new InvoiceDomainError("INVOICE_STORAGE_UNAVAILABLE");
    }
  }

  async delete(input: {
    actor: InvoiceActorContext;
    draftId: string;
    assetId: string;
    expectedRevision: number;
    requestId?: string;
  }): Promise<InvoiceDraftDto> {
    await this.authorize(input.actor);
    const pending = await this.documents.prepareDelete(
      {
        actor: input.actor,
        correlationId: randomUUID(),
        requestId: input.requestId,
      },
      input.draftId,
      input.assetId,
      input.expectedRevision,
    );
    if (!pending) throw new InvoiceDomainError("INVOICE_ASSET_NOT_FOUND");
    if (pending.status === "deleted") {
      const current = await this.drafts.getDraft(input.actor, input.draftId);
      if (!current) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      current.source = await this.documents.getSource(
        input.actor,
        input.draftId,
      );
      return current;
    }
    try {
      await this.storage.delete(pending.objectKey);
    } catch {
      await this.documents.markDeleteFailure(
        input.actor,
        input.draftId,
        input.assetId,
      );
      throw new InvoiceDomainError("INVOICE_STORAGE_UNAVAILABLE");
    }
    try {
      return await this.documents.finalizeDelete(
        {
          actor: input.actor,
          correlationId: randomUUID(),
          requestId: input.requestId,
        },
        input.draftId,
        pending.documentId,
        input.assetId,
        pending.revision,
      );
    } catch (error) {
      await this.documents
        .markDeleteFailure(
          input.actor,
          input.draftId,
          input.assetId,
          "TOMBSTONE_FAILED",
        )
        .catch(() => undefined);
      throw error;
    }
  }

  async reorder(input: {
    actor: InvoiceActorContext;
    draftId: string;
    expectedRevision: number;
    assetIds: readonly string[];
    requestId?: string;
  }): Promise<InvoiceDraftDto> {
    await this.authorize(input.actor);
    return this.documents.reorder(
      {
        actor: input.actor,
        correlationId: randomUUID(),
        requestId: input.requestId,
      },
      input.draftId,
      input.expectedRevision,
      input.assetIds,
    );
  }

  async reconcile(actor: InvoiceActorContext): Promise<{
    repaired: number;
    failed: number;
  }> {
    await this.authorize(actor);
    const candidates = await this.documents.listReconciliationCandidates(
      actor.effectiveCompanyId,
    );
    let repaired = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        if (candidate.lifecycle === "attached") {
          await this.delete({
            actor,
            draftId: candidate.draftId,
            assetId: candidate.assetId,
            expectedRevision: candidate.draftRevision,
          });
        } else {
          await this.storage.delete(candidate.objectKey);
          await this.documents.abandonReconciliationCandidate({
            companyId: candidate.companyId,
            draftId: candidate.draftId,
            documentId: candidate.documentId,
            assetId: candidate.assetId,
            lifecycle: candidate.lifecycle,
          });
        }
        repaired += 1;
      } catch {
        failed += 1;
      }
    }
    return { repaired, failed };
  }
}
