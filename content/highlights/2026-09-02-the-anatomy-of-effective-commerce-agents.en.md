---
externalId: "the-anatomy-of-effective-commerce-agents"
kind: "article"
title: "A Guide to the Anatomy of Effective Commerce Agents"
description: "Anthropic's production architecture for commerce agents: a single agent with skills and business tools, supported by latency, caching, memory, safety, evaluation, and organizational practices."
date: 2026-09-02
sourceUrl: "https://claude.com/blog/the-anatomy-of-effective-commerce-agents"
tags: ["Claude", "Commerce Agent", "Agent Architecture", "Prompt Caching", "Evals", "Anthropic"]
featured: true
draft: false
---

[Official Claude article](https://claude.com/blog/the-anatomy-of-effective-commerce-agents)

Over the past year, Anthropic has worked with teams in retail, marketplaces, travel, entertainment, and telecom to build commerce agents with Claude. These systems are already in production, where some enterprise customers have seen larger carts and more efficient seller operations. They also converge on a common design: Claude in a standard agent loop, equipped with skills, tools, and a strong evaluation suite.

The guide is written for engineers and engineering leaders building commerce or other consumer-facing agents. It focuses on decisions that determine whether such a system succeeds in production: keeping the architecture simple, completing work quickly, using caching to control cost, retaining memory across sessions, and enforcing financial and operational constraints in code.

## 1. One model owns the complete conversation

Anthropic defines a commerce agent as an agent that simplifies buying and selling across an online catalog. Consumer-facing agents search, compare, substitute, and assemble orders; they may also build itineraries, change mobile plans, or hold event seats. Merchant-facing agents answer sales questions, run promotions and campaigns, and manage inventory and pricing.

The recommended core is one model in a standard agent loop: it reasons about a goal, explores context, acts through tools, learns procedures from skills, asks clarifying questions, and observes results until the task is complete. The same agent retains the whole conversation, without an intent router in front or a domain-specific subagent behind every capability.

Commerce conversations frequently cross intents and turns while sharing a cart, staged changes, preferences, and conversation history. Repeated delegation loses state, consumes more tokens, and adds seconds of latency. Across multiple enterprise deployments, Anthropic found that one agent with skills consistently outperformed both a single prompt containing everything and a subagent-per-domain design, often with lower task-level cost and latency.

Subagents still have a role in narrow, self-contained work such as deep research that benefits from a dedicated context window. A separate purpose-built agent may also take over a regulated domain with its own compliance surface and interaction loop. The deciding concept is conversation ownership: narrow work can be delegated, while an entire domain experience can be handed off.

## 2. Split the system prompt and skills by frequency

How often an instruction is needed determines whether it belongs in the system prompt or a skill. Loading a skill costs a model turn, so guidance used on most turns belongs in the prompt and long-tail procedures belong in skills.

Anthropic suggests a starting threshold of one-third of traffic: instructions relevant to at least that share go in the system prompt. If the harness can predict a skill from a known signal such as the page where a user started, it can inject the skill before the first model call and avoid an extra loading turn. Safety and legal rules, brand constraints, and critical user facts such as allergies always remain in the system prompt.

In the reference implementation, the shopping agent's prompt contains grounding, cart and checkout semantics, presentation rules, and product search. Skills cover search discovery, purchase research, planning, customer care, and memory personalization. The merchant agent uses separate skills for performance insights, catalog operations, inventory, pricing and promotions, and marketing campaigns.

## 3. Tools should call existing business systems

Established commerce platforms already have search and ranking, carts, profile stores, inventory, promotions, campaigns, and sales analytics. These systems contain years of business logic and signals that the model does not see. Agent tools should call them, with a clear boundary between deterministic business logic and model judgment.

For example, `search_products` should return already-ranked products. The agent decides which results serve the user's goal, how many to show, and how to present them. Tool results consume context, so they should include only fields the model needs for reasoning. Error responses should also give the model an actionable next step, such as “Include a product ID when querying availability,” instead of returning a generic `403`.

## 4. Model interface components as tools

Commerce responses are often product carousels, itineraries, seat maps, or charts. Anthropic recommends defining each UI component as a typed tool such as `present_products`, `present_itinerary`, or `present_plan_comparison`. The server validates and enriches the call, emits an event, and lets the client render it.

Presentation calls then remain in the Messages API history in native format. Reloading an old conversation requires no custom-tag parser, and the agent can resolve references such as “the first hotel” or “the third one on the left” from the last presentation call. Tool arguments must reflect the rendered layout, using ordered rows and carousels instead of a flat list that the client later rearranges.

Top-level tool arguments are generally buffered for server validation, so component parts arrive in stages. Setting `eager_input_streaming: true` enables token-level input streaming while giving up the server-side schema guarantee. Anthropic reports that schema violations are very rare on Sonnet-class models and above, although production systems should still wrap the call in a retry.

## 5. Optimize total and perceived latency together

Task-completion latency is the sum, across model turns, of time to last token plus tool processing. That creates three levers: fewer turns, faster tools, and faster tokens. These levers can compete, so the useful target is their total.

- **Fewer turns:** preload likely page context, increase model intelligence, and let the model call independent tools in parallel. When production tasks average more than about five turns, a stronger model can often reduce total time through better planning.
- **Faster tools:** optimize the business endpoints behind each tool. The harness can also dispatch a tool as soon as its arguments finish streaming, overlapping execution with remaining model output. Anthropic has seen eager dispatch reduce multi-second gaps to a few hundred milliseconds; the Claude Agent SDK does it by default.
- **Lower perceived latency:** progressively render component parameters and show a short progress line derived from the tool arguments. A typical rendered commerce response contains 500–700 output tokens, which can otherwise mean five or more seconds of a spinner.

Outcome quality still has greater influence on retention, engagement, and cart size than marginal latency improvements in many agentic experiences. Speed work needs to preserve completion, relevance, and accuracy.

## 6. Let prompt caching carry the cost reduction

Cached input-token reads cost one-tenth as much as fresh input, while cache writes cost roughly 1.25 times as much. A cached prefix therefore pays for itself on its second use. The strongest commerce deployments Anthropic has seen reach 90–99% cache-hit rates, a range teams can target from the beginning. At around 100,000 tokens, cached reads are also about 1.5–2 times faster.

Caching is prefix-based. Arrange each request in three segments ordered by how frequently they change:

1. **Global:** the byte-identical system prompt and tool definitions, followed by a cache breakpoint;
2. **Session:** user context and conversation history, stable within one session;
3. **Volatile:** current time, current page, and other frequently changing data at the end.

A timestamp or current page near the top of the system prompt silently breaks the cache on every request. Skills should be loaded as tool results so their bodies enter the conversation prefix and become cacheable. Move the newest breakpoint to the end of each user turn so accumulated history, including long search results, is read from cache in later rounds.

## 7. Choose model and effort through evaluations

Model size and effort both trade intelligence against latency and cost. Teams should first choose quality metrics and a minimum acceptable score, plus p50, p99, and cost budgets. The full evaluation suite can then sweep every candidate model and effort level. Anthropic recommends beginning with Opus for analysis-heavy merchant agents and Sonnet for consumer agents where latency has more weight.

Prompts often need tuning for each model. Smaller models require instructions that larger models infer, while larger models may follow literally what smaller models had ignored. A more intelligent configuration can even win on p90 and p99 latency because difficult requests take fewer rounds.

Measure cost per completed task, including extra turns and failures, rather than cost per model call. When results are close and the economics work, the guide favors more intelligence to protect product quality and leave room for the next six months of growth.

## 8. Put long-term memory in business storage

Long-term memory has three parts: storage, writing, and reading. A flat Markdown profile can work at small scale, but most production commerce agents eventually use an existing database. Each fact can be a small typed record containing a key, short value, category, and source session.

Merchant memory should be keyed by person and read according to that operator's permissions, especially when merchant logins are shared. Memories can contain personal and regulated data, so teams must define acceptable fact types, let users view, correct, and delete data, set retention periods, and provide a per-deployment switch for regions where memory obligations cannot be taken on.

Memory writes should run asynchronously. A separate thread or process reads the conversation after each turn or every few turns, then creates, updates, or deletes facts without adding user-facing latency. This approach achieved 13% higher fact recall on Anthropic's internal commerce memory evaluation suite. The extractor reads user and assistant text only, never tool results, preventing a product description or review from becoming a user fact.

Reads can use three layers: a small fixed set always in context, request-relevant facts prefetched each turn, and everything else behind a lookup tool. All memory belongs in the Session segment after the Global cache breakpoint.

## 9. Enforce safety in the harness

Commerce failures can move money or create difficult-to-reverse business changes. The prompt introduces safe behavior; the harness enforces it in code across both consumer and merchant agents.

- **The model stages changes:** orders, payments, refunds, price changes, and campaign launches all end in an action controlled by the harness. On the consumer side, a real button places the order and the agent-facing backend has no charge method. Merchant write tools create server-issued staged-change IDs, and `apply_change` accepts only changes approved through a real surface.
- **Writes and renders accept server-issued IDs:** the harness tracks every ID returned in the current session. Carts, merchant tools, and presentation tools reject identifiers that were hallucinated, pasted by a user, or planted in a review.
- **Caps are enforced on resulting state:** quantity, discount, restock, and campaign-budget limits apply to the state after a write. Session writes are serialized so parallel calls cannot combine to exceed a cap.
- **Third-party data is sanitized:** listings, reviews, policies, seller messages, and stored memory are treated as untrusted input. A shared sanitizer removes control and bidirectional characters, fake fence markers, imitated conversation turns or tool calls, and excessive length. The prompt says that fenced data may be reported on but cannot authorize action.

Regulated fees and disclosures come from server-approved copy while the model chooses where they apply. Limits are rechecked against current policy when a staged change is applied, avoiding reliance on rules that may have changed since staging.

## 10. Evaluate snapshots of a nondeterministic system

The model API is stateless: output is a function of the system prompt, tools, and messages array. A team can construct any reachable conversation state, append the test message, run the agent, and grade the final state, rendered response, and last write arguments.

Snapshot evaluations are more stable than grading every step of the path. Simulated-user evaluations can discover coverage gaps and provide a general experience check, after which each valuable finding can become a deterministic snapshot case. Tests should include busy first turns, long histories, and contradictory information so the suite represents difficult conditions as well as clean starts.

The suite should cover core traffic, context-dependent requests, safety and brand behavior, interface output, and tasks spanning neighboring capabilities. Every positive case should have a negative counterpart: serve and refuse, act directly and ask first. Injection tests should distinguish user-authored directives from data-plane attacks hidden in product names, reviews, or web snippets returned by tools.

Anthropic recommends starting with 50–100 evaluation cases per user flow and writing them with subject-matter experts from Product, Legal, Merchant Operations, Customer Care, and Category Management. Production transcripts and real incidents are the best sources of new cases.

## 11. Let many teams maintain one agent

In large commerce organizations, search, checkout, pricing, marketing technology, customer care, and catalog platforms ship on different schedules. A change to one tool, skill, or prompt rule can affect other capabilities through the shared context window.

Each skill and tool should have one owner team. A platform team owns common prompt sections, while domain teams own their relevant sections. Changes ship with positive, negative, and neighboring-boundary cases. Pull-request CI runs high-traffic core cases, every safety case, and the cases for the changed capability and its neighbors. A shared-prompt change runs the full suite, which should also run nightly and before every release.

The agent is one deployment unit and belongs on the release calendar. Prompt and skill changes should reach a canary cohort first, every skill needs a kill switch that works without a deployment, and peak periods call for the same release freezes used by other production systems.

## 12. The architecture extends beyond chat

Most pieces of this design are independent of a specific model: tools call systems the business already runs, skills encode existing procedures, evaluations express product requirements as tests, and the harness enforces policy. When a stronger model arrives, a team can change configuration and run the evaluation sweep while the rest remains intact.

The same agent can operate through voice or proactively surface a fare drop. In the future, some storefront traffic will come from external agents shopping for users. Provenance, staging, and approval rules that constrain an internal agent also help a platform expose tools safely to those agents.

Anthropic has published the `anthropics/commerce-agents` reference implementation with consumer and merchant agents plus runnable examples for retail, travel, telecom, and entertainment ticketing. The article was written by Matthew Koen and Ali Shazal.
