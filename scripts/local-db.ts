import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A local Postgres for development, with nothing to install and no account.
 *
 * PGlite is Postgres compiled to WebAssembly; the socket server puts it behind
 * the real wire protocol, so the app connects with an ordinary connection
 * string and neither Drizzle nor postgres.js knows the difference.
 *
 * DEVELOPMENT ONLY. Data lives in .pglite/ on this machine, there is no
 * backup, no concurrency to speak of, and no durability guarantee. Production
 * still needs a real Postgres — Neon or Supabase.
 *
 *   npm run db:local     (leave running)
 *   npm run db:push      (in another terminal)
 *   npm run db:seed
 */

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5432);
/*
 * Kept OUT of the project directory on purpose. This repo lives inside
 * OneDrive, whose syncing has already corrupted .next twice; a database
 * directory being synced mid-write is a worse version of the same problem.
 */
const DIR = process.env.LOCAL_DB_DIR ?? path.join(os.tmpdir(), "bluepoint-pglite");

async function main() {
  fs.mkdirSync(DIR, { recursive: true });

  const db = await PGlite.create({ dataDir: DIR });
  /*
 * maxConnections defaults to ONE. With that, drizzle-kit holds the single
 * slot and every later client — the seed, the dev server, a second tab — is
 * rejected outright, which surfaces as an unexplained ECONNRESET.
 */
const server = new PGLiteSocketServer({
  db,
  port: PORT,
  host: "127.0.0.1",
  maxConnections: 20,
});

  await server.start();

  console.log(`\n  Local Postgres ready on port ${PORT}`);
  console.log(`  Data in ${DIR}\n`);
  console.log("  Put this in .env.local:\n");
  console.log(`    DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres"\n`);
  console.log("  Then, in another terminal: npm run db:push && npm run db:seed\n");
  console.log("  Ctrl-C to stop. Development only — production needs a real Postgres.\n");

  const close = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
