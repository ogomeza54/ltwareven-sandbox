import { randomUUID } from "node:crypto";
import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoiceDraftDto,
} from "@shared/invoice-extraction/contracts";
import { requireInvoiceCapability } from "../domain/policies";
import { PostgresInvoiceRepository } from "../repositories/invoice-repository";
import type { PostgresInvoiceDocumentRepository } from "../repositories/invoice-document-repository";

export interface InvoiceDraftRepositoryPort {
  resolveFeatures(
    companyId: string,
  ): ReturnType<PostgresInvoiceRepository["resolveFeatures"]>;
  createDraft(
    context: Parameters<PostgresInvoiceRepository["createDraft"]>[0],
  ): ReturnType<PostgresInvoiceRepository["createDraft"]>;
  listDrafts(
    actor: InvoiceActorContext,
  ): ReturnType<PostgresInvoiceRepository["listDrafts"]>;
  getDraft(
    actor: InvoiceActorContext,
    draftId: string,
  ): ReturnType<PostgresInvoiceRepository["getDraft"]>;
  transitionDraft(
    context: Parameters<PostgresInvoiceRepository["transitionDraft"]>[0],
    draftId: string,
    expectedRevision: number,
    expectedStatus: Parameters<PostgresInvoiceRepository["transitionDraft"]>[3],
    nextStatus: Parameters<PostgresInvoiceRepository["transitionDraft"]>[4],
  ): ReturnType<PostgresInvoiceRepository["transitionDraft"]>;
}

export class InvoiceDraftService {
  constructor(
    private readonly repository: InvoiceDraftRepositoryPort,
    private readonly documents?: Pick<
      PostgresInvoiceDocumentRepository,
      "getSource"
    >,
  ) {}

  async create(
    actor: InvoiceActorContext,
    requestId?: string,
  ): Promise<InvoiceDraftDto> {
    requireInvoiceCapability(actor, "process_draft");
    const flags = await this.repository.resolveFeatures(
      actor.effectiveCompanyId,
    );
    if (!flags.scanExtraction) {
      throw new InvoiceDomainError("INVOICE_FEATURE_DISABLED");
    }
    return this.repository.createDraft({
      actor,
      correlationId: randomUUID(),
      requestId,
    });
  }

  async list(actor: InvoiceActorContext): Promise<InvoiceDraftDto[]> {
    requireInvoiceCapability(actor, "process_draft");
    const drafts = await this.repository.listDrafts(actor);
    if (!this.documents) return drafts;
    for (const draft of drafts) {
      draft.source = await this.documents.getSource(actor, draft.id);
    }
    return drafts;
  }

  async get(
    actor: InvoiceActorContext,
    draftId: string,
  ): Promise<InvoiceDraftDto> {
    requireInvoiceCapability(actor, "process_draft");
    const draft = await this.repository.getDraft(actor, draftId);
    if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
    if (this.documents) {
      draft.source = await this.documents.getSource(actor, draftId);
    }
    return draft;
  }

  async cancel(
    actor: InvoiceActorContext,
    draftId: string,
    expectedRevision: number,
    requestId?: string,
  ): Promise<InvoiceDraftDto> {
    requireInvoiceCapability(actor, "process_draft");
    const draft = await this.repository.getDraft(actor, draftId);
    if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
    return this.repository.transitionDraft(
      {
        actor,
        correlationId: randomUUID(),
        requestId,
      },
      draftId,
      expectedRevision,
      draft.status,
      "canceled",
    );
  }
}
