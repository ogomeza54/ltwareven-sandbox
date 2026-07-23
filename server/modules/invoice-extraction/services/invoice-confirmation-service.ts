import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoiceConfirmationIntentDto,
} from "@shared/invoice-extraction/contracts";
import { requireInvoiceCapability } from "../domain/policies";
import { PostgresInvoiceConfirmationRepository } from "../repositories/invoice-confirmation-repository";
import { PostgresInvoiceRepository } from "../repositories/invoice-repository";

export class InvoiceConfirmationService {
  constructor(
    private readonly confirmations = new PostgresInvoiceConfirmationRepository(),
    private readonly invoices = new PostgresInvoiceRepository(),
  ) {}

  async createIntent(
    actor: InvoiceActorContext,
    draftId: string,
    revision: number,
    idempotencyKey: string,
    requestId?: string,
  ): Promise<InvoiceConfirmationIntentDto> {
    requireInvoiceCapability(actor, "process_draft");
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,159}$/.test(idempotencyKey)
    ) {
      throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
    }
    const flags = await this.invoices.resolveFeatures(actor.effectiveCompanyId);
    if (!flags.scanExtraction) {
      throw new InvoiceDomainError("INVOICE_FEATURE_DISABLED");
    }
    return this.confirmations.create(
      actor,
      draftId,
      revision,
      idempotencyKey,
      requestId,
    );
  }

  async overrideDuplicate(
    actor: InvoiceActorContext,
    draftId: string,
    intentId: string,
    reason: string,
    requestId?: string,
  ): Promise<InvoiceConfirmationIntentDto> {
    requireInvoiceCapability(actor, "duplicate_override");
    return this.confirmations.overrideDuplicate(
      actor,
      draftId,
      intentId,
      reason,
      requestId,
    );
  }

  async confirm(
    actor: InvoiceActorContext,
    draftId: string,
    intentId: string,
    idempotencyKey: string,
    requestId?: string,
  ): Promise<InvoiceConfirmationIntentDto> {
    requireInvoiceCapability(actor, "process_draft");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,159}$/.test(idempotencyKey)) {
      throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
    }
    const flags = await this.invoices.resolveFeatures(actor.effectiveCompanyId);
    if (!flags.stockConfirmation) {
      throw new InvoiceDomainError("INVOICE_CONFIRMATION_DISABLED");
    }
    return this.confirmations.confirm(
      actor,
      draftId,
      intentId,
      idempotencyKey,
      requestId,
    );
  }
}
