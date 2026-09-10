import Link from "next/link";

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
        <Link href="/" className="mark">
          blue<span>point</span>
        </Link>
        <div className="nav-mid">
          <a href={to("#experts")}>Experts</a>
          <a href={to("#how")}>How it works</a>
          <a href={to("#pricing")}>Pricing</a>
          <a href={to("#faq")}>FAQs</a>
        </div>
        <div className="nav-end">
          <Link className="b b-line b-sm" href="/member/login">
            Bluepoint OS
          </Link>
          <a className="b b-fill b-sm" href={to("#experts")}>
            Book a call
          </a>
        </div>
      </div>
    </nav>
  );
}
