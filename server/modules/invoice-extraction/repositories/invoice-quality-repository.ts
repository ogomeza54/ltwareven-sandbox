import { sql } from "drizzle-orm";
import {
  invoiceQualityDashboardSchema,
  type InvoiceActorContext,
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

    const [feedbackTotalsResult, decisionResult, subjectResult, runResult, casesResult] =
      await Promise.all([
        this.database.execute(sql`
          select count(*)::int as feedback_events,
                 count(*) filter (where feedback.decision in ('accepted', 'corrected', 'added', 'removed'))::int as reviewed_events,
                 count(*) filter (where feedback.decision in ('corrected', 'added', 'removed'))::int as corrected_events,
                 count(*) filter (where feedback.decision = 'accepted')::int as accepted_events
          from invoice_feedback_events feedback
          where ${feedbackFilter}
        `),
        this.database.execute(sql`
          select feedback.decision as key, count(*)::int as count
          from invoice_feedback_events feedback
          where ${feedbackFilter}
          group by feedback.decision
          order by feedback.decision
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
                   select count(*) from invoice_feedback_events event
                   where event.company_id = run.company_id and event.run_id = run.id
                     and event.decision in ('accepted', 'corrected', 'added', 'removed')
                 )::int as reviewed_events,
                 (
                   select count(*) from invoice_feedback_events event
                   where event.company_id = run.company_id and event.run_id = run.id
                     and event.decision in ('corrected', 'added', 'removed')
                 )::int as corrected_events
          from invoice_extraction_runs run
          join invoice_review_drafts draft
            on draft.company_id = run.company_id and draft.id = run.draft_id
          left join invoice_review_headers header
            on header.company_id = draft.company_id and header.draft_id = draft.id
          left join invoice_documents document
            on document.company_id = draft.company_id and document.draft_id = draft.id
          where ${draftFilter}
          order by run.engine_version, run.created_at, run.id
        `),
        this.database.execute(sql`
          select draft.id as draft_id, draft.status,
                 header.final_values ->> 'vendorName' as supplier,
                 run.engine_version,
                 count(feedback.id)::int as feedback_events,
                 count(feedback.id) filter (
                   where feedback.decision in ('corrected', 'added', 'removed')
                 )::int as corrected_events,
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
          having ${filters.subjectType || filters.decision
            ? sql`count(feedback.id) > 0`
            : sql`true`}
          order by draft.updated_at desc, draft.id desc
          limit ${filters.limit} offset ${filters.offset}
        `),
      ]);

    const feedbackTotals = rows<{
      feedback_events: number;
      reviewed_events: number;
      corrected_events: number;
      accepted_events: number;
    }>(feedbackTotalsResult)[0] ?? {
      feedback_events: 0,
      reviewed_events: 0,
      corrected_events: 0,
      accepted_events: 0,
    };
    const reviewedEvents = integer(feedbackTotals.reviewed_events);
    const correctedEvents = integer(feedbackTotals.corrected_events);
    const acceptedEvents = integer(feedbackTotals.accepted_events);
    const cases = rows<{
      draft_id: string;
      status: string;
      supplier: string | null;
      engine_version: string | null;
      feedback_events: number;
      corrected_events: number;
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
      corrected_events: number;
    }>(runResult);
    const engines = Array.from(engineRows.reduce((map, item) => {
      const current = map.get(item.engine_version) ?? {
        engineVersion: item.engine_version,
        runs: 0,
        failedRuns: 0,
        retryAttempts: 0,
        pages: 0,
        reviewedEvents: 0,
        correctedEvents: 0,
        correctionRate: null as number | null,
      };
      current.runs += 1;
      current.failedRuns += item.status === "failed" ? 1 : 0;
      current.retryAttempts += integer(item.retry_attempts);
      current.pages += integer(item.pages);
      current.reviewedEvents += integer(item.reviewed_events);
      current.correctedEvents += integer(item.corrected_events);
      map.set(item.engine_version, current);
      return map;
    }, new Map<string, {
      engineVersion: string;
      runs: number;
      failedRuns: number;
      retryAttempts: number;
      pages: number;
      reviewedEvents: number;
      correctedEvents: number;
      correctionRate: number | null;
    }>()).values()).map((item) => ({
      ...item,
      correctionRate: rate(item.correctedEvents, item.reviewedEvents),
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
        correctedEvents,
        acceptedEvents,
        correctionRate: rate(correctedEvents, denominator),
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
      cases: cases.map((item) => ({
        draftId: item.draft_id,
        status: item.status,
        supplier: item.supplier,
        engineVersion: item.engine_version,
        feedbackEvents: integer(item.feedback_events),
        correctedEvents: integer(item.corrected_events),
        reviewSeconds: decimal(item.review_seconds),
        updatedAt: new Date(item.updated_at).toISOString(),
      })),
    });
  }
}
