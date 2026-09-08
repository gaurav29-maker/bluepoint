import { NextResponse, type NextRequest } from "next/server";
import { OPS_COOKIE, sessionValid } from "@/lib/ops-auth";

/**
 * Everything under /ops holds real customer data — names, emails and portfolio
 * summaries — so the guard sits in front of the routes rather than inside each
 * page, where one forgetful import would open the lot.
 */
export const config = { matcher: ["/ops/:path*"] };

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/ops/login") return NextResponse.next();

  if (await sessionValid(req.cookies.get(OPS_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/ops/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}
