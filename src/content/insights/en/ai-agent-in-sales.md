---
title: "AI agents in sales: what they really do and where they break"
seoTitle: "AI Agents for Business: Use Cases and Risks — CYBERMOVE"
description: "AI agents for business in sales: lead qualification, FAQs, reminders and call analysis. Where they break, how to protect data and how to measure the impact."
date: 2026-09-25
direction: systems
services: [ai, automation]
cases: [oleg-baryshevsky, tsepukh]
faq:
  - q: "Will an AI agent replace our sales reps?"
    a: "In most businesses, no. It takes over routine work: first replies, collecting details, reminders, filling in the CRM. Negotiations, complex quotes and decisions about discounts stay with people — and that is exactly what reps get more time for."
  - q: "What do we need to launch an AI agent?"
    a: "A described scenario (what customers ask and what the correct answers are), a knowledge base (prices, terms, FAQs), access to the communication channel and the CRM, and a person who checks the conversations during the first weeks."
  - q: "Can the agent be trusted to quote prices?"
    a: "Yes, if prices come from a current source (a price list or the CRM) rather than the model's memory, and if the agent is not allowed to promise discounts or terms outside the rules. Anything non-standard should go to a person."
  - q: "How do we know the agent pays off?"
    a: "Compare before and after on specific metrics: first-response time, share of enquiries handled outside working hours, conversion from enquiry to qualified lead, time reps spend on routine. If none of them moved, you do not need the agent."
---

Over the past couple of years, AI agents have become a mandatory item in every conversation about sales. Some expect an agent to replace the sales team; others see it as a toy that annoys customers. In practice the truth is in between: an agent handles narrow, repetitive tasks well and anything that requires responsibility and commitments badly.

Let's look at what an AI agent actually does in sales, where it breaks, how to avoid data problems, and how to tell whether it pays off.

## What an AI agent in sales is

In this article, an AI agent is a program built on a language model that holds a conversation with a customer or processes information about them — and takes actions in your systems while doing so: creates a deal in the CRM, sets a task for a rep, sends a reminder, writes the customer's answers into their record. It differs from a button-based chatbot in that it understands free text and can respond outside a rigid script. It differs from "just ChatGPT" in that it is connected to your data and bound by your rules.

It helps to distinguish three kinds of agents by who they work with:

- **external text agents** — talk to customers in messengers, on the website and on social media;
- **voice agents** — take or make calls: confirm bookings, clarify orders, collect feedback;
- **internal agents** — help the reps themselves: prepare a customer summary before a call, suggest a reply to a difficult email, compile a report.

Internal agents are the easiest place to start: they do not talk to customers directly, so mistakes are cheaper, and the team has time to get used to the new tool.

## Scenarios that work

### First reply and lead qualification

A customer writes in the evening or at the weekend, and a rep will reply in the morning. By then the person has contacted competitors. An agent replies at once, clarifies the task, budget, timing and city, then creates a deal in the CRM with the fields filled in and assigns a rep. In the morning the rep gets not "hello, how much is it?" but a prepared prospect.

### Answering common questions

Delivery times, opening hours, payment terms, what is included, which documents are needed. If the answers are in the knowledge base, the agent replies accurately and consistently, without fatigue and at any hour. Anything not in the base it honestly hands over to a person.

### Reminders and win-back

Reminding about a meeting, an unpaid invoice, scheduled maintenance, or that a customer has not bought in a while. These tasks often fail simply because reps never get round to them.

### Call and chat analysis

An agent can transcribe call recordings, note whether the script was followed, which objections came up and what was agreed, and write the outcome into the CRM. Management gets not hundreds of hours of recordings but a summary per rep and a list of calls worth listening to.

### Filling in the CRM and reports

The most tedious part of a rep's job is data entry. An agent can fill in the record after a conversation and turn CRM data into a readable daily or weekly report.

## Where the agent breaks

- **It answers confidently and wrongly.** Language models can invent plausible answers. If the agent is not forbidden from answering outside the knowledge base, it may quote a price that does not exist or promise something you do not do.
- **It does not know when to stop.** The customer is irritated, asks something unusual or is ready for a large deal — and the agent keeps following the script. You need clear hand-over rules.
- **It works from outdated data.** Prices changed, the promotion ended, but the knowledge base did not. The agent repeats old information with the same confidence.
- **It annoys customers who want a human.** If the agent hides the option to reach a person, customers leave. The way to a human must be obvious.
- **It lives apart from the CRM.** Conversations happen but the data goes nowhere. Then the agent just adds one more channel someone has to check manually.

## Rules that remove most of the risk

1. **A narrow task.** One agent, one scenario: qualifying leads, answering delivery questions, sending reminders. A universal "does everything" agent does each task worse.
2. **Answers only from the knowledge base.** Anything not in it goes to a person. Prices and terms come from current sources, not from the model's memory.
3. **Explicit hand-over to a human.** Triggered by keywords, topic, customer request or deal size — and the customer can see they have been handed over.
4. **Conversation review.** In the first weeks someone reads every conversation and updates the knowledge base. Later, sampled but regular reviews.
5. **Honesty.** The customer knows they are talking to an assistant, not a person.

## Data and security

An AI agent processes customers' personal data: names, phone numbers, the content of their messages. A few questions to settle before launch:

- **Where the data is stored.** Kazakhstan's Law on Personal Data and Its Protection requires personal data databases to be stored in Kazakhstan and regulates cross-border transfer separately. If the agent uses a model provider abroad, discuss the setup with a lawyer: what exactly is transferred, whether data is anonymised, where conversation logs are kept.
- **What the agent can see.** Access only to the data needed for its task. An agent answering delivery questions does not need access to the whole customer base.
- **Customer consent.** Forms and messengers the agent works through should come with clear information about data processing.
- **An audit trail.** Every action the agent takes in the CRM should be visible and traceable: who created the deal, who changed the field.

## How to measure impact

An agent's impact is measured not in the number of conversations but in changes to sales. Before launch, record baselines for:

- first-response time, especially in the evening and at weekends;
- the share of enquiries that received a reply;
- conversion from enquiry to qualified lead and to deal;
- time reps spend on routine: answering standard questions, updating the CRM;
- the share of reminders that were actually sent.

After a month or two, compare. If the metrics did not move, the problem is either the scenario or the choice of task. An honest conclusion that "we don't need an agent here" is also a result.

## What it costs

The price of an agent is not just development. To compare options fairly, count everything you will need over a year:

- **language model usage** — billed by the volume of text processed, growing with the number of conversations;
- **integrations** — connections to messengers, telephony, CRM, accounting;
- **the knowledge base** — written once and kept up to date with every change in prices and terms;
- **quality review** — the time of the person who reads conversations and fixes errors;
- **the platform or hosting**, if the agent does not run inside a ready-made service.

The most underestimated item is usually knowledge base maintenance. An agent nobody updates starts giving wrong answers within a few months.

## When you don't need an agent

Sometimes the right answer is not to launch one at all:

- there are few enquiries and a rep comfortably answers everyone within the hour;
- every sale is unique and needs an expert conversation from the start;
- the sales process is not described, so nobody knows which answers are correct;
- CRM data is kept irregularly, so the agent has nothing to rely on.

In these cases the money is better spent on describing the process, the CRM and rep response speed. An agent amplifies a working process; it does not replace a missing one.

## How to launch

1. **Choose one task** with a clear metric and enough repetitive enquiries.
2. **Build the knowledge base:** common questions with correct answers, prices, terms, hand-over rules.
3. **Build a prototype** and test it on real, already-closed conversations: how would the agent have answered them?
4. **Connect it to the channel and the CRM** and launch it on part of the traffic.
5. **Read the conversations, extend the knowledge base, widen the coverage** as the answers become consistently correct.

## From our practice

In education projects such as [OLEG BARYSHEVSKY](/en/cases/oleg-baryshevsky/) and [TSEPUKH_P](/en/cases/tsepukh/), chatbots supported course launches: answering standard questions, guiding people step by step and helping not to lose them between sign-up and payment. The logic is the same as in selling services: the bot takes the stream of repetitive questions, and people focus on where their expertise is needed.

## What's next

Once it is clear which task the agent should handle, the next step is a prototype on your data. We build [AI tools and agents](/en/services/systems/ai/) for specific scenarios and connect them to the CRM, telephony and messengers as part of [digitalisation and automation](/en/services/systems/automation/) — so the result shows up in sales numbers, not just in the number of conversations.
