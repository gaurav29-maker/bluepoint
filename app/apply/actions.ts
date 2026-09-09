"use server";

import { z } from "zod";
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
  specialties: z.array(z.enum(["portfolio_audit", "fno_systematic"])).min(1, "Pick at least one"),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  sebiRegType: z.enum(["ria", "ra", "none"]),
  sebiRegNumber: z.string().trim().max(60).optional(),
  links: z.string().trim().max(600).optional(),
  note: z.string().trim().max(1200).optional(),
});

export type ApplyState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };

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
      specialties: data.specialties,
      yearsExperience: data.yearsExperience,
      sebiRegType: data.sebiRegType,
      sebiRegNumber: data.sebiRegType === "none" ? null : (data.sebiRegNumber ?? null),
      links: data.links ?? null,
      note: data.note ?? null,
    });
  } catch (err) {
    // The partial unique index means one open application per address.
    if (isUniqueViolation(err)) {
      return {
        ok: true,
        error: undefined,
      };
    }
    console.error("[apply] could not record application", err);
    return { ok: false, error: "We could not record that. Please try again shortly." };
  }

  return { ok: true };
}
