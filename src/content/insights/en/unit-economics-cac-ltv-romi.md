---
title: "Unit economics for small businesses: CAC, LTV and ROMI without spreadsheet hell"
seoTitle: "Unit Economics: CAC, LTV and ROMI Explained — CYBERMOVE"
description: "Unit economics for small businesses: how to calculate CAC, LTV and ROMI, where to find the data, three common mistakes and a worked example in tenge."
date: 2026-09-25
direction: audit
services: [financial-audit, investment]
cases: [toscana-wine, ecommerce]
faq:
  - q: "How often should we calculate unit economics?"
    a: "For advertising decisions, once a month on a closed period. Weekly numbers are too noisy: one large deal or a gap in the data distorts the picture. LTV is worth reviewing once a quarter."
  - q: "What if our CRM has no data on repeat purchases?"
    a: "Start with what you have: payment records, the customer base in your accounting system, receipts. Even a rough LTV estimate is better than none. In parallel, set up tracking so that every payment is linked to a customer."
  - q: "Should sales salaries be included in CAC?"
    a: "Yes, if you want the full cost of a customer. Calculate two versions: marketing CAC (advertising only) and fully loaded CAC (advertising plus sales). The first helps compare channels, the second helps decide on budgets."
  - q: "What is a good ROMI?"
    a: "There is no universal benchmark: it depends on margin, sales cycle length and whether you count revenue or profit. Comparing channels with each other and tracking the trend matters more than chasing someone else's numbers."
---

Unit economics answers a simple question: does the business make money on each customer after everything it spent to acquire them? If the answer is yes, advertising can be scaled. If it is no, every new customer adds to the loss, and revenue growth only speeds the problem up.

It sounds like a job for a finance department, but for a small business three metrics and data you already have are enough. Below are the definitions, formulas, where to find the numbers, the most common mistakes and a worked example with illustrative figures.

## Three metrics are enough

### CAC — customer acquisition cost

CAC is how much money it takes to win one new paying customer.

**Formula:** acquisition spend for the period ÷ number of new customers in the same period.

Details that matter:

- count **new customers**, not leads and not deals with existing customers;
- spend includes everything used to acquire customers: ads, agency fees, creative production and, for the fully loaded version, sales salaries and bonuses;
- the spend period and the customer period must match, and with a long sales cycle the customer period should be shifted by the length of that cycle.

### LTV — customer lifetime value

LTV is how much a customer brings over the entire relationship with you.

**Starter formula:** average order value × average number of purchases per customer × margin.

Margin is essential here. Revenue is not your money: cost of goods, delivery, payment and marketplace fees all have to come out. LTV based on revenue almost always overstates what the business can afford. If margin is hard to calculate, start with revenue-based LTV, but treat it as an upper bound.

### ROMI — return on marketing investment

ROMI shows how much your marketing spend returned.

**Formula:** (income from the channel − spend on the channel) ÷ spend on the channel × 100%.

A ROMI of 0% means the spend only broke even. Negative ROMI means the channel loses money. It is more honest to treat "income" as gross profit (revenue minus cost of goods) rather than revenue, otherwise a channel can look profitable while selling at a loss.

### The key ratio

LTV and CAC work as a pair. If a customer brings less margin over their lifetime than it cost to acquire them, the business loses money on every new customer. If they bring more, you have headroom that can be invested in growth. The LTV / CAC ratio shows that headroom, and the CAC payback period shows how quickly the money comes back.

### Payback period — the metric for your cash

Even with a healthy LTV / CAC ratio, a business can run out of cash. If a customer pays back their acquisition cost over a year while ads have to be paid for today, fast growth eats working capital. That is why it helps to track one more metric — the **CAC payback period**: how many months of margin from a customer it takes to cover the cost of acquiring them.

**Formula:** CAC ÷ monthly margin per customer.

For a small business this is often more important than LTV. A long payback period means you can only scale advertising if you have cash reserves or a credit line. A short one means growth largely funds itself. This metric links marketing to cash-flow management, and it is usually where the conversation about a growth budget really starts.

## Where to find the data

In most small businesses the numbers already exist — just in different places.

| Metric | Source |
|---|---|
| Ad spend | Ad accounts, agency invoices |
| New customers | CRM: deals marked "paid" with new contacts |
| Customer source | UTM tags, "source" field in the CRM, call tracking |
| Average order value | CRM or accounting system |
| Repeat purchases | Payment history per customer in the CRM or accounting |
| Cost of goods and margin | Bookkeeping, supplier prices, per-product calculation |

The weakest link is "customer → source". If the CRM does not record where a customer came from, you cannot calculate CAC by channel, only an overall CAC. So the first practical step is almost always the same: make the source field mandatory and pass UTM tags from the website into the CRM.

## Three common mistakes

### Mistake 1. Counting leads instead of customers

Cost per lead (CPL) is a useful metric for tuning campaigns, but not for budget decisions. A channel with cheap leads can produce few payments, and then its CAC turns out to be the highest. Decisions about where to invest are made on CAC and ROMI, not CPL.

### Mistake 2. Calculating LTV on revenue and without a time horizon

"Our customers stay with us for five years on average" is a hope, not a calculation. LTV should be calculated over a clear horizon — for example, the first year, or the first 12–24 months — using actual repeat-purchase data. And on margin, not revenue.

### Mistake 3. Mixing new and returning customers

If repeat purchases by existing customers end up in the CAC denominator, acquisition cost looks lower than it really is. Repeat sales are the result of retention and service and should be counted separately.

## A worked example

Below is an **illustrative example** with rounded numbers to show the logic. It is not client data and not a benchmark for your market. Amounts are in tenge (₸).

An online store spent the following on two channels in a month:

| | Channel A | Channel B |
|---|---|---|
| Ad spend | 600,000 ₸ | 400,000 ₸ |
| Leads | 300 | 100 |
| Cost per lead (CPL) | 2,000 ₸ | 4,000 ₸ |
| New customers (paid) | 20 | 25 |
| CAC | 30,000 ₸ | 16,000 ₸ |

On cost per lead, channel A looks twice as good. On cost per customer it is the other way round: channel B brings a customer for almost half the price.

Now LTV. Average order value is 25,000 ₸, margin is 40%, and a customer makes 3 purchases a year on average. Annual margin-based LTV: 25,000 × 3 × 0.4 = 30,000 ₸.

- In channel A, LTV (30,000 ₸) equals CAC (30,000 ₸): over a year the customer only pays back their acquisition.
- In channel B, LTV is almost twice CAC: each customer brings 14,000 ₸ of margin a year above acquisition cost.

First-month ROMI, based on the margin from the first purchase (25,000 × 0.4 = 10,000 ₸ per customer):

- channel A: (20 × 10,000 − 600,000) ÷ 600,000 ≈ −67%;
- channel B: (25 × 10,000 − 400,000) ÷ 400,000 ≈ −38%.

Both channels are negative in the first month, which is normal for a business with repeat purchases: acquisition pays back on the second and third order. But channel B pays back sooner, so that is where it makes sense to move budget — until its CAC starts rising.

The point of the example is not the numbers but the reasoning: do not stop at cost per lead, carry the calculation through to customers and margin, and account for repeat purchases.

## How to do it without spreadsheet hell

1. **One sheet, three blocks.** Spend by channel, customers by channel, margin and repeat purchases. That is enough for a monthly report.
2. **Data from systems, not memory.** Spend from ad accounts, customers and payments from the CRM. Manual entry only where there is no integration yet.
3. **A fixed day.** Once a month, on a closed period, in the same format. Month-on-month comparison matters more than perfect precision.
4. **A decision at the end.** Every report ends with one or two decisions: where to move budget, what to test, what to switch off.
5. **One owner.** A specific person builds and defends the report, not "marketing" in general. When the numbers disagree with the team's gut feeling, that person finds out whether the data or the feeling is wrong.

Once the basic sheet is alive, it can be replaced by end-to-end analytics where data flows in automatically. But starting with automation before understanding the logic is a common mistake: the system will produce beautiful numbers that measure the wrong thing.

## From our practice

When sales happen both offline and through an online store, as with [Toscana Wine Shop & Wine Bar](/en/cases/toscana-wine/), channels influence each other: someone sees an ad, visits the bar and buys online later. In [e-commerce projects](/en/cases/ecommerce/), the main difficulty is repeat purchases and honest margin accounting that includes delivery and returns. In both cases unit economics starts in the same place: link each payment to a customer and each customer to a source.

## When you need an outside view

If the numbers do not add up, the data is scattered across systems, or it is unclear how to calculate margin by product, that is a job for a [financial audit](/en/services/audit/financial-audit/) — a management-level review of the business economics, not a statutory audit of financial statements. The result is a model that shows which channels and business lines make money, plus [investment and spending recommendations](/en/services/audit/investment/): where to put money and what to cut.
