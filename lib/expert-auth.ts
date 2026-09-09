/**
 * Expert sign-in: a signed link by email, no password.
 *
 * Deliberately a separate scope from the member and ops sessions. An expert
 * sees other people's portfolios; a member sees only their own. One secret,
 * three domains, and a token minted for one can never be presented as another.
 */

export const EXPERT_COOKIE = "bp_expert";
export const LINK_MINUTES = 30;
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

async function sign(expertId: string, expiresAt: number, scope: "link" | "session") {
  const payload = `expert-${scope}:${expertId}:${expiresAt}`;
  const sig = toHex(await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload)));
  return `${expertId}.${expiresAt}.${sig}`;
}

async function verify(
  token: string | undefined | null,
  scope: "link" | "session",
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [expertId, expRaw, sig] = parts;
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  let expected: string;
  try {
    const payload = `expert-${scope}:${expertId}:${expiresAt}`;
    expected = toHex(await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload)));
  } catch {
    return null;
  }
  return constantTimeEqual(expected, sig) ? expertId : null;
}

export function mintExpertLink(expertId: string) {
  return sign(expertId, Date.now() + LINK_MINUTES * 60_000, "link");
}
export function verifyExpertLink(token: string | undefined | null) {
  return verify(token, "link");
}

export async function mintExpertSession(expertId: string) {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return { value: await sign(expertId, expiresAt, "session"), expiresAt: new Date(expiresAt) };
}
export function verifyExpertSession(token: string | undefined | null) {
  return verify(token, "session");
}
