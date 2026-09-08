import { loadEnv } from "./load-env";
loadEnv();

import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { availabilityRules, experts } from "../lib/db/schema";

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
  for (const e of SEED) {
    const [row] = await db
      .insert(experts)
      .values({ ...e, specialties: [...e.specialties], status: "live" })
      .onConflictDoUpdate({
        target: experts.slug,
        set: { displayName: e.displayName, pricePaise: e.pricePaise, status: "live" },
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
