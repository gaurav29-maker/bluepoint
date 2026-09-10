import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experts as expertsTable } from "@/lib/db/schema";
import { openSlotsFor } from "@/lib/availability";
import { istDayLabel, istTime } from "@/lib/format";
import { rethrowIfNavigation } from "@/lib/nav";
import ExpertGrid, { type ExpertCard } from "@/components/ExpertGrid";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find an expert — Bluepoint",
  description:
    "Every expert shows what they focus on, how long they have done it, where they have worked, and their SEBI registration or its absence.",
};

const FOCUS = [
  { key: "all", label: "Everyone" },
  { key: "portfolio_audit", label: "Portfolio audits" },
  { key: "fno_systematic", label: "F&O" },
] as const;

const SORTS = [
  { key: "experience", label: "Most experienced" },
  { key: "price", label: "Lowest rate" },
] as const;

/** How far ahead the "next available" figure looks. */
const HORIZON_DAYS = 14;

type Params = { focus?: string; sort?: string };

export default async function FindAnExpert({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const focus = FOCUS.some((f) => f.key === params.focus) ? params.focus! : "all";
  const sort = SORTS.some((s) => s.key === params.sort) ? params.sort! : "experience";

  let cards: ExpertCard[] = [];
  let nextAvailable: Record<string, string> = {};
  let dbReady = false;
  let total = 0;

  try {
    const rows = await db
      .select()
      .from(expertsTable)
      .where(eq(expertsTable.status, "live"))
      .orderBy(
        sort === "price" ? asc(expertsTable.pricePaise) : desc(expertsTable.yearsExperience),
      );
    dbReady = true;
    total = rows.length;

    const matching =
      focus === "all" ? rows : rows.filter((e) => e.specialties.includes(focus as never));

    cards = matching.map((e) => ({
      slug: e.slug,
      displayName: e.displayName,
      initials: e.initials,
      headline: e.headline,
      pricePaise: e.pricePaise,
      sebiRegType: e.sebiRegType,
      sebiRegNumber: e.sebiRegNumber,
    }));

    /*
     * One slot computation per expert shown. Fine at this size and it is the
     * figure that actually decides a booking — but it is linear, so past
     * roughly twenty experts this wants caching or a stored "next open slot"
     * rather than being recomputed on every page view.
     */
    const from = new Date();
    const to = new Date(from.getTime() + HORIZON_DAYS * 86_400_000);
    const reads = await Promise.all(
      matching.map(async (e) => {
        const slots = await openSlotsFor({ id: e.id, timezone: e.timezone }, from, to);
        const first = slots[0];
        return [e.slug, first ? `${istDayLabel(first.startsAt)}, ${istTime(first.startsAt)}` : ""] as const;
      }),
    );
    nextAvailable = Object.fromEntries(reads.filter(([, v]) => v !== ""));
  } catch (err) {
    rethrowIfNavigation(err);
    dbReady = false;
  }

  const href = (next: Partial<Params>) => {
    const q = new URLSearchParams();
    const f = next.focus ?? focus;
    const s = next.sort ?? sort;
    if (f !== "all") q.set("focus", f);
    if (s !== "experience") q.set("sort", s);
    const qs = q.toString();
    return qs ? `/experts?${qs}` : "/experts";
  };

  return (
    <div className="site">
      <SiteNav />

      <div className="wrap">
        <div className="doc find">
          <h1 className="doc-name">Find an expert.</h1>
          <p className="doc-lede">
            Every expert shows what they focus on, how long they have done it, where they have
            worked, and their SEBI registration — or plainly that they have none.
          </p>

          {/*
            Filters are links rather than a client-side control, so the URL
            carries the filter. Somebody can send "the F&O ones" to a friend.
          */}
          <div className="filters">
            <div className="filter-row">
              <span className="eyebrow">Focus</span>
              {FOCUS.map((f) => (
                <Link
                  key={f.key}
                  href={href({ focus: f.key })}
                  className={`chip${f.key === focus ? " on" : ""}`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            <div className="filter-row">
              <span className="eyebrow">Sort</span>
              {SORTS.map((s) => (
                <Link
                  key={s.key}
                  href={href({ sort: s.key })}
                  className={`chip${s.key === sort ? " on" : ""}`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>

          {dbReady && cards.length === 0 && total > 0 ? (
            <p className="band-empty find-empty">
              Nobody listed under that focus yet.{" "}
              <Link className="ops-link" href="/experts">
                See everyone
              </Link>
              .
            </p>
          ) : (
            <ExpertGrid experts={cards} dbReady={dbReady} nextAvailable={nextAvailable} />
          )}

          {/*
            The brief asked for filtering by sector, investment style and
            portfolio type as well. Those fields do not exist, and inventing
            the taxonomy before there are real experts to classify would mean
            committing to categories chosen by guesswork. It wants doing once
            there are enough experts for the categories to be observed rather
            than imagined.
          */}
          <p className="find-foot">
            Looking for something not listed here? Email{" "}
            <a href="mailto:hello@bluepoint.in">hello@bluepoint.in</a> and tell us what you need —
            it tells us who to bring on next.
          </p>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
