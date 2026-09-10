import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Bluepoint — book a call with a market expert";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card people actually see when a Bluepoint link is pasted into WhatsApp.
 *
 * Generated rather than a checked-in PNG so it cannot drift from the site's
 * own colours, and so the wording stays in one place. Deliberately plain: it
 * carries the rejection line, because the first thing someone forwarding this
 * to a friend has to answer is "is this another tip group".
 *
 * Every div here that holds more than one child declares display — Satori
 * refuses to lay out an implicit block, and the failure is a 500 on the image
 * rather than anything visible on the page.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#08090B",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>
          <span style={{ color: "#F3F6F9" }}>blue</span>
          <span style={{ color: "#1D9BF0" }}>point</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 21,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#798497",
              marginBottom: 26,
            }}
          >
            Not a tip service · Not a Telegram group
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              lineHeight: 1.08,
              fontWeight: 600,
              color: "#F3F6F9",
              letterSpacing: -2.6,
              maxWidth: 940,
            }}
          >
            Get a fix on your position, before the market does.
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#798497" }}>
          A straight read on what you hold. You book. They look. You decide.
        </div>
      </div>
    ),
    size,
  );
}
