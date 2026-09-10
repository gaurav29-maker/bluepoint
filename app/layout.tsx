import type { Metadata } from "next";
import "./globals.css";

const TITLE = "Bluepoint — book a market expert to read your portfolio";
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
  applicationName: "Bluepoint",
  openGraph: {
    type: "website",
    siteName: "Bluepoint",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  // The consoles set their own robots directives; this is the public default.
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
