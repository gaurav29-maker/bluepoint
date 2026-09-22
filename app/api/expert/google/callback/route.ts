import { NextResponse } from "next/server";
import { completeConnection, verifyState } from "@/lib/google";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Where Google sends the expert back.
 *
 * Deliberately NOT trusting the session cookie here for identity. The expert
 * is taken from the signed `state`, which is the only thing that ties this
 * callback to the consent screen that started it. A cookie would say who is
 * holding the browser, not who asked for this connection — and those come
 * apart on a shared machine.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  // The expert pressed Cancel on Google's screen. Not an error.
  const denied = url.searchParams.get("error");
  if (denied) return NextResponse.redirect(new URL("/expert/profile?google=cancelled", BASE));

  const expertId = verifyState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!expertId || !code) {
    return NextResponse.redirect(new URL("/expert/profile?google=failed", BASE));
  }

  try {
    await completeConnection(expertId, code);
  } catch (err) {
    console.error("[google] connection failed", err);
    return NextResponse.redirect(new URL("/expert/profile?google=failed", BASE));
  }

  return NextResponse.redirect(new URL("/expert/profile?google=connected", BASE));
}
