import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experts } from "@/lib/db/schema";
import { SLOT_MINUTES } from "@/lib/slots";

export const runtime = "nodejs";
export const alt = "Bluepoint expert";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * An expert's own share card.
 *
 * Sharing a profile is how one trader recommends an expert to another, and a
 * bare URL says nothing about who they are. This carries the name, what they
 * do and — the point of it — the registration line, stated the same way here
 * as on the page. Somebody forwarding this passes on the disclosure along
 * with the recommendation rather than only the recommendation.
 *
 * No price, for two reasons. A share card is cached by whatever app rendered
 * it, so a card forwarded around a group would keep quoting a rate the expert
 * has since changed. And the rupee sign is not in Satori's default font, so
 * printing it means shipping a font file to render a number that should not
 * be on here anyway.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let expert:
    | {
        displayName: string;
        initials: string;
        headline: string;
        sebiRegType: string;
        sebiRegNumber: string | null;
      }
    | null = null;

  try {
    const [row] = await db
      .select({
        displayName: experts.displayName,
        initials: experts.initials,
        headline: experts.headline,
        sebiRegType: experts.sebiRegType,
        sebiRegNumber: experts.sebiRegNumber,
      })
      .from(experts)
      .where(and(eq(experts.slug, slug), eq(experts.status, "live")))
      .limit(1);
    expert = row ?? null;
  } catch {
    expert = null;
  }

  const registered = expert && expert.sebiRegType !== "none" && expert.sebiRegNumber;

  const footer = expert
    ? registered
      ? `SEBI ${expert.sebiRegType.toUpperCase()} · ${expert.sebiRegNumber} — a review and a discussion, not advice`
      : "Not registered with SEBI — a review and a discussion, not advice"
    : "A review and a discussion of what you already hold. Never advice.";

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
        <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>
          <span style={{ color: "#F3F6F9" }}>blue</span>
          <span style={{ color: "#1D9BF0" }}>point</span>
        </div>

        {expert ? (
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            <div
              style={{
                display: "flex",
                width: 148,
                height: 148,
                borderRadius: 999,
                background: "#1D9BF0",
                color: "#05080C",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 52,
                fontWeight: 600,
              }}
            >
              {expert.initials}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 62,
                  fontWeight: 600,
                  color: "#F3F6F9",
                  letterSpacing: -2.2,
                }}
              >
                {expert.displayName}
              </div>
              <div style={{ display: "flex", fontSize: 30, color: "#798497", marginTop: 12 }}>
                {expert.headline}
              </div>
              <div style={{ display: "flex", fontSize: 28, color: "#F3F6F9", marginTop: 18 }}>
                {SLOT_MINUTES} minutes, one to one
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 600,
              color: "#F3F6F9",
              letterSpacing: -2,
            }}
          >
            Book a call with a market expert
          </div>
        )}

        <div style={{ display: "flex", fontSize: 24, color: "#798497" }}>{footer}</div>
      </div>
    ),
    size,
  );
}
