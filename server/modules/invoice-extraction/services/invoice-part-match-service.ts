import {
  type InvoiceActorContext,
  type InvoicePartCandidate,
  type InvoiceReviewWorkspaceDto,
} from "@shared/invoice-extraction/contracts";
import { requireInvoiceCapability } from "../domain/policies";
import {
  PostgresInvoicePartMatchRepository,
  type MatchDecisionInput,
} from "../repositories/invoice-part-match-repository";
import { InvoiceHeaderReviewService } from "./invoice-header-review-service";

export class InvoicePartMatchService {
  constructor(
    private readonly repository = new PostgresInvoicePartMatchRepository(),
    private readonly workspace = new InvoiceHeaderReviewService(),
  ) {}

  async candidates(
    actor: InvoiceActorContext,
    draftId: string,
    lineId: string,
    query?: string,
  ): Promise<InvoicePartCandidate[]> {
    requireInvoiceCapability(actor, "process_draft");
    return this.repository.candidates(actor, draftId, lineId, query);
  }

  async update(
    actor: InvoiceActorContext,
    draftId: string,
    revision: number,
    matches: MatchDecisionInput[],
    requestId?: string,
  ): Promise<InvoiceReviewWorkspaceDto> {
    requireInvoiceCapability(actor, "process_draft");
    await this.repository.update(actor, draftId, revision, matches, requestId);
    return this.workspace.get(actor, draftId);
  }
}
