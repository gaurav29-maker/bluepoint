import type { Metadata } from "next";

/**
 * This layout exists for one line of metadata.
 *
 * Both pages under /booking are `"use client"` — the payment page polls for
 * status, the intake page is a form — and a client component cannot export
 * `metadata`. So they were inheriting the root layout's `robots: { index:
 * true }`, which means they were not merely un-excluded, they were opted in.
 *
 * robots.ts already disallows /booking/, and the comment there claimed that
 * "every private page also sets index: false in its own metadata". These two
 * did not, so the second layer that comment promised was not there. That
 * matters more here than anywhere else on the site: the intake page holds
 * what a person actually owns, and the URL carries a token that is the only
 * thing standing between a stranger and their session.
 *
 * A layout is a server component, so it can carry what its client children
 * cannot, and metadata flows down to both of them.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
