"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { expertApplications } from "@/lib/db/schema";

const Body = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(120),
  email: z.string().trim().email("That does not look like an email address"),
  phone: z.string().trim().max(40).optional(),
  headline: z
    .string()
    .trim()
    .min(6, "One line on what you do")
    .max(90, "Keep the headline under 90 characters"),
  bio: z
    .string()
    .trim()
    .min(60, "A few sentences, so someone can tell whether you are right for them")
    .max(1200, "Keep it under 1200 characters"),
  background: z
    .string()
    .trim()
    .min(30, "Where you have worked — this is the part we check")
    .max(600, "Keep it under 600 characters"),
  specialties: z.array(z.enum(["portfolio_audit", "fno_systematic"])).min(1, "Pick at least one"),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  sebiRegType: z.enum(["ria", "ra", "none"]),
  sebiRegNumber: z.string().trim().max(60).optional(),
  links: z.string().trim().max(600).optional(),
  note: z.string().trim().max(1200).optional(),
});

export type ApplyState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };

/**
 * How many applications one source may send in an hour.
 *
 * Generous on purpose: this is not trying to catch a determined attacker, it
 * is stopping an open write endpoint from being trivially flooded. A real
 * person applying, mistyping their email and applying again stays well under
 * it; the shared office or campus NAT that puts three colleagues behind one
 * address does too.
 */
const MAX_PER_SOURCE_PER_HOUR = 5;

/**
 * A salted hash of the caller's address — never the address.
 *
 * Throttling only ever asks "is this the same source again?", which does not
 * require storing who they are. Salted with TOKEN_SECRET so the stored value
 * cannot be matched against a list of candidate IPs by anyone who reads the
 * table, and cannot be correlated with any other system's logs.
 */
async function sourceHash(): Promise<string | null> {
  const secret = process.env.TOKEN_SECRET;
  if (!secret) return null;

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "";
  if (ip === "") return null;

  return createHmac("sha256", secret).update(`apply:${ip}`).digest("hex");
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function submitApplication(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const parsed = Body.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    headline: formData.get("headline"),
    bio: formData.get("bio"),
    background: formData.get("background"),
    specialties: formData.getAll("specialties"),
    yearsExperience: formData.get("yearsExperience"),
    sebiRegType: formData.get("sebiRegType"),
    sebiRegNumber: formData.get("sebiRegNumber") || undefined,
    links: formData.get("links") || undefined,
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Some answers need another look.", fieldErrors };
  }

  const data = parsed.data;

  const source = await sourceHash();
  if (source) {
    const [recent] = await db
      .select({ n: count() })
      .from(expertApplications)
      .where(
        and(
          eq(expertApplications.ipHash, source),
          gte(expertApplications.createdAt, new Date(Date.now() - 60 * 60_000)),
        ),
      );

    if ((recent?.n ?? 0) >= MAX_PER_SOURCE_PER_HOUR) {
      // Says only what the sender already knows about their own behaviour.
      return {
        ok: false,
        error: "That is several applications in a short time. Give us a while to read them.",
      };
    }
  }

  /*
   * A claimed registration number has to be a number. It is not verified here
   * — that is a person's job before anyone is approved — but a registration
   * type with nothing behind it would go on to be published on the profile
   * page as a bare "RIA" with no number to check.
   */
  if (data.sebiRegType !== "none" && !data.sebiRegNumber) {
    return {
      ok: false,
      error: "Some answers need another look.",
      fieldErrors: { sebiRegNumber: "Add the registration number, or select Not registered." },
    };
  }

  try {
    await db.insert(expertApplications).values({
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      headline: data.headline,
      bio: data.bio,
      background: data.background,
      specialties: data.specialties,
      yearsExperience: data.yearsExperience,
      sebiRegType: data.sebiRegType,
      sebiRegNumber: data.sebiRegType === "none" ? null : (data.sebiRegNumber ?? null),
      links: data.links ?? null,
      note: data.note ?? null,
      ipHash: source,
    });
  } catch (err) {
    /*
     * The partial unique index: one open application per address. Reported as
     * success rather than as an error, because the sender has an application
     * with us either way and telling them so is the truthful answer — and
     * because a distinct "already applied" reply would turn this form into a
     * way to test whether a given person has applied.
     */
    if (isUniqueViolation(err)) return { ok: true };
    console.error("[apply] could not record application", err);
    return { ok: false, error: "We could not record that. Please try again shortly." };
  }

  return { ok: true };
}
