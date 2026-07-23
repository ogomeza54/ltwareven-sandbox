import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  InvoiceDomainError,
  invoiceFinalHeaderSchema,
  invoiceHeaderFieldSchema,
  invoiceProposalSchema,
  type InvoiceActorContext,
  type InvoiceFinalHeader,
  type InvoiceHeaderField,
  type InvoiceProposal,
} from "@shared/invoice-extraction/contracts";
import { db as applicationDatabase } from "../../../db";
import { recalculateReviewTotals } from "./invoice-line-review-repository";

type InvoiceDatabase = typeof applicationDatabase;
type Result<T> = { rows: T[] };
function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as Result<T>).rows)
  ) {
    return (result as Result<T>).rows;
  }
  return [];
}

export interface HeaderReviewRecord {
  draftId: string;
  draftRevision: number;
  draftStatus: "needs_review" | "rejected";
  reviewRevision: number;
  decision: "draft" | "approved" | "rejected";
  rejectionReason: string | null;
  finalHeader: InvoiceFinalHeader;
  reviewedFields: InvoiceHeaderField[];
  proposal: InvoiceProposal;
  updatedAt: Date | string;
}

interface HeaderReviewRow {
  draft_id: string;
  draft_revision: number;
  draft_status: "needs_review" | "rejected";
  review_revision: number;
  decision: "draft" | "approved" | "rejected";
  rejection_reason: string | null;
  final_values: unknown;
  reviewed_fields: unknown;
  proposal: unknown;
  updated_at: Date | string;
}

function record(row: HeaderReviewRow): HeaderReviewRecord {
  return {
    draftId: row.draft_id,
    draftRevision: row.draft_revision,
    draftStatus: row.draft_status,
    reviewRevision: row.review_revision,
    decision: row.decision,
    rejectionReason: row.rejection_reason,
    finalHeader: invoiceFinalHeaderSchema.parse(row.final_values),
    reviewedFields: invoiceHeaderFieldSchema.array().parse(row.reviewed_fields),
    proposal: invoiceProposalSchema.parse(row.proposal),
    updatedAt: row.updated_at,
  };
}

export class PostgresInvoiceHeaderReviewRepository {
  constructor(private readonly database: InvoiceDatabase = applicationDatabase) {}

  async get(
    actor: InvoiceActorContext,
    draftId: string,
  ): Promise<HeaderReviewRecord | null> {
    const result = await this.database.execute(sql`
      select draft.id as draft_id, draft.revision as draft_revision,
             draft.status as draft_status, review.revision as review_revision,
             review.decision, review.rejection_reason, review.final_values,
             review.reviewed_fields, proposal.payload as proposal,
             review.updated_at
      from invoice_review_drafts draft
      join invoice_review_headers review
        on review.company_id = draft.company_id and review.draft_id = draft.id
      join invoice_extraction_proposals proposal
        on proposal.company_id = review.company_id
       and proposal.id = review.proposal_id
      where draft.company_id = ${actor.effectiveCompanyId}
        and draft.id = ${draftId}::uuid
        and draft.status in ('needs_review', 'rejected')
      limit 1
    `);
    const row = rows<HeaderReviewRow>(result)[0];
    return row ? record(row) : null;
  }

  async update(
    actor: InvoiceActorContext,
    draftId: string,
    expectedDraftRevision: number,
    header: InvoiceFinalHeader,
    reviewedFields: readonly InvoiceHeaderField[],
    decision: "draft" | "approved",
    requestId?: string,
  ): Promise<HeaderReviewRecord> {
    return this.database.transaction(async (tx) => {
      const locked = rows<{ revision: number; status: string }>(
        await tx.execute(sql`
          select revision, status from invoice_review_drafts
          where company_id = ${actor.effectiveCompanyId}
            and id = ${draftId}::uuid
          for update
        `),
      )[0];
      if (!locked) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      if (locked.revision !== expectedDraftRevision) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      if (locked.status !== "needs_review") {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const updatedReview = rows<{ revision: number; proposal_id: string }>(
        await tx.execute(sql`
          update invoice_review_headers
          set final_values = ${JSON.stringify(header)}::jsonb,
              reviewed_fields = ${JSON.stringify(reviewedFields)}::jsonb,
              decision = ${decision},
              rejection_reason = null,
              revision = revision + 1,
              updated_by_company_id = ${actor.actorCompanyId},
              updated_by_user_id = ${actor.actorUserId},
              updated_at = now()
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
          returning revision, proposal_id
        `),
      )[0];
      if (!updatedReview) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      await recalculateReviewTotals(
        tx,
        actor.effectiveCompanyId,
        draftId,
        updatedReview.proposal_id,
        actor,
        header,
        "draft",
      );
      await tx.execute(sql`
        update invoice_review_drafts
        set revision = revision + 1,
            updated_by_company_id = ${actor.actorCompanyId},
            updated_by_user_id = ${actor.actorUserId},
            updated_at = now(), last_activity_at = now()
        where company_id = ${actor.effectiveCompanyId}
          and id = ${draftId}::uuid and revision = ${expectedDraftRevision}
      `);
      await tx.execute(sql`
        insert into invoice_audit_events (
          company_id, actor_user_id, actor_company_id, action,
          target_type, target_id, correlation_id, request_id, metadata
        ) values (
          ${actor.effectiveCompanyId}, ${actor.actorUserId}, ${actor.actorCompanyId},
          ${decision === "approved" ? "review.header_approved" : "review.header_saved"},
          'draft', ${draftId}::uuid, ${randomUUID()}::uuid,
          ${requestId ?? null}::uuid,
          ${JSON.stringify({ revision: expectedDraftRevision + 1 })}::jsonb
        )
      `);
      const refreshed = await this.getWith(tx, actor, draftId);
      if (!refreshed) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      return refreshed;
    });
  }

  async reject(
    actor: InvoiceActorContext,
    draftId: string,
    expectedDraftRevision: number,
    reason: string,
    requestId?: string,
  ): Promise<HeaderReviewRecord> {
    return this.database.transaction(async (tx) => {
      const draft = rows<{ revision: number; status: string }>(
        await tx.execute(sql`
          select revision, status from invoice_review_drafts
          where company_id = ${actor.effectiveCompanyId}
            and id = ${draftId}::uuid
          for update
        `),
      )[0];
      if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      if (draft.revision !== expectedDraftRevision) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      if (draft.status !== "needs_review") {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      await tx.execute(sql`
        update invoice_review_headers
        set decision = 'rejected', rejection_reason = ${reason},
            revision = revision + 1,
            updated_by_company_id = ${actor.actorCompanyId},
            updated_by_user_id = ${actor.actorUserId}, updated_at = now()
        where company_id = ${actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid
      `);
      await tx.execute(sql`
        update invoice_review_drafts
        set status = 'rejected', revision = revision + 1,
            updated_by_company_id = ${actor.actorCompanyId},
            updated_by_user_id = ${actor.actorUserId},
            updated_at = now(), last_activity_at = now()
        where company_id = ${actor.effectiveCompanyId}
          and id = ${draftId}::uuid and revision = ${expectedDraftRevision}
      `);
      await tx.execute(sql`
        insert into invoice_audit_events (
          company_id, actor_user_id, actor_company_id, action,
          target_type, target_id, correlation_id, request_id, metadata
        ) values (
          ${actor.effectiveCompanyId}, ${actor.actorUserId}, ${actor.actorCompanyId},
          'review.rejected', 'draft', ${draftId}::uuid, ${randomUUID()}::uuid,
          ${requestId ?? null}::uuid,
          ${JSON.stringify({ revision: expectedDraftRevision + 1 })}::jsonb
        )
      `);
      const refreshed = await this.getWith(tx, actor, draftId);
      if (!refreshed) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      return refreshed;
    });
  }

  private async getWith(
    executor: Pick<InvoiceDatabase, "execute">,
    actor: InvoiceActorContext,
    draftId: string,
  ): Promise<HeaderReviewRecord | null> {
    const result = await executor.execute(sql`
      select draft.id as draft_id, draft.revision as draft_revision,
             draft.status as draft_status, review.revision as review_revision,
             review.decision, review.rejection_reason, review.final_values,
             review.reviewed_fields, proposal.payload as proposal,
             review.updated_at
      from invoice_review_drafts draft
      join invoice_review_headers review
        on review.company_id = draft.company_id and review.draft_id = draft.id
      join invoice_extraction_proposals proposal
        on proposal.company_id = review.company_id
       and proposal.id = review.proposal_id
      where draft.company_id = ${actor.effectiveCompanyId}
        and draft.id = ${draftId}::uuid
      limit 1
    `);
    const row = rows<HeaderReviewRow>(result)[0];
    return row ? record(row) : null;
  }
}
