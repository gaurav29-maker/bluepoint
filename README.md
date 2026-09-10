# Bluepoint

An expert-call marketplace for Indian retail traders. Customers book a
45-minute portfolio audit or F&O session, pay through Razorpay, and fill a
short intake form before the call. Every expert's SEBI registration is shown
on their profile, or its absence is stated plainly.

Next.js (App Router) · Postgres · Drizzle · Razorpay · Resend · Vercel.

The design and the reasoning behind it are in
[`docs/plans/2026-09-08-backend-design.md`](docs/plans/2026-09-08-backend-design.md).
Read that before changing how booking or payment works.

## Where this is

**Phase 1 — demo.** Everything works end to end except payment, which has
never been exercised against Razorpay: no keys are configured. No real money,
no real experts.

Expert accounts and self-serve availability, once planned for phase 3, are
built — see *The expert console* below. What is left before this is usable by
anyone is a production `DATABASE_URL`, a Resend key (without which nobody can
sign in anywhere, since sign-in is a link by email), and Razorpay test keys.

## Running it

You need a Postgres database and a Razorpay test account. Both are free.

```bash
cp .env.example .env.local     # then fill it in — see below
npm install
npm run db:local               # a local Postgres, in its own terminal
npm run db:push                # create the tables
npm run db:seed                # three demo experts, weekdays 10-1 and 3-7 IST
npm run dev
```

`db:local` needs no account and nothing installed: it runs Postgres compiled
to WebAssembly behind the ordinary wire protocol, so Drizzle and postgres.js
cannot tell the difference. Data lives in the OS temp directory, deliberately
**outside** this repo — the project sits inside OneDrive, whose syncing has
corrupted `.next` more than once, and a database directory being synced
mid-write is a worse version of the same problem.

Development only. There is no backup and no durability guarantee; production
still needs a real Postgres.

### Filling in `.env.local`

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Neon or Supabase. Use the **pooled** connection string. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay dashboard → Settings → API Keys. Must start `rzp_test_`. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Same value as `RAZORPAY_KEY_ID`. |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay dashboard → Settings → Webhooks. **Not** the key secret. |
| `RESEND_API_KEY` | Resend dashboard. Point `EMAIL_FROM` at your own inbox in phase 1. |
| `TOKEN_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | Any long random string. Guards the Cron endpoints. |
| `OPS_PASSWORD` | Your own choice. The single password for `/ops`. |
| `EXPERT_PAYOUT_PAISE` | What an expert is paid per session. Only used to estimate margin in `/ops/members`; defaults to ₹2,200, which is a **placeholder**. |

### Testing payment locally

Razorpay cannot reach `localhost`, so the webhook — which is the only thing
that confirms a booking — will not fire. Tunnel it:

```bash
npx untun@latest tunnel http://localhost:3000
```

Then add `<tunnel-url>/api/webhooks/razorpay` as a webhook in the Razorpay
dashboard, subscribed to `payment.captured`. Test card `4111 1111 1111 1111`,
any future expiry, any CVV.

## How it fits together

```
app/
  page.tsx                       landing page, experts from the database
  experts/[slug]/                expert profile, with live availability
  apply/                         public application form
  expert/                        the expert console — schedule, hours, profile
  sitemap.ts robots.ts           only live experts are listed
  opengraph-image.tsx            generated share cards, one per expert too
  booking/[id]/page.tsx          post-payment status, polls until confirmed
  booking/[id]/intake/page.tsx   intake form, reached by signed link
  api/
    experts/[slug]/slots         computed availability
    bookings/hold                reserves a slot for 10 minutes
    payments/order               creates the Razorpay order
    webhooks/razorpay            THE ONLY PLACE A BOOKING IS CONFIRMED
    bundles/hold                 buys three calls, holds the first slot
    bookings/redeem              spends a bundle credit, no payment
    memberships/purchase         buys a pass; tier name only, price server-side
    memberships/book             books inside a pass, no payment
    member/session               trades a sign-in link for a session cookie
    cron/expire-holds            daily housekeeping; expiry itself is lazy
    cron/reminders               hourly via GitHub Actions, not Vercel
    cron/purge-intake            daily — deletes intake 90 days after the call
  member/                        the member console, magic-link guarded
  ops/                           the operations console, password-guarded
    members                      usage and margin per pass
lib/
  db/schema.ts                   thirteen tables
  slots.ts                       availability arithmetic, no stored slots
  razorpay.ts                    client and signature verification
  email.ts                       Resend, send-at-most-once
```

## Products and passes

| | Price | Entitlement | Account |
|---|---|---|---|
| Single call | ₹5,499 | one session | no, magic link |
| 3-call bundle | ₹9,999 | 3 credits, 60 days, one expert | no, magic link |
| Quarterly pass | ₹45,000 | unlimited, 90 days, any expert | **yes** |
| Annual pass | ₹2,45,000 | unlimited, 365 days, any expert | **yes** |

**Credits and periods are different shapes and live in different tables.**
`bundles` is a pot that depletes. `memberships` is a window of time with no
counter at all — booking under a pass asks only whether an active membership
covers the date.

Two things about this pricing are knowingly shipped as they stand, both
recorded in `docs/plans/2026-09-08-membership-and-pricing-design.md`: four
quarterly passes cost less than one annual for identical coverage, and the
bundle sells calls at a 39% discount, which is the widest gap in the ladder.

**Passes sidestep RBI e-mandate entirely.** A pass bought once upfront is a
payment, not a mandate — no additional-factor auth at registration, no
pre-debit notice, no auto-debit ceiling. The cost is that renewal is an email
rather than a silent charge.

## The member console

`/member` is what a pass buys. Single-call and bundle customers never see it;
it exists because a membership is a balance held over time, which a one-off
transaction has no use for.

Sign-in is a link by email, no password — customers should not have
credentials to lose. Tokens are scoped: a 30-minute `link` token and a 30-day
`session` token are signed over different payloads with the same secret, so a
session cookie cannot be replayed as a sign-in link. `/api/member/session`
performs the exchange, because Next only permits `cookies().set()` in a route
handler or server action, never during a page render.

## The ops console

`/ops` is the tool for running phase 2 by hand: every booking with its intake
form and payments, mark-complete, cancel and refund, and pausing or repricing
an expert.

One shared password in `OPS_PASSWORD`, no user accounts — there is one
operator and nothing to federate. A signed, httpOnly cookie holds the session
for seven days. `middleware.ts` guards every `/ops` route in front of the
pages, and each server action re-checks, because a server action is a POST
endpoint in its own right.

If `OPS_PASSWORD` is unset the console refuses everyone. That is deliberate:
the failure mode of a missing password should be a locked door, not an open
one.

Applications from `/apply` are reviewed here too. Approving creates the
expert as **draft**, never live: publishing someone the moment they are
approved would put a profile on the site with no availability behind it.

## The expert console

`/expert` is the tool for the person delivering the product. Same magic-link
sign-in as members, on its own cookie and its own scope — an expert sees other
people's portfolios, a member sees only their own, and a token minted for one
cannot be presented as the other.

- **Schedule.** Sessions that have already happened come first, under *Needs
  closing*, because they are the only thing on the page that needs a decision.
  Each session shows the customer's intake, takes a per-session join link, and
  closes as completed or no-show.
- **Availability.** The weekly windows, editable. A window shorter than one
  session is refused, because it can never produce a bookable slot and would
  silently do nothing.
- **Profile.** Headline, description and rate, self-service — `/apply`
  promises "you set your own rate and hours", and a promise the software does
  not keep is worse than one never made. Changing a rate never re-prices an
  existing booking: a booking captures `amount_paise` when the slot is held.

Two things an expert deliberately cannot change. **SEBI registration is
read-only** — the entire value of that line on a public profile is that a
person checked it against the register before the expert went live, and an
editable field would verify nothing. **Going live is not self-service** either:
an expert can pause and unpause themselves, but draft to live stays with
whoever did the verifying.

## Becoming an expert

`/apply` is a public form; `/ops/applications` is the queue. Applicants are
kept out of `experts` until a person approves them — an applicant has no
price, no hours and no account, and a row in `experts` is something the
booking code is entitled to treat as somebody we have checked.

A claimed SEBI registration must carry a number, or the profile would publish
a bare "RIA" with nothing to check it against. One open application per
address, enforced by a partial unique index on `lower(email)` where the status
is still `new`, so the form cannot be sent nine times while it sits in the
queue but somebody rejected in March can apply again in October.

The form is throttled at five per source per hour, keyed on a **salted hash**
of the address rather than the address. Throttling only ever asks "same source
again?", which does not require knowing who they are.

## Checking it still works

```bash
npm run db:local     # in one terminal
npm run dev          # in another
npm run verify
```

64 checks against a real database and a running server. They cover the parts
that need neither Razorpay nor Resend, and several of them exist because the
thing they check is a claim rather than an observation:

- two simultaneous holds on one slot — exactly one wins, defended by the
  partial unique index rather than by application code
- a correctly signed payment webhook paying the wrong amount confirms nothing
- an expert's sign-in link cannot open a member session, and the reverse
- one booking's intake link cannot fill in another's
- a draft expert is absent from the site and their profile returns 404
- a session note is purged with the intake it describes, and one inside the
  window is not
- no price or policy figure is retyped anywhere in the UI

That last one is a source check, not a flow. The booking dialog once carried
its own copy of the bundle price marked "display only"; the list moved and the
copy did not, so the dialog offered a ₹9,999 bundle at ₹3,600.

Four routes remain unexercised — `bundles/hold`, `payments/order`,
`memberships/purchase` and `cron/reminders` — and every one of them needs
Razorpay or Resend.

## The design

One system across the public pages and all three consoles, taken from
tesla.com and measured off the live site rather than recalled: two text
weights (400 and 500), letter-spacing left at normal, a 4px control radius, a
56px nav, one elevation, and text that never sits at pure black.

What could not be carried over is the layout. Four fifths of that site is
product photography and every panel is carried by a car; Bluepoint sells
forty-five minutes of somebody's attention and has nothing to photograph. Each
band is carried instead by a piece of the product — the hero holds a real
availability read, computed through the same helper the booking dialog uses,
so the page cannot advertise a week the dialog then refuses.

The public pages wrap in `.site`. The member and expert consoles wrap in
`.site-dark os` and the ops console in `.ops`; all three share the same
neutral ramp and the same accent.

**On the accent.** White clears `#3E6AE1` at 4.82:1, which is why a filled
control carries a white label. The same blue as *text* reads 4.82:1 on white
but only 3.95:1 on the dark ground, so `--blue-deep` darkens in the light
theme and lightens in the dark one. Same token, opposite direction, because
the ground moved rather than the hue. Do not lift a colour system one value at
a time.

## Three things not to break

**The webhook is the source of truth.** Razorpay's client-side success handler
is a convenience — it can be lost, or forged. Nothing else may confirm a
booking.

**Prices are read server-side.** `/api/payments/order` takes a booking id and
nothing else. The moment a price crosses the wire from the browser, a ₹2,200
slot can be bought for ₹1.

**The partial unique index on `bookings` prevents double-booking.** Do not
replace it with a check in application code; that loses the race.

**Passes are unlimited with no throttle, by decision.** Nothing in the code
stops a member booking three calls a week. `/ops/members` is the instrument
that replaces the cap: it shows calls taken against fee paid, so a member who
costs more than they pay is visible before renewal rather than after. If that
page is ever removed, the cap has to come back.

## Before real money

- A lawyer on the SEBI position. Charging to review real holdings sits close
  to regulated investment advice. See the design doc.
- Live Razorpay keys need a registered entity with completed KYC.
- Real experts, real SEBI registration numbers, and pricing they have agreed to.
- The policy pages at `/legal/*` are drafts that no lawyer has read, and every
  bracketed item in them still needs a real answer. Razorpay asks for them
  during onboarding.

## Deploying

The Vercel MCP connector 404s on this account. Use the CLI:

```bash
npx vercel deploy --prod --yes
```

Cron schedules are in `vercel.json` and need a plan that allows them.
