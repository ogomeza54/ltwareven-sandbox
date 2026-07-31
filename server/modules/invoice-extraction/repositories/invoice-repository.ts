import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type {
  InvoiceActorContext,
  InvoiceAttemptStatus,
  InvoiceDraftDto,
  InvoiceDraftStatus,
  InvoiceFeatureResolution,
  InvoiceRunStatus,
} from "@shared/invoice-extraction/contracts";
import { InvoiceDomainError } from "@shared/invoice-extraction/contracts";
import { db as applicationDatabase } from "../../../db";
import { loadInvoiceConfig } from "../config/invoice-config";
import {
  requireDraftTransition,
  requireExtractionStart,
} from "../domain/policies";

type InvoiceDatabase = typeof applicationDatabase;

interface DraftRow {
  id: string;
  status: InvoiceDraftStatus;
  revision: number;
  active_run_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_activity_at: Date | string;
}

interface RunRow {
  id: string;
  draft_id: string;
  status: InvoiceRunStatus;
  revision: number;
  base_draft_revision: number;
}

interface AttemptRow {
  id: string;
  company_id: string;
  run_id: string;
  status: InvoiceAttemptStatus;
  revision: number;
  lease_token: string;
  lease_expires_at: Date | string;
}

type ResultWithRows<T> = { rows: T[] };

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray((result as ResultWithRows<T>).rows)
  ) {
    return (result as ResultWithRows<T>).rows;
  }
  return [];
}

function draftDto(row: DraftRow): InvoiceDraftDto {
  const iso = (value: Date | string): string =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  return {
    id: row.id,
    status: row.status,
    revision: row.revision,
    activeRunId: row.active_run_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastActivityAt: iso(row.last_activity_at),
  };
}

const allowedAuditMetadata = new Set([
  "fromStatus",
  "toStatus",
  "revision",
  "runNumber",
  "ordinal",
  "outcome",
  "canceledAttempts",
  "capability",
  "enabled",
]);

function safeAuditMetadata(
  metadata: Readonly<Record<string, string | number | boolean>> = {},
): Readonly<Record<string, string | number | boolean>> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => allowedAuditMetadata.has(key)),
  );
}

export interface InvoiceMutationContext {
  actor: InvoiceActorContext;
  correlationId: string;
  requestId?: string;
}

export class PostgresInvoiceRepository {
  constructor(
    private readonly database: InvoiceDatabase = applicationDatabase,
    private readonly maxAttempts = loadInvoiceConfig().workerMaxAttempts,
    private readonly abandonedRetentionDays = loadInvoiceConfig()
      .abandonedRetentionDays,
  ) {}

  async resolveFeatures(companyId: string): Promise<InvoiceFeatureResolution> {
    const result = await this.database.execute(sql`
      select capability, enabled
      from company_invoice_feature_flags
      where company_id = ${companyId}
    `);
    const values = new Map(
      resultRows<{ capability: string; enabled: boolean }>(result).map(
        (row) => [row.capability, row.enabled],
      ),
    );
    return {
      manualReceiving: true,
      scanExtraction: values.get("scan_extraction") === true,
      stockConfirmation: values.get("stock_confirmation") === true,
      engineActivation: values.get("engine_activation") === true,
    };
  }

  async createDraft(context: InvoiceMutationContext): Promise<InvoiceDraftDto> {
    return this.database.transaction(async (tx) => {
      const created = await tx.execute(sql`
        insert into invoice_review_drafts (
          company_id, created_by_company_id, created_by_user_id,
          updated_by_company_id, updated_by_user_id, retention_deadline
        ) values (
          ${context.actor.effectiveCompanyId},
          ${context.actor.actorCompanyId},
          ${context.actor.actorUserId},
          ${context.actor.actorCompanyId},
          ${context.actor.actorUserId},
          now() + (${this.abandonedRetentionDays} * interval '1 day')
        )
        returning id, status, revision, active_run_id,
                  created_at, updated_at, last_activity_at
      `);
      const row = resultRows<DraftRow>(created)[0];
      await this.writeAudit(tx, context, "draft.created", "draft", row.id, {
        revision: row.revision,
      });
      return draftDto(row);
    });
  }

  async listDrafts(actor: InvoiceActorContext): Promise<InvoiceDraftDto[]> {
    const result = await this.database.execute(sql`
      select id, status, revision, active_run_id,
             created_at, updated_at, last_activity_at
      from invoice_review_drafts
      where company_id = ${actor.effectiveCompanyId}
        and created_by_user_id = ${actor.actorUserId}
      order by last_activity_at desc, id
      limit 20
    `);
    return resultRows<DraftRow>(result).map(draftDto);
  }

  async getDraft(
    actor: InvoiceActorContext,
    draftId: string,
  ): Promise<InvoiceDraftDto | null> {
    const result = await this.database.execute(sql`
      select id, status, revision, active_run_id,
             created_at, updated_at, last_activity_at
      from invoice_review_drafts
      where company_id = ${actor.effectiveCompanyId}
        and id = ${draftId}::uuid
      limit 1
    `);
    const row = resultRows<DraftRow>(result)[0];
    return row ? draftDto(row) : null;
  }

  async transitionDraft(
    context: InvoiceMutationContext,
    draftId: string,
    expectedRevision: number,
    expectedStatus: InvoiceDraftStatus,
    nextStatus: InvoiceDraftStatus,
  ): Promise<InvoiceDraftDto> {
    requireDraftTransition(expectedStatus, nextStatus);
    return this.database.transaction(async (tx) => {
      const updated = await tx.execute(sql`
        update invoice_review_drafts
        set status = ${nextStatus}::invoice_draft_status,
            revision = revision + 1,
            updated_by_company_id = ${context.actor.actorCompanyId},
            updated_by_user_id = ${context.actor.actorUserId},
            updated_at = now(),
            last_activity_at = now()
        where company_id = ${context.actor.effectiveCompanyId}
          and id = ${draftId}::uuid
          and revision = ${expectedRevision}
          and status = ${expectedStatus}::invoice_draft_status
        returning id, status, revision, active_run_id,
                  created_at, updated_at, last_activity_at
      `);
      const row = resultRows<DraftRow>(updated)[0];
      if (!row) {
        const exists = await tx.execute(sql`
          select revision, status from invoice_review_drafts
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${draftId}::uuid
        `);
        const current = resultRows<{
          revision: number;
          status: InvoiceDraftStatus;
        }>(exists)[0];
        if (!current) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
        if (current.revision !== expectedRevision) {
          throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
        }
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      await this.writeAudit(
        tx,
        context,
        "draft.transitioned",
        "draft",
        row.id,
        {
          fromStatus: expectedStatus,
          toStatus: nextStatus,
          revision: row.revision,
        },
      );
      return draftDto(row);
    });
  }

  async createAndActivateRun(
    context: InvoiceMutationContext,
    draftId: string,
    expectedRevision: number,
    expectedStatus: InvoiceDraftStatus,
  ): Promise<{ runId: string; draft: InvoiceDraftDto }> {
    requireExtractionStart(expectedStatus);
    return this.database.transaction(async (tx) => {
      const locked = await tx.execute(sql`
        select revision, status
        from invoice_review_drafts
        where company_id = ${context.actor.effectiveCompanyId}
          and id = ${draftId}::uuid
        for update
      `);
      const draft = resultRows<{
        revision: number;
        status: InvoiceDraftStatus;
      }>(locked)[0];
      if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      if (draft.revision !== expectedRevision) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      if (draft.status !== expectedStatus) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const deletionPending = resultRows<{ id: string }>(
        await tx.execute(sql`
          select id from invoice_source_assets
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
            and lifecycle = 'attached' and delete_requested_at is not null
          limit 1
        `),
      )[0];
      if (deletionPending) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const runNumberResult = await tx.execute(sql`
        select coalesce(max(run_number), 0) + 1 as run_number
        from invoice_extraction_runs
        where company_id = ${context.actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid
      `);
      const runNumber = Number(
        resultRows<{ run_number: string | number }>(runNumberResult)[0]
          .run_number,
      );
      const inserted = await tx.execute(sql`
        insert into invoice_extraction_runs (
          company_id, draft_id, run_number, base_draft_revision,
          requested_by_company_id, requested_by_user_id, correlation_id
        ) values (
          ${context.actor.effectiveCompanyId}, ${draftId}::uuid, ${runNumber},
          ${expectedRevision}, ${context.actor.actorCompanyId},
          ${context.actor.actorUserId}, ${context.correlationId}::uuid
        )
        returning id
      `);
      const runId = resultRows<{ id: string }>(inserted)[0].id;
      const updated = await tx.execute(sql`
        update invoice_review_drafts
        set active_run_id = ${runId}::uuid,
            revision = revision + 1,
            updated_by_company_id = ${context.actor.actorCompanyId},
            updated_by_user_id = ${context.actor.actorUserId},
            updated_at = now(),
            last_activity_at = now()
        where company_id = ${context.actor.effectiveCompanyId}
          and id = ${draftId}::uuid
          and revision = ${expectedRevision}
          and status = ${expectedStatus}::invoice_draft_status
        returning id, status, revision, active_run_id,
                  created_at, updated_at, last_activity_at
      `);
      const updatedDraft = resultRows<DraftRow>(updated)[0];
      if (!updatedDraft) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      await this.writeAudit(tx, context, "run.activated", "run", runId, {
        runNumber,
        revision: updatedDraft.revision,
      });
      return { runId, draft: draftDto(updatedDraft) };
    });
  }

  async completeRun(
    context: InvoiceMutationContext,
    runId: string,
    expectedRunRevision: number,
    terminalStatus: Extract<
      InvoiceRunStatus,
      "completed" | "failed" | "canceled"
    >,
    failureCode: string | null = null,
  ): Promise<"CURRENT_RUN" | "STALE_RUN"> {
    return this.database.transaction(async (tx) => {
      const locked = await tx.execute(sql`
        select id, draft_id, status, revision, base_draft_revision
        from invoice_extraction_runs
        where company_id = ${context.actor.effectiveCompanyId}
          and id = ${runId}::uuid
        for update
      `);
      const lockedRun = resultRows<RunRow>(locked)[0];
      if (!lockedRun) {
        throw new InvoiceDomainError("INVOICE_RUN_NOT_FOUND");
      }
      if (
        lockedRun.revision !== expectedRunRevision ||
        !["queued", "processing"].includes(lockedRun.status)
      ) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const successfulAttempt = await tx.execute(sql`
        select id
        from invoice_provider_attempts
        where company_id = ${context.actor.effectiveCompanyId}
          and run_id = ${runId}::uuid
          and status = 'completed'
        limit 1
      `);
      const hasSuccessfulAttempt =
        resultRows<{ id: string }>(successfulAttempt).length === 1;
      if (
        (terminalStatus === "completed" && !hasSuccessfulAttempt) ||
        (terminalStatus !== "completed" && hasSuccessfulAttempt)
      ) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      if (terminalStatus !== "completed") {
        const canceled = await tx.execute(sql`
          update invoice_provider_attempts
          set status = 'canceled',
              revision = revision + 1,
              completed_at = now(),
              lease_owner = null,
              lease_token = null,
              lease_expires_at = null,
              heartbeat_at = null
          where company_id = ${context.actor.effectiveCompanyId}
            and run_id = ${runId}::uuid
            and status in ('queued', 'processing', 'submitted')
          returning id
        `);
        const canceledAttempts = resultRows<{ id: string }>(canceled).length;
        if (canceledAttempts > 0) {
          await this.writeAudit(
            tx,
            context,
            "run.attempts_canceled",
            "run",
            runId,
            { canceledAttempts },
          );
        }
      }
      const completed = await tx.execute(sql`
        update invoice_extraction_runs
        set status = ${terminalStatus}::invoice_run_status,
            revision = revision + 1,
            failure_code = ${failureCode},
            completed_at = now()
        where company_id = ${context.actor.effectiveCompanyId}
          and id = ${runId}::uuid
          and revision = ${expectedRunRevision}
          and status in ('queued', 'processing')
        returning id, draft_id, status, revision, base_draft_revision
      `);
      const run = resultRows<RunRow>(completed)[0];
      if (!run) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const current = await tx.execute(sql`
        select id
        from invoice_review_drafts
        where company_id = ${context.actor.effectiveCompanyId}
          and id = ${run.draft_id}::uuid
          and active_run_id = ${runId}::uuid
          and revision = ${run.base_draft_revision + 1}
          and status = 'uploaded'
      `);
      const outcome =
        resultRows<{ id: string }>(current).length === 1
          ? ("CURRENT_RUN" as const)
          : ("STALE_RUN" as const);
      await this.writeAudit(tx, context, "run.completed", "run", runId, {
        outcome,
      });
      return outcome;
    });
  }

  async createAttempt(
    context: InvoiceMutationContext,
    runId: string,
    provider: string,
  ): Promise<string> {
    return this.database.transaction(async (tx) => {
      const run = await tx.execute(sql`
        select id, status from invoice_extraction_runs
        where company_id = ${context.actor.effectiveCompanyId}
          and id = ${runId}::uuid
        for update
      `);
      const runRow = resultRows<{
        id: string;
        status: InvoiceRunStatus;
      }>(run)[0];
      if (!runRow) {
        throw new InvoiceDomainError("INVOICE_RUN_NOT_FOUND");
      }
      if (!["queued", "processing"].includes(runRow.status)) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const ordinalResult = await tx.execute(sql`
        select coalesce(max(ordinal), 0) + 1 as ordinal
        from invoice_provider_attempts
        where company_id = ${context.actor.effectiveCompanyId}
          and run_id = ${runId}::uuid
      `);
      const ordinal = Number(
        resultRows<{ ordinal: string | number }>(ordinalResult)[0].ordinal,
      );
      if (ordinal > this.maxAttempts) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const inserted = await tx.execute(sql`
        insert into invoice_provider_attempts (
          company_id, run_id, ordinal, provider
        ) values (
          ${context.actor.effectiveCompanyId}, ${runId}::uuid, ${ordinal}, ${provider}
        )
        returning id
      `);
      const attemptId = resultRows<{ id: string }>(inserted)[0].id;
      await this.writeAudit(
        tx,
        context,
        "attempt.created",
        "attempt",
        attemptId,
        { ordinal },
      );
      return attemptId;
    });
  }

  async claimAttempt(
    companyId: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<AttemptRow | null> {
    const token = randomUUID();
    const result = await this.database.execute(sql`
      with eligible as (
        select attempt.id
        from invoice_provider_attempts attempt
        join invoice_extraction_runs run
          on run.company_id = attempt.company_id
         and run.id = attempt.run_id
        where attempt.company_id = ${companyId}
          and attempt.status in ('queued', 'processing', 'submitted')
          and run.status in ('queued', 'processing')
          and attempt.available_at <= now()
          and (attempt.lease_expires_at is null or attempt.lease_expires_at <= now())
        order by attempt.available_at, attempt.created_at, attempt.ordinal, attempt.id
        for update skip locked
        limit 1
      )
      update invoice_provider_attempts attempt
      set status = case
            when attempt.status = 'queued' then 'processing'::invoice_attempt_status
            else attempt.status
          end,
          revision = attempt.revision + 1,
          lease_owner = ${workerId},
          lease_token = ${token}::uuid,
          lease_expires_at = now() + make_interval(secs => ${leaseSeconds}),
          heartbeat_at = now()
      from eligible
      where attempt.id = eligible.id
      returning attempt.id, attempt.company_id, attempt.run_id, attempt.status,
                attempt.revision, attempt.lease_token, attempt.lease_expires_at
    `);
    return resultRows<AttemptRow>(result)[0] ?? null;
  }

  async renewAttemptLease(
    companyId: string,
    attemptId: string,
    leaseToken: string,
    expectedRevision: number,
    leaseSeconds: number,
  ): Promise<AttemptRow> {
    return this.database.transaction(async (tx) => {
      await this.lockActiveAttemptRun(tx, companyId, attemptId);
      const result = await tx.execute(sql`
        update invoice_provider_attempts
        set revision = revision + 1,
            lease_expires_at = now() + make_interval(secs => ${leaseSeconds}),
            heartbeat_at = now()
        where company_id = ${companyId}
          and id = ${attemptId}::uuid
          and lease_token = ${leaseToken}::uuid
          and revision = ${expectedRevision}
          and lease_expires_at > now()
          and status in ('processing', 'submitted')
        returning id, company_id, run_id, status, revision,
                  lease_token, lease_expires_at
      `);
      const row = resultRows<AttemptRow>(result)[0];
      if (!row) throw new InvoiceDomainError("INVOICE_LEASE_LOST");
      return row;
    });
  }

  async completeAttempt(
    context: InvoiceMutationContext,
    attemptId: string,
    leaseToken: string,
    expectedRevision: number,
    providerResponseId: string | null,
    terminalStatus: Extract<
      InvoiceAttemptStatus,
      "completed" | "failed" | "canceled"
    >,
    failureCode: string | null = null,
  ): Promise<void> {
    try {
      await this.database.transaction(async (tx) => {
        await this.lockActiveAttemptRun(
          tx,
          context.actor.effectiveCompanyId,
          attemptId,
        );
        const result = await tx.execute(sql`
          update invoice_provider_attempts
          set status = ${terminalStatus}::invoice_attempt_status,
              revision = revision + 1,
              provider_response_id = ${providerResponseId},
              failure_code = ${failureCode},
              completed_at = now(),
              lease_owner = null,
              lease_token = null,
              lease_expires_at = null,
              heartbeat_at = null
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${attemptId}::uuid
            and lease_token = ${leaseToken}::uuid
            and revision = ${expectedRevision}
            and lease_expires_at > now()
            and status in ('processing', 'submitted')
          returning id
        `);
        if (!resultRows<{ id: string }>(result)[0]) {
          throw new InvoiceDomainError("INVOICE_LEASE_LOST");
        }
        await this.writeAudit(
          tx,
          context,
          "attempt.completed",
          "attempt",
          attemptId,
          {
            toStatus: terminalStatus,
            revision: expectedRevision + 1,
          },
        );
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        if (
          "constraint" in error &&
          (error as { constraint?: string }).constraint ===
            "invoice_provider_attempts_one_completed_per_run"
        ) {
          throw new InvoiceDomainError("INVOICE_INVALID_STATE");
        }
        throw new InvoiceDomainError("INVOICE_PROVIDER_RESPONSE_CONFLICT");
      }
      throw error;
    }
  }

  private async lockActiveAttemptRun(
    executor: Pick<InvoiceDatabase, "execute">,
    companyId: string,
    attemptId: string,
  ): Promise<void> {
    const run = await executor.execute(sql`
      select parent.id
      from invoice_provider_attempts attempt
      join invoice_extraction_runs parent
        on parent.company_id = attempt.company_id
       and parent.id = attempt.run_id
      where attempt.company_id = ${companyId}
        and attempt.id = ${attemptId}::uuid
        and parent.status in ('queued', 'processing')
      for update of parent
    `);
    if (!resultRows<{ id: string }>(run)[0]) {
      throw new InvoiceDomainError("INVOICE_LEASE_LOST");
    }
  }

  private async writeAudit(
    executor: Pick<InvoiceDatabase, "execute">,
    context: InvoiceMutationContext,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Readonly<Record<string, string | number | boolean>> = {},
  ): Promise<void> {
    await executor.execute(sql`
      insert into invoice_audit_events (
        company_id, actor_user_id, actor_company_id, action,
        target_type, target_id, correlation_id, request_id, metadata
      ) values (
        ${context.actor.effectiveCompanyId},
        ${context.actor.actorUserId},
        ${context.actor.actorCompanyId},
        ${action},
        ${targetType},
        ${targetId}::uuid,
        ${context.correlationId}::uuid,
        ${context.requestId ?? null}::uuid,
        ${JSON.stringify(safeAuditMetadata(metadata))}::jsonb
      )
    `);
  }
}
