"use client";

import { useEffect } from "react";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import { CONTACT_EMAIL } from "@/lib/constants";

/**
 * The other default page nobody had replaced. In production an unhandled
 * render error showed Next's own screen, which says "Application error: a
 * client-side exception has occurred" and nothing else — no nav, no footer,
 * and no indication of whether money moved.
 *
 * Two things matter on this page and neither is the apology. Somebody who
 * hits an error mid-payment needs to be told plainly that a charge, if it
 * happened, stands on its own and is visible in the console — because the
 * webhook confirms a booking regardless of what this browser tab does. And
 * they need the digest, which is the only string that ties what they saw to
 * a line in the server logs.
 *
 * `error.message` is deliberately not shown. React replaces it with a
 * generic string in production anyway, and printing raw error text to a page
 * is how internals end up in screenshots.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Until there is real error reporting, the browser console is the record.
    console.error(error);
  }, [error]);

  return (
    <div className="site">
      <SiteNav />

      <div className="wrap">
        <div className="doc">
          <h1 className="doc-name">Something went wrong on our side.</h1>
          <p className="doc-lede">
            This is a fault in the page, not in anything you did. Trying again is usually enough.
          </p>

          <section className="doc-sec">
            <div className="b-pair">
              <button type="button" className="b b-fill" onClick={reset}>
                Try again
              </button>
              <Link className="b b-line" href="/">
                Back to Bluepoint
              </Link>
            </div>
          </section>

          <section className="doc-sec">
            <h2 className="doc-h2">If you were in the middle of paying</h2>
            <p>
              A payment either completed or it did not; this page cannot change that either way. A
              completed one appears in{" "}
              <Link href="/member/login">Bluepoint OS</Link> with its receipt, and the session is
              held for you there. Nothing is charged twice by reloading.
            </p>
          </section>

          <section className="doc-sec">
            <p>
              Telling us about it helps, particularly if it keeps happening:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
              {error.digest ? (
                <>
                  {" "}
                  Quote this reference and we can find the exact failure:{" "}
                  <code>{error.digest}</code>.
                </>
              ) : null}
            </p>
          </section>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
