import { sql } from "drizzle-orm";
import {
  invoiceHistoryItemSchema,
  type InvoiceActorContext,
  type InvoiceDraftStatus,
  type InvoiceHistoryItem,
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

export class PostgresInvoiceHistoryRepository {
  constructor(private readonly database: InvoiceDatabase = applicationDatabase) {}

  async list(
    actor: InvoiceActorContext,
    filters: {
      status?: InvoiceDraftStatus;
      supplier?: string;
      limit: number;
      offset: number;
    },
  ): Promise<InvoiceHistoryItem[]> {
    const records = rows<{
      draft_id: string;
      status: InvoiceDraftStatus;
      final_values: {
        vendorName?: string | null;
        invoiceNumber?: string | null;
        invoiceDate?: string | null;
      } | null;
      updated_by_user_id: string;
      updated_at: Date | string;
      engine_version: string | null;
      intake_id: string | null;
    }>(
      await this.database.execute(sql`
        select draft.id as draft_id, draft.status, header.final_values,
               draft.updated_by_user_id, draft.updated_at,
               run.engine_version, intent.intake_id
        from invoice_review_drafts draft
        left join invoice_review_headers header
          on header.company_id = draft.company_id and header.draft_id = draft.id
        left join invoice_extraction_runs run
          on run.company_id = draft.company_id and run.id = draft.active_run_id
        left join invoice_confirmation_intents intent
          on intent.company_id = draft.company_id
         and intent.draft_id = draft.id
         and intent.status = 'completed'
        where draft.company_id = ${actor.effectiveCompanyId}
          ${filters.status ? sql`and draft.status = ${filters.status}` : sql``}
          ${filters.supplier
            ? sql`and coalesce(header.final_values ->> 'vendorName', '') ilike ${`%${filters.supplier}%`}`
            : sql``}
        order by draft.updated_at desc, draft.id desc
        limit ${filters.limit} offset ${filters.offset}
      `),
    );
    return records.map((record) =>
      invoiceHistoryItemSchema.parse({
        draftId: record.draft_id,
        status: record.status,
        supplier: record.final_values?.vendorName ?? null,
        invoiceNumber: record.final_values?.invoiceNumber ?? null,
        invoiceDate: record.final_values?.invoiceDate ?? null,
        updatedByUserId: record.updated_by_user_id,
        updatedAt: new Date(record.updated_at).toISOString(),
        engineVersion: record.engine_version,
        resumable: ["draft", "uploaded", "needs_review"].includes(record.status),
        intakeId: record.intake_id,
      }),
    );
  }
}
