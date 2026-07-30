import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Client } from "pg";
import { assertBrownfieldBaseline } from "./invoice-migration-preflight";

const migrationName = "0000_invoice_recognition_module.sql";
const migrationCreatedAt = 1_784_764_900_000;
const legacyMigrationCreatedAt = Array.from(
  { length: 17 },
  (_, index) => String(1_784_764_800_000 + index * 1_000),
);

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

    const contents = await readFile(
      join(process.cwd(), "migrations", migrationName),
      "utf8",
    );
    const hash = createHash("sha256").update(contents).digest("hex");
    const present = await client.query<{ hash: string }>(
      "select hash from drizzle.__drizzle_migrations where created_at = $1",
      [migrationCreatedAt],
    );
    if (present.rowCount) {
      if (present.rows[0].hash !== hash) {
        throw new Error(`Migration integrity check failed for ${migrationName}`);
      }
      return;
    }

    const legacy = await client.query<{ created_at: string }>(
      `select created_at::text
         from drizzle.__drizzle_migrations
        where created_at = any($1::bigint[])
        order by created_at`,
      [legacyMigrationCreatedAt],
    );
    if (legacy.rowCount) {
      const observed = legacy.rows.map((row) => row.created_at);
      const compatible =
        observed.length >= 16 &&
        observed.every((value, index) => value === legacyMigrationCreatedAt[index]);
      if (!compatible) {
        throw new Error(
          "Legacy invoice migration journal is incomplete; rebuild from a backup before continuing.",
        );
      }
      await client.query("begin");
      await client.query(`
        alter table invoice_extraction_runs
          alter column model set default 'gpt-5.6-luna',
          alter column execution_mode set default 'synchronous'
      `);
      await client.query(
        "insert into drizzle.__drizzle_migrations(hash, created_at) values ($1, $2)",
        [hash, migrationCreatedAt],
      );
      await client.query("commit");
      return;
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
      [hash, migrationCreatedAt],
    );
    await client.query("commit");
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
