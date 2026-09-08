/**
 * Member sign-in: a signed link by email, no password.
 *
 * Customers should not have credentials to lose. A link proves control of the
 * address the pass was bought with, which is exactly the claim that matters.
 * Web Crypto so middleware (edge) and route handlers (node) share one path.
 */

export const MEMBER_COOKIE = "bp_member";
/** How long a emailed sign-in link stays usable. */
export const LINK_MINUTES = 30;
/** How long the session lasts once signed in. */
export const SESSION_DAYS = 30;

const encoder = new TextEncoder();

function secret(): string {
  const s = process.env.TOKEN_SECRET;
  if (!s) throw new Error("TOKEN_SECRET is not set");
  return s;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * `scope` keeps a 30-minute sign-in link from being replayed as a 30-day
 * session cookie, and vice versa — same secret, different domains.
 */
async function sign(customerId: string, expiresAt: number, scope: "link" | "session") {
  const payload = `${scope}:${customerId}:${expiresAt}`;
  const sig = toHex(await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload)));
  return `${customerId}.${expiresAt}.${sig}`;
}

async function verify(
  token: string | undefined | null,
  scope: "link" | "session",
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [customerId, expRaw, sig] = parts;
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  let expected: string;
  try {
    const payload = `${scope}:${customerId}:${expiresAt}`;
    expected = toHex(await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload)));
  } catch {
    return null;
  }
  return constantTimeEqual(expected, sig) ? customerId : null;
}

export function mintLink(customerId: string) {
  return sign(customerId, Date.now() + LINK_MINUTES * 60_000, "link");
}
export function verifyLink(token: string | undefined | null) {
  return verify(token, "link");
}

export async function mintSession(customerId: string) {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return { value: await sign(customerId, expiresAt, "session"), expiresAt: new Date(expiresAt) };
}
export function verifySession(token: string | undefined | null) {
  return verify(token, "session");
}

export async function memberConsoleUrl(customerId: string): Promise<string> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/api/member/session?t=${await mintLink(customerId)}`;
}
