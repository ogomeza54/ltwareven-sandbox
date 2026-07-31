import "dotenv/config";
import { Client } from "pg";
import { requireExactLocalTestDatabase } from "./test-database-guard";
import { applyInvoiceMigrations } from "./invoice-migration-runner";

const connectionString = requireExactLocalTestDatabase(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);
const client = new Client({ connectionString });

try {
  await client.connect();
  await applyInvoiceMigrations(client);
  console.log("Applied guarded invoice migrations to talavera_invoice_test");
} finally {
  await client.end();
}
