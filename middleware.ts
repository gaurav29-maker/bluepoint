import { NextResponse, type NextRequest } from "next/server";
import { OPS_COOKIE, sessionValid } from "@/lib/ops-auth";
import { MEMBER_COOKIE, verifySession } from "@/lib/member-auth";

/**
 * Everything under /ops holds real customer data — names, emails and portfolio
 * summaries — so the guard sits in front of the routes rather than inside each
 * page, where one forgetful import would open the lot.
 */
export const config = { matcher: ["/ops/:path*", "/member/:path*"] };

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // The member console: /member itself may carry a one-time sign-in link, and
  // the login page must stay reachable, so both are handled by the page.
  if (path === "/member" || path === "/member/login") return NextResponse.next();

  if (path.startsWith("/member")) {
    if (await verifySession(req.cookies.get(MEMBER_COOKIE)?.value)) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = "/member/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (path === "/ops/login") return NextResponse.next();

  if (await sessionValid(req.cookies.get(OPS_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/ops/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}
