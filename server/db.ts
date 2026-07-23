import "dotenv/config";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import {
  drizzle as drizzleNeon,
  type NeonDatabase,
} from "drizzle-orm/neon-serverless";
import { Pool as NodePostgresPool } from "pg";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const useNodePostgres = process.env.DATABASE_DRIVER === "node-postgres";

neonConfig.webSocketConstructor = ws;

const pool = useNodePostgres
  ? new NodePostgresPool({ connectionString: process.env.DATABASE_URL })
  : new NeonPool({ connectionString: process.env.DATABASE_URL });

// Both Drizzle PostgreSQL adapters expose the same query surface used by the
// application. Keeping the public type stable avoids leaking environment
// selection into every repository.
export const db: NeonDatabase<typeof schema> = useNodePostgres
  ? (drizzleNodePostgres({
      client: pool as NodePostgresPool,
      schema,
    }) as unknown as NeonDatabase<typeof schema>)
  : drizzleNeon({
      client: pool as NeonPool,
      schema,
    });

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
