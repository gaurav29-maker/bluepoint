import type { Metadata } from "next";
import "./globals.css";
import { sitePublic } from "@/lib/launch";

const TITLE = "Landline — book a market expert to read your portfolio";
const DESCRIPTION =
  "Book an experienced market professional directly. They read your portfolio before you meet, and tell you what they actually see in it.";

/**
 * `metadataBase` is what turns the relative image paths below into the
 * absolute URLs that WhatsApp, X and LinkedIn require. Without it Next warns
 * at build time and the card silently renders without an image.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Landline",
  openGraph: {
    type: "website",
    siteName: "Landline",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  /*
   * The consoles set their own robots directives; this is the public
   * default — and while the site is closed it is the second layer.
   * robots.txt is a request to a crawler; noindex is the instruction to
   * one that fetched the page anyway, and the two disagreeing is how a
   * page ends up indexed despite the file saying otherwise.
   */
  robots: sitePublic() ? { index: true, follow: true } : { index: false, follow: false },
};

/*
 * suppressHydrationWarning on <html> is required here, not cosmetic.
 *
 * The inline script below stamps data-theme on that element before React
 * runs, which is the entire point of it — waiting for React means a visitor
 * who chose dark watches the page flash white. React then compares the server
 * HTML (no attribute) against the DOM it finds (one attribute) and reports a
 * mismatch it will not patch up.
 *
 * The suppression covers THIS element only, which is exactly the scope of the
 * deliberate difference. Anything nested inside it still warns normally.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/*
          Runs before the first paint, which is the whole point. Anything that
          waits for React has already let the browser draw the light page, and
          a visitor who chose dark watches it flash white on every navigation.

          No stored choice leaves the attribute off entirely, so the CSS media
          query decides — the toggle adds a third state rather than replacing
          the system preference.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `try{var t=localStorage.getItem('landline:theme');` +
              `if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
