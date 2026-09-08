import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Ops — Bluepoint",
  robots: { index: false, follow: false },
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
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
            <Link href="/ops/experts">Experts</Link>
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
