import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bluepoint — A different kind of portfolio review",
  description:
    "From an expert who is paid to look, not to sell. One call. Your holdings, read honestly. Nothing to buy at the end of it.",
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
