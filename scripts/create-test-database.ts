import "dotenv/config";
import { Client } from "pg";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set");
}

const parsedUrl = new URL(testDatabaseUrl);
if (!["localhost", "127.0.0.1"].includes(parsedUrl.hostname)) {
  throw new Error("TEST_DATABASE_URL must target local PostgreSQL");
}

const databaseName = parsedUrl.pathname.slice(1);
if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
  throw new Error("TEST_DATABASE_URL contains an invalid database name");
}

parsedUrl.pathname = "/postgres";
const client = new Client({ connectionString: parsedUrl.toString() });

try {
  await client.connect();
  const existing = await client.query(
    "select 1 from pg_database where datname = $1",
    [databaseName],
  );
  if (existing.rowCount === 0) {
    await client.query(`create database "${databaseName}"`);
    console.log(`Created local test database: ${databaseName}`);
  } else {
    console.log(`Local test database already exists: ${databaseName}`);
  }
} finally {
  await client.end();
}
