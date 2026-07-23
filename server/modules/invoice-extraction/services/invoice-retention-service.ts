import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { InvoiceActorContext } from "@shared/invoice-extraction/contracts";
import { db as applicationDatabase } from "../../../db";
import type { PrivateStoragePort } from "../providers/private-storage";

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

export interface InvoiceRetentionResult {
  purgedDrafts: number;
  failedDrafts: number;
}

export class InvoiceRetentionService {
  constructor(
    private readonly storage: PrivateStoragePort,
    private readonly database: InvoiceDatabase = applicationDatabase,
  ) {}

  async purgeExpired(
    actor: InvoiceActorContext,
    limit = 50,
  ): Promise<InvoiceRetentionResult> {
    const candidates = rows<{
      draft_id: string;
      assets: Array<{ id: string; objectKey: string }>;
    }>(
      await this.database.execute(sql`
        select draft.id as draft_id,
               coalesce(
                 jsonb_agg(
                   jsonb_build_object('id', asset.id, 'objectKey', asset.object_key)
                 ) filter (
                   where asset.id is not null
                     and asset.lifecycle <> 'deleted'
                     and asset.object_key is not null
                     and asset.hold_at is null
                 ),
                 '[]'::jsonb
               ) as assets
        from invoice_review_drafts draft
        left join invoice_source_assets asset
          on asset.company_id = draft.company_id and asset.draft_id = draft.id
        where draft.company_id = ${actor.effectiveCompanyId}
          and draft.retention_deadline <= now()
          and draft.retention_hold = false
          and draft.purged_at is null
          and not exists (
            select 1 from invoice_source_assets held
            where held.company_id = draft.company_id
              and held.draft_id = draft.id and held.hold_at is not null
          )
        group by draft.id, draft.retention_deadline
        order by draft.retention_deadline, draft.id
        limit ${Math.max(1, Math.min(100, limit))}
      `),
    );
    let purgedDrafts = 0;
    let failedDrafts = 0;
    for (const candidate of candidates) {
      try {
        for (const asset of candidate.assets) {
          await this.storage.delete(asset.objectKey);
        }
        await this.database.transaction(async (tx) => {
          const eligible = rows<{ id: string }>(
            await tx.execute(sql`
              select id from invoice_review_drafts
              where company_id = ${actor.effectiveCompanyId}
                and id = ${candidate.draft_id}::uuid
                and retention_deadline <= now()
                and retention_hold = false and purged_at is null
              for update
            `),
          )[0];
          if (!eligible) return;
          await tx.execute(sql`
            update invoice_source_assets
            set lifecycle = 'deleted', object_key = null, position = null,
                display_name = 'deleted-invoice-source',
                deleted_at = now(), updated_at = now(),
                delete_requested_at = coalesce(delete_requested_at, now()),
                delete_failure_code = null
            where company_id = ${actor.effectiveCompanyId}
              and draft_id = ${candidate.draft_id}::uuid
              and lifecycle <> 'deleted' and hold_at is null
          `);
          await tx.execute(sql`
            update invoice_documents
            set fingerprint_sha256 = null, total_pages = 0, updated_at = now()
            where company_id = ${actor.effectiveCompanyId}
              and draft_id = ${candidate.draft_id}::uuid
          `);
          await tx.execute(sql`
            update invoice_review_drafts
            set purged_at = now(), updated_at = now(),
                updated_by_company_id = ${actor.actorCompanyId},
                updated_by_user_id = ${actor.actorUserId}
            where company_id = ${actor.effectiveCompanyId}
              and id = ${candidate.draft_id}::uuid
          `);
          await tx.execute(sql`
            insert into invoice_audit_events (
              company_id, actor_user_id, actor_company_id, action,
              target_type, target_id, correlation_id, metadata
            ) values (
              ${actor.effectiveCompanyId}, ${actor.actorUserId},
              ${actor.actorCompanyId}, 'retention.purged', 'draft',
              ${candidate.draft_id}::uuid, ${randomUUID()}::uuid,
              ${JSON.stringify({ assetCount: candidate.assets.length })}::jsonb
            )
          `);
          purgedDrafts += 1;
        });
      } catch {
        failedDrafts += 1;
        await this.database.execute(sql`
          update invoice_source_assets
          set delete_attempts = delete_attempts + 1,
              delete_failure_code = 'RETENTION_STORAGE_DELETE_FAILED',
              delete_requested_at = coalesce(delete_requested_at, now()),
              updated_at = now()
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${candidate.draft_id}::uuid
            and lifecycle <> 'deleted'
        `);
      }
    }
    return { purgedDrafts, failedDrafts };
  }
}
