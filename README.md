# Bluepoint

An expert-call marketplace for Indian retail traders. Customers book a
45-minute portfolio audit or F&O session with a vetted expert, pay through
Razorpay, and fill a short intake form before the call.

Next.js (App Router) · Postgres · Drizzle · Razorpay · Resend · Vercel.

The design and the reasoning behind it are in
[`docs/plans/2026-09-08-backend-design.md`](docs/plans/2026-09-08-backend-design.md).
Read that before changing how booking or payment works.

## Where this is

**Phase 1 — demo.** Everything works end to end, in Razorpay **test mode**.
No real money, no real experts. Phase 2 switches to live keys; phase 3 adds
expert accounts, self-serve availability and payouts.

## Running it

You need a Postgres database and a Razorpay test account. Both are free.

```bash
cp .env.example .env.local     # then fill it in — see below
npm install
npm run db:push                # create the tables
npm run db:seed                # three demo experts, weekdays 10-1 and 3-7 IST
npm run dev
```

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

### Testing payment locally

Razorpay cannot reach `localhost`, so the webhook — which is the only thing
that confirms a booking — will not fire. Tunnel it:

```bash
npx untun@latest tunnel http://localhost:3002
```

Then add `<tunnel-url>/api/webhooks/razorpay` as a webhook in the Razorpay
dashboard, subscribed to `payment.captured`. Test card `4111 1111 1111 1111`,
any future expiry, any CVV.

## How it fits together

```
app/
  page.tsx                       landing page, experts from the database
  booking/[id]/page.tsx          post-payment status, polls until confirmed
  booking/[id]/intake/page.tsx   intake form, reached by signed link
  api/
    experts/[slug]/slots         computed availability
    bookings/hold                reserves a slot for 10 minutes
    payments/order               creates the Razorpay order
    webhooks/razorpay            THE ONLY PLACE A BOOKING IS CONFIRMED
    bundles/hold                 buys three calls, holds the first slot
    bookings/redeem              spends a bundle credit, no payment
    cron/expire-holds            daily housekeeping; expiry itself is lazy
    cron/reminders               hourly via GitHub Actions, not Vercel
    cron/purge-intake            daily — deletes intake 90 days after the call
  ops/                           the operations console, password-guarded
lib/
  db/schema.ts                   eleven tables
  slots.ts                       availability arithmetic, no stored slots
  razorpay.ts                    client and signature verification
  email.ts                       Resend, send-at-most-once
```

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

Editing availability is not in the console yet — change `availability_rules`
directly or re-run the seed.

## Three things not to break

**The webhook is the source of truth.** Razorpay's client-side success handler
is a convenience — it can be lost, or forged. Nothing else may confirm a
booking.

**Prices are read server-side.** `/api/payments/order` takes a booking id and
nothing else. The moment a price crosses the wire from the browser, a ₹2,200
slot can be bought for ₹1.

**The partial unique index on `bookings` prevents double-booking.** Do not
replace it with a check in application code; that loses the race.

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
