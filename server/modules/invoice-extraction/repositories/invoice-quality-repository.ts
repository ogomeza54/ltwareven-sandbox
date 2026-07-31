import { sql } from "drizzle-orm";
import {
  invoiceQualityCaseDetailSchema,
  invoiceQualityDashboardSchema,
  type InvoiceActorContext,
  type InvoiceQualityCaseDetail,
  type InvoiceQualityDashboard,
  type InvoiceQualityQuery,
} from "@shared/invoice-extraction/contracts";
import { db as applicationDatabase } from "../../../db";

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

const integer = (value: unknown): number => Number.parseInt(String(value ?? 0), 10);
const decimal = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const rate = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

export class PostgresInvoiceQualityRepository {
  constructor(private readonly database: InvoiceDatabase = applicationDatabase) {}

  async dashboard(
    actor: InvoiceActorContext,
    filters: InvoiceQualityQuery,
  ): Promise<InvoiceQualityDashboard> {
    const companyId = actor.effectiveCompanyId;
    const feedbackFilter = sql`
      feedback.company_id = ${companyId}
      ${filters.from ? sql`and feedback.created_at >= ${filters.from}` : sql``}
      ${filters.to ? sql`and feedback.created_at <= ${filters.to}` : sql``}
      ${filters.supplier
        ? sql`and coalesce(feedback.supplier_normalized, '') ilike ${`%${filters.supplier}%`}`
        : sql``}
      ${filters.subjectType
        ? sql`and feedback.subject_type = ${filters.subjectType}`
        : sql``}
      ${filters.decision ? sql`and feedback.decision = ${filters.decision}` : sql``}
      ${filters.engineVersion
        ? sql`and feedback.engine_version = ${filters.engineVersion}`
        : sql``}
    `;
    const draftFilter = sql`
      draft.company_id = ${companyId}
      ${filters.from ? sql`and draft.updated_at >= ${filters.from}` : sql``}
      ${filters.to ? sql`and draft.updated_at <= ${filters.to}` : sql``}
      ${filters.supplier
        ? sql`and coalesce(header.final_values ->> 'vendorName', '') ilike ${`%${filters.supplier}%`}`
        : sql``}
      ${filters.engineVersion
        ? sql`and run.engine_version = ${filters.engineVersion}`
        : sql``}
    `;
    const relevantFieldFeedback = sql`
      feedback.subject_type in ('header', 'line')
      and (
        (
          feedback.proposal is not null
          and feedback.proposal <> 'null'::jsonb
          and not (
            feedback.subject_path like '%.classification'
            and feedback.proposal = '"unknown"'::jsonb
          )
        )
        or (
          feedback.final_value is not null
          and feedback.final_value <> 'null'::jsonb
          and not (
            feedback.subject_path like '%.classification'
            and feedback.final_value = '"unknown"'::jsonb
          )
        )
      )
    `;
    const aiFilledFeedback = sql`
      feedback.proposal is not null
      and feedback.proposal <> 'null'::jsonb
      and not (
        feedback.subject_path like '%.classification'
        and feedback.proposal = '"unknown"'::jsonb
      )
    `;

    const [feedbackTotalsResult, decisionResult, subjectResult, runResult, casesResult, matchDecisionResult] =
      await Promise.all([
        this.database.execute(sql`
          select count(*) filter (where ${relevantFieldFeedback})::int as feedback_events,
                 count(*) filter (where ${relevantFieldFeedback})::int as reviewed_events,
                 count(*) filter (
                   where ${relevantFieldFeedback} and ${aiFilledFeedback}
                 )::int as ai_filled_events,
                 count(*) filter (
                   where ${relevantFieldFeedback}
                     and feedback.decision in ('corrected', 'added', 'removed')
                     and coalesce(feedback.reason, '') <> 'automatic_enrichment'
                 )::int as corrected_events,
                 count(*) filter (
                   where ${relevantFieldFeedback}
                     and feedback.reason = 'automatic_enrichment'
                 )::int as automatic_enrichment_events,
                 count(*) filter (
                   where ${relevantFieldFeedback}
                     and feedback.decision = 'accepted'
                 )::int as accepted_events
          from invoice_feedback_events feedback
          where ${feedbackFilter} and ${relevantFieldFeedback}
        `),
        this.database.execute(sql`
          select case
                   when feedback.reason = 'automatic_enrichment'
                     then 'automatic enrichment'
                   else feedback.decision
                 end as key,
                 count(*)::int as count
          from invoice_feedback_events feedback
          where ${feedbackFilter} and ${relevantFieldFeedback}
          group by key
          order by key
        `),
        this.database.execute(sql`
          select feedback.subject_type as key, count(*)::int as count
          from invoice_feedback_events feedback
          where ${feedbackFilter}
          group by feedback.subject_type
          order by feedback.subject_type
        `),
        this.database.execute(sql`
          select run.engine_version,
                 run.status,
                 greatest((
                   select count(*) from invoice_provider_attempts attempt
                   where attempt.company_id = run.company_id and attempt.run_id = run.id
                 ) - 1, 0)::int as retry_attempts,
                 coalesce(document.total_pages, 0)::int as pages,
                 (
                   select count(*) from invoice_feedback_events feedback
                   where feedback.company_id = run.company_id and feedback.run_id = run.id
                     and ${relevantFieldFeedback}
                 )::int as reviewed_events,
                 (
                   select count(*) from invoice_feedback_events feedback
                   where feedback.company_id = run.company_id and feedback.run_id = run.id
                     and ${relevantFieldFeedback} and ${aiFilledFeedback}
                 )::int as ai_filled_events,
                 (
                   select count(*) from invoice_feedback_events feedback
                   where feedback.company_id = run.company_id and feedback.run_id = run.id
                     and ${relevantFieldFeedback}
                     and feedback.decision in ('corrected', 'added', 'removed')
                     and coalesce(feedback.reason, '') <> 'automatic_enrichment'
                 )::int as corrected_events
                 ,(
                   select count(*) from invoice_feedback_events feedback
                   where feedback.company_id = run.company_id and feedback.run_id = run.id
                     and ${relevantFieldFeedback}
                     and feedback.reason = 'automatic_enrichment'
                 )::int as automatic_enrichment_events
          from invoice_extraction_runs run
          join invoice_review_drafts draft
            on draft.company_id = run.company_id and draft.id = run.draft_id
          left join invoice_review_headers header
            on header.company_id = draft.company_id and header.draft_id = draft.id
          left join invoice_documents document
            on document.company_id = draft.company_id and document.draft_id = draft.id
          where ${draftFilter}
            and exists (
              select 1 from invoice_feedback_events feedback
              where feedback.company_id = run.company_id
                and feedback.draft_id = run.draft_id
                and ${feedbackFilter}
            )
          order by run.engine_version, run.created_at, run.id
        `),
        this.database.execute(sql`
          select draft.id as draft_id, draft.status,
                 header.final_values ->> 'vendorName' as supplier,
                 run.engine_version,
                 count(feedback.id) filter (
                   where ${relevantFieldFeedback}
                 )::int as reviewed_events,
                 count(feedback.id) filter (
                   where ${relevantFieldFeedback} and ${aiFilledFeedback}
                 )::int as ai_filled_events,
                 count(feedback.id) filter (
                   where ${relevantFieldFeedback}
                     and feedback.decision in ('corrected', 'added', 'removed')
                     and coalesce(feedback.reason, '') <> 'automatic_enrichment'
                 )::int as corrected_events,
                 count(feedback.id) filter (
                   where ${relevantFieldFeedback}
                     and feedback.reason = 'automatic_enrichment'
                 )::int as automatic_enrichment_events,
                 case when draft.status in ('confirmed', 'rejected', 'canceled')
                   then greatest(extract(epoch from (draft.updated_at - draft.created_at)), 0)
                   else null end as review_seconds,
                 draft.updated_at
          from invoice_review_drafts draft
          left join invoice_review_headers header
            on header.company_id = draft.company_id and header.draft_id = draft.id
          left join invoice_extraction_runs run
            on run.company_id = draft.company_id and run.id = draft.active_run_id
          left join invoice_feedback_events feedback
            on feedback.company_id = draft.company_id and feedback.draft_id = draft.id
            ${filters.subjectType
              ? sql`and feedback.subject_type = ${filters.subjectType}`
              : sql``}
            ${filters.decision
              ? sql`and feedback.decision = ${filters.decision}`
              : sql``}
          where ${draftFilter}
          group by draft.id, header.final_values, run.engine_version
          having count(feedback.id) > 0
          order by draft.updated_at desc, draft.id desc
          limit ${filters.limit} offset ${filters.offset}
        `),
        this.database.execute(sql`
          select feedback.decision as key, count(*)::int as count
          from invoice_feedback_events feedback
          where ${feedbackFilter} and feedback.subject_type = 'match'
          group by feedback.decision
          order by feedback.decision
        `),
      ]);

    const feedbackTotals = rows<{
      feedback_events: number;
      reviewed_events: number;
      ai_filled_events: number;
      corrected_events: number;
      automatic_enrichment_events: number;
      accepted_events: number;
    }>(feedbackTotalsResult)[0] ?? {
      feedback_events: 0,
      reviewed_events: 0,
      ai_filled_events: 0,
      corrected_events: 0,
      automatic_enrichment_events: 0,
      accepted_events: 0,
    };
    const reviewedEvents = integer(feedbackTotals.reviewed_events);
    const aiFilledEvents = integer(feedbackTotals.ai_filled_events);
    const correctedEvents = integer(feedbackTotals.corrected_events);
    const automaticEnrichmentEvents = integer(
      feedbackTotals.automatic_enrichment_events,
    );
    const acceptedEvents = integer(feedbackTotals.accepted_events);
    const cases = rows<{
      draft_id: string;
      status: string;
      supplier: string | null;
      engine_version: string | null;
      reviewed_events: number;
      ai_filled_events: number;
      corrected_events: number;
      automatic_enrichment_events: number;
      review_seconds: string | null;
      updated_at: Date | string;
    }>(casesResult);
    const terminalReviewSeconds = cases
      .map((item) => decimal(item.review_seconds))
      .filter((value): value is number => value !== null);
    const denominator = reviewedEvents;

    const engineRows = rows<{
      engine_version: string;
      status: string;
      retry_attempts: number;
      pages: number;
      reviewed_events: number;
      ai_filled_events: number;
      corrected_events: number;
      automatic_enrichment_events: number;
    }>(runResult);
    const engines = Array.from(engineRows.reduce((map, item) => {
      const current = map.get(item.engine_version) ?? {
        engineVersion: item.engine_version,
        runs: 0,
        failedRuns: 0,
        retryAttempts: 0,
        pages: 0,
        reviewedEvents: 0,
        aiFilledEvents: 0,
        correctedEvents: 0,
        automaticEnrichmentEvents: 0,
        correctionRate: null as number | null,
        aiFilledRate: null as number | null,
        automaticEnrichmentRate: null as number | null,
      };
      current.runs += 1;
      current.failedRuns += item.status === "failed" ? 1 : 0;
      current.retryAttempts += integer(item.retry_attempts);
      current.pages += integer(item.pages);
      current.reviewedEvents += integer(item.reviewed_events);
      current.aiFilledEvents += integer(item.ai_filled_events);
      current.correctedEvents += integer(item.corrected_events);
      current.automaticEnrichmentEvents += integer(
        item.automatic_enrichment_events,
      );
      map.set(item.engine_version, current);
      return map;
    }, new Map<string, {
      engineVersion: string;
      runs: number;
      failedRuns: number;
      retryAttempts: number;
      pages: number;
      reviewedEvents: number;
      aiFilledEvents: number;
      correctedEvents: number;
      automaticEnrichmentEvents: number;
      correctionRate: number | null;
      aiFilledRate: number | null;
      automaticEnrichmentRate: number | null;
    }>()).values()).map((item) => ({
      ...item,
      correctionRate: rate(item.correctedEvents, item.reviewedEvents),
      aiFilledRate: rate(item.aiFilledEvents, item.reviewedEvents),
      automaticEnrichmentRate: rate(
        item.automaticEnrichmentEvents,
        item.reviewedEvents,
      ),
    }));

    return invoiceQualityDashboardSchema.parse({
      window: {
        from: filters.from ?? null,
        to: filters.to ?? null,
      },
      totals: {
        documents: cases.length,
        runs: engines.reduce((sum, item) => sum + item.runs, 0),
        failedRuns: engines.reduce((sum, item) => sum + item.failedRuns, 0),
        feedbackEvents: integer(feedbackTotals.feedback_events),
        reviewedEvents,
        aiFilledEvents,
        correctedEvents,
        automaticEnrichmentEvents,
        acceptedEvents,
        correctionRate: rate(correctedEvents, denominator),
        aiFilledRate: rate(aiFilledEvents, denominator),
        automaticEnrichmentRate: rate(automaticEnrichmentEvents, denominator),
        acceptanceRate: rate(acceptedEvents, denominator),
        averageReviewSeconds:
          terminalReviewSeconds.length === 0
            ? null
            : terminalReviewSeconds.reduce((sum, value) => sum + value, 0) /
              terminalReviewSeconds.length,
        lowSample: denominator < 20,
        sampleFloor: 20,
      },
      byDecision: rows<{ key: string; count: number }>(decisionResult).map(
        (item) => ({
          key: item.key,
          count: integer(item.count),
          denominator,
          rate: rate(integer(item.count), denominator),
        }),
      ),
      bySubject: rows<{ key: string; count: number }>(subjectResult).map(
        (item) => ({
          key: item.key,
          count: integer(item.count),
          denominator,
          rate: rate(integer(item.count), denominator),
        }),
      ),
      engines,
      byMatchDecision: (() => {
        const items = rows<{ key: string; count: number }>(matchDecisionResult);
        const matchDenominator = items.reduce(
          (sum, item) => sum + integer(item.count),
          0,
        );
        return items.map((item) => ({
          key: item.key,
          count: integer(item.count),
          denominator: matchDenominator,
          rate: rate(integer(item.count), matchDenominator),
        }));
      })(),
      cases: cases.map((item) => ({
        draftId: item.draft_id,
        status: item.status,
        supplier: item.supplier,
        engineVersion: item.engine_version,
        reviewedEvents: integer(item.reviewed_events),
        aiFilledEvents: integer(item.ai_filled_events),
        correctedEvents: integer(item.corrected_events),
        automaticEnrichmentEvents: integer(
          item.automatic_enrichment_events,
        ),
        reviewSeconds: decimal(item.review_seconds),
        updatedAt: new Date(item.updated_at).toISOString(),
      })),
    });
  }

  async detail(
    actor: InvoiceActorContext,
    draftId: string,
  ): Promise<InvoiceQualityCaseDetail | null> {
    const companyId = actor.effectiveCompanyId;
    const caseRecord = rows<{
      draft_id: string;
      status: string;
      final_values: Record<string, unknown> | null;
      engine_version: string | null;
      updated_at: Date | string;
    }>(
      await this.database.execute(sql`
        select draft.id as draft_id, draft.status, header.final_values,
               run.engine_version, draft.updated_at
        from invoice_review_drafts draft
        left join invoice_review_headers header
          on header.company_id = draft.company_id and header.draft_id = draft.id
        left join invoice_extraction_runs run
          on run.company_id = draft.company_id and run.id = draft.active_run_id
        where draft.company_id = ${companyId}
          and draft.id = ${draftId}::uuid
          and exists (
            select 1 from invoice_feedback_events feedback
            where feedback.company_id = draft.company_id
              and feedback.draft_id = draft.id
          )
      `),
    )[0];
    if (!caseRecord) return null;

    const [assetResult, fieldResult, matchResult] = await Promise.all([
      this.database.execute(sql`
        select asset.id, asset.display_name, asset.detected_type,
               asset.page_count, asset.position
        from invoice_source_assets asset
        where asset.company_id = ${companyId}
          and asset.draft_id = ${draftId}::uuid
          and asset.lifecycle = 'attached'
        order by asset.position, asset.id
      `),
      this.database.execute(sql`
        select feedback.subject_type,
               case when feedback.subject_type = 'header'
                 then split_part(feedback.subject_path, '.', 2)
                 else split_part(feedback.subject_path, '.', 3)
               end as field,
               line.id as line_id, line.position as line_position,
               line.description as line_description,
               feedback.proposal, feedback.final_value,
               feedback.decision, feedback.reason
        from invoice_feedback_events feedback
        left join invoice_review_lines line
          on feedback.subject_type = 'line'
         and line.company_id = feedback.company_id
         and line.draft_id = feedback.draft_id
         and line.id::text = split_part(feedback.subject_path, '.', 2)
        where feedback.company_id = ${companyId}
          and feedback.draft_id = ${draftId}::uuid
          and feedback.subject_type in ('header', 'line')
          and (
            (
              feedback.proposal is not null
              and feedback.proposal <> 'null'::jsonb
              and not (
                feedback.subject_path like '%.classification'
                and feedback.proposal = '"unknown"'::jsonb
              )
            )
            or (
              feedback.final_value is not null
              and feedback.final_value <> 'null'::jsonb
              and not (
                feedback.subject_path like '%.classification'
                and feedback.final_value = '"unknown"'::jsonb
              )
            )
          )
        order by case when feedback.subject_type = 'header' then 0 else 1 end,
                 line.position nulls first, feedback.subject_path
      `),
      this.database.execute(sql`
        select line.id as line_id, line.position as line_position,
               line.description as line_description, feedback.decision,
               feedback.proposal, feedback.final_value
        from invoice_feedback_events feedback
        join invoice_review_lines line
          on line.company_id = feedback.company_id
         and line.draft_id = feedback.draft_id
         and line.id::text = split_part(feedback.subject_path, '.', 2)
        where feedback.company_id = ${companyId}
          and feedback.draft_id = ${draftId}::uuid
          and feedback.subject_type = 'match'
        order by line.position, line.id
      `),
    ]);

    const fields = rows<{
      subject_type: "header" | "line";
      field: string;
      line_id: string | null;
      line_position: number | null;
      line_description: string | null;
      proposal: unknown;
      final_value: unknown;
      decision: string;
      reason: string | null;
    }>(fieldResult).map((field) => ({
      subjectType: field.subject_type,
      field: field.field,
      lineId: field.line_id,
      linePosition: field.line_position === null ? null : integer(field.line_position),
      lineDescription: field.line_description,
      proposal: field.proposal ?? null,
      finalValue: field.final_value ?? null,
      result:
        field.decision === "accepted" || field.reason === "automatic_enrichment"
          ? ("automatically_completed" as const)
          : ("changed" as const),
      origin:
        field.reason === "automatic_enrichment"
          ? ("system" as const)
          : field.decision === "accepted"
            ? ("ai" as const)
            : ("review" as const),
    }));
    const automaticallyCompletedFields = fields.filter(
      (field) => field.result === "automatically_completed",
    ).length;

    const finalValues = caseRecord.final_values ?? {};
    return invoiceQualityCaseDetailSchema.parse({
      draftId: caseRecord.draft_id,
      status: caseRecord.status,
      supplier:
        typeof finalValues.vendorName === "string" ? finalValues.vendorName : null,
      invoiceNumber:
        typeof finalValues.invoiceNumber === "string"
          ? finalValues.invoiceNumber
          : null,
      invoiceDate:
        typeof finalValues.invoiceDate === "string" ? finalValues.invoiceDate : null,
      engineVersion: caseRecord.engine_version,
      updatedAt: new Date(caseRecord.updated_at).toISOString(),
      summary: {
        reviewedFields: fields.length,
        automaticallyCompletedFields,
        changedFields: fields.length - automaticallyCompletedFields,
      },
      assets: rows<{
        id: string;
        display_name: string;
        detected_type: string;
        page_count: number;
        position: number;
      }>(assetResult).map((asset) => ({
        id: asset.id,
        displayName: asset.display_name,
        detectedType: asset.detected_type,
        pageCount: integer(asset.page_count),
        position: integer(asset.position),
      })),
      fields,
      matches: rows<{
        line_id: string;
        line_position: number;
        line_description: string | null;
        decision: "accepted" | "corrected" | "added";
        proposal: unknown;
        final_value: unknown;
      }>(matchResult).map((match) => ({
        lineId: match.line_id,
        linePosition: integer(match.line_position),
        lineDescription: match.line_description,
        decision: match.decision,
        proposal: match.proposal ?? null,
        finalValue: match.final_value ?? null,
      })),
    });
  }
}
