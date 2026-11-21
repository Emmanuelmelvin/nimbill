// A throwaway in-memory PGlite for one test file, never .data or a real database, and no email.
// getDb() keeps its connection and "already migrated" marker on globalThis, which test files share
// (--isolate=modules), so both are reset here and again when the file is done.
import { afterAll } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/lib/db/schema.ts";

type DbGlobals = { __nimbillConn?: unknown; __nimbillSchemaSql?: string; __nimbillMigrating?: unknown };

export function memoryDb(): PGlite {
  const g = globalThis as DbGlobals;
  // What test files change: put back afterwards so the next file starts from the real values.
  const { DATABASE_URL, RESEND_API_KEY, NIMIQ_RPC_URL } = process.env;
  delete process.env.DATABASE_URL;
  delete process.env.RESEND_API_KEY;
  delete g.__nimbillSchemaSql;
  delete g.__nimbillMigrating;
  const client = new PGlite();
  g.__nimbillConn = Promise.resolve({
    db: drizzle(client, { schema }),
    migrate: async (sql: string) => void (await client.exec(sql)),
  });
  afterAll(async () => {
    delete g.__nimbillConn;
    delete g.__nimbillSchemaSql;
    delete g.__nimbillMigrating;
    delete process.env.DATABASE_URL;
    delete process.env.RESEND_API_KEY;
    delete process.env.NIMIQ_RPC_URL;
    if (DATABASE_URL !== undefined) process.env.DATABASE_URL = DATABASE_URL;
    if (RESEND_API_KEY !== undefined) process.env.RESEND_API_KEY = RESEND_API_KEY;
    if (NIMIQ_RPC_URL !== undefined) process.env.NIMIQ_RPC_URL = NIMIQ_RPC_URL;
    await client.close();
  });
  return client;
}
