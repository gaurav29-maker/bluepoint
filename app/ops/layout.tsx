import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { OPS_COOKIE, sessionValid } from "@/lib/ops-auth";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Ops — Bluepoint",
  robots: { index: false, follow: false },
};

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  // The login page lives under /ops too, so the chrome is gated on the session
  // rather than on the path — otherwise a signed-out visitor is shown a nav bar
  // and a "Sign out" button on the very page asking them to sign in.
  const signedIn = await sessionValid((await cookies()).get(OPS_COOKIE)?.value);

  if (!signedIn) return <>{children}</>;

  return (
    <div className="ops">
      <header className="ops-bar">
        <div className="ops-bar-inner">
          <Link href="/ops" className="logo ops-logo">
            blue<span>point</span> <em>ops</em>
          </Link>
          <nav className="ops-nav">
            <Link href="/ops">Overview</Link>
            <Link href="/ops/bookings">Bookings</Link>
            <Link href="/ops/members">Members</Link>
            <Link href="/ops/experts">Experts</Link>
            <Link href="/ops/applications">Applications</Link>
            <Link href="/">Site</Link>
          </nav>
          <form action={signOut}>
            <button className="ops-signout" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="ops-main">{children}</main>
    </div>
  );
}
