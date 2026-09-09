/**
 * `redirect()` and `notFound()` signal by throwing.
 *
 * A page that wraps its body in `try { … } catch { … }` to survive a database
 * outage will therefore also swallow them, and a visitor being sent to the
 * sign-in page is shown "Not available right now" instead — an outage message
 * for something that is not an outage. Every console had this.
 *
 * Call this first in any catch that guards a page body.
 */
export function rethrowIfNavigation(err: unknown): void {
  if (typeof err !== "object" || err === null || !("digest" in err)) return;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest !== "string") return;
  /*
   * Any NEXT_-prefixed digest, rather than a list of them. The first version
   * of this matched "NEXT_NOT_FOUND" and silently stopped working, because
   * Next 15 signals notFound() as "NEXT_HTTP_ERROR_FALLBACK;404" — a draft
   * expert's profile answered 200 with an outage panel instead of 404. The
   * prefix is the contract; the individual names are not.
   */
  if (digest.startsWith("NEXT_")) throw err;
}
