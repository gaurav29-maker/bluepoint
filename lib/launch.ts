/**
 * Whether the site is open to search engines.
 *
 * The production domain is public — Vercel's deployment protection covers
 * preview deployments, not production, which is not what we assumed for a
 * while. Being reachable is fine. Being *indexed* is not, yet: the three
 * experts on the site are seed data with backgrounds nobody has verified, one
 * of them named after the founder; the legal pages carry "This draft has not
 * been reviewed by a lawyer" and bracketed blanks where the refund percentage
 * and the grievance officer should be; and the booking flow has no payment
 * keys, so a stranger who clicks Book a call gets a dead end.
 *
 * A search footprint is the part that is expensive to undo. A link you gave
 * somebody still works — that is deliberate, this is not a lock.
 *
 * Off unless SITE_PUBLIC is explicitly "1" or "true": the safe state is the
 * one you get by forgetting, and turning it on should be a decision somebody
 * made on a day they meant to.
 */
export function sitePublic(): boolean {
  const flag = process.env.SITE_PUBLIC?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}
