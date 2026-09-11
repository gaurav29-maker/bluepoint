/**
 * Which connection string to use, and why there is more than one name.
 *
 * Connecting Supabase to Vercel through their integration does not set
 * DATABASE_URL. It injects POSTGRES_URL (pooled, pgbouncer, 6543),
 * POSTGRES_URL_NON_POOLING (direct, 5432) and a few others. Reading only
 * DATABASE_URL meant a correctly connected Supabase project still produced
 * "No experts are listed yet", which is indistinguishable from an empty one.
 *
 * So both names work, ours first: anything set by hand is deliberate and
 * should beat anything injected.
 */

/** Names accepted for the pooled connection the app runs on. */
const RUNTIME_KEYS = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"] as const;

/**
 * Names accepted for migrations. DDL wants the direct connection: a
 * transaction pooler multiplexes statements across backends, which is wrong
 * for schema changes, so the non-pooling string is preferred here and the
 * pooled one is only a fallback.
 */
const MIGRATION_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
] as const;

function pick(keys: readonly string[]): { url: string; from: string } | null {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim() !== "") return { url: value, from: key };
  }
  return null;
}

/** Throws with the names it looked for, rather than just the one it likes. */
function require_(keys: readonly string[], what: string): { url: string; from: string } {
  const found = pick(keys);
  if (found) return found;

  /*
   * The confusing case: POSTGRES_URL_NON_POOLING is set and nothing else, so
   * a connection string plainly exists and the app still refuses to start.
   * It is refused on purpose — the direct connection opens a real backend per
   * invocation and a serverless function will exhaust Postgres on it, which
   * fails later, intermittently, under load. Better to say so now than to
   * start and fall over on the first busy day.
   */
  if (what === "database" && process.env.POSTGRES_URL_NON_POOLING) {
    throw new Error(
      "Only POSTGRES_URL_NON_POOLING is set. That is the direct connection, " +
        "which serverless functions must not run on — they would exhaust Postgres. " +
        "Set POSTGRES_URL (the pooled string, port 6543) or DATABASE_URL.",
    );
  }

  throw new Error(
    `No ${what} connection string. Set one of: ${keys.join(", ")}. ` +
      "Connecting Supabase to Vercel provides the POSTGRES_* names automatically.",
  );
}

export function runtimeConnection() {
  return require_(RUNTIME_KEYS, "database");
}

export function migrationConnection() {
  return require_(MIGRATION_KEYS, "migration");
}

/** True when any accepted name is set — for telling "not configured" from "empty". */
export function hasDatabaseUrl(): boolean {
  return pick(RUNTIME_KEYS) !== null;
}
