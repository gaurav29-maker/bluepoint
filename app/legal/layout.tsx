import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

/**
 * The legal pages get the real shell, not a bare wordmark.
 *
 * Somebody reading the refund policy is deciding whether to trust us with
 * money. Dropping them onto a page with no way back into the site — and
 * without the disclaimer the footer carries — made the terms read like a
 * document posted somewhere rather than part of the product.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <SiteNav />

      <div className="wrap">
        <div className="legal-doc">
          {children}

          <nav className="legal-nav">
            <Link href="/legal/terms">Terms &amp; Conditions</Link>
            <Link href="/legal/privacy">Privacy Policy</Link>
            <Link href="/legal/refunds">Refund Policy</Link>
            <Link href="/">Back to Bluepoint</Link>
          </nav>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
