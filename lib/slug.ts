/**
 * A URL slug from a display name, made unique against what already exists.
 *
 * Two experts called Rhea Kulkarni is not a hypothetical worth ignoring: the
 * slug is a primary route, and a collision would either 500 on insert or, if
 * the unique index were ever dropped, silently point one person's profile at
 * another's schedule.
 */
export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "expert";
}

export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const existing = new Set(taken);
  const base = slugify(name);
  if (!existing.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
