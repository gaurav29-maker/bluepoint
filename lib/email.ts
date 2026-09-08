import { Resend } from "resend";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { istDateTime, rupees } from "@/lib/format";
import { intakeUrl } from "@/lib/tokens";

type Kind = (typeof notifications.kind.enumValues)[number];

let cached: Resend | null = null;
function resend(): Resend {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  cached = new Resend(key);
  return cached;
}

/**
 * Send an email at most once per (booking, kind), ever.
 *
 * The claim row goes in first. If two Cron runs overlap, the second one's
 * insert conflicts and it sends nothing. If the send itself fails, the claim
 * is released so a later run can retry.
 */
export async function sendOnce(
  bookingId: string,
  kind: Kind,
  message: { to: string; subject: string; html: string },
): Promise<"sent" | "already-sent" | "failed"> {
  const claimed = await db
    .insert(notifications)
    .values({ bookingId, kind })
    .onConflictDoNothing()
    .returning({ id: notifications.id });

  if (claimed.length === 0) return "already-sent";

  try {
    await resend().emails.send({
      from: process.env.EMAIL_FROM ?? "Bluepoint <onboarding@resend.dev>",
      replyTo: process.env.EMAIL_REPLY_TO,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    return "sent";
  } catch (err) {
    await db
      .delete(notifications)
      .where(and(eq(notifications.bookingId, bookingId), eq(notifications.kind, kind)));
    console.error(`[email] ${kind} for ${bookingId} failed`, err);
    return "failed";
  }
}

const DISCLAIMER = `
  <p style="color:#6B6B6B;font-size:12px;line-height:1.6;margin-top:28px;
            border-top:1px solid #E4E8EF;padding-top:16px">
    Bluepoint sessions are a review and discussion of your existing portfolio and
    approach. They are not a recommendation to buy or sell any security, and are
    not personalised investment advice. You remain responsible for your own
    decisions. Never share your demat or broker login with anyone, including us.
  </p>`;

function shell(body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;
                      color:#1A1A1A;max-width:520px;line-height:1.65">
    ${body}
    ${DISCLAIMER}
  </div>`;
}

export function customerConfirmation(args: {
  customerName: string;
  expertName: string;
  startsAt: Date;
  amountPaise: number;
  bookingId: string;
  meetingUrl: string | null;
}) {
  return {
    subject: `Your Bluepoint call with ${args.expertName} is confirmed`,
    html: shell(`
      <h2 style="font-size:20px;margin:0 0 16px">You're booked in.</h2>
      <p>Hi ${args.customerName}, your 45-minute session with
         <strong>${args.expertName}</strong> is confirmed.</p>
      <p style="background:#EAF2FC;padding:14px 16px;border-radius:8px;margin:20px 0">
        <strong>${istDateTime(args.startsAt)} IST</strong><br>
        Paid ${rupees(args.amountPaise)}
        ${args.meetingUrl ? `<br><a href="${args.meetingUrl}">Join link</a>` : ""}
      </p>
      <p><strong>One thing before the call.</strong> Fill in the short intake form so
         your expert arrives having already looked at your holdings:</p>
      <p><a href="${intakeUrl(args.bookingId)}"
            style="display:inline-block;background:#387ED1;color:#fff;padding:11px 20px;
                   border-radius:8px;text-decoration:none">Fill the intake form</a></p>
      <p style="font-size:13px;color:#6B6B6B">It asks for a summary of your holdings —
         never a login.</p>`),
  };
}

export function expertNotification(args: {
  expertName: string;
  customerName: string;
  startsAt: Date;
  bookingId: string;
}) {
  return {
    subject: `New booking: ${args.customerName}, ${istDateTime(args.startsAt)}`,
    html: shell(`
      <h2 style="font-size:20px;margin:0 0 16px">New booking</h2>
      <p>Hi ${args.expertName}, <strong>${args.customerName}</strong> has booked a
         45-minute session.</p>
      <p style="background:#EAF2FC;padding:14px 16px;border-radius:8px;margin:20px 0">
        <strong>${istDateTime(args.startsAt)} IST</strong>
      </p>
      <p>Their intake form will follow once they've filled it in.</p>`),
  };
}

export function intakeNudge(args: { customerName: string; startsAt: Date; bookingId: string }) {
  return {
    subject: "Two minutes before your Bluepoint call tomorrow",
    html: shell(`
      <p>Hi ${args.customerName}, your call is at
         <strong>${istDateTime(args.startsAt)} IST</strong> and the intake form is
         still empty.</p>
      <p>Filling it in is what makes the session useful — otherwise the first fifteen
         minutes go on describing your portfolio out loud.</p>
      <p><a href="${intakeUrl(args.bookingId)}"
            style="display:inline-block;background:#387ED1;color:#fff;padding:11px 20px;
                   border-radius:8px;text-decoration:none">Fill it in now</a></p>`),
  };
}

export function reminder(args: {
  customerName: string;
  expertName: string;
  startsAt: Date;
  meetingUrl: string | null;
  soon: boolean;
}) {
  return {
    subject: args.soon
      ? `Your call with ${args.expertName} starts in an hour`
      : `Your call with ${args.expertName} is tomorrow`,
    html: shell(`
      <p>Hi ${args.customerName}, a reminder that your session with
         <strong>${args.expertName}</strong> is at
         <strong>${istDateTime(args.startsAt)} IST</strong>.</p>
      ${
        args.meetingUrl
          ? `<p><a href="${args.meetingUrl}"
                  style="display:inline-block;background:#387ED1;color:#fff;padding:11px 20px;
                         border-radius:8px;text-decoration:none">Join the call</a></p>`
          : "<p>Your expert will send the join link shortly.</p>"
      }`),
  };
}

export function refundApology(args: {
  customerName: string;
  startsAt: Date;
  amountPaise: number;
}) {
  return {
    subject: "That slot went — your money is on its way back",
    html: shell(`
      <p>Hi ${args.customerName}, your payment for the
         ${istDateTime(args.startsAt)} IST slot arrived just after someone else
         had taken it.</p>
      <p>We haven't kept the money. <strong>${rupees(args.amountPaise)}</strong> has been
         refunded and will reach your account in 5-7 working days.</p>
      <p>Sorry — genuinely. Please do pick another slot.</p>`),
  };
}
