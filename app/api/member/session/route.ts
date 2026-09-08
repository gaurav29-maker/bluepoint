import { NextRequest, NextResponse } from "next/server";
import { MEMBER_COOKIE, mintSession, verifyLink } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * Trades an emailed sign-in link for a session cookie.
 *
 * This lives in a route handler because Next only permits cookies().set() in
 * a server action or a route handler — never during a page render, which is
 * where it was first attempted.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const customerId = await verifyLink(token);

  const base = req.nextUrl.origin;
  if (!customerId) {
    return NextResponse.redirect(`${base}/member/login?expired=1`);
  }

  const { value, expiresAt } = await mintSession(customerId);
  const res = NextResponse.redirect(`${base}/member`);
  res.cookies.set(MEMBER_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return res;
}
