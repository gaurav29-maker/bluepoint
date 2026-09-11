import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { migrationConnection, runtimeConnection } from "./connection";

/**
 * Lazy on purpose. `next build` imports every route module to collect page
 * data, so throwing on a missing DATABASE_URL at import time would make the
 * build require a live database. The error should land on first query instead.
 */
let instance: PostgresJsDatabase<typeof schema> | null = null;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (instance) return instance;

  const { url: connectionString } = runtimeConnection();

  // One connection per invocation, reused across warm starts.
  const globalForDb = globalThis as unknown as { bpClient?: ReturnType<typeof postgres> };
  const client = globalForDb.bpClient ?? postgres(connectionString, { max: 1, prepare: false });
  if (process.env.NODE_ENV !== "production") globalForDb.bpClient = client;

  instance = drizzle(client, { schema });
  return instance;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };

/**
 * A database for command-line scripts — the seed, and anything else run by a
 * person on a laptop rather than by a serverless function.
 *
 * `db` above refuses the direct connection on purpose: a serverless function
 * opens a real backend per invocation and would exhaust Postgres. That
 * reasoning does not apply to a script that runs once and exits, and the
 * direct connection is in fact the right one for it — so the seed hit an
 * error written for a situation it was not in.
 *
 * Same resolution order as migrations, for the same reason: these are the
 * tools you point at a database deliberately.
 */
export function scriptDb(): PostgresJsDatabase<typeof schema> {
  const { url } = migrationConnection();
  return drizzle(postgres(url, { max: 1, prepare: false }), { schema });
}
