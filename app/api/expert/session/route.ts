import { NextRequest, NextResponse } from "next/server";
import { EXPERT_COOKIE, mintExpertSession, verifyExpertLink } from "@/lib/expert-auth";

export const dynamic = "force-dynamic";

/** Trades an emailed link for a session cookie. Route handler because Next
 *  only permits cookies().set() here or in a server action. */
export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  const expertId = await verifyExpertLink(req.nextUrl.searchParams.get("t"));

  if (!expertId) return NextResponse.redirect(`${base}/expert/login?expired=1`);

  const { value, expiresAt } = await mintExpertSession(expertId);
  const res = NextResponse.redirect(`${base}/expert`);
  res.cookies.set(EXPERT_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return res;
}
