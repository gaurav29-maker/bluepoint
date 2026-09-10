"use client";

/**
 * The last resort, and the one page that cannot use anything the rest of the
 * site has.
 *
 * app/error.tsx catches a fault inside the root layout's children. It cannot
 * catch a fault in the root layout itself — if that throws, there is no
 * layout to render an error page into. React swaps the whole document for
 * this one, which is why it declares its own <html> and <body>: it REPLACES
 * the root layout rather than rendering inside it.
 *
 * That also means globals.css is not loaded, the fonts are not loaded, and
 * SiteNav and SiteFooter would drag in styles that no longer exist. So every
 * value here is inline and literal on purpose. It is the one file in the
 * project that must not import the design system, because the reason it is
 * showing may be that the design system failed to load.
 *
 * It should effectively never appear. It exists so that when it does, the
 * page still says something true instead of showing the browser's own error.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      {/* Replacing the document loses the root layout metadata with it, so
          without this the browser tab reads as the bare host name. */}
      <head>
        <title>Bluepoint</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#FFFFFF",
          color: "#393C41",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          fontSize: "15px",
          lineHeight: "24px",
        }}
      >
        <main style={{ maxWidth: "460px" }}>
          <p
            style={{
              margin: "0 0 14px",
              fontSize: "12px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#676A6E",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            Bluepoint
          </p>

          <h1
            style={{
              margin: "0 0 12px",
              fontSize: "26px",
              lineHeight: "34px",
              fontWeight: 500,
              color: "#171A20",
              letterSpacing: "-0.01em",
            }}
          >
            Bluepoint didn&rsquo;t load.
          </h1>

          <p style={{ margin: "0 0 20px" }}>
            Something failed before the page could be built. This is a fault on our side, not
            anything you did.
          </p>

          {/*
            The same promise app/error.tsx makes, for the same reason: the
            webhook confirms a booking regardless of what this browser tab
            managed to render.
          */}
          <p style={{ margin: "0 0 24px" }}>
            If you were paying, the payment either completed or it did not — this page cannot
            change that either way, and a completed one is in Bluepoint OS with its receipt.
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                appearance: "none",
                border: "1px solid #3E6AE1",
                background: "#3E6AE1",
                color: "#FFFFFF",
                borderRadius: "4px",
                padding: "10px 22px",
                fontSize: "14px",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                border: "1px solid #5C5E62",
                color: "#171A20",
                borderRadius: "4px",
                padding: "10px 22px",
                fontSize: "14px",
                textDecoration: "none",
              }}
            >
              Back to Bluepoint
            </a>
          </div>

          <p style={{ margin: "26px 0 0", fontSize: "13.5px", color: "#5C5E62" }}>
            Telling us helps:{" "}
            <a href="mailto:hello@bluepoint.in" style={{ color: "#3159C9" }}>
              hello@bluepoint.in
            </a>
            {error.digest ? (
              <>
                {" "}
                — quote{" "}
                <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {error.digest}
                </code>
                .
              </>
            ) : (
              "."
            )}
          </p>
        </main>
      </body>
    </html>
  );
}
