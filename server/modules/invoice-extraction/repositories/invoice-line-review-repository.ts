import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  InvoiceDomainError,
  invoiceFinalHeaderSchema,
  invoiceProposalSchema,
  type InvoiceActorContext,
  type InvoiceFinalHeader,
  type InvoiceProposal,
} from "@shared/invoice-extraction/contracts";
import { db as applicationDatabase } from "../../../db";
import { loadInvoiceConfig } from "../config/invoice-config";
import {
  reconcileInvoiceMoney,
  centsToDecimal,
  lineExtensionCents,
  type InvoiceReconciliation,
} from "../domain/invoice-money";

type InvoiceDatabase = typeof applicationDatabase;
type TransactionExecutor = Parameters<
  Parameters<InvoiceDatabase["transaction"]>[0]
>[0];
type SqlExecutor = Pick<TransactionExecutor, "execute">;
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

export interface EditableReviewLine {
  id: string | null;
  description: string | null;
  vendorPartNumber: string | null;
  quantity: string | null;
  unitCost: string | null;
  classification: "inventory" | "consumable" | "unknown";
}

export interface ReviewLineRecord extends Omit<EditableReviewLine, "id"> {
  id: string;
  sourceLineIndex: number | null;
  position: number;
  calculatedLineTotal: string | null;
  proposed: InvoiceProposal["lines"][number] | null;
}

export interface ReviewTotalsRecord
  extends Omit<InvoiceReconciliation, "lineTotals"> {
  decision: "draft" | "approved";
}

interface LineRow {
  id: string;
  source_line_index: number | null;
  position: number;
  description: string | null;
  vendor_part_number: string | null;
  quantity: string | null;
  unit_cost: string | null;
  classification: ReviewLineRecord["classification"];
}

function headerMoney(header: InvoiceFinalHeader) {
  return {
    observedSubtotal: header.subtotal,
    observedTax: header.tax,
    observedFreight: header.freight,
    observedTotal: header.total,
  };
}

export async function recalculateReviewTotals(
  executor: SqlExecutor,
  companyId: string,
  draftId: string,
  proposalId: string,
  actor: InvoiceActorContext,
  header: InvoiceFinalHeader,
  decision: "draft" | "approved" = "draft",
): Promise<InvoiceReconciliation> {
  const lineRows = rows<{ quantity: string | null; unit_cost: string | null }>(
    await executor.execute(sql`
      select quantity::text, unit_cost::text
      from invoice_review_lines
      where company_id = ${companyId} and draft_id = ${draftId}::uuid
      order by position, id
    `),
  );
  const reconciliation = reconcileInvoiceMoney({
    lines: lineRows.map((line) => ({
      quantity: line.quantity,
      unitCost: line.unit_cost,
    })),
    ...headerMoney(header),
    toleranceCents: loadInvoiceConfig().reconciliationToleranceCents,
  });
  if (decision === "approved" && !reconciliation.withinTolerance) {
    throw new InvoiceDomainError("INVOICE_RECONCILIATION_REQUIRED");
  }
  await executor.execute(sql`
    insert into invoice_review_totals (
      company_id, draft_id, proposal_id, decision,
      observed_subtotal, observed_tax, observed_freight, observed_total,
      calculated_subtotal, calculated_tax, calculated_freight,
      calculated_total, difference, complete, within_tolerance,
      updated_by_company_id, updated_by_user_id
    ) values (
      ${companyId}, ${draftId}::uuid, ${proposalId}::uuid, ${decision},
      ${reconciliation.observedSubtotal}, ${reconciliation.observedTax},
      ${reconciliation.observedFreight}, ${reconciliation.observedTotal},
      ${reconciliation.calculatedSubtotal}, ${reconciliation.calculatedTax},
      ${reconciliation.calculatedFreight}, ${reconciliation.calculatedTotal},
      ${reconciliation.difference}, ${reconciliation.complete},
      ${reconciliation.withinTolerance}, ${actor.actorCompanyId},
      ${actor.actorUserId}
    )
    on conflict (company_id, draft_id) do update set
      decision = excluded.decision,
      observed_subtotal = excluded.observed_subtotal,
      observed_tax = excluded.observed_tax,
      observed_freight = excluded.observed_freight,
      observed_total = excluded.observed_total,
      calculated_subtotal = excluded.calculated_subtotal,
      calculated_tax = excluded.calculated_tax,
      calculated_freight = excluded.calculated_freight,
      calculated_total = excluded.calculated_total,
      difference = excluded.difference,
      complete = excluded.complete,
      within_tolerance = excluded.within_tolerance,
      revision = invoice_review_totals.revision + 1,
      updated_by_company_id = excluded.updated_by_company_id,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = now()
  `);
  return reconciliation;
}

export class PostgresInvoiceLineReviewRepository {
  constructor(private readonly database: InvoiceDatabase = applicationDatabase) {}

  async get(
    actor: InvoiceActorContext,
    draftId: string,
  ): Promise<{ lines: ReviewLineRecord[]; totals: ReviewTotalsRecord } | null> {
    const proposalRow = rows<{ payload: unknown }>(
      await this.database.execute(sql`
        select proposal.payload
        from invoice_review_headers header
        join invoice_extraction_proposals proposal
          on proposal.company_id = header.company_id
         and proposal.id = header.proposal_id
        where header.company_id = ${actor.effectiveCompanyId}
          and header.draft_id = ${draftId}::uuid
      `),
    )[0];
    if (!proposalRow) return null;
    const proposal = invoiceProposalSchema.parse(proposalRow.payload);
    const lineRows = rows<LineRow>(
      await this.database.execute(sql`
        select id, source_line_index, position, description,
               vendor_part_number, quantity::text, unit_cost::text,
               classification
        from invoice_review_lines
        where company_id = ${actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid
        order by position, id
      `),
    );
    const totals = rows<{
      decision: "draft" | "approved";
      observed_subtotal: string | null;
      observed_tax: string | null;
      observed_freight: string | null;
      observed_total: string | null;
      calculated_subtotal: string | null;
      calculated_tax: string | null;
      calculated_freight: string | null;
      calculated_total: string | null;
      difference: string | null;
      complete: boolean;
      within_tolerance: boolean;
    }>(
      await this.database.execute(sql`
        select decision, observed_subtotal::text, observed_tax::text,
               observed_freight::text, observed_total::text,
               calculated_subtotal::text, calculated_tax::text,
               calculated_freight::text, calculated_total::text,
               difference::text, complete, within_tolerance
        from invoice_review_totals
        where company_id = ${actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid
      `),
    )[0];
    if (!totals) return null;
    return {
      lines: lineRows.map((line) => ({
        id: line.id,
        sourceLineIndex: line.source_line_index,
        position: line.position,
        description: line.description,
        vendorPartNumber: line.vendor_part_number,
        quantity: line.quantity,
        unitCost: line.unit_cost,
        calculatedLineTotal:
          line.quantity !== null && line.unit_cost !== null
            ? centsToDecimal(
                lineExtensionCents(
                  line.quantity,
                  line.unit_cost,
                  `lines.${line.position - 1}`,
                ),
              )
            : null,
        classification: line.classification,
        proposed:
          line.source_line_index === null
            ? null
            : proposal.lines[line.source_line_index] ?? null,
      })),
      totals: {
        decision: totals.decision,
        complete: totals.complete,
        withinTolerance: totals.within_tolerance,
        observedSubtotal: totals.observed_subtotal,
        observedTax: totals.observed_tax,
        observedFreight: totals.observed_freight,
        observedTotal: totals.observed_total,
        calculatedSubtotal: totals.calculated_subtotal,
        calculatedTax: totals.calculated_tax,
        calculatedFreight: totals.calculated_freight,
        calculatedTotal: totals.calculated_total,
        difference: totals.difference,
      },
    };
  }

  async update(
    actor: InvoiceActorContext,
    draftId: string,
    expectedRevision: number,
    inputLines: readonly EditableReviewLine[],
    decision: "draft" | "approved",
    requestId?: string,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const draft = rows<{ revision: number; status: string }>(
        await tx.execute(sql`
          select revision, status from invoice_review_drafts
          where company_id = ${actor.effectiveCompanyId}
            and id = ${draftId}::uuid
          for update
        `),
      )[0];
      if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      if (draft.revision !== expectedRevision) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      if (draft.status !== "needs_review") {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const header = rows<{
        proposal_id: string;
        final_values: InvoiceFinalHeader;
      }>(
        await tx.execute(sql`
          select proposal_id, final_values from invoice_review_headers
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
          for update
        `),
      )[0];
      if (!header) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      const current = rows<{ id: string }>(
        await tx.execute(sql`
          select id from invoice_review_lines
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
        `),
      );
      const currentIds = new Set(current.map((line) => line.id));
      const retainedIds = inputLines
        .map((line) => line.id)
        .filter((id): id is string => id !== null);
      if (new Set(retainedIds).size !== retainedIds.length) {
        throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
      }
      for (const line of inputLines) {
        if (line.id && !currentIds.has(line.id)) {
          throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        }
      }
      const retained = retainedIds;
      await tx.execute(
        retained.length
          ? sql`delete from invoice_review_lines
                where company_id = ${actor.effectiveCompanyId}
                  and draft_id = ${draftId}::uuid
                  and id not in (${sql.join(retained.map((id) => sql`${id}::uuid`), sql`, `)})`
          : sql`delete from invoice_review_lines
                where company_id = ${actor.effectiveCompanyId}
                  and draft_id = ${draftId}::uuid`,
      );
      await tx.execute(sql`
        update invoice_review_lines set position = position + 1000
        where company_id = ${actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid
      `);
      for (let index = 0; index < inputLines.length; index += 1) {
        const line = inputLines[index];
        if (line.id) {
          await tx.execute(sql`
            update invoice_review_lines
            set position = ${index + 1}, description = ${line.description},
                vendor_part_number = ${line.vendorPartNumber},
                quantity = ${line.quantity}, unit_cost = ${line.unitCost},
                classification = ${line.classification},
                revision = revision + 1, updated_at = now()
            where company_id = ${actor.effectiveCompanyId}
              and draft_id = ${draftId}::uuid and id = ${line.id}::uuid
          `);
        } else {
          await tx.execute(sql`
            insert into invoice_review_lines (
              company_id, draft_id, proposal_id, source_line_index, position,
              description, vendor_part_number, quantity, unit_cost, classification
            ) values (
              ${actor.effectiveCompanyId}, ${draftId}::uuid,
              ${header.proposal_id}::uuid, null, ${index + 1},
              ${line.description}, ${line.vendorPartNumber}, ${line.quantity},
              ${line.unitCost}, ${line.classification}
            )
          `);
        }
      }
      await recalculateReviewTotals(
        tx,
        actor.effectiveCompanyId,
        draftId,
        header.proposal_id,
        actor,
        invoiceFinalHeaderSchema.parse(header.final_values),
        decision,
      );
      await tx.execute(sql`
        update invoice_review_drafts
        set revision = revision + 1,
            updated_by_company_id = ${actor.actorCompanyId},
            updated_by_user_id = ${actor.actorUserId},
            updated_at = now(), last_activity_at = now()
        where company_id = ${actor.effectiveCompanyId}
          and id = ${draftId}::uuid and revision = ${expectedRevision}
      `);
      await tx.execute(sql`
        insert into invoice_audit_events (
          company_id, actor_user_id, actor_company_id, action,
          target_type, target_id, correlation_id, request_id, metadata
        ) values (
          ${actor.effectiveCompanyId}, ${actor.actorUserId}, ${actor.actorCompanyId},
          ${decision === "approved" ? "review.lines_approved" : "review.lines_saved"},
          'draft', ${draftId}::uuid, ${randomUUID()}::uuid,
          ${requestId ?? null}::uuid,
          ${JSON.stringify({ revision: expectedRevision + 1 })}::jsonb
        )
      `);
    });
  }
}
