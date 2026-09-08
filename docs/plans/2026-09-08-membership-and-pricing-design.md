# Memberships, pricing, and what the member console is for

**Date:** 8 September 2026
**Status:** design agreed in outline; several numbers still open (see the end)
**Supersedes:** the pricing in `2026-09-08-backend-design.md`, which described
₹1,500–₹2,200 calls and a ₹3,600 bundle.

## The idea in one line

Single calls sell fine with no account at all. A membership is what earns a
login — so **the console is not a feature of Bluepoint, it is the shape a
membership takes.** Someone who buys one call never sees it.

## The ladder

Four things on the price list, two shapes underneath.

| | What it is | Entitlement | Account |
|---|---|---|---|
| Single call | one 45-minute session | — | no, magic link |
| 3-call bundle | 3 sessions, 60 days, one expert | **credits** | no, magic link |
| Quarterly pass | unlimited, 90 days, any expert | **period** | **yes** |
| Annual pass | unlimited, 12 months, any expert | **period** | **yes** |

**Credits and periods are different things and must not share a table.**
`bundles` already models credits: a pot with `credits_total`, `credits_used`
and an expiry, spent by `/api/bookings/redeem` without payment. A pass has no
counter at all — it is a window of time inside which booking is free.
Stretching `bundles` to cover both would leave half its columns null on every
membership row. Passes get their own `memberships` table.

Booking under a pass reduces to one question: *is there an active membership
covering this date?* If yes, book, take no payment, decrement nothing.

## Unlimited, with no throttle

Decided 8 September: passes are **genuinely unlimited**, priced high enough
that heavy use is still profitable. No fair-use cap, no queue depth, no
"one booking at a time".

The alternative considered and rejected was Edit Lobby's model — unlimited
work, one request in flight — which self-limits demand by the calendar rather
than by a counter. It remains the obvious lever if the economics go wrong.

**The consequence is not neutral.** Removing the throttle moves the safety
mechanism out of the code and into visibility: nothing stops a member taking
three calls a week, so the operator has to be able to *see* it happening
before renewal rather than infer it from a bank balance afterwards.

That makes a **margin view in the ops console load-bearing, not a nicety**:
per member, calls taken against fee paid, expert cost accrued, and the
resulting margin. It is the instrument that replaces the throttle.

## Pricing

### Where it stands

| | Gaurav's figure | Recommended |
|---|---|---|
| Single call | ₹5,499 | ₹5,499 — keep |
| 3-call bundle | ₹9,999 | ₹13,999 |
| Quarterly pass | ₹45,000 | ₹75,000 |
| Annual pass | ₹2,45,000 | ₹2,45,000 — keep |

### The reasoning is per-day, not per-period

```
Quarterly  ₹45,000 ÷ 90   = ₹500/day
Annual    ₹2,45,000 ÷ 365 = ₹671/day    ← 34% dearer
```

As originally priced, **four quarterly passes (₹1,80,000) cost less than one
annual (₹2,45,000)** for identical coverage. A longer commitment should cost
less per day, because the customer is being paid for their certainty. Anyone
spending two lakh will do that arithmetic.

Raising the quarterly to ₹75,000 (₹833/day) puts the annual 19% below it and
restores the normal shape, without touching the annual figure.

### Why ₹45,000 a quarter was the broken number, not the annual

The site already promises a "weekly check-in call" on the F&O tier, so weekly
use is the advertised behaviour, not an edge case. A weekly member takes ~13
calls a quarter. At ₹2,200 to the expert that is ₹28,600 of cost against
₹45,000 collected — thin, and negative as soon as they go twice weekly. At
₹75,000 the same member leaves roughly 60% margin, and the pass stays positive
to about two calls a week.

### The bundle cannibalises the passes

At ₹9,999 for three, calls cost ₹3,333 — a 39% discount, the widest gap in the
ladder. A member is then better off buying bundles indefinitely than ever
taking a pass: they would need ~22 calls a quarter before a ₹75,000 pass wins.
At ₹13,999 the discount is 15%, the bundle still works as an entry rung, and
the pass starts winning around 16 calls.

### Exposure

At ₹2,200 per call to the expert, an annual pass covers about 111 calls.
A member booking three a week takes 156 — roughly **₹90,000 underwater**.
Survivable once, structural if it becomes a pattern.

**Everything above assumes an expert keeps ₹2,000–2,200 per session.** If the
share is instead 60% of list (~₹3,300), the ₹13,999 bundle falls to near cost
and the annual's safe ceiling drops from 111 calls to 74. The real payout
figure is the single most important open input.

## What the member console is for

A member holds something over time, which is exactly what a logged-out magic
link cannot represent. The console has four jobs:

1. **Prove the membership is live** — what they hold, and until when.
2. **Book** — the main verb, unlimited, across any expert.
3. **Hold the thread** — past sessions, the intake they submitted each time,
   how the portfolio has changed. This is the part a single call cannot give
   and the reason continuity is worth paying for.
4. **Renew** — since passes are bought outright, renewal is a prompt, not a
   silent auto-debit.

## Why this sidesteps the hardest technical problem

The monthly F&O tier was deferred because recurring auto-debit in India runs
under the RBI e-mandate framework: additional-factor auth at registration, a
pre-debit notification 24 hours before every charge, an auto-debit ceiling.

**A quarterly or annual pass bought once, upfront, is not a mandate — it is a
payment.** Same machinery as the existing bundle, longer window. The cost is
losing auto-renewal; the gain is skipping the whole e-mandate build. For a
young marketplace that is close to free.

## Schema changes this needs

- **New `memberships` table** — customer, tier, `starts_at`, `ends_at`,
  `amount_paise`, status. No credit columns.
- **`bundles.expert_id` becomes nullable**, or passes simply never use it.
  "All services, any expert" breaks the current one-bundle-one-expert rule.
- **`bookings.product`** gains a membership variant alongside `single` and
  `bundle_call`.
- **Ops console margin view** — usage and expert cost per member.

## Open, and deliberately not decided here

- **Expert payout per call.** Decides whether the table above holds.
- **Whether the annual stays ₹2,45,000** and the quarterly rises, or the
  annual comes down instead.
- **Financial year versus rolling twelve months.** An Indian FY runs 1 April
  to 31 March; FY alignment fits the tax-and-review rhythm, but a member
  joining in January gets three months. Rolling from purchase avoids that.
- **Whether the 3-call bundle survives** at all once passes exist.
- **What the member console is called.** `/ops` is the operator's console;
  this needs its own name.
- **Whether "all services" ever grows beyond audits and F&O sessions.**

Nothing in this document has been built. The live site still shows the old
₹1,500–₹2,200 pricing.
