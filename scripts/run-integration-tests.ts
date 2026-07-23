import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { Client } from "pg";
import { requireExactLocalTestDatabase } from "./test-database-guard";

const testDatabaseUrl = requireExactLocalTestDatabase(
  process.env.TEST_DATABASE_URL,
);

const testFiles = readdirSync("server/tests/integration")
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => `server/tests/integration/${name}`);
if (testFiles.length === 0) {
  throw new Error("No integration test files found");
}

const lockClient = new Client({ connectionString: testDatabaseUrl });
await lockClient.connect();
try {
  await lockClient.query("select pg_advisory_lock($1)", [1_104_202_611]);
  const preparation = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/prepare-test-database.ts"],
    {
      env: {
        ...process.env,
        TEST_DATABASE_URL: testDatabaseUrl,
      },
      stdio: "inherit",
    },
  );
  if (preparation.error) throw preparation.error;
  if (preparation.status !== 0) {
    throw new Error("Unable to prepare the integration-test database");
  }
  const migration = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate-test-database.ts"],
    {
      env: {
        ...process.env,
        TEST_DATABASE_URL: testDatabaseUrl,
        DATABASE_URL: testDatabaseUrl,
        DATABASE_DRIVER: "node-postgres",
      },
      stdio: "inherit",
    },
  );
  if (migration.error) throw migration.error;
  if (migration.status !== 0) {
    throw new Error("Unable to migrate the integration-test database");
  }

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", ...testFiles],
    {
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        DATABASE_DRIVER: "node-postgres",
        NODE_ENV: "test",
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await lockClient.query("select pg_advisory_unlock($1)", [1_104_202_611]);
  await lockClient.end();
}
