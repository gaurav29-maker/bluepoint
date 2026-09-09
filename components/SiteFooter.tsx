import Link from "next/link";

export default function SiteFooter({ onLanding = false }: { onLanding?: boolean }) {
  const to = (hash: string) => (onLanding ? hash : `/${hash}`);

  return (
    <footer>
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-col">
            <h4>Navigate</h4>
            <a href={to("#experts")}>Experts</a>
            <a href={to("#how")}>How it works</a>
            <a href={to("#pricing")}>Pricing</a>
            <a href={to("#faq")}>FAQs</a>
            <Link href="/member/login">Bluepoint OS</Link>
          </div>
          <div className="footer-col">
            <h4>Get in touch</h4>
            <a href="#">Email</a>
            <a href="#">Instagram</a>
            <a href="#">LinkedIn</a>
          </div>
          <div className="footer-col">
            <h4>Useful links</h4>
            <Link href="/legal/terms">Terms &amp; Conditions</Link>
            <Link href="/legal/privacy">Privacy Policy</Link>
            <Link href="/legal/refunds">Refund Policy</Link>
          </div>
          <div className="footer-col">
            <div className="footer-recruit">
              <h4>Are you an expert?</h4>
              <p>Join the platform and help traders make sense of their portfolios.</p>
              <Link className="footer-apply" href="/apply">
                Apply now
              </Link>
            </div>
          </div>
        </div>
        {/*
          The disclaimer sits on every public page, not only the home page.
          It is the statement the terms rest on, and a visitor who lands
          straight on an expert's page has to meet it too.
        */}
        <p className="footer-disclaimer">
          Bluepoint sessions are a review and discussion of your existing portfolio and approach.
          They are not a recommendation to buy or sell any security, and are not personalised
          investment advice. You remain responsible for your own decisions.
        </p>
        <div className="footer-bottom">© 2026 Bluepoint. All rights reserved.</div>
      </div>
    </footer>
  );
}
