# Bluepoint backend — design

**Date:** 8 September 2026
**Status:** agreed, phase 1 in build

## What Bluepoint is

An expert-call marketplace for Indian retail traders. A customer picks a
vetted expert, books a 45-minute slot, pays, and fills a short portfolio
intake form before the call. Two products today — portfolio audits and
F&O systematic-trading sessions — priced ₹1,500–₹2,200 per call, with a
three-call bundle at ₹3,600 and an ongoing monthly F&O tier.

Bluepoint is a separate project from Ojanics. Nothing is shared between
them except the Vercel account.

## Shape of the work

The site was a single static `index.html` with no JavaScript. The backend
is built as three phases, each a superset of the last, in one codebase.
No phase throws away the phase before it.

| | Phase 1 — demo | Phase 2 — real money | Phase 3 — marketplace |
|---|---|---|---|
| Razorpay | test keys | live keys (needs entity KYC) | + Subscriptions for monthly |
| Experts | seeded SQL | seeded by hand | Auth.js, self-serve availability |
| Slots | computed | computed | + expert dashboard |
| Meet link | static per expert | static per expert | auto-generated |
| Payouts | — | manual UPI | Razorpay Route split |
| Ops | — | by hand | admin UI |

Phase 1 is everything working end to end, in Razorpay test mode. That is
what makes "demo, then validate, then launch" a sequence rather than a
contradiction.

## Stack

Next.js (App Router) + Postgres + Drizzle + Razorpay + Resend, on Vercel.

Two alternatives were considered and rejected:

- **Static HTML plus serverless functions.** Fastest start, no migration.
  But the slot picker, intake form and payment states in hand-rolled
  vanilla JS get ugly fast, and phase 3 forces the migration anyway.
- **Embed Cal.com or similar.** Least code by a wide margin. Breaks down
  here: Cal.com's payment path assumes Stripe, this needs INR through
  Razorpay, and a marketplace taking commission across many experts is
  not what it is built for.

## Regulatory position

Charging a fee to review someone's actual holdings sits close to
"investment advice" under the SEBI (Investment Advisers) Regulations,
2013. F&O guidance can touch the Research Analyst regulations. The site
copy already tries to thread this — "no tips, just a review" — but
reviewing real portfolios for money moves toward the regulated line, not
away from it.

**This needs a lawyer before live payments are switched on.** It is not a
question the code can settle.

What the backend does is make compliance cheap rather than expensive
later:

- `sebi_reg_type` and `sebi_reg_number` are first-class fields on an
  expert, not an afterthought.
- Every booking records timestamped consent against a versioned
  disclaimer.
- Session records are immutable once the call completes.

Portfolio data also engages the DPDP Act 2023, which is handled by the
retention rule below.

## Data model

Eleven tables.

```
experts              slug, display_name, headline, bio, specialties[],
                     years_experience, price_paise, timezone,
                     sebi_reg_type ('ria'|'ra'|'none'), sebi_reg_number,
                     meeting_url, status ('draft'|'live'|'paused')

availability_rules   expert_id, weekday 0-6, start_minute, end_minute
availability_except  expert_id, date, kind ('block'|'extra'), start/end_minute

bookings             expert_id, customer_id, starts_at, ends_at,
                     status ('held'|'confirmed'|'completed'|'cancelled'
                             |'refunded'|'expired'),
                     hold_expires_at, product ('single'|'bundle_call'|'monthly'),
                     bundle_id, amount_paise, meeting_url

customers            email (unique), name, phone
bundles              customer_id, expert_id, credits_total, credits_used,
                     amount_paise, expires_at, status
payments             booking_id, bundle_id, razorpay_order_id (unique),
                     razorpay_payment_id (unique), amount_paise, status, raw
intake_submissions   booking_id (unique), payload jsonb, submitted_at
consents             booking_id, disclaimer_version, accepted_at, ip
webhook_events       provider, event_id (unique), type, payload, processed_at
notifications        booking_id, kind, sent_at  — unique (booking_id, kind)
```

### Three decisions worth defending

**Slots are not a table.** They are computed per request: recurring rules,
minus exceptions, minus live bookings, over a rolling 21-day window. A
`slots` table would need a generator job and would drift out of date.
Computing is cheap at this volume and cannot go stale.

**Times are minutes from midnight**, with `Asia/Kolkata` held on the
expert. Weekly recurrence stored in `timestamptz` invites DST and offset
bugs; integers plus an explicit zone do not.

**Double-booking is prevented in Postgres, not in application code:**

```sql
CREATE UNIQUE INDEX ON bookings (expert_id, starts_at)
  WHERE status IN ('held','confirmed','completed');
```

Two people paying for the same 4pm slot is the one failure that costs a
customer and an expert at once. A check-then-insert in application code
loses that race. The partial index cannot.

Note what is absent: no users or passwords table. Phases 1 and 2 have no
customer accounts — bookings are reached by signed magic link. That
removes an entire auth surface until phase 3 needs it.

## Booking and payment flow

The rule the whole flow turns on: **the client never decides anything
that costs money.**

```
1  GET  /api/experts/[slug]/slots?from&to   computed, 21-day window
2  POST /api/bookings/hold                  → booking status='held',
                                              hold_expires_at = now()+10min
                                              (partial index rejects races → 409)
3  POST /api/payments/order                 server reads expert.price_paise,
                                              creates Razorpay order
4  → Razorpay Checkout opens client-side
5  POST /api/webhooks/razorpay              payment.captured → confirm
6  Vercel Cron */5                          expire stale holds
```

**Amount is computed server-side, always.** Step 3 accepts a `booking_id`
and nothing else — no price, no plan, no discount code from the browser.
Accepting a client-supplied amount is the classic marketplace hole, and
it is how someone books a ₹2,200 slot for ₹1.

**The webhook is the only source of truth.** Razorpay's client-side
success handler is a convenience — it can be lost on a flaky connection,
or fabricated outright. Only `/api/webhooks/razorpay` confirms a booking,
and it must:

- verify the HMAC-SHA256 signature over the **raw** request body. Next.js
  parses bodies by default, and verifying against re-serialized JSON fails
  intermittently in a way that is miserable to debug;
- insert into `webhook_events` on a unique `event_id`, so redelivery is a
  no-op rather than a double-confirm;
- re-check the amount against the expert's price before confirming.

**The edge case that must be handled:** payment captured at minute 11,
after the hold expired and someone else took the slot. The webhook finds
no valid hold, so it issues an automatic refund through Razorpay's
Refunds API and emails an apology. Rare — but the alternative is quietly
holding money for a call that cannot happen, which is the kind of thing
that ends a young marketplace.

**Bundles** buy three credits against one expert, expiring in 60 days.
Credit spend decrements in the same transaction as the booking insert.

## Notifications and intake

Emails go out through Resend, each triggered from booking state:
confirmation to customer and expert on confirm, an intake nudge if the
form is still empty 24 hours out, reminders at 24 hours and 1 hour, and a
follow-up after the call. An hourly Vercel Cron drives the time-based
ones.

The `notifications` table exists because a Cron that retries would
otherwise send the same reminder three times. The unique index on
`(booking_id, kind)` makes a resend impossible rather than unlikely.

Intake lives at `/booking/[id]/intake?t=<signed token>` — no login, the
token is an HMAC of the booking id.

Two rules are baked into the schema rather than left to discipline:

- **No credential field exists anywhere.** The FAQ promises users never
  share a demat login. The cheapest way to keep that promise is to have
  nowhere to put one.
- **Intake payloads are purged 90 days after the call**, keeping the
  booking row. DPDP calls for retention limits, and stale portfolio data
  is pure liability.

## Deliberately deferred

- **Monthly F&O tier.** Recurring INR payments run under the RBI
  e-mandate framework — additional-factor auth at registration, a
  pre-debit notification 24 hours before every charge. Disproportionately
  hard, and last in the order.
- **Expert payouts.** Manual UPI at low volume in phase 2. Razorpay Route
  in phase 3, which needs KYC on each expert.
- **Customer accounts.** Magic links until phase 3.

## Real-world dependencies

Not everything here is code:

- Live Razorpay keys need a registered entity with completed KYC.
- The SEBI position needs a lawyer.
- Phase 2 needs real experts who have agreed to be listed.

## Deploying

The Vercel MCP connector 404s on this account — a known quirk, seen on
the other project too. Use the `vercel` CLI.
