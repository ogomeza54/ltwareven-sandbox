import {
  InvoiceDomainError,
  invoiceFinalHeaderSchema,
  invoiceHeaderFieldSchema,
  type InvoiceActorContext,
  type InvoiceFinalHeader,
  type InvoiceHeaderField,
  type InvoiceReviewIssue,
  type InvoiceReviewWorkspaceDto,
} from "@shared/invoice-extraction/contracts";
import { requireInvoiceCapability } from "../domain/policies";
import { PostgresInvoiceDocumentRepository } from "../repositories/invoice-document-repository";
import {
  PostgresInvoiceHeaderReviewRepository,
  type HeaderReviewRecord,
} from "../repositories/invoice-header-review-repository";

const criticalFields: readonly InvoiceHeaderField[] = [
  "vendorName",
  "invoiceNumber",
  "invoiceDate",
  "currency",
  "total",
];

function fieldFromPath(path: string): InvoiceHeaderField | null {
  const candidate = path.replace(/^header\./, "").split(".")[0];
  const parsed = invoiceHeaderFieldSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function unresolvedIssues(record: HeaderReviewRecord): InvoiceReviewIssue[] {
  const reviewed = new Set(record.reviewedFields);
  const issues = record.proposal.uncertainties
    .filter((issue) => issue.path.startsWith("header."))
    .filter((issue) => {
      const field = fieldFromPath(issue.path);
      return !field || !reviewed.has(field);
    });
  for (const field of criticalFields) {
    const value = record.finalHeader[field];
    if (value !== null && value.trim() !== "") continue;
    if (!issues.some((issue) => fieldFromPath(issue.path) === field)) {
      issues.push({
        path: `header.${field}`,
        reason: "missing",
        message: `${field} is required before header approval.`,
      });
    }
  }
  for (const field of invoiceHeaderFieldSchema.options) {
    const confidence = record.proposal.header[field].confidence;
    if (
      confidence !== null &&
      confidence < 0.7 &&
      !reviewed.has(field) &&
      !issues.some((issue) => fieldFromPath(issue.path) === field)
    ) {
      issues.push({
        path: `header.${field}`,
        reason: "low_confidence",
        message: `${field} needs human review.`,
      });
    }
  }
  return issues;
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export class InvoiceHeaderReviewService {
  constructor(
    private readonly repository = new PostgresInvoiceHeaderReviewRepository(),
    private readonly documents = new PostgresInvoiceDocumentRepository(),
  ) {}

  async get(
    actor: InvoiceActorContext,
    draftId: string,
  ): Promise<InvoiceReviewWorkspaceDto> {
    requireInvoiceCapability(actor, "process_draft");
    const record = await this.repository.get(actor, draftId);
    if (!record) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
    const source = await this.documents.getSource(actor, draftId);
    if (!source || source.assets.length === 0) {
      throw new InvoiceDomainError("INVOICE_SOURCE_REQUIRED");
    }
    return {
      draftId,
      draftRevision: record.draftRevision,
      reviewRevision: record.reviewRevision,
      decision: record.decision,
      rejectionReason: record.rejectionReason,
      proposedHeader: record.proposal.header,
      finalHeader: record.finalHeader,
      reviewedFields: record.reviewedFields,
      issues: unresolvedIssues(record),
      source,
      updatedAt: iso(record.updatedAt),
    };
  }

  async update(
    actor: InvoiceActorContext,
    draftId: string,
    input: {
      revision: number;
      header: InvoiceFinalHeader;
      reviewedFields: InvoiceHeaderField[];
      decision: "draft" | "approved";
    },
    requestId?: string,
  ): Promise<InvoiceReviewWorkspaceDto> {
    requireInvoiceCapability(actor, "process_draft");
    const header = invoiceFinalHeaderSchema.parse(input.header);
    const reviewedFields = invoiceHeaderFieldSchema.array().parse(
      Array.from(new Set(input.reviewedFields)),
    );
    if (input.decision === "approved") {
      const current = await this.repository.get(actor, draftId);
      if (!current) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      const candidate = { ...current, finalHeader: header, reviewedFields };
      if (unresolvedIssues(candidate).length > 0) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE", {
          reason: "HEADER_ISSUES_REMAIN",
        });
      }
    }
    await this.repository.update(
      actor,
      draftId,
      input.revision,
      header,
      reviewedFields,
      input.decision,
      requestId,
    );
    return this.get(actor, draftId);
  }

  async reject(
    actor: InvoiceActorContext,
    draftId: string,
    revision: number,
    reason: string,
    requestId?: string,
  ): Promise<InvoiceReviewWorkspaceDto> {
    requireInvoiceCapability(actor, "process_draft");
    await this.repository.reject(
      actor,
      draftId,
      revision,
      reason.trim(),
      requestId,
    );
    return this.get(actor, draftId);
  }
}
