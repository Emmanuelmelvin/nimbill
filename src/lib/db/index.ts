import "server-only";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
import { SCHEMA_SQL } from "./schema";

// Production: Postgres via DATABASE_URL (Neon serverless HTTP driver).
// Local dev: an embedded Postgres (PGlite) stored in ./.data, zero setup.
type DB = ReturnType<typeof drizzlePglite<typeof schema>>;

const g = globalThis as unknown as { __nimbillDb?: Promise<DB> };

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sql = neon(url);
    for (const stmt of SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
      await sql.query(stmt);
    }
    return drizzleNeon(sql, { schema }) as unknown as DB;
  }
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. Add a Postgres database (e.g. Neon) in your Vercel project.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { mkdirSync } = await import("node:fs");
  const dir = `${process.cwd()}/.data/pglite`;
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await client.exec(SCHEMA_SQL);
  return drizzlePglite(client, { schema });
}

export function getDb(): Promise<DB> {
  if (!g.__nimbillDb) {
    g.__nimbillDb = create().catch((e) => {
      g.__nimbillDb = undefined;
      throw e;
    });
  }
  return g.__nimbillDb;
}

export { schema };
