import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoiceReviewWorkspaceDto,
} from "@shared/invoice-extraction/contracts";
import { requireInvoiceCapability } from "../domain/policies";
import {
  InvoiceNumericError,
  normalizeQuantity,
  normalizeUnitCost,
} from "../domain/invoice-money";
import { PostgresInvoiceLineReviewRepository } from "../repositories/invoice-line-review-repository";
import { InvoiceHeaderReviewService } from "./invoice-header-review-service";

export class InvoiceLineReviewService {
  constructor(
    private readonly repository = new PostgresInvoiceLineReviewRepository(),
    private readonly workspace = new InvoiceHeaderReviewService(),
  ) {}

  async update(
    actor: InvoiceActorContext,
    draftId: string,
    input: {
      revision: number;
      lines: Array<{
        id: string | null;
        description: string | null;
        vendorPartNumber: string | null;
        quantity: string | null;
        unitCost: string | null;
        classification: "inventory" | "consumable" | "unknown";
      }>;
      decision: "draft" | "approved";
    },
    requestId?: string,
  ): Promise<InvoiceReviewWorkspaceDto> {
    requireInvoiceCapability(actor, "process_draft");
    let lines;
    try {
      lines = input.lines.map((line, index) => ({
        ...line,
        quantity:
          line.quantity === null
            ? null
            : normalizeQuantity(line.quantity, `lines.${index}.quantity`),
        unitCost:
          line.unitCost === null
            ? null
            : normalizeUnitCost(line.unitCost, `lines.${index}.unitCost`),
      }));
    } catch (error) {
      if (error instanceof InvoiceNumericError) {
        throw new InvoiceDomainError("INVOICE_NUMERIC_INVALID", {
          field: error.field,
        });
      }
      throw error;
    }
    await this.repository.update(
      actor,
      draftId,
      input.revision,
      lines,
      input.decision,
      requestId,
    );
    return this.workspace.get(actor, draftId);
  }
}
