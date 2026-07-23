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
    `delete from invoice_provider_attempts where company_id = any($1::varchar[])`,
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
  // Audit is append-only by design, so company fixtures intentionally remain.
  await client.end();
  const { closeDatabase } = await import("../../db");
  await closeDatabase();
});

test("migration journal is idempotent and ledger constraints are installed", async () => {
  const journal = await client.query(
    "select hash, created_at from drizzle.__drizzle_migrations order by created_at",
  );
  assert.equal(journal.rowCount, 2);
  for (const [index, migration] of [
    "0000_brownfield_baseline.sql",
    "0001_invoice_ledger_core.sql",
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
  assert.equal(journal.rows[0].count, 2);
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
