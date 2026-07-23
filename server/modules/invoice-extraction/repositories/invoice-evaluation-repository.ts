import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  InvoiceDomainError,
  invoiceEvaluationDocumentSchema,
  invoiceEvaluationMetricsSchema,
  type InvoiceActorContext,
  type InvoiceEvaluationDocument,
  type InvoiceEvaluationMetrics,
} from "@shared/invoice-extraction/contracts";
import { db as applicationDatabase } from "../../../db";

type InvoiceDatabase = typeof applicationDatabase;
type Result<T> = { rows: T[] };
function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as Result<T>).rows ?? []) as T[];
  }
  return [];
}

export interface EvaluationExampleRecord {
  fixtureKey: string;
  split: "tuning" | "test";
  expected: InvoiceEvaluationDocument;
}

export class PostgresInvoiceEvaluationRepository {
  constructor(private readonly database: InvoiceDatabase = applicationDatabase) {}

  async registerEngine(
    actor: InvoiceActorContext,
    input: {
      version: string;
      model: string;
      schemaVersion: string;
      providerConfig: Record<string, unknown>;
      activationEligible: boolean;
      eligibilityReason: string | null;
    },
  ) {
    const result = rows<{
      version: string;
      model: string;
      schema_version: string;
      activation_eligible: boolean;
      eligibility_reason: string | null;
      created_at: Date | string;
    }>(await this.database.execute(sql`
      insert into invoice_engine_versions (
        version, model, schema_version, provider_config,
        activation_eligible, eligibility_reason,
        created_by_company_id, created_by_user_id
      ) values (
        ${input.version}, ${input.model}, ${input.schemaVersion},
        ${JSON.stringify(input.providerConfig)}::jsonb,
        ${input.activationEligible}, ${input.eligibilityReason},
        ${actor.actorCompanyId}, ${actor.actorUserId}
      )
      returning version, model, schema_version, activation_eligible,
                eligibility_reason, created_at
    `))[0];
    return {
      version: result.version,
      model: result.model,
      schemaVersion: result.schema_version,
      activationEligible: result.activation_eligible,
      eligibilityReason: result.eligibility_reason,
      createdAt: new Date(result.created_at).toISOString(),
    };
  }

  async createSet(
    actor: InvoiceActorContext,
    input: {
      name: string;
      version: number;
      source: "synthetic" | "authorized_feedback";
      consentRecorded: boolean;
      snapshotHash: string;
      examples: readonly {
        fixtureKey: string;
        split: "tuning" | "test";
        expected: InvoiceEvaluationDocument;
        inputMetadata: { pageCount: number; synthetic: boolean };
      }[];
    },
  ) {
    return this.database.transaction(async (tx) => {
      const set = rows<{ id: string; created_at: Date | string }>(
        await tx.execute(sql`
          insert into invoice_evaluation_sets (
            company_id, name, version, source, consent_recorded, snapshot_hash,
            created_by_company_id, created_by_user_id
          ) values (
            ${actor.effectiveCompanyId}, ${input.name}, ${input.version},
            ${input.source}, ${input.consentRecorded}, ${input.snapshotHash},
            ${actor.actorCompanyId}, ${actor.actorUserId}
          )
          returning id, created_at
        `),
      )[0];
      for (const example of input.examples) {
        await tx.execute(sql`
          insert into invoice_evaluation_examples (
            company_id, set_id, split, fixture_key, expected, input_metadata
          ) values (
            ${actor.effectiveCompanyId}, ${set.id}::uuid, ${example.split},
            ${example.fixtureKey}, ${JSON.stringify(example.expected)}::jsonb,
            ${JSON.stringify(example.inputMetadata)}::jsonb
          )
        `);
      }
      return {
        id: set.id,
        name: input.name,
        version: input.version,
        source: input.source,
        consentRecorded: input.consentRecorded,
        snapshotHash: input.snapshotHash,
        exampleCount: input.examples.length,
        createdAt: new Date(set.created_at).toISOString(),
      };
    });
  }

  async examples(
    actor: InvoiceActorContext,
    setId: string,
  ): Promise<EvaluationExampleRecord[]> {
    return rows<{
      fixture_key: string;
      split: "tuning" | "test";
      expected: unknown;
    }>(await this.database.execute(sql`
      select fixture_key, split, expected
      from invoice_evaluation_examples
      where company_id = ${actor.effectiveCompanyId}
        and set_id = ${setId}::uuid
      order by fixture_key
    `)).map((row) => ({
      fixtureKey: row.fixture_key,
      split: row.split,
      expected: invoiceEvaluationDocumentSchema.parse(row.expected),
    }));
  }

  async saveRun(
    actor: InvoiceActorContext,
    input: {
      setId: string;
      engineVersion: string;
      configHash: string;
      predictionsHash: string;
      metrics: InvoiceEvaluationMetrics;
    },
  ) {
    const result = rows<{ id: string; created_at: Date | string }>(
      await this.database.execute(sql`
        insert into invoice_evaluation_runs (
          company_id, set_id, engine_version, status, config_hash, metrics,
          predictions_hash, created_by_company_id, created_by_user_id, completed_at
        )
        select ${actor.effectiveCompanyId}, set_record.id, engine.version,
               'completed', ${input.configHash}, ${JSON.stringify(input.metrics)}::jsonb,
               ${input.predictionsHash}, ${actor.actorCompanyId},
               ${actor.actorUserId}, now()
        from invoice_evaluation_sets set_record
        join invoice_engine_versions engine on engine.version = ${input.engineVersion}
        where set_record.company_id = ${actor.effectiveCompanyId}
          and set_record.id = ${input.setId}::uuid
        returning id, created_at
      `),
    )[0];
    if (!result) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
    return {
      id: result.id,
      setId: input.setId,
      engineVersion: input.engineVersion,
      status: "completed" as const,
      metrics: input.metrics,
      createdAt: new Date(result.created_at).toISOString(),
    };
  }

  async comparisons(actor: InvoiceActorContext, setId: string) {
    return rows<{
      id: string;
      engine_version: string;
      metrics: unknown;
      created_at: Date | string;
    }>(await this.database.execute(sql`
      select id, engine_version, metrics, created_at
      from invoice_evaluation_runs
      where company_id = ${actor.effectiveCompanyId}
        and set_id = ${setId}::uuid and status = 'completed'
      order by created_at desc, id desc
    `)).map((row) => ({
      id: row.id,
      engineVersion: row.engine_version,
      metrics: invoiceEvaluationMetricsSchema.parse(row.metrics),
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async activate(
    actor: InvoiceActorContext,
    input: {
      engineVersion: string;
      evaluationRunId: string;
      expectedRevision: number;
      reason: string;
      requestId?: string;
    },
  ) {
    return this.database.transaction(async (tx) => {
      const evidence = rows<{ eligible: boolean }>(await tx.execute(sql`
        select engine.activation_eligible as eligible
        from invoice_evaluation_runs run
        join invoice_engine_versions engine on engine.version = run.engine_version
        where run.company_id = ${actor.effectiveCompanyId}
          and run.id = ${input.evaluationRunId}::uuid
          and run.engine_version = ${input.engineVersion}
          and run.status = 'completed'
        for update
      `))[0];
      if (!evidence?.eligible) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      const existing = rows<{ id: string; revision: number; engine_version: string }>(await tx.execute(sql`
        select id, revision, engine_version from invoice_engine_activations
        where company_id = ${actor.effectiveCompanyId}
          and capability = 'scan_extraction'
        for update
      `))[0];
      if ((existing?.revision ?? 0) !== input.expectedRevision) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      const activationId = existing?.id ?? randomUUID();
      const activation = rows<{
        id: string;
        engine_version: string;
        revision: number;
        activated_at: Date | string;
      }>(await tx.execute(sql`
        insert into invoice_engine_activations (
          id, company_id, capability, engine_version, evaluation_run_id,
          revision, reason, activated_by_company_id, activated_by_user_id
        ) values (
          ${activationId}::uuid, ${actor.effectiveCompanyId}, 'scan_extraction',
          ${input.engineVersion}, ${input.evaluationRunId}::uuid,
          ${input.expectedRevision + 1}, ${input.reason},
          ${actor.actorCompanyId}, ${actor.actorUserId}
        )
        on conflict (company_id, capability) do update
        set engine_version = excluded.engine_version,
            evaluation_run_id = excluded.evaluation_run_id,
            revision = excluded.revision,
            reason = excluded.reason,
            activated_by_company_id = excluded.activated_by_company_id,
            activated_by_user_id = excluded.activated_by_user_id,
            activated_at = now()
        returning id, engine_version, revision, activated_at
      `))[0];
      await tx.execute(sql`
        insert into invoice_audit_events (
          company_id, actor_user_id, actor_company_id, action,
          target_type, target_id, correlation_id, request_id, metadata
        ) values (
          ${actor.effectiveCompanyId}, ${actor.actorUserId}, ${actor.actorCompanyId},
          'engine.activated', 'engine_activation', ${activation.id}::uuid,
          ${randomUUID()}::uuid, ${input.requestId ?? null}::uuid,
          ${JSON.stringify({
            previousVersion: existing?.engine_version ?? null,
            engineVersion: input.engineVersion,
            evaluationRunId: input.evaluationRunId,
            reason: input.reason,
          })}::jsonb
        )
      `);
      return {
        id: activation.id,
        engineVersion: activation.engine_version,
        revision: activation.revision,
        activatedAt: new Date(activation.activated_at).toISOString(),
      };
    });
  }
}
