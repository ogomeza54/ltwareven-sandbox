import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type {
  InvoiceActorContext,
  InvoiceDraftDto,
  InvoicePublicAssetDto,
  InvoiceSourceDto,
} from "@shared/invoice-extraction/contracts";
import { InvoiceDomainError } from "@shared/invoice-extraction/contracts";
import { db as applicationDatabase } from "../../../db";
import { loadInvoiceConfig } from "../config/invoice-config";
import type { InvoiceMutationContext } from "./invoice-repository";

type InvoiceDatabase = typeof applicationDatabase;
type DatabaseExecutor = Parameters<
  Parameters<InvoiceDatabase["transaction"]>[0]
>[0];
type SqlExecutor = Pick<DatabaseExecutor, "execute">;

type ResultWithRows<T> = { rows: T[] };
function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as ResultWithRows<T>).rows)
  ) {
    return (result as ResultWithRows<T>).rows;
  }
  return [];
}

interface InternalAssetRow {
  id: string;
  document_id: string;
  lifecycle: "staging" | "verified" | "attached" | "deleted";
  object_key: string | null;
  display_name: string;
  detected_type: InvoicePublicAssetDto["detectedType"] | null;
  byte_size: number | null;
  sha256: string | null;
  page_count: number | null;
  position: number | null;
  hold_at: Date | string | null;
  delete_requested_at: Date | string | null;
  created_at: Date | string;
}

interface DocumentRow {
  id: string;
  total_pages: number;
}

interface DraftMutationRow {
  id: string;
  status: InvoiceDraftDto["status"];
  revision: number;
  active_run_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_activity_at: Date | string;
}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function publicAsset(row: InternalAssetRow): InvoicePublicAssetDto {
  const base = {
    id: row.id,
    displayName: row.display_name,
    checksumSha256: row.sha256,
    createdAt: iso(row.created_at),
  };
  if (row.lifecycle !== "attached") {
    return {
      ...base,
      detectedType: row.detected_type,
      byteSize: row.byte_size,
      pageCount: row.page_count,
      position: null,
      state: "Uploading",
    };
  }
  if (!row.detected_type || !row.byte_size || !row.page_count || !row.position) {
    throw new Error("Attached invoice asset is incomplete");
  }
  return {
    ...base,
    detectedType: row.detected_type,
    byteSize: row.byte_size,
    pageCount: row.page_count,
    position: row.position,
    state: "Saved",
  };
}

function publicDraft(row: DraftMutationRow, source: InvoiceSourceDto | null): InvoiceDraftDto {
  return {
    id: row.id,
    status: row.status,
    revision: row.revision,
    activeRunId: row.active_run_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastActivityAt: iso(row.last_activity_at),
    source,
  };
}

function sanitizeDisplayName(value: string): string {
  const leaf = value.replaceAll("\\", "/").split("/").pop() ?? "";
  const safe = leaf
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .slice(0, 120);
  return safe || "invoice-source";
}

export class PostgresInvoiceDocumentRepository {
  constructor(
    private readonly database: InvoiceDatabase = applicationDatabase,
    private readonly sourceRetentionDays = loadInvoiceConfig()
      .confirmedRetentionDays,
    private readonly abandonedRetentionDays = loadInvoiceConfig()
      .abandonedRetentionDays,
  ) {}

  private async getSourceWith(
    executor: SqlExecutor,
    companyId: string,
    draftId: string,
  ): Promise<InvoiceSourceDto | null> {
    const document = rows<DocumentRow>(
      await executor.execute(sql`
        select id, total_pages
        from invoice_documents
        where company_id = ${companyId} and draft_id = ${draftId}::uuid
      `),
    )[0];
    if (!document) return null;
    const assets = rows<InternalAssetRow>(
      await executor.execute(sql`
        select id, document_id, lifecycle, object_key, display_name,
               detected_type, byte_size, sha256, page_count, position,
               hold_at, delete_requested_at, created_at
        from invoice_source_assets
        where company_id = ${companyId}
          and draft_id = ${draftId}::uuid
          and document_id = ${document.id}::uuid
          and lifecycle <> 'deleted'
        order by position nulls last, created_at, id
      `),
    );
    return {
      totalPages: document.total_pages,
      assets: assets.map(publicAsset),
    };
  }

  async getSource(
    actor: InvoiceActorContext,
    draftId: string,
  ): Promise<InvoiceSourceDto | null> {
    const draft = rows<{ id: string }>(
      await this.database.execute(sql`
        select id from invoice_review_drafts
        where company_id = ${actor.effectiveCompanyId}
          and id = ${draftId}::uuid
      `),
    )[0];
    if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
    return this.getSourceWith(this.database, actor.effectiveCompanyId, draftId);
  }

  async reserve(
    context: InvoiceMutationContext,
    draftId: string,
    expectedRevision: number,
    unsafeDisplayName: string,
    objectKey: string,
  ): Promise<{ assetId: string; documentId: string; displayName: string }> {
    return this.database.transaction(async (tx) => {
      const draft = rows<{ revision: number; status: string; active_run_id: string | null }>(
        await tx.execute(sql`
          select revision, status, active_run_id
          from invoice_review_drafts
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${draftId}::uuid
          for update
        `),
      )[0];
      if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      if (draft.revision !== expectedRevision) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      if (!["draft", "uploaded"].includes(draft.status) || draft.active_run_id) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const deletionPending = rows<{ id: string }>(
        await tx.execute(sql`
          select id from invoice_source_assets
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
            and lifecycle = 'attached' and delete_requested_at is not null
          limit 1
        `),
      )[0];
      if (deletionPending) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      const insertedDocument = rows<{ id: string }>(
        await tx.execute(sql`
          insert into invoice_documents (
            company_id, draft_id, retention_deadline
          ) values (
            ${context.actor.effectiveCompanyId}, ${draftId}::uuid,
            now() + (${this.sourceRetentionDays} * interval '1 day')
          )
          on conflict (company_id, draft_id)
          do update set updated_at = invoice_documents.updated_at
          returning id
        `),
      )[0];
      await tx.execute(sql`
        update invoice_review_drafts
        set retention_deadline =
              now() + (${this.abandonedRetentionDays} * interval '1 day')
        where company_id = ${context.actor.effectiveCompanyId}
          and id = ${draftId}::uuid
      `);
      const displayName = sanitizeDisplayName(unsafeDisplayName);
      const insertedAsset = rows<{ id: string }>(
        await tx.execute(sql`
          insert into invoice_source_assets (
            company_id, draft_id, document_id, display_name, object_key
          ) values (
            ${context.actor.effectiveCompanyId}, ${draftId}::uuid,
            ${insertedDocument.id}::uuid, ${displayName}, ${objectKey}
          )
          returning id
        `),
      )[0];
      return {
        assetId: insertedAsset.id,
        documentId: insertedDocument.id,
        displayName,
      };
    });
  }

  async findDuplicate(
    actor: InvoiceActorContext,
    draftId: string,
    documentId: string,
    sha256: string,
  ): Promise<InvoicePublicAssetDto | null> {
    const duplicate = rows<InternalAssetRow>(
      await this.database.execute(sql`
        select id, document_id, lifecycle, object_key, display_name,
               detected_type, byte_size, sha256, page_count, position,
               hold_at, delete_requested_at, created_at
        from invoice_source_assets
        where company_id = ${actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid
          and document_id = ${documentId}::uuid
          and sha256 = ${sha256}
          and lifecycle = 'attached'
        limit 1
      `),
    )[0];
    return duplicate ? publicAsset(duplicate) : null;
  }

  async abandonReservation(
    actor: InvoiceActorContext,
    draftId: string,
    documentId: string,
    assetId: string,
  ): Promise<void> {
    await this.database.execute(sql`
      delete from invoice_source_assets
      where company_id = ${actor.effectiveCompanyId}
        and draft_id = ${draftId}::uuid
        and document_id = ${documentId}::uuid
        and id = ${assetId}::uuid
        and lifecycle = 'staging'
    `);
  }

  async markVerified(
    actor: InvoiceActorContext,
    draftId: string,
    documentId: string,
    assetId: string,
    objectKey: string,
    validated: {
      detectedType: string;
      byteSize: number;
      sha256: string;
      pageCount: number;
    },
  ): Promise<void> {
    const updated = rows<{ id: string }>(
      await this.database.execute(sql`
        update invoice_source_assets
        set lifecycle = 'verified', object_key = ${objectKey},
            detected_type = ${validated.detectedType},
            byte_size = ${validated.byteSize}, sha256 = ${validated.sha256},
            page_count = ${validated.pageCount}, updated_at = now()
        where company_id = ${actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid
          and document_id = ${documentId}::uuid
          and id = ${assetId}::uuid
          and lifecycle = 'staging'
        returning id
      `),
    )[0];
    if (!updated) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
  }

  async abandonVerified(
    actor: InvoiceActorContext,
    draftId: string,
    documentId: string,
    assetId: string,
  ): Promise<void> {
    await this.database.execute(sql`
      delete from invoice_source_assets
      where company_id = ${actor.effectiveCompanyId}
        and draft_id = ${draftId}::uuid
        and document_id = ${documentId}::uuid
        and id = ${assetId}::uuid
        and lifecycle = 'verified'
    `);
  }

  private async fingerprint(
    tx: SqlExecutor,
    companyId: string,
    documentId: string,
  ): Promise<{ fingerprint: string | null; totalPages: number }> {
    const attached = rows<{
      sha256: string;
      detected_type: string;
      byte_size: number;
      page_count: number;
    }>(
      await tx.execute(sql`
        select sha256, detected_type, byte_size, page_count
        from invoice_source_assets
        where company_id = ${companyId}
          and document_id = ${documentId}::uuid
          and lifecycle = 'attached'
        order by position, id
      `),
    );
    const totalPages = attached.reduce((sum, item) => sum + item.page_count, 0);
    const fingerprint = attached.length
      ? createHash("sha256")
          .update(
            attached
              .map(
                (item) =>
                  `${item.sha256}\u001f${item.detected_type}\u001f${item.byte_size}\u001f${item.page_count}`,
              )
              .join("\u001e"),
          )
          .digest("hex")
      : null;
    await tx.execute(sql`
      update invoice_documents
      set fingerprint_sha256 = ${fingerprint}, total_pages = ${totalPages},
          updated_at = now()
      where company_id = ${companyId} and id = ${documentId}::uuid
    `);
    return { fingerprint, totalPages };
  }

  async attach(
    context: InvoiceMutationContext,
    draftId: string,
    documentId: string,
    assetId: string,
    expectedRevision: number,
    maxPages: number,
    replacementAssetId?: string,
  ): Promise<InvoiceDraftDto> {
    return this.database.transaction(async (tx) => {
      const draft = rows<DraftMutationRow>(
        await tx.execute(sql`
          select id, status, revision, active_run_id,
                 created_at, updated_at, last_activity_at
          from invoice_review_drafts
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${draftId}::uuid
          for update
        `),
      )[0];
      if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      if (draft.revision !== expectedRevision) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      if (!["draft", "uploaded"].includes(draft.status) || draft.active_run_id) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const deletionPending = rows<{ id: string }>(
        await tx.execute(sql`
          select id from invoice_source_assets
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
            and lifecycle = 'attached' and delete_requested_at is not null
          limit 1
        `),
      )[0];
      if (deletionPending) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      const document = rows<DocumentRow>(
        await tx.execute(sql`
          select id, total_pages from invoice_documents
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid and id = ${documentId}::uuid
          for update
        `),
      )[0];
      const asset = rows<{ page_count: number }>(
        await tx.execute(sql`
          select page_count from invoice_source_assets
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
            and document_id = ${documentId}::uuid
            and id = ${assetId}::uuid and lifecycle = 'verified'
          for update
        `),
      )[0];
      if (!document || !asset) throw new InvoiceDomainError("INVOICE_ASSET_NOT_FOUND");
      const replacement = replacementAssetId
        ? rows<{ id: string; page_count: number; position: number; hold_at: Date | null }>(
            await tx.execute(sql`
              select id, page_count, position, hold_at
              from invoice_source_assets
              where company_id = ${context.actor.effectiveCompanyId}
                and draft_id = ${draftId}::uuid
                and document_id = ${documentId}::uuid
                and id = ${replacementAssetId}::uuid
                and lifecycle = 'attached'
              for update
            `),
          )[0]
        : null;
      if (replacementAssetId && !replacement) {
        throw new InvoiceDomainError("INVOICE_ASSET_NOT_FOUND");
      }
      if (replacement?.hold_at) {
        throw new InvoiceDomainError("INVOICE_ASSET_HELD");
      }
      if (
        document.total_pages -
          (replacement?.page_count ?? 0) +
          asset.page_count >
        maxPages
      ) {
        throw new InvoiceDomainError("INVOICE_PAGE_LIMIT");
      }
      const position =
        replacement?.position ??
        rows<{ position: number }>(
          await tx.execute(sql`
            select coalesce(max(position), 0) + 1 as position
            from invoice_source_assets
            where company_id = ${context.actor.effectiveCompanyId}
              and document_id = ${documentId}::uuid
              and lifecycle = 'attached'
          `),
        )[0].position;
      if (replacement) {
        await tx.execute(sql`
          update invoice_source_assets
          set lifecycle = 'deleted', position = null,
              deleted_at = now(), updated_at = now()
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
            and document_id = ${documentId}::uuid
            and id = ${replacement.id}::uuid
            and lifecycle = 'attached'
        `);
      }
      await tx.execute(sql`
        update invoice_source_assets
        set lifecycle = 'attached', position = ${Number(position)}, updated_at = now()
        where company_id = ${context.actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid
          and document_id = ${documentId}::uuid
          and id = ${assetId}::uuid and lifecycle = 'verified'
      `);
      await this.fingerprint(tx, context.actor.effectiveCompanyId, documentId);
      const updated = rows<DraftMutationRow>(
        await tx.execute(sql`
          update invoice_review_drafts
          set status = 'uploaded', revision = revision + 1,
              updated_by_company_id = ${context.actor.actorCompanyId},
              updated_by_user_id = ${context.actor.actorUserId},
              updated_at = now(), last_activity_at = now()
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${draftId}::uuid and revision = ${expectedRevision}
          returning id, status, revision, active_run_id,
                    created_at, updated_at, last_activity_at
        `),
      )[0];
      await this.audit(tx, context, "asset.uploaded", assetId);
      if (replacement) {
        await this.audit(tx, context, "asset.replaced", replacement.id);
      }
      return publicDraft(
        updated,
        await this.getSourceWith(tx, context.actor.effectiveCompanyId, draftId),
      );
    });
  }

  async getAssetForRead(
    actor: InvoiceActorContext,
    draftId: string,
    assetId: string,
  ): Promise<{ objectKey: string; detectedType: string; displayName: string } | null> {
    const asset = rows<{
      object_key: string;
      detected_type: string;
      display_name: string;
    }>(
        await this.database.execute(sql`
          select object_key, detected_type, display_name
          from invoice_source_assets
          where company_id = ${actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
            and id = ${assetId}::uuid
            and lifecycle = 'attached'
          limit 1
        `),
      )[0];
    return asset
      ? {
          objectKey: asset.object_key,
          detectedType: asset.detected_type,
          displayName: asset.display_name,
        }
      : null;
  }

  async auditView(context: InvoiceMutationContext, assetId: string): Promise<void> {
    await this.database.transaction((tx) =>
      this.audit(tx, context, "asset.viewed", assetId),
    );
  }

  async prepareDelete(
    context: InvoiceMutationContext,
    draftId: string,
    assetId: string,
    expectedRevision: number,
  ): Promise<
    | { status: "pending"; objectKey: string; documentId: string; revision: number }
    | { status: "deleted" }
    | null
  > {
    return this.database.transaction(async (tx) => {
      const draft = rows<DraftMutationRow>(
        await tx.execute(sql`
          select id, status, revision, active_run_id,
                 created_at, updated_at, last_activity_at
          from invoice_review_drafts
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${draftId}::uuid
          for update
        `),
      )[0];
      if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      const asset = rows<InternalAssetRow>(
        await tx.execute(sql`
          select id, document_id, lifecycle, object_key, display_name,
                 detected_type, byte_size, sha256, page_count, position,
                 hold_at, delete_requested_at, created_at
          from invoice_source_assets
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid and id = ${assetId}::uuid
          for update
        `),
      )[0];
      if (!asset) return null;
      if (asset.lifecycle === "deleted") return { status: "deleted" };
      if (asset.hold_at) throw new InvoiceDomainError("INVOICE_ASSET_HELD");
      if (asset.lifecycle !== "attached" || !asset.object_key) {
        throw new InvoiceDomainError("INVOICE_ASSET_NOT_FOUND");
      }
      if (asset.delete_requested_at) {
        if (
          expectedRevision !== draft.revision &&
          expectedRevision !== draft.revision - 1
        ) {
          throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
        }
        return {
          status: "pending",
          objectKey: asset.object_key,
          documentId: asset.document_id,
          revision: draft.revision,
        };
      }
      if (draft.revision !== expectedRevision) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      if (!["draft", "uploaded"].includes(draft.status) || draft.active_run_id) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const otherDeletion = rows<{ id: string }>(
        await tx.execute(sql`
          select id from invoice_source_assets
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid and id <> ${assetId}::uuid
            and lifecycle = 'attached' and delete_requested_at is not null
          limit 1
        `),
      )[0];
      if (otherDeletion) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      await tx.execute(sql`
        update invoice_source_assets
        set delete_requested_at = now(), delete_failure_code = null,
            updated_at = now()
        where company_id = ${context.actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid and id = ${assetId}::uuid
          and lifecycle = 'attached'
      `);
      const reserved = rows<{ revision: number }>(
        await tx.execute(sql`
          update invoice_review_drafts
          set revision = revision + 1,
              updated_by_company_id = ${context.actor.actorCompanyId},
              updated_by_user_id = ${context.actor.actorUserId},
              updated_at = now(), last_activity_at = now()
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${draftId}::uuid and revision = ${expectedRevision}
          returning revision
        `),
      )[0];
      return {
        status: "pending",
        objectKey: asset.object_key,
        documentId: asset.document_id,
        revision: reserved.revision,
      };
    });
  }

  async markDeleteFailure(
    actor: InvoiceActorContext,
    draftId: string,
    assetId: string,
    failureCode: "STORAGE_UNAVAILABLE" | "TOMBSTONE_FAILED" =
      "STORAGE_UNAVAILABLE",
  ): Promise<void> {
    await this.database.execute(sql`
      update invoice_source_assets
      set delete_attempts = delete_attempts + 1,
          delete_failure_code = ${failureCode}, updated_at = now()
      where company_id = ${actor.effectiveCompanyId}
        and draft_id = ${draftId}::uuid and id = ${assetId}::uuid
        and lifecycle = 'attached'
    `);
  }

  async finalizeDelete(
    context: InvoiceMutationContext,
    draftId: string,
    documentId: string,
    assetId: string,
    expectedRevision: number,
  ): Promise<InvoiceDraftDto> {
    return this.database.transaction(async (tx) => {
      const draft = rows<DraftMutationRow>(
        await tx.execute(sql`
          select id, status, revision, active_run_id,
                 created_at, updated_at, last_activity_at
          from invoice_review_drafts
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${draftId}::uuid
          for update
        `),
      )[0];
      if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      const current = rows<{ lifecycle: string; hold_at: Date | null }>(
        await tx.execute(sql`
          select lifecycle, hold_at from invoice_source_assets
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
            and document_id = ${documentId}::uuid and id = ${assetId}::uuid
          for update
        `),
      )[0];
      if (!current) throw new InvoiceDomainError("INVOICE_ASSET_NOT_FOUND");
      if (current.lifecycle === "deleted") {
        return publicDraft(
          draft,
          await this.getSourceWith(tx, context.actor.effectiveCompanyId, draftId),
        );
      }
      if (draft.revision !== expectedRevision) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      if (!["draft", "uploaded"].includes(draft.status) || draft.active_run_id) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      if (current.hold_at) throw new InvoiceDomainError("INVOICE_ASSET_HELD");
      await tx.execute(sql`
        update invoice_source_assets
        set lifecycle = 'deleted', object_key = null, position = null,
            deleted_at = now(), delete_failure_code = null, updated_at = now()
        where company_id = ${context.actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid
          and document_id = ${documentId}::uuid and id = ${assetId}::uuid
      `);
      await tx.execute(sql`
        update invoice_source_assets set position = position + 1000
        where company_id = ${context.actor.effectiveCompanyId}
          and document_id = ${documentId}::uuid
          and lifecycle = 'attached'
      `);
      await tx.execute(sql`
        with ordered as (
          select id, row_number() over (order by position, id) as next_position
          from invoice_source_assets
          where company_id = ${context.actor.effectiveCompanyId}
            and document_id = ${documentId}::uuid and lifecycle = 'attached'
        )
        update invoice_source_assets asset
        set position = ordered.next_position, updated_at = now()
        from ordered where asset.id = ordered.id
      `);
      const aggregate = await this.fingerprint(
        tx,
        context.actor.effectiveCompanyId,
        documentId,
      );
      const updated = rows<DraftMutationRow>(
        await tx.execute(sql`
          update invoice_review_drafts
          set status = ${aggregate.totalPages === 0 ? "draft" : "uploaded"}::invoice_draft_status,
              updated_by_company_id = ${context.actor.actorCompanyId},
              updated_by_user_id = ${context.actor.actorUserId},
              updated_at = now(), last_activity_at = now()
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${draftId}::uuid and revision = ${expectedRevision}
          returning id, status, revision, active_run_id,
                    created_at, updated_at, last_activity_at
        `),
      )[0];
      await this.audit(tx, context, "asset.deleted", assetId);
      return publicDraft(
        updated,
        await this.getSourceWith(tx, context.actor.effectiveCompanyId, draftId),
      );
    });
  }

  async reorder(
    context: InvoiceMutationContext,
    draftId: string,
    expectedRevision: number,
    assetIds: readonly string[],
  ): Promise<InvoiceDraftDto> {
    return this.database.transaction(async (tx) => {
      const draft = rows<DraftMutationRow>(
        await tx.execute(sql`
          select id, status, revision, active_run_id,
                 created_at, updated_at, last_activity_at
          from invoice_review_drafts
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${draftId}::uuid
          for update
        `),
      )[0];
      if (!draft) throw new InvoiceDomainError("INVOICE_DRAFT_NOT_FOUND");
      const assets = rows<{ id: string; document_id: string }>(
        await tx.execute(sql`
          select id, document_id
          from invoice_source_assets
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid and lifecycle = 'attached'
          order by position, id
          for update
        `),
      );
      const currentIds = assets.map((asset) => asset.id);
      if (
        currentIds.length === assetIds.length &&
        currentIds.every((id, index) => id === assetIds[index])
      ) {
        return publicDraft(
          draft,
          await this.getSourceWith(tx, context.actor.effectiveCompanyId, draftId),
        );
      }
      if (draft.revision !== expectedRevision) {
        throw new InvoiceDomainError("INVOICE_DRAFT_REVISION_CONFLICT");
      }
      if (!["draft", "uploaded"].includes(draft.status) || draft.active_run_id) {
        throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      }
      const deletionPending = rows<{ id: string }>(
        await tx.execute(sql`
          select id from invoice_source_assets
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
            and lifecycle = 'attached' and delete_requested_at is not null
          limit 1
        `),
      )[0];
      if (deletionPending) throw new InvoiceDomainError("INVOICE_INVALID_STATE");
      if (
        currentIds.length !== assetIds.length ||
        new Set(assetIds).size !== assetIds.length ||
        currentIds.some((id) => !assetIds.includes(id))
      ) {
        throw new InvoiceDomainError("INVOICE_ASSET_ORDER_CONFLICT");
      }
      const documentId = assets[0]?.document_id;
      if (!documentId && assetIds.length) {
        throw new InvoiceDomainError("INVOICE_ASSET_ORDER_CONFLICT");
      }
      await tx.execute(sql`
        update invoice_source_assets set position = position + 1000
        where company_id = ${context.actor.effectiveCompanyId}
          and draft_id = ${draftId}::uuid and lifecycle = 'attached'
      `);
      for (let index = 0; index < assetIds.length; index += 1) {
        await tx.execute(sql`
          update invoice_source_assets set position = ${index + 1}, updated_at = now()
          where company_id = ${context.actor.effectiveCompanyId}
            and draft_id = ${draftId}::uuid
            and id = ${assetIds[index]}::uuid and lifecycle = 'attached'
        `);
      }
      if (documentId) {
        await this.fingerprint(tx, context.actor.effectiveCompanyId, documentId);
      }
      const updated = rows<DraftMutationRow>(
        await tx.execute(sql`
          update invoice_review_drafts
          set revision = revision + 1,
              updated_by_company_id = ${context.actor.actorCompanyId},
              updated_by_user_id = ${context.actor.actorUserId},
              updated_at = now(), last_activity_at = now()
          where company_id = ${context.actor.effectiveCompanyId}
            and id = ${draftId}::uuid and revision = ${expectedRevision}
          returning id, status, revision, active_run_id,
                    created_at, updated_at, last_activity_at
        `),
      )[0];
      await this.audit(
        tx,
        context,
        "asset.reordered",
        documentId ?? draftId,
        documentId ? "source_document" : "draft",
      );
      return publicDraft(
        updated,
        await this.getSourceWith(tx, context.actor.effectiveCompanyId, draftId),
      );
    });
  }

  async listReconciliationCandidates(companyId?: string): Promise<
    Array<{
      companyId: string;
      draftId: string;
      documentId: string;
      assetId: string;
      objectKey: string;
      lifecycle: "staging" | "verified" | "attached" | "deleted";
      draftRevision: number;
    }>
  > {
    return rows<{
      company_id: string;
      draft_id: string;
      document_id: string;
      id: string;
      object_key: string;
      lifecycle: "staging" | "verified" | "attached" | "deleted";
      draft_revision: number;
    }>(
      await this.database.execute(sql`
        select asset.company_id, asset.draft_id, asset.document_id, asset.id,
               asset.object_key, asset.lifecycle,
               draft.revision as draft_revision
        from invoice_source_assets asset
        join invoice_review_drafts draft
          on draft.company_id = asset.company_id
         and draft.id = asset.draft_id
        where ${
          companyId === undefined
            ? sql`true`
            : sql`asset.company_id = ${companyId}`
        }
          and (
            (
              asset.lifecycle in ('staging', 'verified')
              and asset.object_key is not null
              and asset.updated_at < now() - interval '15 minutes'
            )
            or (
              asset.lifecycle = 'attached'
              and asset.delete_failure_code is not null
            )
            or (
              asset.lifecycle = 'deleted'
              and asset.object_key is not null
            )
          )
        order by asset.updated_at, asset.id
        limit 100
      `),
    ).map((row) => ({
      companyId: row.company_id,
      draftId: row.draft_id,
      documentId: row.document_id,
      assetId: row.id,
      objectKey: row.object_key,
      lifecycle: row.lifecycle,
      draftRevision: row.draft_revision,
    }));
  }

  async clearDeletedObjectKey(
    actor: InvoiceActorContext,
    draftId: string,
    assetId: string,
  ): Promise<void> {
    await this.database.execute(sql`
      update invoice_source_assets
      set object_key = null, updated_at = now()
      where company_id = ${actor.effectiveCompanyId}
        and draft_id = ${draftId}::uuid
        and id = ${assetId}::uuid
        and lifecycle = 'deleted'
    `);
  }

  async abandonReconciliationCandidate(candidate: {
    companyId: string;
    draftId: string;
    documentId: string;
    assetId: string;
    lifecycle: "staging" | "verified";
  }): Promise<void> {
    await this.database.execute(sql`
      delete from invoice_source_assets
      where company_id = ${candidate.companyId}
        and draft_id = ${candidate.draftId}::uuid
        and document_id = ${candidate.documentId}::uuid
        and id = ${candidate.assetId}::uuid
        and lifecycle = ${candidate.lifecycle}::invoice_source_asset_lifecycle
    `);
  }

  private async audit(
    tx: SqlExecutor,
    context: InvoiceMutationContext,
    action: string,
    targetId: string,
    targetType = "source_asset",
  ): Promise<void> {
    await tx.execute(sql`
      insert into invoice_audit_events (
        company_id, actor_user_id, actor_company_id, action,
        target_type, target_id, correlation_id, request_id, metadata
      ) values (
        ${context.actor.effectiveCompanyId}, ${context.actor.actorUserId},
        ${context.actor.actorCompanyId}, ${action}, ${targetType},
        ${targetId}::uuid, ${context.correlationId}::uuid,
        ${context.requestId ?? null}::uuid, '{}'::jsonb
      )
    `);
  }
}
