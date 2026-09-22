import crypto from "node:crypto";

/**
 * Encrypting one thing at rest: a Google refresh token.
 *
 * A refresh token is not a session — it keeps working until somebody revokes
 * it, and it can mint access tokens for an expert's calendar for as long as
 * it exists. A database dump with those in the clear is a different kind of
 * bad day from one with hashed nothing-in-particular, so it gets encrypted.
 *
 * AES-256-GCM, which authenticates as well as encrypts: a row edited by hand
 * fails to open rather than decrypting to something plausible.
 *
 * The key is derived from TOKEN_SECRET with HKDF and a fixed info string, so
 * this shares the one secret the rest of the app already has without reusing
 * the literal bytes that sign sessions. Rotating TOKEN_SECRET therefore
 * invalidates stored tokens — which is correct: experts reconnect, and that
 * is what you want to happen after a secret has been rotated.
 */

const INFO = "landline:google-refresh-token:v1";

function key(): Buffer {
  const secret = process.env.TOKEN_SECRET;
  if (!secret) throw new Error("TOKEN_SECRET is not set");
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), Buffer.from(INFO, "utf8"), 32));
}

/** Returns "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function seal(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

/**
 * Throws if the value was tampered with, truncated, or sealed under a
 * different secret. Callers treat a throw as "this expert is not connected"
 * rather than as a crash — see lib/google.ts.
 */
export function open(sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("not a sealed value");
  const [, iv, tag, enc] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64url")), decipher.final()]).toString("utf8");
}
