import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { EXPERT_COOKIE, verifyExpertSession } from "@/lib/expert-auth";
import { consentUrl, googleConfigured } from "@/lib/google";

/**
 * Starts the connection. A GET that redirects, because it is reached by a
 * link in the console rather than by a form — there is nothing to submit.
 *
 * The expert is identified from their own session here, never from anything
 * in the request, so one expert cannot start a connection for another.
 */
export async function GET() {
  const expertId = await verifyExpertSession((await cookies()).get(EXPERT_COOKIE)?.value);
  if (!expertId) return NextResponse.redirect(new URL("/expert/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));

  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL("/expert/profile?google=unconfigured", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    );
  }

  return NextResponse.redirect(consentUrl(expertId));
}
