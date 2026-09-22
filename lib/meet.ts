/**
 * Handing an expert a pre-filled Google Calendar event for a session.
 *
 * Why this and not the real thing: a Meet link cannot be created from a URL.
 * Creating one for somebody else needs the Google Calendar or Meet API, which
 * needs each expert to connect their Google account over OAuth, which needs a
 * Google Cloud project and a consent screen. That is a real feature and it is
 * worth building — but it is not a prerequisite for an expert being able to
 * get a link into a booking today, and it cannot be built at all until
 * somebody creates the Cloud project.
 *
 * So: one click opens Calendar with the title, date and time already filled
 * in. The expert ticks "Add Google Meet video conferencing", saves, and
 * copies the link back into the field beside this one. Two upsides over
 * pasting a bare link — the session lands in their own calendar, where they
 * will actually see it, and the meeting room is unique to the event rather
 * than a personal room a previous customer could wander into.
 *
 * Deliberately NOT included: the customer's email address. The expert console
 * loads the customer's name and not their address, and a calendar invite is
 * not the place to quietly widen that — nor is a query string the place to
 * put somebody's email.
 */

/** Google's template URLs want basic-format UTC: 20260923T103000Z. */
function utcBasic(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarTemplateUrl(args: {
  customerName: string;
  startsAt: Date;
  endsAt: Date;
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Landline session — ${args.customerName}`,
    dates: `${utcBasic(args.startsAt)}/${utcBasic(args.endsAt)}`,
    details:
      "Landline session. Add Google Meet video conferencing to this event, " +
      "save it, then copy the Meet link back into your Landline schedule so " +
      "the customer can join.",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
