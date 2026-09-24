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
        <Wordmark className="mark" href="/" />
        <div className="nav-mid">
          <Link href="/experts">Find an expert</Link>
          <a href={to("#audit")}>Audit my portfolio</a>
          <a href={to("#ways")}>Packages</a>
          <a href={to("#how")}>How it works</a>
        </div>
        <div className="nav-end">
          {/* Before the button: it is a setting, not a call to action. */}
          <ThemeToggle />
          <Link className="b b-fill b-sm" href="/experts">
            Find an expert
          </Link>
        </div>
      </div>

      {/*
        Sign-in sits outside the capsule, not in it.

        The capsule is what the site is — where to go and what to do. Getting
        into your own console is a different kind of errand and belongs beside
        that object rather than inside it, which is also how the reference
        separates its account link from its navigation.
      */}
      <div className="nav-aside">
        <Link className="b b-line b-sm" href="/member/login">
          Landline OS
        </Link>
      </div>
    </nav>
  );
}
