import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, experts, googleAccounts } from "@/lib/db/schema";
import { open, seal } from "@/lib/secretbox";

/**
 * Creating each session's Google Meet link on the expert's own calendar.
 *
 * Why the expert's calendar rather than a Landline one: a Meet link has to
 * belong to somebody, and a personal Meet room is the thing that lets one
 * customer walk into another's call — the hazard the bookings.meetingUrl
 * comment records. An event on the expert's calendar gets its own room, and
 * lands where the expert will actually see it.
 *
 * Everything here fails soft. A booking is confirmed by money changing hands
 * or a credit being spent; a calendar that did not answer must never undo
 * that. When this cannot produce a link the booking keeps meetingUrl null and
 * the expert console still offers the manual paste — which is why that was
 * built first and stays.
 */

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const CALENDAR = "https://www.googleapis.com/calendar/v3";
const REVOKE = "https://oauth2.googleapis.com/revoke";

/**
 * calendar.events is the narrow scope: it can read and write events, and
 * cannot touch calendar settings, sharing or anything else. userinfo.email is
 * only so the expert can see which account they connected.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID is not set");
  return v;
}

function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return v;
}

/**
 * Must match a redirect URI registered in the Google Cloud console exactly,
 * character for character. Derived from NEXT_PUBLIC_SITE_URL so there is one
 * place that decides what this site's address is.
 */
export function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/expert/google/callback`;
}

/* ---------------------------------------------------------------- state --
 *
 * The state parameter comes back from Google untouched, so it is the only
 * thing tying a callback to the expert who started it — and anything a
 * stranger can forge, a stranger can use to attach THEIR calendar to someone
 * else's account. So it is signed, and carries its own expiry.
 */

export function signState(expertId: string, expiresAt: number): string {
  const secret = process.env.TOKEN_SECRET;
  if (!secret) throw new Error("TOKEN_SECRET is not set");
  const payload = `google-oauth:${expertId}:${expiresAt}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${expertId}.${expiresAt}.${sig}`;
}

export function verifyState(state: string | null): string | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [expertId, expiresAtRaw, sig] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const expected = signState(expertId, expiresAt).split(".")[2];
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? expertId : null;
}

export function consentUrl(expertId: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    // Without both of these Google returns no refresh token on a repeat
    // connect, and the connection silently expires an hour later.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: signState(expertId, Date.now() + 10 * 60_000),
  });
  return `${AUTH}?${params.toString()}`;
}

/* --------------------------------------------------------------- tokens -- */

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  return (await res.json()) as TokenResponse;
}

/** Exchanges the one-time code and stores the connection. */
export async function completeConnection(expertId: string, code: string): Promise<void> {
  const tokens = await tokenRequest({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });

  if (!tokens.refresh_token || !tokens.access_token) {
    throw new Error(tokens.error_description ?? tokens.error ?? "Google returned no refresh token");
  }

  const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const email = ((await who.json()) as { email?: string }).email ?? "unknown";

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
  const row = {
    expertId,
    googleEmail: email,
    refreshTokenEnc: seal(tokens.refresh_token),
    accessToken: tokens.access_token,
    accessTokenExpiresAt: expiresAt,
    updatedAt: new Date(),
  };

  await db
    .insert(googleAccounts)
    .values(row)
    // Reconnecting replaces, so switching Google account is just connecting
    // again rather than disconnect-then-connect.
    .onConflictDoUpdate({ target: googleAccounts.expertId, set: row });
}

export async function disconnect(expertId: string): Promise<void> {
  const [acct] = await db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.expertId, expertId))
    .limit(1);

  // Tell Google as well as forgetting locally. Best effort: if the call
  // fails the row still goes, because leaving it would show the expert a
  // connection they just removed.
  if (acct) {
    try {
      await fetch(REVOKE, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: open(acct.refreshTokenEnc) }).toString(),
      });
    } catch {
      /* forget it anyway */
    }
  }

  await db.delete(googleAccounts).where(eq(googleAccounts.expertId, expertId));
}

/** A usable access token, refreshed if the stored one is close to expiring. */
async function accessTokenFor(expertId: string): Promise<string | null> {
  const [acct] = await db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.expertId, expertId))
    .limit(1);
  if (!acct) return null;

  // A minute of headroom: a token that expires mid-request is a token that
  // did not work.
  const fresh =
    acct.accessToken &&
    acct.accessTokenExpiresAt &&
    acct.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
  if (fresh) return acct.accessToken;

  let refreshToken: string;
  try {
    refreshToken = open(acct.refreshTokenEnc);
  } catch {
    // Sealed under a different secret, or edited. Not recoverable, and not
    // a crash: the expert reconnects.
    return null;
  }

  const tokens = await tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
  });

  if (!tokens.access_token) {
    // Revoked from the Google side, most likely. Drop the row so the console
    // stops claiming a connection that no longer exists.
    await db.delete(googleAccounts).where(eq(googleAccounts.expertId, expertId));
    return null;
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
  await db
    .update(googleAccounts)
    .set({ accessToken: tokens.access_token, accessTokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(googleAccounts.expertId, expertId));

  return tokens.access_token;
}

export async function isConnected(expertId: string): Promise<{ email: string } | null> {
  const [acct] = await db
    .select({ email: googleAccounts.googleEmail })
    .from(googleAccounts)
    .where(eq(googleAccounts.expertId, expertId))
    .limit(1);
  return acct ?? null;
}

/* ---------------------------------------------------------------- event -- */

/**
 * Creates the calendar event with a Meet room and writes the link onto the
 * booking. Returns the link, or null for every reason it might not happen —
 * not configured, expert not connected, Google refused. Never throws at the
 * caller: a confirmed booking stays confirmed.
 */
export async function ensureMeetingLink(bookingId: string): Promise<string | null> {
  try {
    if (!googleConfigured()) return null;

    const [row] = await db
      .select({
        booking: bookings,
        expertName: experts.displayName,
      })
      .from(bookings)
      .innerJoin(experts, eq(bookings.expertId, experts.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!row || row.booking.meetingUrl) return row?.booking.meetingUrl ?? null;

    const token = await accessTokenFor(row.booking.expertId);
    if (!token) return null;

    const res = await fetch(
      `${CALENDAR}/calendars/primary/events?conferenceDataVersion=1`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          summary: "Landline session",
          description:
            "A Landline session. The customer's intake is in your Landline schedule.",
          start: { dateTime: row.booking.startsAt.toISOString() },
          end: { dateTime: row.booking.endsAt.toISOString() },
          // requestId must be unique per request; the booking id is, and
          // reusing it means a retry cannot create a second room.
          conferenceData: {
            createRequest: {
              requestId: `landline-${row.booking.id}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
    );

    if (!res.ok) {
      console.error("[google] event create failed", res.status, await res.text());
      return null;
    }

    const event = (await res.json()) as { hangoutLink?: string };
    if (!event.hangoutLink) return null;

    await db
      .update(bookings)
      .set({ meetingUrl: event.hangoutLink })
      // IS NULL, so two confirmations racing cannot overwrite each other.
      .where(and(eq(bookings.id, bookingId), isNull(bookings.meetingUrl)));

    return event.hangoutLink;
  } catch (err) {
    console.error("[google] ensureMeetingLink failed", err);
    return null;
  }
}

