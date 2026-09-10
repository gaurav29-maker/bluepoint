# References

Things being looked at. Nothing here is a dependency, and nothing here is
part of the product.

---

## Vibe-Trading — https://github.com/HKUDS/Vibe-Trading

An open-source (MIT) agent framework from HKUDS. LLM-driven: it automates
investment research and strategy backtesting, and executes live trades through
broker integrations. Actively maintained and presented as a production
framework rather than a research demo — 33k stars, 2,000+ commits, releases
landing weekly as of September 2026.

**Checked again on 11 September 2026, and the first version of this note was
wrong.** It said there was no Indian market support and treated that as the
reason not to use it. India equity landed in v0.1.11 and is first class:

- An `IndiaEquityEngine` modelling T+1 delivery, no overnight shorts,
  configurable circuit bands, 1-share lots, and the whole cost stack — STT,
  stamp duty, exchange fees, SEBI levies, GST.
- An `equity_in` factor universe, 255 alpha101/qlib158 factors.
- Data for `.NS`/`.BO` routed yahoo → yfinance → an optional read-only
  Shoonya/Dhan bridge → local.
- Zerodha and Fyers wired for live orders. Dhan and Shoonya capped to paper
  and read-only, because neither exposes a sandbox.

Read the release wording carefully: India is a first-class **backtesting**
market. Production execution for India is not documented to the same standard.

## india-trade-cli — https://github.com/hopit-ai/india-trade-cli

Confusingly also called "Vibe Trading", and **not** a fork of the above. MIT,
~100 stars, ~260 commits. Seven LLM analyst agents — technical, fundamental,
options, news/macro, sentiment, sector rotation, risk — run in parallel, hold
a multi-round bull/bear debate, and a fund manager agent issues a
**BUY/SELL/HOLD verdict with a confidence level**. Fyers for data, Zerodha /
Angel One / Upstox for execution. It places real orders. It notes SEBI's
static-IPv4 registration rule, effective April 2026.

---

## Where these can and cannot go

**The India-native one is the more dangerous of the two**, which is the
opposite of what its name suggests. A BUY/SELL/HOLD verdict on a holding is a
personalised recommendation on a security. Bluepoint's terms say a session is
"a review and a discussion… not a recommendation to buy or sell any
security" — that output contradicts the promise in our own footer, and it is
precisely the activity that needs IA or RA registration. Its own README
carries a "not financial advice" disclaimer, which tells you the authors know
it. It does not go near the product.

**Nothing here appears customer-facing, either way.** The site says in several
places, on purpose:

- *Not an automated score. A person reads your portfolio, not a model.*
- The FAQ answers "Is this AI reading my portfolio?" with "No."
- *Nothing is executed for you, and no one follows up to sell you anything.*

At 33k stars the HKUDS repo is recognisable enough that a customer spotting it
turns a positioning problem into a credibility one.

**Execution stays off in both cases.** Placing trades for clients is a
different business under a different licence, and turning it on changes what
Bluepoint *is* under SEBI, not merely what it can do.

## The one idea worth building toward: cost drag

The Indian cost stack is already modelled — STT, stamp duty, exchange, SEBI,
GST. Most retail F&O traders have no accurate idea what a year of trading
actually costs them.

Telling somebody that number is **arithmetic, not advice**. It is factual,
usually surprising, sits comfortably inside the line the rest of the product
is drawn around, and goes straight into an F&O session as prep the expert
walks them through. If any of this is ever used, this is the piece to start
with.

Everything else stays internal in the same shape: factor exposure and
historical drawdown of a customer's actual basket, computed as *material* and
handed to an expert who forms their own view. A researcher using automated
screening to inform their own work is not an algorithm handing a verdict to a
customer — the same way an analyst using Excel does not make the output "an
Excel recommendation". What reaches a customer is what a named expert says,
having done the thinking themselves.

## Before any of it

Worth a conversation with the lawyer alongside the research-team question —
they are the same question. And it is the second thing, not the first: there
is no production database, nobody can sign in, and no payment has ever
executed.
