import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  InvoiceDomainError,
  invoiceConfirmationIntentDtoSchema,
  invoiceFinalHeaderSchema,
  invoiceProposalSchema,
  type InvoiceActorContext,
  type InvoiceConfirmationIntentDto,
} from "@shared/invoice-extraction/contracts";
import { db as applicationDatabase } from "../../../db";
import {
  canonicalPayloadHash,
  normalizedInvoiceIdentity,
  stockUnitDelta,
  type InvoiceConfirmationSummary,
} from "../domain/confirmation-intent";
import {
  centsToDecimal,
  lineExtensionCents,
} from "../domain/invoice-money";
import Decimal from "decimal.js";
import { receiveInventoryWithinTransaction } from "../../inventory-receiving/postgres-inventory-intake-service";
import type { InventoryReceivingCommand } from "../../inventory-receiving/types";
import { loadInvoiceConfig } from "../config/invoice-config";
import {
  classifyHeaderFeedback,
  classifyLineFieldFeedback,
} from "../domain/feedback-classification";

type InvoiceDatabase = typeof applicationDatabase;
type TransactionExecutor = Parameters<
  Parameters<InvoiceDatabase["transaction"]>[0]
>[0];
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

interface IntentRow {
  id: string;
  draft_id: string;
  draft_revision: number;
  idempotency_key: string;
  payload_hash: string;
  canonical_payload: { summary: InvoiceConfirmationSummary };
  status: "reserved" | "completed" | "invalidated";
  duplicate_status: "clear" | "suspected" | "overridden";
  duplicate_signals: InvoiceConfirmationIntentDto["duplicateSignals"];
  override_reason: string | null;
  intake_id: string | null;
  created_at: Date | string;
}

function intentDto(row: IntentRow): InvoiceConfirmationIntentDto {
  return invoiceConfirmationIntentDtoSchema.parse({
    id: row.id,
    draftId: row.draft_id,
    draftRevision: row.draft_revision,
    idempotencyKey: row.idempotency_key,
    payloadHash: row.payload_hash,
    status: row.status,
    duplicateStatus: row.duplicate_status,
    duplicateSignals: row.duplicate_signals,
    overrideReason: row.override_reason,
    summary: row.canonical_payload.summary,
    intakeId: row.intake_id,
    createdAt: new Date(row.created_at).toISOString(),
  });
}

export class PostgresInvoiceConfirmationRepository {
  constructor(private readonly database: InvoiceDatabase = applicationDatabase) {}

  private async findByKey(
    executor: Pick<TransactionExecutor, "execute">,
    companyId: string,
    key: string,
  ): Promise<IntentRow | null> {
    return (
      rows<IntentRow>(
        await executor.execute(sql`
          select id, draft_id, draft_revision, idempotency_key, payload_hash,
                 canonical_payload, status, duplicate_status, duplicate_signals,
                 override_reason, intake_id, created_at
          from invoice_confirmation_intents
          where company_id = ${companyId} and idempotency_key = ${key}
        `),
      )[0] ?? null
    );
  }

  private async buildSummary(
    tx: TransactionExecutor,
    companyId: string,
    draftId: string,
    expectedRevision: number,
  ): Promise<InvoiceConfirmationSummary> {
    const headerRow = rows<{
      draft_revision: number;
      draft_status: string;
      decision: string;
      final_values: unknown;
      totals_decision: string;
      complete: boolean;
      within_tolerance: boolean;
      calculated_subtotal: string | null;
      calculated_tax: string | null;
      calculated_freight: string | null;
      calculated_total: string | null;
    }>(
      await tx.execute(sql`
        select draft.revision as draft_revision, draft.status as draft_status,
               header.decision, header.final_values,
               totals.decision as totals_decision, totals.complete,
               totals.within_tolerance, totals.calculated_subtotal::text,
               totals.calculated_tax::text, totals.calculated_freight::text,
               totals.calculated_total::text
        from invoice_review_drafts draft
        join invoice_review_headers header
          on header.company_id = draft.company_id and header.draft_id = draft.id
        join invoice_review_totals totals
          on totals.company_id = draft.company_id and totals.draft_id = draft.id
        where draft.company_id = ${companyId} and draft.id = ${draftId}::uuid
        for update of draft
      `),
    )[0];
    if (!headerRow) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
    if (headerRow.draft_revision !== expectedRevision) {
      throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
    }
    if (
      !["needs_review", "confirming"].includes(headerRow.draft_status) ||
      headerRow.decision !== "approved" ||
      headerRow.totals_decision !== "approved" ||
      !headerRow.complete ||
      !headerRow.within_tolerance
    ) {
      throw new InvoiceDomainError("INVOICE_REVIEW_INCOMPLETE");
    }
    const header = invoiceFinalHeaderSchema.parse(headerRow.final_values);
    if (
      !header.vendorName ||
      !header.invoiceDate ||
      header.currency !== "USD" ||
      !headerRow.calculated_subtotal ||
      !headerRow.calculated_tax ||
      !headerRow.calculated_freight ||
      !headerRow.calculated_total
    ) {
      throw new InvoiceDomainError("INVOICE_REVIEW_INCOMPLETE");
    }
    const lineRows = rows<{
      line_id: string;
      description: string | null;
      vendor_part_number: string | null;
      quantity: string | null;
      unit_cost: string | null;
      classification: "inventory" | "consumable" | "service" | "direct_expense" | "adjustment" | "unknown";
      match_decision: "unresolved" | "existing" | "new" | null;
      selected_part_id: string | null;
      selected_part_name: string | null;
      proposed_new_part: InvoiceConfirmationSummary["lines"][number]["resolution"] extends {
        kind: "new";
        proposedPart: infer T;
      }
        ? T
        : never;
    }>(
      await tx.execute(sql`
        select line.id as line_id, line.description, line.vendor_part_number,
               line.quantity::text, line.unit_cost::text, line.classification,
               match.decision as match_decision, match.selected_part_id,
               part.name as selected_part_name, match.proposed_new_part
        from invoice_review_lines line
        left join invoice_line_matches match
          on match.company_id = line.company_id and match.line_id = line.id
        left join inventory_parts part
          on part.company_id = line.company_id and part.id = match.selected_part_id
        where line.company_id = ${companyId} and line.draft_id = ${draftId}::uuid
        order by line.position, line.id
      `),
    );
    if (!lineRows.length) throw new InvoiceDomainError("INVOICE_REVIEW_INCOMPLETE");
    const lines: InvoiceConfirmationSummary["lines"] = lineRows.map(
      (line, index) => {
        if (
          !line.description ||
          !line.quantity ||
          !line.unit_cost ||
          line.classification === "unknown"
        ) {
          throw new InvoiceDomainError("INVOICE_REVIEW_INCOMPLETE");
        }
        const common = {
          lineId: line.line_id,
          description: line.description,
          partNumber: line.vendor_part_number ?? "",
          itemType: line.classification,
          quantity: line.quantity,
          unitCost: line.unit_cost,
          lineTotal: centsToDecimal(
            lineExtensionCents(line.quantity, line.unit_cost, `lines.${index}`),
          ),
        };
        if (line.classification === "adjustment") {
          return {
            ...common,
            resolution: {
              kind: "adjustment" as const,
              adjustmentType: new Decimal(common.lineTotal).isNegative()
                ? ("credit" as const)
                : ("charge" as const),
            },
          };
        }
        if (line.classification === "service") {
          return {
            ...common,
            resolution: { kind: "service" as const },
          };
        }
        if (line.classification === "direct_expense") {
          return {
            ...common,
            resolution: { kind: "direct_expense" as const },
          };
        }
        if (
          line.match_decision === "existing" &&
          line.selected_part_id &&
          line.selected_part_name
        ) {
          return {
            ...common,
            resolution: {
              kind: "existing" as const,
              partId: line.selected_part_id,
              partName: line.selected_part_name,
            },
          };
        }
        if (line.match_decision === "new" && line.proposed_new_part) {
          return {
            ...common,
            resolution: {
              kind: "new" as const,
              proposedPart: line.proposed_new_part,
            },
          };
        }
        throw new InvoiceDomainError("INVOICE_REVIEW_INCOMPLETE");
      },
    );
    return {
      vendor: header.vendorName,
      invoiceNumber: header.invoiceNumber,
      invoiceDate: header.invoiceDate,
      currency: "USD",
      subtotal: headerRow.calculated_subtotal,
      tax: headerRow.calculated_tax,
      freight: headerRow.calculated_freight,
      total: headerRow.calculated_total,
      lines,
      newPartCount: lines.filter((line) => line.resolution.kind === "new").length,
      stockUnitDelta: stockUnitDelta(lines),
    };
  }

  async create(
    actor: InvoiceActorContext,
    draftId: string,
    expectedRevision: number,
    idempotencyKey: string,
    requestId?: string,
  ): Promise<InvoiceConfirmationIntentDto> {
    try {
      return await this.database.transaction(async (tx) => {
      const replay = await this.findByKey(
        tx,
        actor.effectiveCompanyId,
        idempotencyKey,
      );
      if (replay) {
        if (
          replay.draft_id !== draftId ||
          replay.draft_revision !== expectedRevision
        ) {
          throw new InvoiceDomainError("INVOICE_IDEMPOTENCY_CONFLICT");
        }
        return intentDto(replay);
      }
      const active = rows<{ id: string }>(
        await tx.execute(sql`
          select id from invoice_confirmation_intents
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid and status = 'reserved'
          for update
        `),
      )[0];
      if (active) throw new InvoiceDomainError("INVOICE_IDEMPOTENCY_CONFLICT");
      const summary = await this.buildSummary(
        tx,
        actor.effectiveCompanyId,
        draftId,
        expectedRevision,
      );
      const duplicateSignals: InvoiceConfirmationIntentDto["duplicateSignals"] = [];
      const fingerprints = rows<{ fingerprint_sha256: string }>(
        await tx.execute(sql`
          select fingerprint_sha256 from invoice_documents
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
        `),
      ).map((row) => row.fingerprint_sha256);
      if (fingerprints.length) {
        const duplicate = rows<{ intake_id: string }>(
          await tx.execute(sql`
            select distinct intent.intake_id
            from invoice_confirmation_intents intent
            join invoice_documents document
              on document.company_id = intent.company_id
             and document.draft_id = intent.draft_id
            where intent.company_id = ${actor.effectiveCompanyId}
              and intent.status = 'completed' and intent.intake_id is not null
              and document.fingerprint_sha256 in (
                ${sql.join(fingerprints.map((value) => sql`${value}`), sql`, `)}
              )
            limit 1
          `),
        )[0];
        if (duplicate) {
          duplicateSignals.push({
            kind: "source_fingerprint",
            intakeId: duplicate.intake_id,
          });
        }
      }
      const identity = normalizedInvoiceIdentity(
        summary.vendor,
        summary.invoiceNumber,
      );
      if (identity) {
        const completed = rows<{
          intake_id: string;
          canonical_payload: { summary?: { vendor?: string; invoiceNumber?: string | null } };
        }>(
          await tx.execute(sql`
            select intake_id, canonical_payload
            from invoice_confirmation_intents
            where company_id = ${actor.effectiveCompanyId}
              and status = 'completed' and intake_id is not null
          `),
        );
        const duplicate = completed.find(
          (candidate) =>
            normalizedInvoiceIdentity(
              candidate.canonical_payload.summary?.vendor ?? "",
              candidate.canonical_payload.summary?.invoiceNumber ?? null,
            ) === identity,
        );
        if (
          duplicate &&
          !duplicateSignals.some(
            (signal) => signal.intakeId === duplicate.intake_id,
          )
        ) {
          duplicateSignals.push({
            kind: "supplier_invoice_number",
            intakeId: duplicate.intake_id,
          });
        }
      }
      const canonicalPayload = {
        draftId,
        draftRevision: expectedRevision,
        summary,
        duplicateSignals,
        duplicateOverrideReason: null,
      };
      const created = rows<IntentRow>(
        await tx.execute(sql`
          insert into invoice_confirmation_intents (
            company_id, draft_id, draft_revision, idempotency_key,
            payload_hash, canonical_payload, duplicate_status,
            duplicate_signals, created_by_company_id, created_by_user_id
          ) values (
            ${actor.effectiveCompanyId}, ${draftId}::uuid, ${expectedRevision},
            ${idempotencyKey}, ${canonicalPayloadHash(canonicalPayload)},
            ${JSON.stringify(canonicalPayload)}::jsonb,
            ${duplicateSignals.length ? "suspected" : "clear"},
            ${JSON.stringify(duplicateSignals)}::jsonb,
            ${actor.actorCompanyId}, ${actor.actorUserId}
          )
          returning id, draft_id, draft_revision, idempotency_key, payload_hash,
                    canonical_payload, status, duplicate_status, duplicate_signals,
                    override_reason, intake_id, created_at
        `),
      )[0];
      await tx.execute(sql`
        update invoice_review_drafts
        set status = 'confirming', updated_at = now(), last_activity_at = now(),
            updated_by_company_id = ${actor.actorCompanyId},
            updated_by_user_id = ${actor.actorUserId}
        where company_id = ${actor.effectiveCompanyId}
          and id = ${draftId}::uuid and revision = ${expectedRevision}
          and status = 'needs_review'
      `);
      await tx.execute(sql`
        insert into invoice_audit_events (
          company_id, actor_user_id, actor_company_id, action, target_type,
          target_id, correlation_id, request_id, metadata
        ) values (
          ${actor.effectiveCompanyId}, ${actor.actorUserId}, ${actor.actorCompanyId},
          'confirmation.intent_reserved', 'confirmation_intent', ${created.id}::uuid,
          ${randomUUID()}::uuid, ${requestId ?? null}::uuid,
          ${JSON.stringify({
            draftId,
            duplicateStatus: created.duplicate_status,
            payloadHash: created.payload_hash,
          })}::jsonb
        )
      `);
        return intentDto(created);
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        const replay = await this.findByKey(
          this.database,
          actor.effectiveCompanyId,
          idempotencyKey,
        );
        if (
          replay &&
          replay.draft_id === draftId &&
          replay.draft_revision === expectedRevision
        ) {
          return intentDto(replay);
        }
        throw new InvoiceDomainError("INVOICE_IDEMPOTENCY_CONFLICT");
      }
      throw error;
    }
  }

  async overrideDuplicate(
    actor: InvoiceActorContext,
    draftId: string,
    intentId: string,
    reason: string,
    requestId?: string,
  ): Promise<InvoiceConfirmationIntentDto> {
    return this.database.transaction(async (tx) => {
      const row = rows<IntentRow>(
        await tx.execute(sql`
          select id, draft_id, draft_revision, idempotency_key, payload_hash,
                 canonical_payload, status, duplicate_status, duplicate_signals,
                 override_reason, intake_id, created_at
          from invoice_confirmation_intents
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid and id = ${intentId}::uuid
          for update
        `),
      )[0];
      if (!row) throw new InvoiceDomainError("INVOICE_CONFIRMATION_NOT_FOUND");
      if (row.status !== "reserved" || row.duplicate_status !== "suspected") {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const canonicalPayload = {
        ...row.canonical_payload,
        duplicateOverrideReason: reason,
      };
      const updated = rows<IntentRow>(
        await tx.execute(sql`
          update invoice_confirmation_intents
          set duplicate_status = 'overridden', override_reason = ${reason},
              override_by_company_id = ${actor.actorCompanyId},
              override_by_user_id = ${actor.actorUserId},
              canonical_payload = ${JSON.stringify(canonicalPayload)}::jsonb,
              payload_hash = ${canonicalPayloadHash(canonicalPayload)},
              revision = revision + 1
          where company_id = ${actor.effectiveCompanyId} and id = ${intentId}::uuid
          returning id, draft_id, draft_revision, idempotency_key, payload_hash,
                    canonical_payload, status, duplicate_status, duplicate_signals,
                    override_reason, intake_id, created_at
        `),
      )[0];
      await tx.execute(sql`
        insert into invoice_audit_events (
          company_id, actor_user_id, actor_company_id, action, target_type,
          target_id, correlation_id, request_id, metadata
        ) values (
          ${actor.effectiveCompanyId}, ${actor.actorUserId}, ${actor.actorCompanyId},
          'confirmation.duplicate_overridden', 'confirmation_intent',
          ${intentId}::uuid, ${randomUUID()}::uuid, ${requestId ?? null}::uuid,
          ${JSON.stringify({ reason })}::jsonb
        )
      `);
      return intentDto(updated);
    });
  }

  async confirm(
    actor: InvoiceActorContext,
    draftId: string,
    intentId: string,
    idempotencyKey: string,
    requestId?: string,
  ): Promise<InvoiceConfirmationIntentDto> {
    return this.database.transaction(async (tx) => {
      const intent = rows<IntentRow>(
        await tx.execute(sql`
          select id, draft_id, draft_revision, idempotency_key, payload_hash,
                 canonical_payload, status, duplicate_status, duplicate_signals,
                 override_reason, intake_id, created_at
          from invoice_confirmation_intents
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid and id = ${intentId}::uuid
          for update
        `),
      )[0];
      if (!intent) throw new InvoiceDomainError("INVOICE_CONFIRMATION_NOT_FOUND");
      if (intent.idempotency_key !== idempotencyKey) {
        throw new InvoiceDomainError("INVOICE_IDEMPOTENCY_CONFLICT");
      }
      if (intent.status === "completed") return intentDto(intent);
      if (intent.status !== "reserved") {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const feature = rows<{ enabled: boolean }>(
        await tx.execute(sql`
          select enabled from company_invoice_feature_flags
          where company_id = ${actor.effectiveCompanyId}
            and capability = 'stock_confirmation'
          for update
        `),
      )[0];
      if (!feature?.enabled) {
        throw new InvoiceDomainError("INVOICE_CONFIRMATION_DISABLED");
      }
      if (intent.duplicate_status === "suspected") {
        throw new InvoiceDomainError("INVOICE_DUPLICATE_SUSPECTED");
      }
      const summary = await this.buildSummary(
        tx,
        actor.effectiveCompanyId,
        draftId,
        intent.draft_revision,
      );
      const canonicalPayload = {
        draftId,
        draftRevision: intent.draft_revision,
        summary,
        duplicateSignals: intent.duplicate_signals,
        duplicateOverrideReason: intent.override_reason,
      };
      if (canonicalPayloadHash(canonicalPayload) !== intent.payload_hash) {
        throw new InvoiceDomainError("INVOICE_CONFIRMATION_CONFLICT");
      }
      const identity = normalizedInvoiceIdentity(
        summary.vendor,
        summary.invoiceNumber,
      );
      const completed = rows<{
        intake_id: string;
        canonical_payload: { summary?: { vendor?: string; invoiceNumber?: string | null } };
      }>(
        await tx.execute(sql`
          select intake_id, canonical_payload
          from invoice_confirmation_intents
          where company_id = ${actor.effectiveCompanyId}
            and status = 'completed' and intake_id is not null
            and id <> ${intentId}::uuid
        `),
      );
      const identityDuplicate =
        identity === null
          ? null
          : completed.find(
              (candidate) =>
                normalizedInvoiceIdentity(
                  candidate.canonical_payload.summary?.vendor ?? "",
                  candidate.canonical_payload.summary?.invoiceNumber ?? null,
                ) === identity,
            );
      const fingerprints = rows<{ fingerprint_sha256: string }>(
        await tx.execute(sql`
          select fingerprint_sha256 from invoice_documents
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
        `),
      ).map((row) => row.fingerprint_sha256);
      const fingerprintDuplicate =
        fingerprints.length === 0
          ? null
          : rows<{ intake_id: string }>(
              await tx.execute(sql`
                select distinct completed_intent.intake_id
                from invoice_confirmation_intents completed_intent
                join invoice_documents document
                  on document.company_id = completed_intent.company_id
                 and document.draft_id = completed_intent.draft_id
                where completed_intent.company_id = ${actor.effectiveCompanyId}
                  and completed_intent.status = 'completed'
                  and completed_intent.intake_id is not null
                  and completed_intent.id <> ${intentId}::uuid
                  and document.fingerprint_sha256 in (
                    ${sql.join(fingerprints.map((value) => sql`${value}`), sql`, `)}
                  )
                limit 1
              `),
            )[0];
      if (
        (identityDuplicate || fingerprintDuplicate) &&
        intent.duplicate_status !== "overridden"
      ) {
        const duplicateSignals: InvoiceConfirmationIntentDto["duplicateSignals"] = [];
        if (fingerprintDuplicate) {
          duplicateSignals.push({
            kind: "source_fingerprint",
            intakeId: fingerprintDuplicate.intake_id,
          });
        }
        if (
          identityDuplicate &&
          !duplicateSignals.some(
            (signal) => signal.intakeId === identityDuplicate.intake_id,
          )
        ) {
          duplicateSignals.push({
            kind: "supplier_invoice_number",
            intakeId: identityDuplicate.intake_id,
          });
        }
        const duplicatePayload = {
          draftId,
          draftRevision: intent.draft_revision,
          summary,
          duplicateSignals,
          duplicateOverrideReason: null,
        };
        const suspected = rows<IntentRow>(
          await tx.execute(sql`
            update invoice_confirmation_intents
            set duplicate_status = 'suspected',
                duplicate_signals = ${JSON.stringify(duplicateSignals)}::jsonb,
                canonical_payload = ${JSON.stringify(duplicatePayload)}::jsonb,
                payload_hash = ${canonicalPayloadHash(duplicatePayload)},
                revision = revision + 1
            where company_id = ${actor.effectiveCompanyId}
              and id = ${intentId}::uuid and status = 'reserved'
            returning id, draft_id, draft_revision, idempotency_key, payload_hash,
                      canonical_payload, status, duplicate_status, duplicate_signals,
                      override_reason, intake_id, created_at
          `),
        )[0];
        return intentDto(suspected);
      }
      const existingPartIds = summary.lines
        .filter((line) => line.resolution.kind === "existing")
        .map((line) =>
          line.resolution.kind === "existing" ? line.resolution.partId : "",
        );
      const existingParts = existingPartIds.length
        ? rows<{ id: string; name: string; part_number: string }>(
            await tx.execute(sql`
              select id, name, part_number from inventory_parts
              where company_id = ${actor.effectiveCompanyId}
                and id in (
                  ${sql.join(existingPartIds.map((id) => sql`${id}`), sql`, `)}
                )
              for update
            `),
          )
        : [];
      if (existingParts.length !== new Set(existingPartIds).size) {
        throw new InvoiceDomainError("INVOICE_CONFIRMATION_CONFLICT");
      }
      const partById = new Map(existingParts.map((part) => [part.id, part]));
      for (const line of summary.lines) {
        if (
          line.resolution.kind === "adjustment" ||
          line.resolution.kind === "service" ||
          line.resolution.kind === "direct_expense"
        ) continue;
        const quantity = new Decimal(line.quantity);
        if (
          !quantity.isInteger() ||
          quantity.lessThan(1) ||
          quantity.greaterThan(2_147_483_647)
        ) {
          throw new InvoiceDomainError("INVOICE_CONFIRMATION_CONFLICT", {
            reason: "stock_quantity_must_be_integer",
            lineId: line.lineId,
          });
        }
        if (line.resolution.kind !== "new") continue;
        const proposal = line.resolution.proposedPart;
        const duplicate = rows<{ id: string }>(
          await tx.execute(sql`
            select id from inventory_parts
            where company_id = ${actor.effectiveCompanyId}
              and (
                lower(regexp_replace(part_number, '[^a-zA-Z0-9]', '', 'g')) =
                  ${proposal.partNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}
                or lower(trim(name)) = ${proposal.name.trim().toLowerCase()}
              )
            limit 1
          `),
        )[0];
        if (duplicate) {
          throw new InvoiceDomainError("INVOICE_CONFIRMATION_CONFLICT", {
            reason: "new_part_duplicate",
            partId: duplicate.id,
          });
        }
      }
      const command: InventoryReceivingCommand = {
        header: {
          vendor: summary.vendor,
          invoiceNumber: summary.invoiceNumber,
          invoiceDate: new Date(summary.invoiceDate!),
          subtotal: summary.subtotal,
          taxAmount: summary.tax,
          deliveryFee: summary.freight,
          totalAmount: summary.total,
          reconciliationStatus: "matched",
          notes: `Confirmed from invoice review ${draftId}`,
          quickbooksSyncStatus: "not_synced",
          quickbooksId: null,
          quickbooksLastSyncedAt: null,
          externalReferenceNumber: summary.invoiceNumber,
          invoicePhotoUrl: null,
        },
        landedAdjustmentAmount: summary.lines
          .filter((line) => line.resolution.kind === "adjustment")
          .reduce((sum, line) => sum.add(line.lineTotal), new Decimal(0))
          .toFixed(2),
        items: summary.lines
          .filter((line) => line.resolution.kind !== "adjustment")
          .map((line) => {
          if (
            line.resolution.kind === "service" ||
            line.resolution.kind === "direct_expense"
          ) {
            return {
              partId: undefined,
              partNameSnapshot: line.description,
              partNumberSnapshot: line.partNumber,
              itemType: line.resolution.kind,
              qty: Number(line.quantity),
              unitCost: line.unitCost,
              lineTotal: line.lineTotal,
            };
          }
          const existing =
            line.resolution.kind === "existing"
              ? partById.get(line.resolution.partId)
              : null;
          const proposed =
            line.resolution.kind === "new"
              ? line.resolution.proposedPart
              : null;
          return {
            partId: existing?.id,
            partNameSnapshot: existing?.name ?? proposed!.name,
            partNumberSnapshot: existing?.part_number ?? proposed!.partNumber,
            itemType: existing
              ? line.itemType === "consumable"
                ? "consumable"
                : "inventory"
              : proposed!.itemType,
            category: proposed?.category ?? undefined,
            groupId: proposed?.groupId ?? undefined,
            subgroupId: proposed?.subgroupId ?? undefined,
            qty: Number(line.quantity),
            unitCost: line.unitCost,
            lineTotal: line.lineTotal,
          };
          }),
      };
      const intake = await receiveInventoryWithinTransaction(
        tx,
        command,
        {
          companyId: actor.effectiveCompanyId,
          userId: actor.actorUserId,
        },
      );
      const receivedLines = rows<{
        part_id: string;
        part_name_snapshot: string;
        part_number_snapshot: string;
      }>(
        await tx.execute(sql`
          select part_id, part_name_snapshot, part_number_snapshot
          from inventory_intake_items
          where company_id = ${actor.effectiveCompanyId}
            and inventory_intake_id = ${intake.id}
            and part_id is not null
        `),
      );
      for (const received of receivedLines) {
        await tx.execute(sql`
          insert into invoice_part_aliases (
            company_id, part_id, vendor_name_normalized,
            vendor_part_number_normalized, description_normalized
          ) values (
            ${actor.effectiveCompanyId}, ${received.part_id},
            ${summary.vendor.trim().toLowerCase()},
            ${received.part_number_snapshot.trim().toLowerCase()},
            ${received.part_name_snapshot.trim().toLowerCase()}
          )
          on conflict do nothing
        `);
      }
      const feedbackContext = rows<{
        proposal: unknown;
        final_values: unknown;
        run_id: string;
        engine_version: string;
      }>(
        await tx.execute(sql`
          select proposal.payload as proposal, header.final_values,
                 run.id as run_id, run.engine_version
          from invoice_review_headers header
          join invoice_extraction_proposals proposal
            on proposal.company_id = header.company_id
           and proposal.id = header.proposal_id
          join invoice_extraction_runs run
            on run.company_id = proposal.company_id and run.id = proposal.run_id
          where header.company_id = ${actor.effectiveCompanyId}
            and header.draft_id = ${draftId}::uuid
        `),
      )[0];
      const proposal = invoiceProposalSchema.parse(feedbackContext.proposal);
      const finalHeader = invoiceFinalHeaderSchema.parse(
        feedbackContext.final_values,
      );
      const supplierNormalized = summary.vendor.trim().toLowerCase();
      const headerFields = [
        "vendorName",
        "invoiceNumber",
        "invoiceDate",
        "currency",
        "subtotal",
        "tax",
        "freight",
        "total",
      ] as const;
      for (const field of headerFields) {
        const proposed =
          proposal.header[field].normalized ?? proposal.header[field].observed;
        const finalValue = finalHeader[field];
        const feedback = classifyHeaderFeedback(field, proposed, finalValue);
        await tx.execute(sql`
          insert into invoice_feedback_events (
            company_id, draft_id, run_id, engine_version, subject_type,
            subject_path, decision, proposal, final_value, reason,
            supplier_normalized, actor_company_id, actor_user_id
          ) values (
            ${actor.effectiveCompanyId}, ${draftId}::uuid,
            ${feedbackContext.run_id}::uuid, ${feedbackContext.engine_version},
            'header', ${`header.${field}`},
            ${feedback.decision},
            ${JSON.stringify(proposed)}::jsonb, ${JSON.stringify(finalValue)}::jsonb,
            ${feedback.reason},
            ${supplierNormalized}, ${actor.actorCompanyId}, ${actor.actorUserId}
          )
        `);
      }
      const feedbackLines = rows<{
        id: string;
        source_line_index: number | null;
        description: string | null;
        vendor_part_number: string | null;
        quantity: string | null;
        unit_cost: string | null;
        classification: string;
        original_suggestion: unknown;
        decision: "unresolved" | "existing" | "new";
        selected_part_id: string | null;
        proposed_new_part: unknown;
      }>(
        await tx.execute(sql`
          select line.id, line.source_line_index, line.description,
                 line.vendor_part_number, line.quantity::text, line.unit_cost::text,
                 line.classification, match.original_suggestion, match.decision,
                 match.selected_part_id, match.proposed_new_part
          from invoice_review_lines line
          join invoice_line_matches match
            on match.company_id = line.company_id and match.line_id = line.id
          where line.company_id = ${actor.effectiveCompanyId}
            and line.draft_id = ${draftId}::uuid
          order by line.position
        `),
      );
      for (const line of feedbackLines) {
        const proposedLine =
          line.source_line_index === null
            ? null
            : proposal.lines[line.source_line_index] ?? null;
        const finalLine = {
          description: line.description,
          vendorPartNumber: line.vendor_part_number,
          quantity: line.quantity,
          unitCost: line.unit_cost,
          classification: line.classification,
        };
        const normalizedProposal =
          proposedLine === null
            ? null
            : {
                description:
                  proposedLine.description.normalized ??
                  proposedLine.description.observed,
                vendorPartNumber:
                  proposedLine.vendorPartNumber.normalized ??
                  proposedLine.vendorPartNumber.observed,
                quantity:
                  proposedLine.quantity.normalized ??
                  proposedLine.quantity.observed,
                unitCost:
                  proposedLine.unitCost.normalized ??
                  proposedLine.unitCost.observed,
                classification: proposedLine.classification?.kind ?? null,
              };
        const suggestedPartId =
          line.original_suggestion &&
          typeof line.original_suggestion === "object" &&
          "partId" in line.original_suggestion
            ? String(line.original_suggestion.partId)
            : null;
        const lineFields = [
          "description",
          "vendorPartNumber",
          "quantity",
          "unitCost",
          "classification",
        ] as const;
        for (const field of lineFields) {
          const proposedValue = normalizedProposal?.[field] ?? null;
          const finalValue = finalLine[field];
          const classificationAutomaticallyEnriched =
            field === "classification" &&
            (proposedValue === null || proposedValue === "unknown") &&
            finalValue !== "unknown" &&
            (line.classification === "adjustment" ||
              (line.decision === "existing" &&
                suggestedPartId === line.selected_part_id));
          const feedback = classifyLineFieldFeedback(
            field,
            proposedValue,
            finalValue,
            classificationAutomaticallyEnriched,
          );
          await tx.execute(sql`
            insert into invoice_feedback_events (
              company_id, draft_id, run_id, engine_version, subject_type,
              subject_path, decision, proposal, final_value, reason,
              supplier_normalized, actor_company_id, actor_user_id
            ) values (
              ${actor.effectiveCompanyId}, ${draftId}::uuid,
              ${feedbackContext.run_id}::uuid, ${feedbackContext.engine_version},
              'line', ${`lines.${line.id}.${field}`},
              ${feedback.decision},
              ${JSON.stringify(proposedValue)}::jsonb,
              ${JSON.stringify(finalValue)}::jsonb,
              ${feedback.reason},
              ${supplierNormalized}, ${actor.actorCompanyId}, ${actor.actorUserId}
            )
          `);
        }
        if (
          line.classification === "adjustment" ||
          line.classification === "service" ||
          line.classification === "direct_expense"
        ) continue;
        const finalMatch =
          line.decision === "existing"
            ? { kind: "existing", partId: line.selected_part_id }
            : { kind: "new", proposedPart: line.proposed_new_part };
        await tx.execute(sql`
          insert into invoice_feedback_events (
            company_id, draft_id, run_id, engine_version, subject_type,
            subject_path, decision, proposal, final_value,
            supplier_normalized, actor_company_id, actor_user_id
          ) values (
            ${actor.effectiveCompanyId}, ${draftId}::uuid,
            ${feedbackContext.run_id}::uuid, ${feedbackContext.engine_version},
            'match', ${`matches.${line.id}`},
            ${line.decision === "existing" &&
              suggestedPartId === line.selected_part_id
              ? "accepted"
              : line.decision === "new"
                ? "added"
                : "corrected"},
            ${JSON.stringify(line.original_suggestion)}::jsonb,
            ${JSON.stringify(finalMatch)}::jsonb,
            ${supplierNormalized}, ${actor.actorCompanyId}, ${actor.actorUserId}
          )
        `);
      }
      await tx.execute(sql`
        insert into invoice_feedback_events (
          company_id, draft_id, run_id, engine_version, subject_type,
          subject_path, decision, final_value, supplier_normalized,
          actor_company_id, actor_user_id
        ) values (
          ${actor.effectiveCompanyId}, ${draftId}::uuid,
          ${feedbackContext.run_id}::uuid, ${feedbackContext.engine_version},
          'document', 'document', 'confirmed',
          ${JSON.stringify({ intakeId: intake.id })}::jsonb,
          ${supplierNormalized}, ${actor.actorCompanyId}, ${actor.actorUserId}
        )
      `);
      const completedIntent = rows<IntentRow>(
        await tx.execute(sql`
          update invoice_confirmation_intents
          set status = 'completed', intake_id = ${intake.id},
              completed_at = now(), revision = revision + 1
          where company_id = ${actor.effectiveCompanyId}
            and id = ${intentId}::uuid and status = 'reserved'
          returning id, draft_id, draft_revision, idempotency_key, payload_hash,
                    canonical_payload, status, duplicate_status, duplicate_signals,
                    override_reason, intake_id, created_at
        `),
      )[0];
      if (!completedIntent) {
        throw new InvoiceDomainError("INVOICE_IDEMPOTENCY_CONFLICT");
      }
      await tx.execute(sql`
        update invoice_review_drafts
        set status = 'confirmed', revision = revision + 1,
            retention_deadline =
              now() + (${loadInvoiceConfig().confirmedRetentionDays} * interval '1 day'),
            updated_by_company_id = ${actor.actorCompanyId},
            updated_by_user_id = ${actor.actorUserId},
            updated_at = now(), last_activity_at = now()
        where company_id = ${actor.effectiveCompanyId}
          and id = ${draftId}::uuid and status = 'confirming'
          and revision = ${intent.draft_revision}
      `);
      await tx.execute(sql`
        insert into invoice_audit_events (
          company_id, actor_user_id, actor_company_id, action, target_type,
          target_id, correlation_id, request_id, metadata
        ) values (
          ${actor.effectiveCompanyId}, ${actor.actorUserId}, ${actor.actorCompanyId},
          'confirmation.completed', 'confirmation_intent', ${intentId}::uuid,
          ${randomUUID()}::uuid, ${requestId ?? null}::uuid,
          ${JSON.stringify({
            draftId,
            intakeId: intake.id,
            payloadHash: intent.payload_hash,
          })}::jsonb
        )
      `);
      return intentDto(completedIntent);
    });
  }
}
