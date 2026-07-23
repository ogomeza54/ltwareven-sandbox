import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  InvoiceDomainError,
  invoiceProposalSchema,
  type InvoiceActorContext,
  type InvoiceExtractionRunDto,
  type InvoiceFinalHeader,
  type InvoiceProposal,
} from "@shared/invoice-extraction/contracts";
import { db as applicationDatabase } from "../../../db";
import type { InvoiceConfig } from "../config/invoice-config";
import type { InvoiceProviderResult } from "../providers/extraction-provider";
import {
  InvoiceNumericError,
  moneyToCents,
  normalizeQuantity,
  normalizeUnitCost,
} from "../domain/invoice-money";
import { recalculateReviewTotals } from "./invoice-line-review-repository";

type InvoiceDatabase = typeof applicationDatabase;
type RowResult<T> = { rows: T[] };

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as RowResult<T>).rows)
  ) {
    return (result as RowResult<T>).rows;
  }
  return [];
}

interface RunViewRow {
  id: string;
  draft_id: string;
  run_number: number;
  status: InvoiceExtractionRunDto["status"];
  revision: number;
  attempt_status: InvoiceExtractionRunDto["attemptStatus"];
  failure_code: string | null;
  engine_version: string;
  model: string;
  schema_version: string;
  execution_mode: InvoiceExtractionRunDto["executionMode"];
  store_response: boolean;
  payload: unknown | null;
  created_at: Date | string;
  completed_at: Date | string | null;
}

export interface ClaimedExtractionAttempt {
  id: string;
  companyId: string;
  runId: string;
  draftId: string;
  status: "processing" | "submitted";
  leaseToken: string;
  providerResponseId: string | null;
  model: string;
  executionMode: "background" | "synchronous";
  storeResponse: boolean;
}

export interface ExtractionSourceRecord {
  id: string;
  objectKey: string;
  detectedType: string;
  displayName: string;
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function runDto(row: RunViewRow): InvoiceExtractionRunDto {
  return {
    id: row.id,
    draftId: row.draft_id,
    runNumber: Number(row.run_number),
    status: row.status,
    revision: row.revision,
    attemptStatus: row.attempt_status,
    failureCode: row.failure_code,
    engineVersion: row.engine_version,
    model: row.model,
    schemaVersion: row.schema_version,
    executionMode: row.execution_mode,
    storeResponse: row.store_response,
    proposal: row.payload ? invoiceProposalSchema.parse(row.payload) : null,
    createdAt: iso(row.created_at),
    completedAt: row.completed_at ? iso(row.completed_at) : null,
  };
}

export class PostgresInvoiceExtractionRepository {
  constructor(private readonly database: InvoiceDatabase = applicationDatabase) {}

  async start(
    actor: InvoiceActorContext,
    draftId: string,
    expectedRevision: number,
    requestId: string | undefined,
    config: InvoiceConfig,
  ): Promise<InvoiceExtractionRunDto> {
    const runId = await this.database.transaction(async (tx) => {
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
      if (draft.status !== "uploaded") {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const source = rows<{ count: string; pending: boolean }>(
        await tx.execute(sql`
          select count(*)::text as count,
                 bool_or(delete_requested_at is not null) as pending
          from invoice_source_assets
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
            and lifecycle = 'attached'
        `),
      )[0];
      if (!source || Number(source.count) === 0) {
        throw new InvoiceDomainError("INVOICE_SOURCE_REQUIRED");
      }
      if (source.pending) throw new InvoiceDomainError("INVOICE_INVALID_STATE");

      const number = rows<{ value: number | string }>(
        await tx.execute(sql`
          select coalesce(max(run_number), 0) + 1 as value
          from invoice_extraction_runs
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
        `),
      )[0];
      const activeEngine = rows<{
        version: string;
        model: string;
        schema_version: string;
        provider_config: Record<string, unknown>;
      }>(await tx.execute(sql`
        select engine.version, engine.model, engine.schema_version,
               engine.provider_config
        from invoice_engine_activations activation
        join invoice_engine_versions engine
          on engine.version = activation.engine_version
        where activation.company_id = ${actor.effectiveCompanyId}
          and activation.capability = 'scan_extraction'
        limit 1
      `))[0];
      const correlationId = randomUUID();
      const created = rows<{ id: string }>(
        await tx.execute(sql`
          insert into invoice_extraction_runs (
            company_id, draft_id, run_number, base_draft_revision,
            requested_by_company_id, requested_by_user_id, correlation_id,
            engine_version, model, schema_version, execution_mode,
            store_response, provider_config
          ) values (
            ${actor.effectiveCompanyId}, ${draftId}::uuid, ${Number(number.value)},
            ${expectedRevision}, ${actor.actorCompanyId}, ${actor.actorUserId},
            ${correlationId}::uuid, ${activeEngine?.version ?? config.engineVersion},
            ${activeEngine?.model ?? config.openaiModel},
            ${activeEngine?.schema_version ?? config.proposalSchemaVersion},
            ${config.executionMode}, ${config.storeResponse},
            ${JSON.stringify({
              sdk: "openai",
              sdkVersion: "6.48.0",
              ...(activeEngine?.provider_config ?? {}),
            })}::jsonb
          )
          returning id
        `),
      )[0];
      await tx.execute(sql`
        insert into invoice_provider_attempts (
          company_id, run_id, ordinal, provider
        ) values (${actor.effectiveCompanyId}, ${created.id}::uuid, 1, 'openai')
      `);
      await tx.execute(sql`
        update invoice_review_drafts
        set active_run_id = ${created.id}::uuid,
            revision = revision + 1,
            updated_by_company_id = ${actor.actorCompanyId},
            updated_by_user_id = ${actor.actorUserId},
            updated_at = now(), last_activity_at = now()
        where company_id = ${actor.effectiveCompanyId}
          and id = ${draftId}::uuid
      `);
      await tx.execute(sql`
        insert into invoice_audit_events (
          company_id, actor_user_id, actor_company_id, action,
          target_type, target_id, correlation_id, request_id, metadata
        ) values (
          ${actor.effectiveCompanyId}, ${actor.actorUserId}, ${actor.actorCompanyId},
          'extraction.started', 'run', ${created.id}::uuid, ${correlationId}::uuid,
          ${requestId ?? null}::uuid,
          ${JSON.stringify({ runNumber: Number(number.value) })}::jsonb
        )
      `);
      return created.id;
    });
    const createdRun = await this.get(actor, runId);
    if (!createdRun) throw new InvoiceDomainError("INVOICE_RUN_NOT_FOUND");
    return createdRun;
  }

  async get(
    actor: InvoiceActorContext,
    runId: string,
  ): Promise<InvoiceExtractionRunDto | null> {
    const result = await this.database.execute(sql`
      select run.id, run.draft_id, run.run_number, run.status, run.revision,
             attempt.status as attempt_status, run.failure_code,
             run.engine_version, run.model, run.schema_version,
             run.execution_mode, run.store_response, proposal.payload,
             run.created_at, run.completed_at
      from invoice_extraction_runs run
      left join lateral (
        select status from invoice_provider_attempts
        where company_id = run.company_id and run_id = run.id
        order by ordinal desc limit 1
      ) attempt on true
      left join invoice_extraction_proposals proposal
        on proposal.company_id = run.company_id and proposal.run_id = run.id
      where run.company_id = ${actor.effectiveCompanyId}
        and run.id = ${runId}::uuid
      limit 1
    `);
    const row = rows<RunViewRow>(result)[0];
    return row ? runDto(row) : null;
  }

  async claimNext(
    workerId: string,
    leaseSeconds: number,
  ): Promise<ClaimedExtractionAttempt | null> {
    const leaseToken = randomUUID();
    const result = await this.database.execute(sql`
      with eligible as (
        select attempt.id
        from invoice_provider_attempts attempt
        join invoice_extraction_runs run
          on run.company_id = attempt.company_id and run.id = attempt.run_id
        where attempt.status in ('queued', 'processing', 'submitted')
          and run.status in ('queued', 'processing')
          and attempt.available_at <= now()
          and (attempt.lease_expires_at is null or attempt.lease_expires_at <= now())
        order by attempt.available_at, attempt.created_at, attempt.id
        for update skip locked
        limit 1
      )
      update invoice_provider_attempts attempt
      set status = case when attempt.status = 'queued'
                        then 'processing'::invoice_attempt_status
                        else attempt.status end,
          revision = attempt.revision + 1,
          lease_owner = ${workerId}, lease_token = ${leaseToken}::uuid,
          lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
          heartbeat_at = now()
      from eligible, invoice_extraction_runs run
      where attempt.id = eligible.id
        and run.company_id = attempt.company_id and run.id = attempt.run_id
      returning attempt.id, attempt.company_id, attempt.run_id,
                run.draft_id, attempt.status, attempt.lease_token,
                attempt.provider_response_id, run.model, run.execution_mode,
                run.store_response
    `);
    const row = rows<{
      id: string; company_id: string; run_id: string; draft_id: string;
      status: "processing" | "submitted"; lease_token: string;
      provider_response_id: string | null; model: string;
      execution_mode: "background" | "synchronous"; store_response: boolean;
    }>(result)[0];
    return row
      ? {
          id: row.id,
          companyId: row.company_id,
          runId: row.run_id,
          draftId: row.draft_id,
          status: row.status,
          leaseToken: row.lease_token,
          providerResponseId: row.provider_response_id,
          model: row.model,
          executionMode: row.execution_mode,
          storeResponse: row.store_response,
        }
      : null;
  }

  async listSources(companyId: string, draftId: string): Promise<ExtractionSourceRecord[]> {
    return rows<{
      id: string; object_key: string; detected_type: string; display_name: string;
    }>(
      await this.database.execute(sql`
        select id, object_key, detected_type, display_name
        from invoice_source_assets
        where company_id = ${companyId} and draft_id = ${draftId}::uuid
          and lifecycle = 'attached' and delete_requested_at is null
        order by position, id
      `),
    ).map((row) => ({
      id: row.id,
      objectKey: row.object_key,
      detectedType: row.detected_type,
      displayName: row.display_name,
    }));
  }

  async markSubmitted(
    attempt: ClaimedExtractionAttempt,
    responseId: string,
    pollSeconds: number,
  ): Promise<void> {
    const result = await this.database.execute(sql`
      update invoice_provider_attempts
      set status = 'submitted', revision = revision + 1,
          provider_response_id = ${responseId},
          available_at = now() + (${pollSeconds} * interval '1 second'),
          lease_owner = null, lease_token = null, lease_expires_at = null,
          heartbeat_at = null
      where company_id = ${attempt.companyId} and id = ${attempt.id}::uuid
        and lease_token = ${attempt.leaseToken}::uuid
        and status in ('processing', 'submitted')
      returning id
    `);
    if (!rows<{ id: string }>(result)[0]) {
      throw new InvoiceDomainError("INVOICE_LEASE_LOST");
    }
    await this.database.execute(sql`
      update invoice_extraction_runs
      set status = 'processing', revision = revision + 1,
          started_at = coalesce(started_at, now())
      where company_id = ${attempt.companyId} and id = ${attempt.runId}::uuid
        and status = 'queued'
    `);
  }

  async settleClaim(
    attempt: ClaimedExtractionAttempt,
    result: Exclude<InvoiceProviderResult, { status: "pending" }>,
  ): Promise<void> {
    await this.settle(attempt.companyId, attempt.id, result, attempt.leaseToken);
  }

  async settleByResponse(
    responseId: string,
    result: Exclude<InvoiceProviderResult, { status: "pending" }>,
  ): Promise<void> {
    const attempt = rows<{ company_id: string; id: string }>(
      await this.database.execute(sql`
        select company_id, id from invoice_provider_attempts
        where provider_response_id = ${responseId}
        limit 1
      `),
    )[0];
    if (!attempt) return;
    await this.settle(attempt.company_id, attempt.id, result);
  }

  private async settle(
    companyId: string,
    attemptId: string,
    result: Exclude<InvoiceProviderResult, { status: "pending" }>,
    leaseToken?: string,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const attempt = rows<{
        id: string; run_id: string; status: string; provider_response_id: string | null;
      }>(
        await tx.execute(sql`
          select id, run_id, status, provider_response_id
          from invoice_provider_attempts
          where company_id = ${companyId} and id = ${attemptId}::uuid
          for update
        `),
      )[0];
      if (!attempt || ["completed", "failed", "canceled"].includes(attempt.status)) return;
      if (leaseToken) {
        const validLease = rows<{ ok: boolean }>(
          await tx.execute(sql`
            select lease_token = ${leaseToken}::uuid
                   and lease_expires_at > now() as ok
            from invoice_provider_attempts
            where company_id = ${companyId} and id = ${attemptId}::uuid
          `),
        )[0];
        if (!validLease?.ok) throw new InvoiceDomainError("INVOICE_LEASE_LOST");
      }
      const run = rows<{
        id: string;
        draft_id: string;
        status: string;
        base_draft_revision: number;
        schema_version: string;
        requested_by_company_id: string;
        requested_by_user_id: string;
      }>(
        await tx.execute(sql`
          select id, draft_id, status, base_draft_revision, schema_version,
                 requested_by_company_id, requested_by_user_id
          from invoice_extraction_runs
          where company_id = ${companyId} and id = ${attempt.run_id}::uuid
          for update
        `),
      )[0];
      if (!run || !["queued", "processing"].includes(run.status)) return;

      if (result.status === "failed") {
        await tx.execute(sql`
          update invoice_provider_attempts
          set status = 'failed', revision = revision + 1,
              provider_response_id = coalesce(provider_response_id, ${result.responseId}),
              failure_code = ${result.failureCode}, completed_at = now(),
              lease_owner = null, lease_token = null, lease_expires_at = null,
              heartbeat_at = null
          where company_id = ${companyId} and id = ${attemptId}::uuid
        `);
        await tx.execute(sql`
          update invoice_extraction_runs
          set status = 'failed', revision = revision + 1,
              failure_code = ${result.failureCode}, completed_at = now()
          where company_id = ${companyId} and id = ${run.id}::uuid
        `);
        return;
      }

      const proposal: InvoiceProposal = invoiceProposalSchema.parse(result.proposal);
      const insertedProposal = rows<{ id: string }>(await tx.execute(sql`
        insert into invoice_extraction_proposals (
          company_id, draft_id, run_id, attempt_id, schema_version, payload
        ) values (
          ${companyId}, ${run.draft_id}::uuid, ${run.id}::uuid,
          ${attemptId}::uuid, ${run.schema_version}, ${JSON.stringify(proposal)}::jsonb
        )
        on conflict (company_id, run_id) do nothing
        returning id
      `))[0];
      const proposalId =
        insertedProposal?.id ??
        rows<{ id: string }>(await tx.execute(sql`
          select id from invoice_extraction_proposals
          where company_id = ${companyId} and run_id = ${run.id}::uuid
        `))[0].id;
      const finalHeader = Object.fromEntries(
        Object.entries(proposal.header).map(([key, value]) => [
          key,
          value.normalized ?? value.observed,
        ]),
      ) as InvoiceFinalHeader;
      await tx.execute(sql`
        insert into invoice_review_headers (
          company_id, draft_id, proposal_id, final_values,
          created_by_company_id, created_by_user_id,
          updated_by_company_id, updated_by_user_id
        ) values (
          ${companyId}, ${run.draft_id}::uuid, ${proposalId}::uuid,
          ${JSON.stringify(finalHeader)}::jsonb,
          ${run.requested_by_company_id}, ${run.requested_by_user_id},
          ${run.requested_by_company_id}, ${run.requested_by_user_id}
        )
        on conflict (company_id, draft_id) do nothing
      `);
      const numericOrNull = (
        value: string | null,
        kind: "quantity" | "unitCost" | "money",
      ): string | null => {
        if (value === null) return null;
        try {
          if (kind === "quantity") return normalizeQuantity(value);
          if (kind === "unitCost") return normalizeUnitCost(value);
          moneyToCents(value, "header");
          return value;
        } catch (error) {
          if (error instanceof InvoiceNumericError) return null;
          throw error;
        }
      };
      for (let index = 0; index < proposal.lines.length; index += 1) {
        const line = proposal.lines[index];
        const description =
          line.description.normalized ?? line.description.observed;
        const vendorPartNumber =
          line.vendorPartNumber.normalized ?? line.vendorPartNumber.observed;
        const quantity = numericOrNull(
          line.quantity.normalized ?? line.quantity.observed,
          "quantity",
        );
        const unitCost = numericOrNull(
          line.unitCost.normalized ?? line.unitCost.observed,
          "unitCost",
        );
        await tx.execute(sql`
          insert into invoice_review_lines (
            company_id, draft_id, proposal_id, source_line_index, position,
            description, vendor_part_number, quantity, unit_cost, classification
          ) values (
            ${companyId}, ${run.draft_id}::uuid, ${proposalId}::uuid,
            ${index}, ${index + 1}, ${description}, ${vendorPartNumber},
            ${quantity}, ${unitCost},
            ${line.classification?.kind ?? "unknown"}
          )
          on conflict (company_id, draft_id, source_line_index) do nothing
        `);
      }
      const reconciliationHeader = {
        ...finalHeader,
        subtotal: numericOrNull(finalHeader.subtotal, "money"),
        tax: numericOrNull(finalHeader.tax, "money"),
        freight: numericOrNull(finalHeader.freight, "money"),
        total: numericOrNull(finalHeader.total, "money"),
      };
      await recalculateReviewTotals(
        tx,
        companyId,
        run.draft_id,
        proposalId,
        {
          actorUserId: run.requested_by_user_id,
          actorCompanyId: run.requested_by_company_id,
          effectiveCompanyId: companyId,
          role: "shop_user",
          isProductAdministrator: false,
        },
        reconciliationHeader,
      );
      await tx.execute(sql`
        update invoice_provider_attempts
        set status = 'completed', revision = revision + 1,
            provider_response_id = coalesce(provider_response_id, ${result.responseId}),
            completed_at = now(), lease_owner = null, lease_token = null,
            lease_expires_at = null, heartbeat_at = null
        where company_id = ${companyId} and id = ${attemptId}::uuid
      `);
      await tx.execute(sql`
        update invoice_extraction_runs
        set status = 'completed', revision = revision + 1,
            completed_at = now(), started_at = coalesce(started_at, now())
        where company_id = ${companyId} and id = ${run.id}::uuid
      `);
      await tx.execute(sql`
        update invoice_review_drafts
        set status = 'needs_review', revision = revision + 1,
            updated_at = now(), last_activity_at = now()
        where company_id = ${companyId} and id = ${run.draft_id}::uuid
          and active_run_id = ${run.id}::uuid
          and revision = ${run.base_draft_revision + 1}
          and status = 'uploaded'
      `);
    });
  }

  async recordWebhook(
    eventId: string,
    eventType: string,
    responseId: string,
  ): Promise<boolean> {
    const inserted = await this.database.execute(sql`
      insert into invoice_provider_webhook_events (
        provider, provider_event_id, provider_response_id, event_type
      ) values ('openai', ${eventId}, ${responseId}, ${eventType})
      on conflict (provider, provider_event_id) do nothing
      returning id
    `);
    return rows<{ id: string }>(inserted).length === 1;
  }

  async markWebhookProcessed(eventId: string): Promise<void> {
    await this.database.execute(sql`
      update invoice_provider_webhook_events
      set processed_at = coalesce(processed_at, now())
      where provider = 'openai' and provider_event_id = ${eventId}
    `);
  }
}
