import { loadEnv } from "./load-env";
loadEnv();

import { eq } from "drizzle-orm";
import { scriptDb } from "../lib/db";
import { availabilityRules, experts } from "../lib/db/schema";

// Resolved after loadEnv() has run, not at import time.
let db: ReturnType<typeof scriptDb>;

/**
 * Demo seed for phase 1.
 *
 * These are the placeholder people from the original mockup. Before real money
 * is switched on, replace them with experts who have actually agreed to be
 * listed, and fill in real SEBI registration numbers where they apply.
 */
const SEED = [
  {
    slug: "rhea-kulkarni",
    displayName: "Rhea Kulkarni",
    initials: "RK",
    headline: "Portfolio audits · 9 yrs",
    bio: "Reviews concentrated equity portfolios and long-term allocation.",
    background:
      "Nine years on a domestic PMS desk, latterly running the concentrated equity mandate. Before that, four years covering IT and financials on the buy side.",
    specialties: ["portfolio_audit"] as const,
    yearsExperience: 9,
    pricePaise: 549900,
    contactEmail: "rhea@example.com",
    meetingUrl: "https://meet.google.com/placeholder-rhea",
  },
  {
    slug: "gaurav-khona",
    displayName: "Gaurav Khona",
    initials: "GK",
    headline: "Portfolio audits · F&O · 10 yrs",
    bio: "Portfolio reviews and a systematic frame for options positions.",
    background:
      "Ten years between a long-only fund and a proprietary options book, covering both sides of the same portfolios. Now independent.",
    specialties: ["portfolio_audit", "fno_systematic"] as const,
    yearsExperience: 10,
    pricePaise: 549900,
    contactEmail: "gauravkhona29@gmail.com",
    meetingUrl: "https://meet.google.com/placeholder-gaurav",
  },
  {
    slug: "arjun-mehta",
    displayName: "Arjun Mehta",
    initials: "AM",
    headline: "F&O systematic trading · 12 yrs",
    bio: "Position sizing, risk limits and a repeatable process for F&O.",
    background:
      "Twelve years running a derivatives book, the last five as head of risk for a proprietary desk. Sizing and limits were the job.",
    specialties: ["fno_systematic"] as const,
    yearsExperience: 12,
    pricePaise: 549900,
    contactEmail: "arjun@example.com",
    meetingUrl: "https://meet.google.com/placeholder-arjun",
  },
];

// Weekdays, 10:00-13:00 and 15:00-19:00 IST, as minutes from midnight.
const WEEKDAY_WINDOWS = [
  { startMinute: 10 * 60, endMinute: 13 * 60 },
  { startMinute: 15 * 60, endMinute: 19 * 60 },
];

async function main() {
  db = scriptDb();

  for (const e of SEED) {
    const [row] = await db
      .insert(experts)
      .values({ ...e, specialties: [...e.specialties], status: "live" })
      /*
       * Refresh everything the seed defines, not a subset.
       *
       * This used to set only displayName, pricePaise and status, which meant
       * re-running the seed silently left bio, headline, background and the
       * rest at whatever they already were. "Re-run the seed" is the
       * documented way to reset demo data, and it was not resetting it.
       */
      .onConflictDoUpdate({
        target: experts.slug,
        set: {
          displayName: e.displayName,
          initials: e.initials,
          headline: e.headline,
          bio: e.bio,
          background: e.background,
          specialties: [...e.specialties],
          yearsExperience: e.yearsExperience,
          pricePaise: e.pricePaise,
          contactEmail: e.contactEmail,
          /*
           * Registration is deliberately absent. The seed does not set it —
           * these three demo experts fall back to "none" — and a reseed must
           * not blow away a registration a person verified by hand for a real
           * expert who happens to share a slug.
           */
          status: "live",
          updatedAt: new Date(),
        },
      })
      .returning({ id: experts.id, slug: experts.slug });

    await db.delete(availabilityRules).where(eq(availabilityRules.expertId, row.id));

    for (let weekday = 1; weekday <= 5; weekday++) {
      for (const w of WEEKDAY_WINDOWS) {
        await db.insert(availabilityRules).values({ expertId: row.id, ...w, weekday });
      }
    }
    console.log(`seeded ${row.slug} with ${5 * WEEKDAY_WINDOWS.length} availability rules`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
