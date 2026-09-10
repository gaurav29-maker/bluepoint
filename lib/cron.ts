import crypto from "node:crypto";
import { NextRequest } from "next/server";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 *
 * Compared in constant time, like every other secret in this codebase. `===`
 * on a string returns as soon as two bytes differ, which leaks how much of a
 * guess was right. Exploiting that across a network is genuinely hard, but
 * this is a two-line fix and the inconsistency was the real problem: a reader
 * finding one hand-rolled comparison among five careful ones cannot tell
 * whether it was reasoned about or missed.
 */
export function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const offered = req.headers.get("authorization");
  if (!offered) return false;

  const a = Buffer.from(offered, "utf8");
  const b = Buffer.from(`Bearer ${secret}`, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
