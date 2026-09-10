import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  // Next emits its own <meta name="robots" content="noindex"> on a 404;
  // repeating it here just produced two tags saying the same thing.
  title: "Page not found — Bluepoint",
};

/**
 * Until now a 404 rendered Next's default: black text on white, no nav, no
 * footer, no way back into the site. The link checker added last week stops
 * us shipping a broken link; it does nothing about the ways people actually
 * arrive here — a mistyped address, a link from somewhere old, or an emailed
 * booking link opened long after the booking finished.
 *
 * That last one is the reason this page names the console. Someone who has
 * paid and cannot find their session needs somewhere to go, not an apology.
 */
export default function NotFound() {
  return (
    <div className="site">
      <SiteNav />

      <div className="wrap">
        <div className="doc">
          <h1 className="doc-name">This page doesn&rsquo;t exist.</h1>
          <p className="doc-lede">
            The address may have changed, or the link may have been written down wrong. Nothing has
            happened to your account or your bookings.
          </p>

          <section className="doc-sec">
            <h2 className="doc-h2">Where you might be going</h2>
            <ul className="ul">
              <li>
                <b>
                  <Link href="/experts">Find an expert</Link>
                </b>{" "}— everyone currently taking sessions, with their next open time.
              </li>
              <li>
                <b>
                  <Link href="/member/login">Bluepoint OS</Link>
                </b>{" "}— your sessions, passes and receipts. If you followed a booking link
                from an email and landed here, the booking itself is in there.
              </li>
              <li>
                <b>
                  <Link href="/apply">Take calls on Bluepoint</Link>
                </b>{" "}— if you are the one with the experience.
              </li>
            </ul>
          </section>

          <section className="doc-sec">
            <p>
              If you were sent this link by us, it is our mistake and worth telling us about:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
