import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Lazy on purpose. `next build` imports every route module to collect page
 * data, so throwing on a missing DATABASE_URL at import time would make the
 * build require a live database. The error should land on first query instead.
 */
let instance: PostgresJsDatabase<typeof schema> | null = null;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (instance) return instance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

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
