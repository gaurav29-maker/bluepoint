import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap legal">
      <Link href="/" className="logo legal-logo">
        blue<span>point</span>
      </Link>
      {children}
      <nav className="legal-nav">
        <Link href="/legal/terms">Terms &amp; Conditions</Link>
        <Link href="/legal/privacy">Privacy Policy</Link>
        <Link href="/legal/refunds">Refund Policy</Link>
        <Link href="/">Back to Bluepoint</Link>
      </nav>
    </div>
  );
}
