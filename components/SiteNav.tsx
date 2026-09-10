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
          <Link href="/experts">Find an expert</Link>
          <a href={to("#audit")}>Audit my portfolio</a>
          <a href={to("#ways")}>Packages</a>
          <a href={to("#how")}>How it works</a>
        </div>
        <div className="nav-end">
          <Link className="b b-line b-sm" href="/member/login">
            Bluepoint OS
          </Link>
          <Link className="b b-fill b-sm" href="/experts">
            Find an expert
          </Link>
        </div>
      </div>
    </nav>
  );
}
