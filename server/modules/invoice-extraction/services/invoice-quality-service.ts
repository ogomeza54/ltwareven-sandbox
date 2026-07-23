import type {
  InvoiceActorContext,
  InvoiceQualityDashboard,
  InvoiceQualityQuery,
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
}
