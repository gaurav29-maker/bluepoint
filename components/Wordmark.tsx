import Link from "next/link";
import { WORDMARK_SRC, WORDMARK_HEIGHT, TRADEMARK_REGISTERED } from "@/lib/brand";

type Size = keyof typeof WORDMARK_HEIGHT;

/**
 * The Landline wordmark. The only place it is drawn.
 *
 * The DOM it produces is the DOM the fifteen hand-written copies produced —
 * `land` with `line` in a span, an optional `<em>` suffix — so every style
 * that already targets `.mark`, `.logo` and `.os-mark` keeps working and this
 * is a refactor rather than a redesign.
 *
 * `as` exists for the same reason. Several call sites wrapped the mark in a
 * `<p>` or a `<div>`, and `.logo` sets no display of its own, so collapsing
 * them all to a `<span>` would quietly turn a block into an inline box inside
 * the sign-in cards. The element each caller had is the element it keeps.
 *
 * Set lowercase, matching the supplied artwork. That is the logotype, not the
 * name: prose still writes Landline with a capital.
 */
export default function Wordmark({
  className = "",
  sub,
  href,
  as = "span",
  size = "sm",
}: {
  /** The class the surrounding design already uses: "mark", "logo os-mark", … */
  className?: string;
  /** The console suffix — "os", "ops", "experts". Rendered in an <em>. */
  sub?: string;
  /** Where the mark links. Omit for a mark that is not a link. */
  href?: string;
  /** The element to use when the mark is not a link. */
  as?: "span" | "p" | "div";
  size?: Size;
}) {
  const inner = (
    <>
      {WORDMARK_SRC ? (
        /*
         * Width is left to the intrinsic ratio on purpose. A logotype
         * stretched into a fixed box is worse than no logotype, and height is
         * the only dimension the surrounding layout actually cares about.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={WORDMARK_SRC}
          alt="Landline"
          height={WORDMARK_HEIGHT[size]}
          style={{ height: WORDMARK_HEIGHT[size], width: "auto", display: "block" }}
        />
      ) : (
        <>
          land<span>line</span>
        </>
      )}
      {TRADEMARK_REGISTERED ? <sup className="mark-r">&reg;</sup> : null}
      {sub ? (
        <>
          {" "}
          <em>{sub}</em>
        </>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  const Tag = as;
  return <Tag className={className}>{inner}</Tag>;
}
