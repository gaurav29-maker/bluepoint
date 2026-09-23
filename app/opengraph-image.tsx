import { ImageResponse } from "next/og";
import { WORDMARK_PARTS, BRAND_DESCRIPTOR, TRADEMARK_REGISTERED } from "@/lib/brand";

export const runtime = "nodejs";
export const alt = "Landline — book a call with a market expert";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card people actually see when a Landline link is pasted into WhatsApp.
 *
 * Built in the language of the printed card: paper ground, a pane of glass
 * lying on it, one blue light under the left of the pane, the wordmark in
 * near-black. NOT the printed card itself — that is a render, and a render of
 * a business card tells a stranger nothing. The words still do the work; the
 * glass is what makes somebody stop scrolling long enough to read them.
 *
 * Generated rather than a checked-in PNG so it cannot drift from the site's
 * own colours, and so the wording stays in one place. It drifted anyway: this
 * card was still promising "You book. They look. You decide." after the site
 * had stopped saying "look" — which is the argument for reading the brand out
 * of lib/brand.ts rather than typing it in here.
 *
 * Satori renders this, not a browser. Two rules it will not forgive: every div
 * holding more than one child declares display, and there is no
 * backdrop-filter — the glass is a pale ground, a hairline and a shadow, which
 * at this size is indistinguishable from the real thing.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          /* The paper. Slightly cool, and never pure white, so the pane can be. */
          background: "#E8E9EC",
          padding: 56,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            borderRadius: 20,
            padding: "58px 64px",
            backgroundColor: "#FBFCFE",
            /* The one light, under the left of the pane, as on the card. */
            backgroundImage:
              "radial-gradient(52% 78% at 20% 52%, rgba(43, 79, 224, 0.50) 0%, rgba(43, 79, 224, 0.15) 42%, rgba(43, 79, 224, 0) 70%)",
            border: "1px solid rgba(255, 255, 255, 0.92)",
            boxShadow: "0 24px 60px rgba(28, 40, 88, 0.16)",
          }}
        >
          {/* The lockup, set the way the printed card sets it. */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                fontSize: 62,
                fontWeight: 800,
                letterSpacing: -2.4,
                color: "#0B0C0E",
              }}
            >
              <span>{WORDMARK_PARTS[0]}</span>
              <span>{WORDMARK_PARTS[1]}</span>
              {TRADEMARK_REGISTERED ? (
                <span style={{ fontSize: 22, fontWeight: 500, marginTop: 6, marginLeft: 5 }}>
                  &reg;
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", fontSize: 26, color: "#2A2D33", marginTop: 4 }}>
              {BRAND_DESCRIPTOR}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 19,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "#3A3E46",
                marginBottom: 22,
              }}
            >
              Not a tip service · Not a Telegram group
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 58,
                lineHeight: 1.08,
                fontWeight: 600,
                color: "#0B0C0E",
                letterSpacing: -2.2,
                maxWidth: 900,
              }}
            >
              Real experts. Real work. Real conversations.
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
