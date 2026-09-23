import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import Wordmark from "@/components/Wordmark";

/**
 * The public shell, shared rather than copied.
 *
 * `onLanding` is not cosmetic. The section links are in-page anchors on the
 * home page and must become root-relative anywhere else, or they scroll to
 * nothing — and a same-page "/#experts" would trigger a full navigation
 * instead of a scroll.
 */
export default function SiteNav({ onLanding = false }: { onLanding?: boolean }) {
  const to = (hash: string) => (onLanding ? hash : `/${hash}`);

  return (
    <nav className="nav">
      <div className="nav-in">
        {/*
          The mark sits on glass, the same material as the hero instrument —
          same sheet, same rim, same tint, all from the same tokens.

          A lozenge and not the disc from the artwork: that disc holds the
          wordmark AND "financial expert" stacked inside it, and at the 32px
          a nav bar allows, the second line is roughly two pixels tall. The
          disc belongs somewhere it can be read at its own size.
        */}
        <Wordmark className="mark mark-badge glassy" href="/" />
        <div className="nav-mid">
          <Link href="/experts">Find an expert</Link>
          <a href={to("#audit")}>Audit my portfolio</a>
          <a href={to("#ways")}>Packages</a>
          <a href={to("#how")}>How it works</a>
        </div>
        <div className="nav-end">
          {/* Before the two buttons: it is a setting, not a call to action. */}
          <ThemeToggle />
          <Link className="b b-line b-sm" href="/member/login">
            Landline OS
          </Link>
          <Link className="b b-fill b-sm" href="/experts">
            Find an expert
          </Link>
        </div>
      </div>
    </nav>
  );
}
