import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { requireExactLocalTestDatabase } from "./test-database-guard";

const connectionString = requireExactLocalTestDatabase(
  process.env.TEST_DATABASE_URL,
);
const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query(
    "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public",
  );
  const frozenBaseline = await readFile(
    "migrations/fixtures/0000_brownfield_schema.sql",
    "utf8",
  );
  await client.query(frozenBaseline);
  console.log("Rebuilt frozen Brownfield schema in talavera_invoice_test");
} finally {
  await client.end();
}
