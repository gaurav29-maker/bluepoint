import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bluepoint — Get your portfolio reviewed, by a real person",
  description:
    "Book a call with a vetted market expert. A straight read on what you hold, or a system for sizing your F&O trades instead of guessing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
