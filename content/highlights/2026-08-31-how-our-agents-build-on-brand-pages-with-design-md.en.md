---
externalId: "how-our-agents-build-on-brand-pages-with-design-md"
kind: "article"
title: "How Vercel's agents build on-brand pages with design.md"
description: "Vercel explains how design.md combines design judgment, a public stylesheet, human review, and deterministic checks in an evolving evaluation loop for on-brand agent-generated pages."
date: 2026-08-31
sourceUrl: "https://vercel.com/blog/how-our-agents-build-on-brand-pages-with-design-md"
tags: ["Vercel", "design.md", "Design System", "AI Agent", "Evals", "Codex"]
featured: true
draft: false
---

[Original Vercel article](https://vercel.com/blog/how-our-agents-build-on-brand-pages-with-design-md)

Vercel uses coding agents to design and build reports, proposals, microsites, and other pages. Those artifacts still need to carry the typography, color, composition, and judgment found in the company's shipped work. Design Engineer John Phamous explains how the team extended its repository-based `product-design` skill into a public [`design.md`](https://vercel.com/design.md) that any agent can load, then built an evaluation loop to make the guidance reliable.

## 1. From a repository skill to a public design file

Vercel's earlier [`product-design`](https://vercel.com/blog/teaching-agents-product-design-at-vercel) skill lives beside the code it governs. An agent can inspect the design system, product guidance, real components, and shipped examples in the same repository. That works well for product development, while reports, renewal proposals, and one-off pages are often created in tools with no access to those files.

The public version therefore needed to meet two requirements:

- one URL that an agent could load from any environment;
- guidance spanning brand, layout, copywriting, the design system, responsiveness, and information architecture.

The first attempt collapsed the `product-design` references into a single public prompt. It described the visual language, yet different models interpreted the same description in very different ways. Subjective instructions such as "keep the layout clean" lacked observable criteria. Outside the repository, the models also lost the components and shipped examples that made the original guidance concrete.

The team set that port aside, rewrote the file from scratch, and tested every change against seven repeatable scenarios drawn from real work:

- a usage and performance report;
- a renewal proposal;
- a benchmark report;
- an interactive planning page;
- a build-versus-buy brief;
- a security governance brief;
- a presentation deck.

Each prompt stayed frozen with its mock data and render settings, making changes in the output attributable to `design.md`.

## 2. The first matched comparison

The initial experiment ran the renewal proposal twice with the same model, prompt, data, and viewport. One run loaded `design.md`; the other did not. Both were first attempts with no rerolls.

![The renewal proposal before and after loading design.md](https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/4kNmeRfQq0MgbJMdN7XCIQ/6e701e79b08e90bd0312f06884f890db/Frame_1400003192__5_.png "[wide] Same prompt, data, model, and viewport. Each version was generated once with no rerolls.")

The baseline looked like a generic SaaS dashboard. With `design.md`, the page led with the renewal recommendation, gathered commercial evidence into one grid, placed comparable values on a common scale, and kept supporting detail available without competing with the summary. The file had changed structure and hierarchy as well as styling, providing a clear enough signal for the team to continue adding guidance one tested rule at a time.

## 3. The three layers of the system

Repeated testing turned the project into a three-part system:

- [`design.md`](https://vercel.com/design.md) provides judgment about the reader's job, the structure of evidence, and the choice of composition;
- a public [`vercel-brand.css`](https://vercel.com/geist/vercel-brand.css) supplies a bounded, documented vocabulary of classes and design tokens;
- an evaluation loop converts repeated human feedback into better guidance and deterministic checks.

The file covers quick executive reading and detailed audit, concrete claims and honest caveats, hierarchy across evidence and prose, and the publishing rules for Vercel's wordmark and triangle logo. It also names recurring generated-design patterns, giving agents a vocabulary for recognizing and avoiding them.

![An excerpt naming recurring generated-design patterns](https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/5ddvYwvA6TmgyMRnBnTk82/1319c6b7f77f1f6c04efd6d8366cc7b0/Frame_1400003199.png "An excerpt from design.md. Explicit names help agents recognize and avoid recurring generated-design patterns.")

The stylesheet takes repeatable typography, spacing, and layout decisions away from the model. It packages primitives for headings, tables, stat strips, and charts, while `design.md` documents the available class names and tokens. The browser loads the CSS at render time, so the stylesheet's source does not consume model context.

The evaluation loop connects those two layers. Deterministic checks catch mechanical failures such as a table ignoring its available width. People assess hierarchy, composition, and whether a page helps its reader do the intended job.

## 4. How guidance earned a place in the file

The team generated pages from fixed scenarios, reviewed the results, encoded accepted corrections, and reran the scenarios to see whether each change held. A change that helps one artifact can damage another, so every rule has to justify itself through output.

### Scenarios and rounds

A scenario freezes a prompt together with mock inputs and render settings. A full round regenerates all seven scenarios on both Claude Opus 4.8 and Codex with GPT-5.5. For a narrow change that only affects tables, the team can rerun the relevant scenarios or a single model and keep the iteration loop short.

The seven page types share Vercel typography, color, and spacing without collapsing into one template. The planning page makes its controls prominent because readers open it to change numbers. The renewal proposal prioritizes the recommendation and commercial comparison because its reader is making a renewal decision.

![Different scenarios share a visual language while using different structures](https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/7H9KorueiLZ2DiimG5FMiw/bcda164e35375394bd55ec5a1b5e942f/Frame_1400003196__1_.png "[wide] Different scenarios share Vercel's visual language while organizing themselves around different reader tasks.")

### Reviewing every run

Vercel built a local app that displays full-page renders and supports blind A/B comparisons. It grew into an evaluation harness that records every run's prompt, inputs, model configuration, `design.md` version, screenshots, and reviewer feedback. Each correction remains attached to the exact output that prompted it.

<video controls playsinline preload="metadata" src="https://assets.vercel.com/video/upload/contentful/video/e5382hct74si/33d9KrOHYeH4jVpGfRvN4w/1e533a11ac2bee8d1d971da80f42ac8c/johnphamous_2026-08-14_at_12.20.06_Aside.mp4"></video>

_The local review harness displays full-page renders and runs blind A/B comparisons._

### Turning corrections into rules and checks

Feedback lands in the narrowest layer that can enforce it consistently. Judgment belongs in `design.md`, reusable mechanics belong in the stylesheet, and mechanically detectable failures become checks in code. Harness defects stay in the harness. A failure isolated to one model remains out of the shared rules until it repeats.

One early renewal proposal squeezed a commercial-terms table into the prose column even though the page had room for twice the width. Previous runs showed the same failure repeatedly, so the team added both a `design.md` rule telling evidence tables to use the available width and a deterministic layout check.

![The commercial terms table before and after the rule was added](https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/3mNy5CuYb5RzJo50MID1eo/95404ecb3be7a04eba93c2edeb155a99/Frame_1400003195__2_.png "[wide] The commercial terms table before and after the full-width feedback was incorporated into design.md.")

Affected scenarios were rerun after the correction. At milestones, blind A/B rounds compared the latest file with an older version to determine whether a change should be kept, revised, or reverted.

## 5. Measuring the effect

Building the file took more than 200 runs across full rounds, targeted checks, dry runs, and dead ends. Human reviewers were joined by a model judge that critiqued each round and fed the next iteration.

![Generated pages improving across evaluation rounds](https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/6gM4GTG3rpgP4QgFIL9dt/7b0c3e2932e501f9a5a2915985524abe/Frame_1400003202.png "[wide] Every third generation is shown; feedback from each round informed the next.")

For the final test, Vercel selected three desktop scenarios and had Codex with GPT-5.5 generate each one once with `design.md` and once without it. Deterministic checks found 39 known failures across the three pages that loaded the file and 91 across the three pages that did not, a reduction of 57% in this test.

The result has important limits. The checks only recognize failures that the team has already observed and encoded, so they do not measure overall design quality. Six pages are also too few for a broad reliability claim, and every page still contained at least one issue serious enough to block shipping. The useful signal is narrower: once a failure is named and encoded, it tends to recur less often.

## 6. Keeping design.md current through real use

Fixed scenarios helped ship the file; production use keeps it relevant. Inside Slack, Vercel uses `@design-agent`, built on [eve](https://eve.dev/), for design critiques, copy alternatives, icon suggestions, and report sites generated from pasted data. For page requests, it loads the current `design.md`, builds against the published stylesheet, and posts a full-page screenshot and deployment URL back to the thread.

Those threads capture real requests, outputs, and steering. Each week, automation groups repeated feedback from Slack, GitHub reviews, and Figma. A person reviews every proposed change and decides whether it belongs in `@design-agent`, the `product-design` skill, `design.md`, the stylesheet, or a deterministic check. Requests for unfamiliar page types become new evaluation scenarios.

The team tracks how often each complaint appears in comparable work. After a fix is encoded, that count should fall. If it does not, the rule may be unclear, loaded at the wrong time, unsupported by the stylesheet, or better suited to a deterministic check.

## 7. Building your own loop

Vercel proposes a practical sequence that begins with one recurring artifact and one manual comparison:

1. **Pick one repeated artifact.** Start with a real proposal, performance report, benchmark, or microsite. Define a rubric covering retained facts, the reader's decision, and the correction that repeatedly requires manual work.
2. **Save the baseline first.** Generate once before adding design context, and preserve the prompt, inputs, configuration, screenshot, and first output.
3. **Start with the last ten corrections.** Rewrite vague feedback such as "make the table feel less cramped" as an observable rule such as "let evidence tables use the full available width." Organize a first `design.md` around scope, reader and task, observable decisions, and available primitives.
4. **Constrain repeatable mechanics.** When outputs keep inventing typography, spacing, or layout, publish a stylesheet and document the classes and tokens the agent may use. Keep judgment in prose and place repeatable mechanics in CSS or checks.
5. **Run a matched comparison.** Regenerate with the same input, model, and viewport, shuffle the result with the baseline, and score both blindly. One trial exposes large failures; multiple independent first attempts are needed for reliability. Vercel points readers to [Anthropic's guide to agent evaluations](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) for that next step.
6. **Encode the correction.** Record what users repeat, which rule is missing or ambiguous, whether the stylesheet can express the fix, whether code can check it, and whether the change generalizes. Update the guidance and use the next comparison to measure the first attempt again.

Once the manual loop pays off, teams can add inclusion and exclusion scenarios, a hidden holdout set, model and guidance versioning, automated checks, and multiple blind reviewers. Final changes remain human-reviewed, and the recurring metric is whether the same complaints become less common.

Vercel loads its public [`design.md`](https://vercel.com/design.md) into [v0](https://v0.app/), Codex, and Claude every day. The company also published an [eve design agent template](https://github.com/vercel-labs/eve-design-template) for teams that want a similar Slack-based design agent. The original article was written by John Phamous with Kevin Corbett as a contributor.
