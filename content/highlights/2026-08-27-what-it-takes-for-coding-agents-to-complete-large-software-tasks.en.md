---
externalId: "what-it-takes-for-coding-agents-to-complete-large-software-tasks"
kind: "article"
title: "What It Takes for Coding Agents to Complete Large Software Tasks"
description: "Factory's ProgramBench study shows why coding agents stop early on large software tasks, and how an independent executable standard of completion can push them toward behavioral parity."
date: 2026-08-27
sourceUrl: "https://x.com/droid_35719/status/2093068852917899336"
tags: ["Coding Agent", "Software Engineering", "ProgramBench", "Validation", "Multi-Agent", "Factory"]
featured: true
draft: false
---

[Original article on the Factory blog](https://factory.ai/news/what-it-takes-for-coding-agents-to-complete-large-software-tasks?utm_source=x&utm_medium=article&utm_content=header) · [Source post](https://x.com/droid_35719/status/2093068852917899336)

*By Factory｜Originally published on August 27, 2026*

![What it takes for coding agents to complete large software tasks](https://pbs.twimg.com/media/HQwTALrbwAAjgQp?format=jpg&name=large)

Held to a standard of completion they wrote themselves, agents rebuilt complex programs to near-parity.

Models have become very good at problems with compact, stable criteria for success. Much of the past year's progress in mathematics and constrained optimization falls into this category — [machine-checked proofs of long-open Erdős problems](https://openai.com/index/ten-advances-in-mathematics/), [gold-medal performance at the IMO](https://deepmind.google/blog/advanced-version-of-gemini-with-deep-think-officially-achieves-gold-medal-standard-at-the-international-mathematical-olympiad/), and [new bounds on decades-old combinatorial problems](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/). The search space can be enormous, but the result can ultimately be judged as a whole.

Large software tasks are different. A software specification can semantically cover the desired outcome without specifying what must be run, inspected, and compared before the work can be called complete. Requirements state what must be true. By themselves, they do not measure whether the work achieves it.

Without that measurement, an agent constructs one piecemeal as it works. It decomposes the task, validates each piece in the context that produced it, and eventually decides that it is finished. Every local judgment may be reasonable while parts of the whole remain unmeasured.

Humans currently close the loop by supervising the agent: holding the whole outcome and steering the agent back to it.

We wanted to know whether the model could close the loop on its own.

## gdal, from scratch

To test this, we compared single-agent and multi-role runs across 24 selected [ProgramBench](https://programbench.com/) tasks and three models. Take gdal. We asked Droid to rebuild it from scratch in two ways. In both runs, Droid could execute the reference program without limit, but could not access its source, tests, or the internet.

> **gdal** — C/C++ · ~2M lines upstream · ~600K reachable through the CLI

> gdal is the command-line tool of the [GDAL](https://gdal.org/) project, the workhorse of geospatial data processing, and carries decades of functionality behind dozens of subcommands. In development since 1998, GDAL sits beneath much of the world's mapping software — QGIS, ArcGIS, PostGIS — and reads more than two hundred raster and vector formats, from satellite imagery to navigation charts.

As a single agent, Droid implemented, checked its own work, and decided for itself when it was done. It wrote 17,000 lines of C++ and reproduced 36 percent of the program's behavior. The code was solid and the common paths worked, but most of the program was still missing. It did not run out of time or budget. It stopped because, by its own assessment, it was done.

We then arranged Droid into a system consisting of separate roles. Before any implementation, one role built an executable standard of completion — its own account of what the reimplementation must do and what evidence would prove it — and the implementation was then held to that standard. This run grew to 115,000 lines and reached 90 percent behavioral parity.

What the system run produced is [its own program](https://github.com/Factory-AI/pb-gdal-fable): it resembles the original in neither shape nor size — a fraction of GDAL's codebase, organized its own way.

This was not an outlier case. Across the 24 tasks, the same system took its 7-Zip recreation from 54 percent parity to 95 percent and its DuckDB recreation from 34 to 80 percent. Several recreations reached the upper 90s.

![Single-agent and system frontiers across 24 tasks](https://pbs.twimg.com/media/HQwTAYCbEAAb5X_?format=jpg&name=large)

One row per task. The ring is the single-agent frontier: the best any single agent has achieved on the task, every public leaderboard entry plus our own singles — every ring is dashed because on these 24 tasks our own singles hold all of them. The dot is the system frontier, colored by the model that holds it, and the number is what closing the loop added.

The underlying model did not change. But when held to its own standard of completion, it reproduced far more of each program's behavior.

## Why the same agent stops early

Coding agents usually validate their own work as they go. They implement a piece, write or run a few checks, inspect the output, and decide whether to continue. For a small change, this works well: the task, implementation, and evidence fit in one view.

Large tasks have to be decomposed into features, subsystems, and successive rounds of work. As the agent reaches each piece, it also decides what evidence would count and whether that evidence is sufficient. These checks inherit the scope of the work that produced them. They can establish everything the agent thought to build, but exclude features, interactions, or constraints it never represented.

An agent can therefore make steady, locally correct progress and stop with much of the outcome absent. The problem is not necessarily that it could not implement the rest. It never established a complete account of what remained.

## Define validation before the work

Establishing a whole outcome requires more than a list of requirements. The system needs an inventory of what must be established, procedures for establishing each part, and current evidence that those procedures pass against the artifact being shipped.

That standard should be derived from the requirements and relevant sources of truth before implementation narrows the task into individual work items. It need not remain frozen. Checks can be added, replaced, or refined as the system learns. But the standard of completion must not quietly collapse around whatever has already been built.

## Why this is rarely done by humans

Separating requirements from evidence is not new. Safety-critical projects use requirements traceability and independent verification and validation. Standards bodies publish conformance suites that many implementations must pass. Product teams write acceptance tests.

What is unusual is deriving and maintaining a comprehensive standard for each project. A conformance suite can spread its cost across many implementations; a product team bears that cost again for each application, rewrite, or migration. Most teams therefore validate incrementally and rely on review, product feedback, and the continuity of the people involved to preserve the whole.

Agents change both sides of this tradeoff. They can produce work faster than humans can inspect it, making informal supervision the bottleneck. But the same capacity can be applied to the standard itself: inventorying the outcome, constructing checks, and rerunning them as the artifact changes.

ProgramBench represents a demanding limit case: the reference program is available, but the model must discover both the behavior space and how to measure it.

## ProgramBench

ProgramBench is a cleanroom software-engineering benchmark. Each task provides a reference program, fixtures, and partial documentation. The reference is a black-box oracle: it may be run, but never read, decompiled, or traced.

The goal is to reproduce the observable behavior of the reference program from scratch. Each task is graded and scored against a hidden suite of behavioral checks.

Completeness of a black-box implementation is difficult to measure. Any single behavior is trivially verifiable by running the reference against the candidate, but the whole is not. The shipped documentation covers a slice of the interface; the rest of the program's behavior has to be discovered.

That leaves three questions:

1. Can a frontier model construct its own measure of completeness for a large, unknown program?
2. Can that measure remain useful through a long implementation?
3. Does answering to it produce a better artifact?

## Task selection

We selected 24 of the benchmark's hardest tasks, based on the current top leaderboard score.

![The 24 selected ProgramBench tasks](https://pbs.twimg.com/media/HQwTAjJacAAAT1v?format=jpg&name=large)

Every dot is one of ProgramBench's 200 tasks, placed at the best score any public leaderboard entry has achieved on it. The ink dots are the 24 selected tasks; hover any dot for its name.

The set was hand-picked, weighted toward low best-public scores. Some hard-end candidates — php-src, pueue, ditaa, quickjs, chroma, miller — were dropped during screening for persistent safety blocks, single-agent saturation, or a score gated by one undocumented environment variable.

## Experimental design

For each selected task and model panel, we ran one campaign in each of two conditions. The system condition added an independent measure of completion without replacing the implementer's ordinary development loop.

![Single-agent and system experimental conditions](https://pbs.twimg.com/media/HQwTAt4aMAA54IT?format=jpg&name=large)

Both conditions began from the same task scaffold and fixtures. Within each non-substituted model panel, the single agent and all three system roles used the same model at the same reasoning level. Both conditions could execute the reference program without limit, but neither could read, decompile, or trace it, inspect the benchmark tests, or access the internet. Six disclosed Fable cells used Opus after Fable was safety-blocked.

Once launched, each campaign ran without human intervention. The campaigns were not compute-matched; each continued until the single agent or system orchestrator decided to ship.

Each cell represents one campaign, not an average across repeated runs. After a campaign ended, its final candidate was graded once using the official pb-1.2.0 metric.

## How the system closed the loop

**The instrument**

Full behavioral parity is not directly measurable. A program can accept an effectively unbounded set of inputs, flags, file formats, combinations, and error conditions. Any practical validation strategy has to sample that space.

In our system, that sample is an instrument. Before implementation begins, a validator surveys the reference program and maps where its behavior lives. It then builds a weighted body of cases and the comparison rules needed to judge the candidate's output. We asked for the instrument only in outline. Everything inside it — which behaviors matter, how they are weighted, what counts as evidence — the validator decides.

Two cases from the instrument the validator built for gdal:

![Two gdal validation cases](https://pbs.twimg.com/media/HQwTA5Ma0AAbsXE?format=jpg&name=large)

Each case describes the invocation; the grading policy says how to judge the result:

![The grading policy for a gdal validation case](https://pbs.twimg.com/media/HQwTBC-a0AAIn9z?format=jpg&name=large)

The validator wrote hundreds of cases like these, and licensed exactly two relaxations across all of them — a masked heap address in debug traces, a date embedded in a file header — each with recorded evidence that the reference cannot produce stable bytes there.

**The outer loop**

The system consists of three roles: orchestrator, implementer, and validator. The orchestrator delegates to both the implementer, which builds the candidate program, and the validator, which measures it against its instrument.

The validator builds the instrument first. Once implementation starts, the loop goes:

1. The orchestrator chooses what should be measured.
2. The validator tests the current candidate and interprets the failures.
3. The orchestrator decides which findings are real and what work should happen next.
4. The implementer investigates the reference and advances the candidate.

When the instrument stops revealing meaningful differences between successive candidates, the orchestrator can ask the validator to expand a weak area or begin targeted differential testing against the reference.

![The orchestrator, implementer, and validator loop](https://pbs.twimg.com/media/HQwTBM1asAAqDvz?format=jpg&name=large)

Both roles are the same model at the same reasoning level, and both hold the reference program, so keeping the instrument on the measuring side costs no information — only a shortcut. The candidate and the findings cross the wall; the instrument does not. Grading happens once, outside the loop, and is the source of every score in this post.

**The wall**

In ProgramBench, the standard required an additional boundary because its cases were only a sample of a much larger behavior space.

The boundary holds in both directions. The validator can expand the instrument as it learns more about the reference, but cannot weaken or revise it to accommodate what the candidate happens to contain. And the implementer never authors it, runs it, or sees its cases or raw output: once a sparse sample becomes visible, it becomes the target, and passing it establishes those cases, not the space they were meant to represent.

The validator runs the instrument against the current candidate and groups failures by root cause. The orchestrator reviews those findings, rejects noise or invalid measurements, and turns the remaining problems into a directive at the level of missing features, subsystems, or behavior. The implementer receives the directive, investigates the reference independently, and decides how to change the candidate.

Here is part of a directive from the gdal run:

![A directive from the gdal run](https://pbs.twimg.com/media/HQwTBX-akAAv1bi?format=jpg&name=large)

The directive tells the implementer where the candidate is weak without giving away the sample.

## Results

We ran the experiment with three frontier models — Fable 5, Kimi K3, and GPT 5.6 Sol.

Every score here comes from the benchmark's hidden suite — a sample of the same behavior space that no role ever saw. The gains transferred from the instrument the system built to an independent measure.

![Results for Fable 5, Kimi K3, and GPT 5.6 Sol](https://pbs.twimg.com/media/HQwTBhxbEAA4AXf?format=jpg&name=large)

Each panel is one model, run twice on the same 24 tasks: on the left as a single agent, on the right as the full system. Every line is one task, placed at its official score from the benchmark's hidden suite. Lines that fall are drawn dashed. A handful of cells have no score at all — a test hung during evaluation, so grading never completed. These are placed at the foot of the panel. The rail on the left filters the tasks by difficulty, the best public score per task, on the same 0–100 scale.

The system runs were far longer and more expensive; for gdal, 14 times the credits and 13 times the wall time. But budget was not what separated the conditions. Every single-agent campaign ended because the agent decided to end it. Additional compute does not help an agent that will not spend it. What our approach changed was the judgment of completion; the compute followed from that judgment.

> Every task, every model, every receipt — scores, spend, timelines, and artifacts for all 144 cells are in the interactive explorer in the full post: [explore every run](https://factory.ai/news/what-it-takes-for-coding-agents-to-complete-large-software-tasks?utm_source=x&utm_medium=article#explorer).

## Method notes

- **Reasoning levels.** Fable ran at xhigh, Kimi at high, Sol at max, applied uniformly to the single agent and to all three roles in the system.
- **One run per cell.** Every number here is a single run. Nothing was repeated to average it, so no cell carries a variance estimate, and none of these figures should be read as a mean.
- **Headline runs.** The gdal, 7-Zip, and DuckDB numbers in the opening section are Fable 5 runs.
- **Scale.** GDAL upstream is roughly two million lines of C/C++ (1.9 million after removing bundled third-party libraries). The subset reachable through the gdal CLI as configured in the task — eleven drivers, no GEOS — is roughly 600 thousand. The recreation matched 90 percent of that surface's measured behavior in 115 thousand lines.
- **Opus substitutes.** Six cells in the Fable panel are Opus runs standing in for Fable ones that were safety-blocked, either in the single-agent or system run: bedtools2, gromacs, pandoc, samtools, sox and tree-sitter.
- **Coverage.** 141 of the 144 cells have been graded. The remaining three system runs — gdal and gromacs on Sol, samtools on Kimi — were interrupted and not rerun before publication; they carry no score.
- **Grading.** Every score is the official metric from the hidden suite, pinned at pb-1.2.0 and computed identically for single-agent and system artifacts.

## Conclusion

The single agent didn't lack skill. It lacked a standard of completion. An independent standard, authored by the same model, drove the implementation much closer to behavioral parity with the reference.

ProgramBench gave that standard a particular shape: an inventory and weighted sample recovered from a black-box reference.

Other tasks draw their standard from different sources. A product task may draw on user-approved flows and designs; a migration, on the system being replaced.

What generalizes to real software work is the need for an external, executable standard of completion — one derived from the outcome, before implementation narrows attention, and kept current until the work meets it.

Factory is building this structure into the next generation of Missions. [Contact Factory](https://factory.ai/contact) to join the waitlist.
