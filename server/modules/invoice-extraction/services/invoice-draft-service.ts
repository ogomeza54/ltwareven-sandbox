import { randomUUID } from "node:crypto";
import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoiceDraftDto,
} from "@shared/invoice-extraction/contracts";
import { requireInvoiceCapability } from "../domain/policies";
import { PostgresInvoiceRepository } from "../repositories/invoice-repository";

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
}

export class InvoiceDraftService {
  constructor(private readonly repository: InvoiceDraftRepositoryPort) {}

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
    return this.repository.listDrafts(actor);
  }

  async get(
    actor: InvoiceActorContext,
    draftId: string,
  ): Promise<InvoiceDraftDto> {
    requireInvoiceCapability(actor, "process_draft");
    const draft = await this.repository.getDraft(actor, draftId);
    if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
    return draft;
  }
}
