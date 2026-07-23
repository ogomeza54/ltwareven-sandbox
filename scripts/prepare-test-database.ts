import "dotenv/config";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { requireExactLocalTestDatabase } from "./test-database-guard";

const connectionString = requireExactLocalTestDatabase(
  process.env.TEST_DATABASE_URL,
);
const client = new Client({ connectionString });

try {
  await client.connect();
  const exported = spawnSync(
    "./node_modules/.bin/drizzle-kit",
    ["export", "--config", "drizzle.config.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        DATABASE_DRIVER: "node-postgres",
      },
    },
  );
  if (exported.error) {
    throw exported.error;
  }
  if (exported.status !== 0) {
    throw new Error(
      `Unable to export the local test schema: ${exported.stderr?.trim() || "unknown drizzle-kit error"}`,
    );
  }
  await client.query(
    "drop schema if exists public cascade; create schema public",
  );
  await client.query(exported.stdout);
  console.log("Rebuilt disposable schema in talavera_invoice_test");
} finally {
  await client.end();
}
