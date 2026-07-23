import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { Client } from "pg";
import { requireExactLocalTestDatabase } from "../../../scripts/test-database-guard";
import type { InvoiceActorContext } from "@shared/invoice-extraction/contracts";

const connectionString = requireExactLocalTestDatabase(
  process.env.DATABASE_URL,
);
const client = new Client({ connectionString });
const companyA = randomUUID();
const companyB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();

const actorA: InvoiceActorContext = {
  actorUserId: userA,
  actorCompanyId: companyA,
  effectiveCompanyId: companyA,
  role: "admin",
  isProductAdministrator: false,
};
const actorB: InvoiceActorContext = {
  actorUserId: userB,
  actorCompanyId: companyB,
  effectiveCompanyId: companyB,
  role: "shop_user",
  isProductAdministrator: false,
};

before(async () => {
  await client.connect();
  await client.query(
    `insert into companies(id, name) values ($1, 'Ledger A'), ($2, 'Ledger B')`,
    [companyA, companyB],
  );
  await client.query(
    `insert into users(id, email, role, company_id)
     values ($1, $2, 'admin', $3), ($4, $5, 'shop_user', $6)`,
    [
      userA,
      `${userA}@test.invalid`,
      companyA,
      userB,
      `${userB}@test.invalid`,
      companyB,
    ],
  );
});

after(async () => {
  await client
    .query("delete from invoice_audit_events where false")
    .catch(() => undefined);
  await client.query(
    `delete from company_invoice_feature_flags where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  );
  await client.query(
    `delete from invoice_line_matches where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  ).catch(() => undefined);
  await client.query(
    `delete from invoice_part_aliases where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  ).catch(() => undefined);
  await client.query(
    `delete from invoice_review_totals where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  ).catch(() => undefined);
  await client.query(
    `delete from invoice_review_lines where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  ).catch(() => undefined);
  await client.query(
    `delete from invoice_review_headers where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  ).catch(() => undefined);
  await client.query(
    `delete from invoice_extraction_proposals where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  ).catch(() => undefined);
  await client.query(
    `delete from invoice_provider_attempts where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  );
  await client.query(
    `delete from invoice_source_assets where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  );
  await client.query(
    `delete from invoice_documents where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  );
  await client.query(
    `update invoice_review_drafts set active_run_id = null
      where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  );
  await client.query(
    `delete from invoice_extraction_runs where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  );
  await client.query(
    `delete from invoice_review_drafts where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  );
  await client.query(
    `delete from inventory_parts where company_id = any($1::varchar[])`,
    [[companyA, companyB]],
  );
  // Audit is append-only by design, so company fixtures intentionally remain.
  await client.end();
  const { closeDatabase } = await import("../../db");
  await closeDatabase();
});

test("migration journal is idempotent and ledger constraints are installed", async () => {
  const journal = await client.query(
    "select hash, created_at from drizzle.__drizzle_migrations order by created_at",
  );
  assert.equal(journal.rowCount, 9);
  for (const [index, migration] of [
    "0000_brownfield_baseline.sql",
    "0001_invoice_ledger_core.sql",
    "0002_invoice_private_sources.sql",
    "0003_invoice_extraction_proposals.sql",
    "0004_invoice_attempt_ownership.sql",
    "0005_invoice_header_review.sql",
    "0006_invoice_header_review_state.sql",
    "0007_invoice_line_review.sql",
    "0008_invoice_part_matching.sql",
  ].entries()) {
    const contents = await readFile(`migrations/${migration}`, "utf8");
    assert.equal(
      journal.rows[index].hash,
      createHash("sha256").update(contents).digest("hex"),
    );
  }
  const trigger = await client.query(
    `select 1 from pg_trigger
      where tgname = 'invoice_audit_events_append_only' and not tgisinternal`,
  );
  assert.equal(trigger.rowCount, 1);
  const sentinel = await client.query(
    `select intake.id, intake.quickbooks_id, intake.qb_invoice_number,
            item.id as item_id, item.quickbooks_id as item_quickbooks_id
       from inventory_intakes intake
       join inventory_intake_items item
         on item.inventory_intake_id = intake.id
      where intake.id = '00000000-0000-4000-8000-000000000104'`,
  );
  assert.deepEqual(sentinel.rows, [
    {
      id: "00000000-0000-4000-8000-000000000104",
      quickbooks_id: "qb-sentinel-intake",
      qb_invoice_number: "SENTINEL-001",
      item_id: "00000000-0000-4000-8000-000000000105",
      item_quickbooks_id: "qb-sentinel-line",
    },
  ]);
});

test("overlapping migration runners serialize and remain idempotent", async () => {
  const { applyInvoiceMigrations } =
    await import("../../../scripts/invoice-migration-runner");
  const first = new Client({ connectionString });
  const second = new Client({ connectionString });
  await Promise.all([first.connect(), second.connect()]);
  try {
    await Promise.all([
      applyInvoiceMigrations(first),
      applyInvoiceMigrations(second),
    ]);
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
  const journal = await client.query(
    "select count(*)::int as count from drizzle.__drizzle_migrations",
  );
  assert.equal(journal.rows[0].count, 9);
});

test("private source lifecycle preserves tenant, page, order and fingerprint invariants", async () => {
  const { PostgresInvoiceRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-repository");
  const { PostgresInvoiceDocumentRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-document-repository");
  const ledger = new PostgresInvoiceRepository();
  const sources = new PostgresInvoiceDocumentRepository();
  const context = {
    actor: actorA,
    correlationId: randomUUID(),
    requestId: randomUUID(),
  };
  const draft = await ledger.createDraft(context);
  const first = await sources.reserve(
    context,
    draft.id,
    draft.revision,
    "../../first.png",
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
  );
  await sources.markVerified(
    actorA,
    draft.id,
    first.documentId,
    first.assetId,
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
    {
      detectedType: "image/png",
      byteSize: 100,
      sha256: "a".repeat(64),
      pageCount: 4,
    },
  );
  const uploaded = await sources.attach(
    context,
    draft.id,
    first.documentId,
    first.assetId,
    draft.revision,
    10,
  );
  assert.equal(uploaded.status, "uploaded");
  assert.equal(uploaded.revision, 1);
  assert.equal(uploaded.source?.assets[0].displayName, "first.png");
  assert.equal(uploaded.source?.totalPages, 4);

  const second = await sources.reserve(
    context,
    draft.id,
    uploaded.revision,
    "second.pdf",
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
  );
  await sources.markVerified(
    actorA,
    draft.id,
    second.documentId,
    second.assetId,
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
    {
      detectedType: "application/pdf",
      byteSize: 200,
      sha256: "b".repeat(64),
      pageCount: 6,
    },
  );
  const twoAssets = await sources.attach(
    context,
    draft.id,
    second.documentId,
    second.assetId,
    uploaded.revision,
    10,
  );
  assert.equal(twoAssets.source?.totalPages, 10);
  const overLimit = await sources.reserve(
    context,
    draft.id,
    twoAssets.revision,
    "over-limit.png",
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
  );
  await sources.markVerified(
    actorA,
    draft.id,
    overLimit.documentId,
    overLimit.assetId,
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
    {
      detectedType: "image/png",
      byteSize: 50,
      sha256: "c".repeat(64),
      pageCount: 1,
    },
  );
  await assert.rejects(
    sources.attach(
      context,
      draft.id,
      overLimit.documentId,
      overLimit.assetId,
      twoAssets.revision,
      10,
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVOICE_PAGE_LIMIT",
  );
  await sources.abandonVerified(
    actorA,
    draft.id,
    overLimit.documentId,
    overLimit.assetId,
  );
  const beforeFingerprint = await client.query<{ fingerprint_sha256: string }>(
    `select fingerprint_sha256 from invoice_documents
      where company_id = $1 and draft_id = $2`,
    [companyA, draft.id],
  );
  assert.match(beforeFingerprint.rows[0].fingerprint_sha256, /^[0-9a-f]{64}$/);

  const reordered = await sources.reorder(
    context,
    draft.id,
    twoAssets.revision,
    [second.assetId, first.assetId],
  );
  assert.deepEqual(
    reordered.source?.assets.map((asset) => asset.id),
    [second.assetId, first.assetId],
  );
  const afterFingerprint = await client.query<{ fingerprint_sha256: string }>(
    `select fingerprint_sha256 from invoice_documents
      where company_id = $1 and draft_id = $2`,
    [companyA, draft.id],
  );
  assert.notEqual(
    afterFingerprint.rows[0].fingerprint_sha256,
    beforeFingerprint.rows[0].fingerprint_sha256,
  );

  await assert.rejects(
    sources.getSource(actorB, draft.id),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVOICE_DRAFT_NOT_FOUND",
  );
  await assert.rejects(
    client.query(
      `insert into invoice_source_assets (
         company_id, draft_id, document_id, display_name
       ) values ($1, $2, $3, 'foreign')`,
      [companyB, draft.id, first.documentId],
    ),
    /foreign key/i,
  );

  const replay = await sources.reorder(
    context,
    draft.id,
    twoAssets.revision,
    [second.assetId, first.assetId],
  );
  assert.equal(replay.revision, reordered.revision);
  const pendingSecond = await sources.prepareDelete(
    context,
    draft.id,
    second.assetId,
    reordered.revision,
  );
  assert.equal(pendingSecond?.status, "pending");
  assert.equal(pendingSecond?.status === "pending" && pendingSecond.revision, 4);
  const pendingReplay = await sources.prepareDelete(
    context,
    draft.id,
    second.assetId,
    reordered.revision,
  );
  assert.deepEqual(pendingReplay, pendingSecond);
  await assert.rejects(
    ledger.createAndActivateRun(
      context,
      draft.id,
      pendingSecond?.status === "pending"
        ? pendingSecond.revision
        : reordered.revision,
      "uploaded",
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVOICE_INVALID_STATE",
  );
  await assert.rejects(
    sources.reorder(
      context,
      draft.id,
      pendingSecond?.status === "pending"
        ? pendingSecond.revision
        : reordered.revision,
      [first.assetId, second.assetId],
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVOICE_INVALID_STATE",
  );
  const oneAsset = await sources.finalizeDelete(
    context,
    draft.id,
    second.documentId,
    second.assetId,
    pendingSecond?.status === "pending"
      ? pendingSecond.revision
      : reordered.revision,
  );
  assert.equal(oneAsset.source?.totalPages, 4);
  const pendingFirst = await sources.prepareDelete(
    context,
    draft.id,
    first.assetId,
    oneAsset.revision,
  );
  assert.equal(pendingFirst?.status, "pending");
  const empty = await sources.finalizeDelete(
    context,
    draft.id,
    first.documentId,
    first.assetId,
    pendingFirst?.status === "pending" ? pendingFirst.revision : oneAsset.revision,
  );
  assert.equal(empty.status, "draft");
  assert.equal(empty.source?.totalPages, 0);
  assert.deepEqual(empty.source?.assets, []);
  assert.equal(
    (
      await sources.prepareDelete(
        context,
        draft.id,
        first.assetId,
        empty.revision,
      )
    )?.status,
    "deleted",
  );

  const held = await sources.reserve(
    context,
    draft.id,
    empty.revision,
    "held.png",
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
  );
  await sources.markVerified(
    actorA,
    draft.id,
    held.documentId,
    held.assetId,
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
    {
      detectedType: "image/png",
      byteSize: 10,
      sha256: "d".repeat(64),
      pageCount: 1,
    },
  );
  const heldAttached = await sources.attach(
    context,
    draft.id,
    held.documentId,
    held.assetId,
    empty.revision,
    10,
  );
  await client.query(
    `update invoice_source_assets set hold_at = now()
      where company_id = $1 and id = $2`,
    [companyA, held.assetId],
  );
  await assert.rejects(
    sources.prepareDelete(
      context,
      draft.id,
      held.assetId,
      heldAttached.revision,
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVOICE_ASSET_HELD",
  );
});

test("private source replacement is atomic at the page limit", async () => {
  const { PostgresInvoiceRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-repository");
  const { PostgresInvoiceDocumentRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-document-repository");
  const ledger = new PostgresInvoiceRepository();
  const sources = new PostgresInvoiceDocumentRepository();
  const context = {
    actor: actorA,
    correlationId: randomUUID(),
    requestId: randomUUID(),
  };
  const draft = await ledger.createDraft(context);
  const original = await sources.reserve(
    context,
    draft.id,
    draft.revision,
    "ten-pages.pdf",
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
  );
  await sources.markVerified(
    actorA,
    draft.id,
    original.documentId,
    original.assetId,
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
    {
      detectedType: "application/pdf",
      byteSize: 100,
      sha256: "d".repeat(64),
      pageCount: 10,
    },
  );
  const full = await sources.attach(
    context,
    draft.id,
    original.documentId,
    original.assetId,
    draft.revision,
    10,
  );
  const replacement = await sources.reserve(
    context,
    draft.id,
    full.revision,
    "replacement.png",
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
  );
  await sources.markVerified(
    actorA,
    draft.id,
    replacement.documentId,
    replacement.assetId,
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
    {
      detectedType: "image/png",
      byteSize: 50,
      sha256: "e".repeat(64),
      pageCount: 1,
    },
  );

  const replaced = await sources.attach(
    context,
    draft.id,
    replacement.documentId,
    replacement.assetId,
    full.revision,
    10,
    original.assetId,
  );

  assert.equal(replaced.revision, full.revision + 1);
  assert.equal(replaced.source?.totalPages, 1);
  assert.deepEqual(
    replaced.source?.assets.map((asset) => [
      asset.id,
      asset.position,
      asset.checksumSha256,
    ]),
    [[replacement.assetId, 1, "e".repeat(64)]],
  );
  const lifecycle = await client.query<{
    lifecycle: string;
    position: number | null;
    deleted_at: Date | null;
  }>(
    `select lifecycle, position, deleted_at
       from invoice_source_assets
      where company_id = $1 and id = $2`,
    [companyA, original.assetId],
  );
  assert.equal(lifecycle.rows[0].lifecycle, "deleted");
  assert.equal(lifecycle.rows[0].position, null);
  assert.ok(lifecycle.rows[0].deleted_at);
});

test("journal adoption rejects an incomplete ledger fingerprint", async () => {
  const { assertBrownfieldBaseline } =
    await import("../../../scripts/invoice-migration-preflight");
  await client.query("begin");
  try {
    await client.query("drop index invoice_provider_attempts_claim_idx");
    await assert.rejects(
      assertBrownfieldBaseline(client),
      /journaled invoice ledger is incompatible/,
    );
  } finally {
    await client.query("rollback");
  }
});

test("journal adoption rejects drifted private source definitions", async () => {
  const { assertBrownfieldBaseline } =
    await import("../../../scripts/invoice-migration-preflight");
  await client.query("begin");
  try {
    await client.query(
      "drop index invoice_source_assets_document_checksum_unique",
    );
    await assert.rejects(
      assertBrownfieldBaseline(client),
      /journaled private invoice sources are incompatible/,
    );
  } finally {
    await client.query("rollback");
  }
});

test("optional accounting integration table is outside the invoice baseline", async () => {
  const { assertBrownfieldBaseline } =
    await import("../../../scripts/invoice-migration-preflight");
  await client.query("begin");
  try {
    await client.query("drop table company_integrations cascade");
    await assert.doesNotReject(assertBrownfieldBaseline(client));
  } finally {
    await client.query("rollback");
  }
});

test("missing flags resolve false while manual receiving remains true", async () => {
  const { PostgresInvoiceRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-repository");
  const repository = new PostgresInvoiceRepository();
  assert.deepEqual(await repository.resolveFeatures(companyA), {
    manualReceiving: true,
    scanExtraction: false,
    stockConfirmation: false,
    engineActivation: false,
  });
});

test("tenant reads are non-disclosing and cross-tenant child SQL is rejected", async () => {
  const { PostgresInvoiceRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-repository");
  const repository = new PostgresInvoiceRepository();
  const draft = await repository.createDraft({
    actor: actorA,
    correlationId: randomUUID(),
  });
  assert.equal(await repository.getDraft(actorB, draft.id), null);
  assert.equal(
    (await repository.listDrafts(actorB)).some((row) => row.id === draft.id),
    false,
  );
  await assert.rejects(
    client.query(
      `insert into invoice_extraction_runs(
        company_id, draft_id, run_number, base_draft_revision,
        requested_by_company_id, requested_by_user_id, correlation_id
      ) values ($1, $2, 1, 0, $1, $3, $4)`,
      [companyB, draft.id, userB, randomUUID()],
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "23503",
  );
});

test("draft CAS, active run and stale run completion are deterministic", async () => {
  const { InvoiceDomainError } =
    await import("@shared/invoice-extraction/contracts");
  const { PostgresInvoiceRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-repository");
  const repository = new PostgresInvoiceRepository();
  const draft = await repository.createDraft({
    actor: actorA,
    correlationId: randomUUID(),
  });
  const uploaded = await repository.transitionDraft(
    { actor: actorA, correlationId: randomUUID() },
    draft.id,
    draft.revision,
    "draft",
    "uploaded",
  );
  const first = await repository.createAndActivateRun(
    { actor: actorA, correlationId: randomUUID() },
    draft.id,
    uploaded.revision,
    "uploaded",
  );
  const second = await repository.createAndActivateRun(
    { actor: actorA, correlationId: randomUUID() },
    draft.id,
    first.draft.revision,
    "uploaded",
  );
  const firstAttempt = await repository.createAttempt(
    { actor: actorA, correlationId: randomUUID() },
    first.runId,
    "test-provider",
  );
  const firstClaim = await repository.claimAttempt(
    companyA,
    "stale-run-worker",
    120,
  );
  assert.equal(firstClaim?.id, firstAttempt);
  assert.ok(firstClaim);
  await repository.completeAttempt(
    { actor: actorA, correlationId: randomUUID() },
    firstAttempt,
    firstClaim.lease_token,
    firstClaim.revision,
    `stale-${randomUUID()}`,
    "completed",
  );
  const secondAttempt = await repository.createAttempt(
    { actor: actorA, correlationId: randomUUID() },
    second.runId,
    "test-provider",
  );
  const secondClaim = await repository.claimAttempt(
    companyA,
    "current-run-worker",
    120,
  );
  assert.equal(secondClaim?.id, secondAttempt);
  assert.ok(secondClaim);
  await repository.completeAttempt(
    { actor: actorA, correlationId: randomUUID() },
    secondAttempt,
    secondClaim.lease_token,
    secondClaim.revision,
    `current-${randomUUID()}`,
    "completed",
  );
  assert.equal(
    await repository.completeRun(
      { actor: actorA, correlationId: randomUUID() },
      first.runId,
      0,
      "completed",
    ),
    "STALE_RUN",
  );
  assert.equal(
    await repository.completeRun(
      { actor: actorA, correlationId: randomUUID() },
      second.runId,
      0,
      "completed",
    ),
    "CURRENT_RUN",
  );
  const unchanged = await repository.getDraft(actorA, draft.id);
  assert.equal(unchanged?.status, "uploaded");
  assert.equal(unchanged?.revision, second.draft.revision);
  await assert.rejects(
    repository.transitionDraft(
      { actor: actorA, correlationId: randomUUID() },
      draft.id,
      0,
      "draft",
      "uploaded",
    ),
    (error: unknown) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_DRAFT_REVISION_CONFLICT",
  );
});

test("only one attempt may complete a run", async () => {
  const { InvoiceDomainError } =
    await import("@shared/invoice-extraction/contracts");
  const { PostgresInvoiceRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-repository");
  const repository = new PostgresInvoiceRepository();
  const draft = await repository.createDraft({
    actor: actorA,
    correlationId: randomUUID(),
  });
  const uploaded = await repository.transitionDraft(
    { actor: actorA, correlationId: randomUUID() },
    draft.id,
    draft.revision,
    "draft",
    "uploaded",
  );
  const run = await repository.createAndActivateRun(
    { actor: actorA, correlationId: randomUUID() },
    draft.id,
    uploaded.revision,
    "uploaded",
  );
  const firstAttempt = await repository.createAttempt(
    { actor: actorA, correlationId: randomUUID() },
    run.runId,
    "test-provider",
  );
  const firstClaim = await repository.claimAttempt(companyA, "winner-a", 120);
  assert.equal(firstClaim?.id, firstAttempt);
  assert.ok(firstClaim);
  await repository.completeAttempt(
    { actor: actorA, correlationId: randomUUID() },
    firstAttempt,
    firstClaim.lease_token,
    firstClaim.revision,
    `winner-${randomUUID()}`,
    "completed",
  );
  const secondAttempt = await repository.createAttempt(
    { actor: actorA, correlationId: randomUUID() },
    run.runId,
    "test-provider",
  );
  const secondClaim = await repository.claimAttempt(companyA, "winner-b", 120);
  assert.equal(secondClaim?.id, secondAttempt);
  assert.ok(secondClaim);
  await assert.rejects(
    repository.completeAttempt(
      { actor: actorA, correlationId: randomUUID() },
      secondAttempt,
      secondClaim.lease_token,
      secondClaim.revision,
      `winner-${randomUUID()}`,
      "completed",
    ),
    (error: unknown) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_INVALID_STATE",
  );
});

test("draft transitions and transport attempts are bounded by server policy", async () => {
  const { InvoiceDomainError } =
    await import("@shared/invoice-extraction/contracts");
  const { PostgresInvoiceRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-repository");
  const repository = new PostgresInvoiceRepository(undefined, 1);
  const draft = await repository.createDraft({
    actor: actorB,
    correlationId: randomUUID(),
  });
  await assert.rejects(
    repository.transitionDraft(
      { actor: actorB, correlationId: randomUUID() },
      draft.id,
      draft.revision,
      "draft",
      "confirmed",
    ),
    (error: unknown) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_INVALID_STATE",
  );
  await assert.rejects(
    repository.createAndActivateRun(
      { actor: actorB, correlationId: randomUUID() },
      draft.id,
      draft.revision,
      "draft",
    ),
    (error: unknown) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_INVALID_STATE",
  );
  const uploaded = await repository.transitionDraft(
    { actor: actorB, correlationId: randomUUID() },
    draft.id,
    draft.revision,
    "draft",
    "uploaded",
  );
  const run = await repository.createAndActivateRun(
    { actor: actorB, correlationId: randomUUID() },
    draft.id,
    uploaded.revision,
    "uploaded",
  );
  const leasedAttempt = await repository.createAttempt(
    { actor: actorB, correlationId: randomUUID() },
    run.runId,
    "test-provider",
  );
  await assert.rejects(
    repository.createAttempt(
      { actor: actorB, correlationId: randomUUID() },
      run.runId,
      "test-provider",
    ),
    (error: unknown) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_INVALID_STATE",
  );
  const lease = await repository.claimAttempt(companyB, "late-worker", 120);
  assert.equal(lease?.id, leasedAttempt);
  assert.ok(lease);
  await repository.completeRun(
    { actor: actorB, correlationId: randomUUID() },
    run.runId,
    0,
    "canceled",
  );
  assert.equal(
    await repository.claimAttempt(companyB, "late-worker", 120),
    null,
  );
  await assert.rejects(
    repository.completeAttempt(
      { actor: actorB, correlationId: randomUUID() },
      leasedAttempt,
      lease.lease_token,
      lease.revision,
      `late-${randomUUID()}`,
      "completed",
    ),
    (error: unknown) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_LEASE_LOST",
  );
  await assert.rejects(
    repository.createAttempt(
      { actor: actorB, correlationId: randomUUID() },
      run.runId,
      "test-provider",
    ),
    (error: unknown) =>
      error instanceof InvoiceDomainError &&
      error.code === "INVOICE_INVALID_STATE",
  );
});

test("two concurrent claimers yield one lease and expired DB-time leases are reclaimable", async () => {
  const { PostgresInvoiceRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-repository");
  const repository = new PostgresInvoiceRepository();
  const draft = await repository.createDraft({
    actor: actorA,
    correlationId: randomUUID(),
  });
  const uploaded = await repository.transitionDraft(
    { actor: actorA, correlationId: randomUUID() },
    draft.id,
    draft.revision,
    "draft",
    "uploaded",
  );
  const run = await repository.createAndActivateRun(
    { actor: actorA, correlationId: randomUUID() },
    draft.id,
    uploaded.revision,
    "uploaded",
  );
  const attemptId = await repository.createAttempt(
    { actor: actorA, correlationId: randomUUID() },
    run.runId,
    "test-provider",
  );
  const [first, second] = await Promise.all([
    repository.claimAttempt(companyA, "worker-a", 120),
    repository.claimAttempt(companyA, "worker-b", 120),
  ]);
  assert.equal([first, second].filter(Boolean).length, 1);
  const claim = first ?? second;
  assert.ok(claim);
  await assert.rejects(
    repository.renewAttemptLease(
      companyA,
      attemptId,
      randomUUID(),
      claim.revision,
      120,
    ),
    /lease is no longer valid/i,
  );
  await client.query(
    `update invoice_provider_attempts
      set lease_expires_at = now() - interval '1 second'
      where id = $1`,
    [attemptId],
  );
  const reclaimed = await repository.claimAttempt(companyA, "worker-c", 120);
  assert.equal(reclaimed?.id, attemptId);
  assert.ok(reclaimed);
  await repository.completeAttempt(
    { actor: actorA, correlationId: randomUUID() },
    attemptId,
    reclaimed.lease_token,
    reclaimed.revision,
    "provider-response-unique",
    "completed",
  );
  const otherDraft = await repository.createDraft({
    actor: actorA,
    correlationId: randomUUID(),
  });
  const otherUploaded = await repository.transitionDraft(
    { actor: actorA, correlationId: randomUUID() },
    otherDraft.id,
    otherDraft.revision,
    "draft",
    "uploaded",
  );
  const otherRun = await repository.createAndActivateRun(
    { actor: actorA, correlationId: randomUUID() },
    otherDraft.id,
    otherUploaded.revision,
    "uploaded",
  );
  const otherAttemptId = await repository.createAttempt(
    { actor: actorA, correlationId: randomUUID() },
    otherRun.runId,
    "test-provider",
  );
  const otherClaim = await repository.claimAttempt(companyA, "worker-d", 120);
  assert.equal(otherClaim?.id, otherAttemptId);
  assert.ok(otherClaim);
  await assert.rejects(
    repository.completeAttempt(
      { actor: actorA, correlationId: randomUUID() },
      otherAttemptId,
      otherClaim.lease_token,
      otherClaim.revision,
      "provider-response-unique",
      "completed",
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "INVOICE_PROVIDER_RESPONSE_CONFLICT",
  );
});

test("durable extraction publishes only a tenant-owned current proposal", async () => {
  const { PostgresInvoiceRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-repository");
  const { PostgresInvoiceDocumentRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-document-repository");
  const { PostgresInvoiceExtractionRepository } =
    await import("../../modules/invoice-extraction/repositories/invoice-extraction-repository");
  const { loadInvoiceConfig } =
    await import("../../modules/invoice-extraction/config/invoice-config");
  const ledger = new PostgresInvoiceRepository();
  const documents = new PostgresInvoiceDocumentRepository();
  const extractions = new PostgresInvoiceExtractionRepository();
  const context = { actor: actorA, correlationId: randomUUID() };
  const draft = await ledger.createDraft(context);
  const source = await documents.reserve(
    context,
    draft.id,
    draft.revision,
    "invoice.png",
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
  );
  await documents.markVerified(
    actorA,
    draft.id,
    source.documentId,
    source.assetId,
    `invoice-sources/${randomUUID()}/${randomUUID()}`,
    {
      detectedType: "image/png",
      byteSize: 100,
      sha256: "d".repeat(64),
      pageCount: 1,
    },
  );
  const uploaded = await documents.attach(
    context,
    draft.id,
    source.documentId,
    source.assetId,
    draft.revision,
    10,
  );
  const run = await extractions.start(
    actorA,
    draft.id,
    uploaded.revision,
    randomUUID(),
    loadInvoiceConfig({
      NODE_ENV: "test",
      OPENAI_API_KEY: "mock-only",
    }),
  );
  assert.equal(run.status, "queued");
  assert.equal(run.model, "gpt-5.6-terra");
  assert.equal(await extractions.get(actorB, run.id), null);

  const claimed = await extractions.claimNext("worker-a", 120);
  assert.equal(claimed?.runId, run.id);
  assert.ok(claimed);
  const responseId = `resp_${randomUUID()}`;
  await extractions.markSubmitted(claimed, responseId, 1);
  await client.query(
    `update invoice_provider_attempts
        set available_at = now() - interval '1 second'
      where id = $1`,
    [claimed.id],
  );
  const reclaimed = await extractions.claimNext("worker-b", 120);
  assert.equal(reclaimed?.providerResponseId, responseId);
  assert.ok(reclaimed);
  const empty = {
    observed: null,
    normalized: null,
    confidence: null,
    sourceAssetId: null,
    sourcePage: null,
  };
  await extractions.settleClaim(reclaimed, {
    status: "completed",
    responseId,
    proposal: {
      schemaVersion: "invoice-proposal-v1",
      header: {
        vendorName: { ...empty, observed: "Vendor", normalized: "Vendor" },
        invoiceNumber: empty,
        invoiceDate: empty,
        currency: { ...empty, observed: "USD", normalized: "USD" },
        subtotal: empty,
        tax: empty,
        freight: empty,
        total: empty,
      },
      lines: [],
      uncertainties: [
        { path: "header.total", reason: "missing", message: "Not visible" },
      ],
    },
  });
  const completed = await extractions.get(actorA, run.id);
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.proposal?.header.vendorName.normalized, "Vendor");
  const currentDraft = await ledger.getDraft(actorA, draft.id);
  assert.equal(currentDraft?.status, "needs_review");
  const { InvoiceHeaderReviewService } =
    await import("../../modules/invoice-extraction/services/invoice-header-review-service");
  const reviews = new InvoiceHeaderReviewService();
  const review = await reviews.get(actorA, draft.id);
  assert.equal(review.proposedHeader.vendorName.normalized, "Vendor");
  assert.equal(review.finalHeader.vendorName, "Vendor");
  assert.ok(review.issues.some((issue) => issue.path === "header.total"));
  await assert.rejects(
    reviews.get(actorB, draft.id),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVOICE_DRAFT_NOT_FOUND",
  );
  const approved = await reviews.update(
    actorA,
    draft.id,
    {
      revision: review.draftRevision,
      header: {
        ...review.finalHeader,
        vendorName: "Vendor",
        invoiceNumber: "INV-1",
        invoiceDate: "2026-07-23",
        currency: "USD",
        total: "100.00",
      },
      reviewedFields: [
        "vendorName",
        "invoiceNumber",
        "invoiceDate",
        "currency",
        "subtotal",
        "tax",
        "freight",
        "total",
      ],
      decision: "approved",
    },
    randomUUID(),
  );
  assert.equal(approved.decision, "approved");
  assert.equal(approved.issues.length, 0);
  await assert.rejects(
    reviews.update(actorA, draft.id, {
      revision: review.draftRevision,
      header: approved.finalHeader,
      reviewedFields: approved.reviewedFields,
      decision: "draft",
    }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVOICE_DRAFT_REVISION_CONFLICT",
  );
  const { InvoiceLineReviewService } =
    await import("../../modules/invoice-extraction/services/invoice-line-review-service");
  const lineReviews = new InvoiceLineReviewService();
  const linesApproved = await lineReviews.update(
    actorA,
    draft.id,
    {
      revision: approved.draftRevision,
      lines: [
        {
          id: null,
          description: "Synthetic brake pad",
          vendorPartNumber: "BP-TEST",
          quantity: "2",
          unitCost: "50.0000",
          classification: "inventory",
        },
      ],
      decision: "approved",
    },
    randomUUID(),
  );
  assert.equal(linesApproved.lines.length, 1);
  assert.equal(linesApproved.lines[0].calculatedLineTotal, "100.00");
  assert.equal(linesApproved.reconciliation.calculatedTotal, "100.00");
  assert.equal(linesApproved.reconciliation.withinTolerance, true);
  assert.equal(linesApproved.reconciliation.decision, "approved");
  await assert.rejects(
    lineReviews.update(actorA, draft.id, {
      revision: linesApproved.draftRevision,
      lines: [
        {
          id: linesApproved.lines[0].id,
          description: "Synthetic brake pad",
          vendorPartNumber: "BP-TEST",
          quantity: "2",
          unitCost: "49.0000",
          classification: "inventory",
        },
      ],
      decision: "approved",
    }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVOICE_RECONCILIATION_REQUIRED",
  );
  const afterFailedApproval = await reviews.get(actorA, draft.id);
  assert.equal(afterFailedApproval.draftRevision, linesApproved.draftRevision);
  assert.equal(afterFailedApproval.lines[0].unitCost, "50.0000");
  await assert.rejects(
    lineReviews.update(actorA, draft.id, {
      revision: linesApproved.draftRevision,
      lines: [
        {
          id: linesApproved.lines[0].id,
          description: "Synthetic brake pad",
          vendorPartNumber: "BP-TEST",
          quantity: "NaN",
          unitCost: "50.00",
          classification: "inventory",
        },
      ],
      decision: "draft",
    }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVOICE_NUMERIC_INVALID",
  );
  const ownedPartId = randomUUID();
  const foreignPartId = randomUUID();
  await client.query(
    `insert into inventory_parts (
       id, name, part_number, category, item_type, price, company_id
     ) values
       ($1, 'Synthetic Brake Pad', 'BP-TEST', 'Brakes', 'inventory', 50, $2),
       ($3, 'Foreign Brake Pad', 'BP-TEST', 'Brakes', 'inventory', 50, $4)`,
    [ownedPartId, companyA, foreignPartId, companyB],
  );
  const { InvoicePartMatchService } =
    await import("../../modules/invoice-extraction/services/invoice-part-match-service");
  const partMatches = new InvoicePartMatchService();
  const candidates = await partMatches.candidates(
    actorA,
    draft.id,
    linesApproved.lines[0].id,
  );
  assert.equal(candidates[0].part.id, ownedPartId);
  assert.equal(candidates.some((candidate) => candidate.part.id === foreignPartId), false);
  assert.ok(candidates[0].signals.includes("Exact part reference"));
  await assert.rejects(
    partMatches.update(
      actorA,
      draft.id,
      linesApproved.draftRevision,
      [
        {
          lineId: linesApproved.lines[0].id,
          decision: "existing",
          selectedPartId: foreignPartId,
          proposedNewPart: null,
        },
      ],
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVOICE_INVALID_REQUEST",
  );
  const afterForeignAttempt = await reviews.get(actorA, draft.id);
  assert.equal(afterForeignAttempt.draftRevision, linesApproved.draftRevision);
  const matched = await partMatches.update(
    actorA,
    draft.id,
    linesApproved.draftRevision,
    [
      {
        lineId: linesApproved.lines[0].id,
        decision: "existing",
        selectedPartId: ownedPartId,
        proposedNewPart: null,
      },
    ],
    randomUUID(),
  );
  assert.equal(matched.lines[0].match.decision, "existing");
  assert.equal(matched.lines[0].match.selectedPart?.id, ownedPartId);
  assert.equal(matched.lines[0].match.originalSuggestion?.partId, ownedPartId);
  const rejected = await reviews.reject(
    actorA,
    draft.id,
    matched.draftRevision,
    "Not a supplier invoice",
    randomUUID(),
  );
  assert.equal(rejected.decision, "rejected");
  assert.equal(rejected.rejectionReason, "Not a supplier invoice");
  assert.equal(
    (await ledger.getDraft(actorA, draft.id))?.status,
    "rejected",
  );

  const eventId = `evt_${randomUUID()}`;
  assert.equal(
    await extractions.recordWebhook(eventId, "response.completed", responseId),
    true,
  );
  assert.equal(
    await extractions.recordWebhook(eventId, "response.completed", responseId),
    false,
  );
  await assert.rejects(
    client.query(
      `update invoice_extraction_proposals
          set payload = '{}'::jsonb
        where company_id = $1 and run_id = $2`,
      [companyA, run.id],
    ),
    /immutable/,
  );
});

test("audit attribution is append-only", async () => {
  const event = await client.query(
    `select id, company_id, actor_company_id, actor_user_id
       from invoice_audit_events
      where company_id = $1
      order by created_at desc
      limit 1`,
    [companyA],
  );
  assert.equal(event.rows[0].company_id, companyA);
  assert.equal(event.rows[0].actor_company_id, companyA);
  assert.equal(event.rows[0].actor_user_id, userA);
  await assert.rejects(
    client.query(
      "update invoice_audit_events set action = 'tampered' where id = $1",
      [event.rows[0].id],
    ),
    /append-only/,
  );
  await assert.rejects(
    client.query("delete from invoice_audit_events where id = $1", [
      event.rows[0].id,
    ]),
    /append-only/,
  );
});
