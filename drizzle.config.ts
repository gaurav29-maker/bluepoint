import type { Config } from "drizzle-kit";
import { loadEnv } from "./scripts/load-env";

loadEnv();

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
