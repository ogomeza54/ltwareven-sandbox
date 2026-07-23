import type {
  InvoiceActorContext,
  InvoiceDraftStatus,
  InvoiceHistoryItem,
} from "@shared/invoice-extraction/contracts";
import { requireInvoiceCapability } from "../domain/policies";
import { PostgresInvoiceHistoryRepository } from "../repositories/invoice-history-repository";

export class InvoiceHistoryService {
  constructor(private readonly repository = new PostgresInvoiceHistoryRepository()) {}

  async list(
    actor: InvoiceActorContext,
    filters: {
      status?: InvoiceDraftStatus;
      supplier?: string;
      limit: number;
      offset: number;
    },
  ): Promise<InvoiceHistoryItem[]> {
    requireInvoiceCapability(actor, "process_draft");
    return this.repository.list(actor, filters);
  }
}
