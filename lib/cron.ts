import { NextRequest } from "next/server";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
