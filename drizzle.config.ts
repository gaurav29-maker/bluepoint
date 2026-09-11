import type { Config } from "drizzle-kit";
import { loadEnv } from "./scripts/load-env";
import { migrationConnection } from "./lib/db/connection";

loadEnv();

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Prefers the direct connection: a transaction pooler is the wrong place
  // to run DDL. See lib/db/connection.ts.
  dbCredentials: { url: migrationConnection().url },
} satisfies Config;
