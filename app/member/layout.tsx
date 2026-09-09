/**
 * The member area is its own product, not a page of the marketing site, so it
 * gets its own shell: the dark palette and terminal typography from
 * `.site-dark`, plus `.os` for the console-specific pieces.
 *
 * One wrapper here rather than a class on each page, so /member, its receipts
 * and its profile can never drift apart visually.
 */
export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <div className="site-dark os">{children}</div>;
}
