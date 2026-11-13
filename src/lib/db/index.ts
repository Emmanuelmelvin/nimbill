import "server-only";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { neon } from "@neondatabase/serverless";
import { env } from "../env";
import { Errors } from "../errors";
import * as schema from "./schema";
import { SCHEMA_SQL } from "./schema";

// Production: Postgres via DATABASE_URL (Neon serverless HTTP driver).
// Local dev: an embedded Postgres (PGlite) stored in ./.data, zero setup.
type DB = ReturnType<typeof drizzlePglite<typeof schema>>;
type Conn = { db: DB; migrate: (sql: string) => Promise<void> };

// Kept on globalThis so dev hot reloads reuse one connection (PGlite allows one per folder).
// `schemaSql` is what was last applied: when a reload brings new SCHEMA_SQL (a new column, say),
// it is applied to the open connection instead of waiting for a server restart.
const g = globalThis as unknown as { __nimbillConn?: Promise<Conn>; __nimbillSchemaSql?: string; __nimbillMigrating?: Promise<void> };

async function connect(): Promise<Conn> {
  const url = env.DATABASE_URL;
  if (url) {
    const sql = neon(url);
    const migrate = async (text: string) => {
      for (const stmt of text
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)) {
        await sql.query(stmt);
      }
    };
    return { db: drizzleNeon(sql, { schema }) as unknown as DB, migrate };
  }
  if (env.VERCEL) {
    throw Errors.config("DATABASE_URL is not set. Add a Postgres database (e.g. Neon) in your Vercel project.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { mkdirSync } = await import("node:fs");
  const dir = `${process.cwd()}/.data/pglite`;
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  return { db: drizzlePglite(client, { schema }), migrate: async (text) => void (await client.exec(text)) };
}

export async function getDb(): Promise<DB> {
  if (!g.__nimbillConn) {
    g.__nimbillConn = connect().catch((e) => {
      g.__nimbillConn = undefined;
      throw e;
    });
  }
  const conn = await g.__nimbillConn;
  // Every statement in SCHEMA_SQL is idempotent (IF NOT EXISTS), so re-running it is safe.
  if (g.__nimbillSchemaSql !== SCHEMA_SQL) {
    const target = SCHEMA_SQL;
    g.__nimbillMigrating ??= conn
      .migrate(target)
      .then(() => {
        g.__nimbillSchemaSql = target;
      })
      .finally(() => {
        g.__nimbillMigrating = undefined;
      });
    await g.__nimbillMigrating;
  }
  return conn.db;
}

export { schema };
