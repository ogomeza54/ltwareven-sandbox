import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  InvoiceDomainError,
  type InvoiceActorContext,
  type InvoicePartCandidate,
} from "@shared/invoice-extraction/contracts";
import { db as applicationDatabase } from "../../../db";
import {
  normalizeMatchText,
  rankPartCandidates,
  type MatchablePart,
} from "../domain/part-matching";

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

interface PartRow {
  id: string;
  name: string;
  part_number: string;
  category: string | null;
  item_type: "inventory" | "consumable";
  vendor_part_number_normalized: string | null;
  description_normalized: string | null;
}

export type MatchDecisionInput =
  | {
      lineId: string;
      decision: "unresolved";
      selectedPartId: null;
      proposedNewPart: null;
    }
  | {
      lineId: string;
      decision: "existing";
      selectedPartId: string;
      proposedNewPart: null;
    }
  | {
      lineId: string;
      decision: "new";
      selectedPartId: null;
      proposedNewPart: {
        name: string;
        partNumber: string;
        itemType: "inventory" | "consumable";
        category: string | null;
        groupId: string | null;
        subgroupId: string | null;
      };
    };

export class PostgresInvoicePartMatchRepository {
  constructor(private readonly database: InvoiceDatabase = applicationDatabase) {}

  private async listParts(companyId: string): Promise<MatchablePart[]> {
    const records = rows<PartRow>(
      await this.database.execute(sql`
        select part.id, part.name, part.part_number, part.category, part.item_type,
               alias.vendor_part_number_normalized,
               alias.description_normalized
        from inventory_parts part
        left join invoice_part_aliases alias
          on alias.company_id = part.company_id and alias.part_id = part.id
        where part.company_id = ${companyId}
        order by part.id, alias.id
      `),
    );
    const grouped = new Map<string, MatchablePart>();
    for (const record of records) {
      const part = grouped.get(record.id) ?? {
        id: record.id,
        name: record.name,
        partNumber: record.part_number,
        category: record.category,
        itemType:
          record.item_type === "consumable" ? "consumable" : "inventory",
        aliases: [],
      };
      if (
        record.vendor_part_number_normalized !== null ||
        record.description_normalized !== null
      ) {
        part.aliases.push({
          vendorPartNumberNormalized: record.vendor_part_number_normalized,
          descriptionNormalized: record.description_normalized,
        });
      }
      grouped.set(record.id, part);
    }
    return Array.from(grouped.values());
  }

  async candidates(
    actor: InvoiceActorContext,
    draftId: string,
    lineId: string,
    query?: string,
  ): Promise<InvoicePartCandidate[]> {
    const line = rows<{
      description: string | null;
      vendor_part_number: string | null;
      classification: "inventory" | "consumable" | "unknown";
    }>(
      await this.database.execute(sql`
        select line.description, line.vendor_part_number, line.classification
        from invoice_review_lines line
        join invoice_review_drafts draft
          on draft.company_id = line.company_id and draft.id = line.draft_id
        where line.company_id = ${actor.effectiveCompanyId}
          and line.draft_id = ${draftId}::uuid
          and line.id = ${lineId}::uuid
          and draft.status = 'needs_review'
      `),
    )[0];
    if (!line) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
    return rankPartCandidates(
      {
        description: line.description,
        vendorPartNumber: line.vendor_part_number,
        classification: line.classification,
        query,
      },
      await this.listParts(actor.effectiveCompanyId),
    );
  }

  async update(
    actor: InvoiceActorContext,
    draftId: string,
    expectedRevision: number,
    matches: readonly MatchDecisionInput[],
    requestId?: string,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const draft = rows<{ revision: number; status: string }>(
        await tx.execute(sql`
          select revision, status
          from invoice_review_drafts
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
      if (new Set(matches.map((match) => match.lineId)).size !== matches.length) {
        throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
      }
      const draftLines = rows<{
        id: string;
        description: string | null;
        vendor_part_number: string | null;
        classification: "inventory" | "consumable" | "unknown";
      }>(
        await tx.execute(sql`
          select id, description, vendor_part_number, classification
          from invoice_review_lines
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
        `),
      );
      const lineById = new Map(draftLines.map((line) => [line.id, line]));
      if (matches.some((match) => !lineById.has(match.lineId))) {
        throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
      }
      const selectedIds = matches
        .filter((match) => match.decision === "existing")
        .map((match) => match.selectedPartId);
      if (selectedIds.length) {
        const owned = rows<{ id: string }>(
          await tx.execute(sql`
            select id from inventory_parts
            where company_id = ${actor.effectiveCompanyId}
              and id in (${sql.join(selectedIds.map((id) => sql`${id}`), sql`, `)})
          `),
        );
        if (owned.length !== new Set(selectedIds).size) {
          throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
        }
      }
      for (const match of matches) {
        if (match.decision !== "new") continue;
        const proposal = match.proposedNewPart;
        if (proposal.groupId || proposal.subgroupId) {
          const hierarchy = rows<{ group_id: string; subgroup_id: string | null }>(
            await tx.execute(sql`
              select group_record.id as group_id, subgroup.id as subgroup_id
              from maintenance_groups group_record
              left join maintenance_subgroups subgroup
                on subgroup.group_id = group_record.id
               and subgroup.company_id = group_record.company_id
               and subgroup.id = ${proposal.subgroupId}
              where group_record.company_id = ${actor.effectiveCompanyId}
                and group_record.id = ${proposal.groupId}
            `),
          )[0];
          if (
            !hierarchy ||
            (proposal.subgroupId !== null &&
              hierarchy.subgroup_id !== proposal.subgroupId)
          ) {
            throw new InvoiceDomainError("INVOICE_INVALID_REQUEST");
          }
        }
        const duplicate = rows<{ id: string }>(
          await tx.execute(sql`
            select id from inventory_parts
            where company_id = ${actor.effectiveCompanyId}
              and (
                lower(regexp_replace(part_number, '[^a-zA-Z0-9]', '', 'g')) =
                  ${normalizeMatchText(proposal.partNumber).replace(/\s/g, "")}
                or lower(trim(name)) = ${normalizeMatchText(proposal.name)}
              )
            limit 1
          `),
        )[0];
        if (duplicate) {
          throw new InvoiceDomainError("INVOICE_INVALID_REQUEST", {
            reason: "duplicate_part",
            partId: duplicate.id,
          });
        }
      }
      const parts = await this.listParts(actor.effectiveCompanyId);
      for (const match of matches) {
        const line = lineById.get(match.lineId)!;
        const suggestion = rankPartCandidates(
          {
            description: line.description,
            vendorPartNumber: line.vendor_part_number,
            classification: line.classification,
          },
          parts,
          1,
        )[0];
        const originalSuggestion = suggestion
          ? {
              partId: suggestion.part.id,
              score: suggestion.score,
              signals: suggestion.signals,
            }
          : null;
        await tx.execute(sql`
          insert into invoice_line_matches (
            company_id, draft_id, line_id, decision, selected_part_id,
            proposed_new_part, original_suggestion,
            updated_by_company_id, updated_by_user_id
          ) values (
            ${actor.effectiveCompanyId}, ${draftId}::uuid, ${match.lineId}::uuid,
            ${match.decision}, ${match.selectedPartId},
            ${match.proposedNewPart ? JSON.stringify(match.proposedNewPart) : null}::jsonb,
            ${originalSuggestion ? JSON.stringify(originalSuggestion) : null}::jsonb,
            ${actor.actorCompanyId}, ${actor.actorUserId}
          )
          on conflict (company_id, line_id) do update set
            decision = excluded.decision,
            selected_part_id = excluded.selected_part_id,
            proposed_new_part = excluded.proposed_new_part,
            original_suggestion =
              coalesce(invoice_line_matches.original_suggestion, excluded.original_suggestion),
            revision = invoice_line_matches.revision + 1,
            updated_by_company_id = excluded.updated_by_company_id,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = now()
        `);
      }
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
          'review.matches_saved', 'draft', ${draftId}::uuid,
          ${randomUUID()}::uuid, ${requestId ?? null}::uuid,
          ${JSON.stringify({ revision: expectedRevision + 1, count: matches.length })}::jsonb
        )
      `);
    });
  }
}
