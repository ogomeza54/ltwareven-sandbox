import "dotenv/config";
import { Client } from "pg";
import { applyInvoiceMigrations } from "./invoice-migration-runner";

if (process.env.INVOICE_MIGRATION_APPROVED !== "true") {
  throw new Error(
    "Refusing schema migration without INVOICE_MIGRATION_APPROVED=true",
  );
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for schema migration");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await applyInvoiceMigrations(client);
  console.log("Applied versioned invoice migrations");
} finally {
  await client.end();
}
