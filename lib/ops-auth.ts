/**
 * Ops console auth: one shared password, one signed cookie.
 *
 * Deliberately not Auth.js. There is exactly one operator, no self-service
 * signup, and nothing to federate — a user table here would be cost without
 * benefit. Uses Web Crypto rather than node:crypto so the same code runs in
 * middleware (edge) and in server actions (node).
 */

export const OPS_COOKIE = "bp_ops";
export const OPS_SESSION_DAYS = 7;

const encoder = new TextEncoder();

function secret(): string {
  const s = process.env.TOKEN_SECRET;
  if (!s) throw new Error("TOKEN_SECRET is not set");
  return s;
}

async function hmacKey(): Promise<CryptoKey> {
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

/** Length-independent comparison, so a wrong guess leaks no timing signal. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.OPS_PASSWORD;
  // No password configured means the console is closed, not open.
  if (!expected) return false;
  // Hash both sides first so the comparison is over equal-length strings.
  const [a, b] = await Promise.all([sha256Hex(candidate), sha256Hex(expected)]);
  return constantTimeEqual(a, b);
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function mintSession(): Promise<{ value: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + OPS_SESSION_DAYS * 24 * 60 * 60 * 1000);
  const payload = String(expiresAt.getTime());
  const sig = toHex(await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload)));
  return { value: `${payload}.${sig}`, expiresAt };
}

export async function sessionValid(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  let expected: string;
  try {
    expected = toHex(await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload)));
  } catch {
    return false;
  }
  return constantTimeEqual(expected, sig);
}
