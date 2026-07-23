import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Client } from "pg";
import { assertBrownfieldBaseline } from "./invoice-migration-preflight";

const migrations = [
  "0000_brownfield_baseline.sql",
  "0001_invoice_ledger_core.sql",
  "0002_invoice_private_sources.sql",
  "0003_invoice_extraction_proposals.sql",
  "0004_invoice_attempt_ownership.sql",
  "0005_invoice_header_review.sql",
  "0006_invoice_header_review_state.sql",
  "0007_invoice_line_review.sql",
  "0008_invoice_part_matching.sql",
] as const;

function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function applyInvoiceMigrations(client: Client): Promise<void> {
  const migrationLock = 1_104_202_612;
  await client.query("select pg_advisory_lock($1)", [migrationLock]);
  try {
    await assertBrownfieldBaseline(client);
    await client.query("begin");
    await client.query("create schema if not exists drizzle");
    await client.query(`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);
    await client.query("commit");

    for (let index = 0; index < migrations.length; index += 1) {
      const createdAt = 1784764800000 + index * 1000;
      const migrationName = migrations[index];
      const contents = await readFile(
        join(process.cwd(), "migrations", migrationName),
        "utf8",
      );
      const hash = createHash("sha256").update(contents).digest("hex");
      const present = await client.query<{ hash: string }>(
        "select hash from drizzle.__drizzle_migrations where created_at = $1",
        [createdAt],
      );
      if (present.rowCount) {
        if (present.rows[0].hash !== hash) {
          throw new Error(
            `Migration integrity check failed for ${migrationName}`,
          );
        }
        continue;
      }
      const statements = splitStatements(contents);
      for (const statement of statements.filter((value) =>
        /\bcreate\s+unique\s+index\s+concurrently\b/i.test(value),
      )) {
        await client.query(statement);
      }
      await client.query("begin");
      for (const statement of statements.filter(
        (value) => !/\bcreate\s+unique\s+index\s+concurrently\b/i.test(value),
      )) {
        await client.query(statement);
      }
      await client.query(
        "insert into drizzle.__drizzle_migrations(hash, created_at) values ($1, $2)",
        [hash, createdAt],
      );
      await client.query("commit");
    }
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client
      .query("select pg_advisory_unlock($1)", [migrationLock])
      .catch(() => undefined);
  }
}
import { createHash } from "node:crypto";
