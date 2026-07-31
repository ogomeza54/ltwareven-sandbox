import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoiceQualityCaseDetail,
  type InvoiceQualityDashboard,
  type InvoiceQualityQuery,
} from "@shared/invoice-extraction/contracts";
import { requireInvoiceCapability } from "../domain/policies";
import { PostgresInvoiceQualityRepository } from "../repositories/invoice-quality-repository";

export class InvoiceQualityService {
  constructor(private readonly repository = new PostgresInvoiceQualityRepository()) {}

  async dashboard(
    actor: InvoiceActorContext,
    filters: InvoiceQualityQuery,
  ): Promise<InvoiceQualityDashboard> {
    requireInvoiceCapability(actor, "quality_read");
    return this.repository.dashboard(actor, filters);
  }

  async detail(
    actor: InvoiceActorContext,
    draftId: string,
  ): Promise<InvoiceQualityCaseDetail> {
    requireInvoiceCapability(actor, "quality_read");
    const detail = await this.repository.detail(actor, draftId);
    if (!detail) {
      throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
    }
    return detail;
  }
}
