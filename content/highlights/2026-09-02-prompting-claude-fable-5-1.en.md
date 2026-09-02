---
externalId: "prompting-claude-fable-5-1"
kind: "article"
title: "Prompting Claude Fable 5.1: The Official Practical Guide"
description: "Anthropic's guidance for Claude Fable 5.1: choosing effort, keeping users informed, batching tools, preserving append-only history, finishing tasks, controlling scope, coordinating subagents, and improving vision workflows."
date: 2026-09-02
sourceUrl: "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1"
tags: ["Claude", "Fable 5.1", "Prompt Engineering", "Agent", "Anthropic"]
featured: true
draft: false
---

[Anthropic documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1) · [中文版](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1)

Existing Claude Fable 5 prompts generally work well on Claude Fable 5.1 without modification. The useful part of this guide is not a demand to rewrite every prompt. It is a concrete behavior-calibration checklist: when to change `effort`, why users may see no progress during long tool runs, how to avoid serial tool use, and how to keep an agent from stopping early or quietly widening the task.

For coding, research, or other long-running tool-using agents, it is a strong pre-launch checklist.

## 1. Evaluate every effort level

Start at the default `high`, then test `low`, `medium`, `xhigh`, and `max` on your own evaluations. `effort` is the main control for the tradeoff among intelligence, latency, and cost, and the same label does not represent the same amount of thinking across models.

- `medium` can be roughly comparable to Fable 5 at lower cost;
- `low` should be compared with smaller models running at higher effort;
- `xhigh` and `max` show the largest gains but may take longer and use more tokens on long deliverables;
- at `low`, the model is less likely to invoke search and retrieval.

The goal is not to choose the highest setting by default. It is to find the lowest setting that remains reliable for the task.

## 2. Ask for user-facing progress updates

During long tool-running turns, Fable 5.1 writes fewer user-facing updates by default than Fable 5. Users may see several minutes of silence, and a final response may cover only the last step.

First confirm that the client requests and renders progress. Short explanations between tool calls arrive as progress-update `thinking` blocks. With the default `thinking.display: "omitted"`, those blocks are empty. The beta header `thinking-display-updates-2026-08-18` allows `display: "updates"` or `"summarized"`.

Remove old instructions such as “save all findings for the final answer” if they suppress narration. When more visible feedback is useful, add:

```text
Before you start, say in a line what you're about to do; brief updates while you work help the user follow along. Close with a short recap that stands on its own — what you found, what you did, and what's next — so a reader who only sees the last message has the full picture.
```

If your product collapses tool output, tell the model that the user cannot see the complete command result and that anything the user needs must appear in the reply.

## 3. Batch independent tool calls

Fable 5.1 generally issues parallel calls when a request explicitly names several items. In coding agents, bash-plus-editor harnesses, and computer-use loops, however, it may make only one call per round when the independent next steps are implied rather than stated.

Append this reminder to the current request:

```text
First privately list what you need next; then request every item that doesn't depend on another's result in this one response.
```

After each tool result, append a fresh turn-scoped system message and leave earlier messages unchanged. The beta `clear_at: "next_user_message"` behavior requires `mid-conversation-system-clear-at-2026-08-21`. Deleting or rewriting old reminders restarts the prompt cache and invalidates later thinking blocks.

## 4. Keep conversation history append-only

Append each assistant turn exactly as returned by the API, including thinking blocks. Do not edit older system prompts, tool lists, or messages between requests.

For accounts created on or after August 31, 2026, a Fable 5.1 thinking block is valid only in the exact conversation that produced it. Replaying it after the prefix changes returns `400`, or drops it when the beta `thinking.block_binding.prefix_mismatch_behavior: "drop_block"` is enabled.

Three operational rules follow:

1. Send per-turn reminders as turn-scoped system messages rather than injecting and later removing them.
2. Change instructions or tools with a mid-conversation system message rather than rewriting `system` or `tools`.
3. Prefer server-side Compaction or Context Editing. If client-side compaction is necessary, replace the complete history with one summary plus the new user turn; do not carry old thinking blocks forward.

Run once with `prefix_mismatch_behavior: "drop_block"` and log `input_transformations` to discover hidden prefix edits in your harness.

## 5. Reduce writing density

Fable 5.1 uses fewer stock phrases and unexplained terms, but its sentences can be longer and its paragraphs denser. Anthropic recommends directly naming the anti-pattern—mannered prose—and preferring literal language over decorative metaphor.

The short version often works:

```text
Please remove all mannered prose.
```

The aim is not to remove all style. It is to keep accuracy and reader effort ahead of flourish.

## 6. Let formatting serve the content

Older models often overused bold text and bullets, so many prompts retain strict anti-formatting rules. Fable 5.1 leans the other way: it is less likely to use headings, lists, bold, or quotations.

Allow structure when multifaceted material benefits from it. Reserve plain prose for explicit minimal-format requests and conversational, personal, or emotional exchanges. A global ban on formatting is no longer a good default.

## 7. Paraphrase retrieved sources and mark short quotations

When summarizing documents, Fable 5.1 is more likely than Fable 5 to reproduce source passages without marking them as quotations. Anthropic recommends a complete correct example in the system prompt containing:

- the user's request;
- search or retrieval output;
- a response organized around comparison and synthesis rather than article-by-article retelling;
- a sentence explaining why the response is correct.

The example should use the model's own indirect speech for nearly all claims and preserve only a small amount of clearly quoted source language.

## 8. Tell the model to finish the whole task

Fable 5.1 can execute very long tasks, but in complex asynchronous work it can still describe the next action and stop, or ask permission for a step the user already authorized. The system prompt should say that reversible actions implied by the original request should proceed, while destructive actions and genuine scope changes require a decision.

```text
You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking 'Want me to…?' or 'Shall I…?' will block the work. For reversible actions that follow from the original request, proceed without asking. Stop only for destructive actions or genuine scope changes the user must decide.
```

Keep one important exception: when the user is describing a problem, asking a question, or thinking aloud, the deliverable is the assessment. Do not silently implement a fix.

Before ending a turn, check whether the last paragraph is merely a plan, question, next-step list, or promise. If the work does not require a new user decision, continue with tools and complete it.

## 9. Define the user request as the delivery scope

The user's request—or an approved plan—is the scope and therefore the deliverable. Do not quietly narrow, widen, or replace it.

- Make routine judgment calls on ordinary ambiguity.
- Complete everything that does not depend on an unanswered question.
- If one part is blocked, finish the rest and name the omission precisely.
- Report unrelated bugs, performance concerns, or documentation gaps as follow-ups rather than folding them into the change.
- A step already decided upon is something to execute, not announce at the end.

These rules address two common failures together: stopping too early and enthusiastically changing things the user never requested.

## 10. Specify what compaction summaries must preserve

For client-side compaction, explicitly require the summary to retain:

1. difficulties encountered and how they were handled;
2. options raised, tried, or set aside, and why;
3. requests, decisions, rejected paths, preferences, constraints, and boundaries;
4. the exact current state of the work;
5. anything still open, unresolved, or promised;
6. hard-to-reconstruct names, numbers, dates, wording, links, and references.

Keep user-provided requirements close to their original wording. The model's own explanations and reasoning can be compressed much more aggressively. Server-side Compaction already follows a similar principle.

## 11. Limit changes and tests to the requested task

On open-ended feature work, Fable 5.1 may fix nearby code, extend unrequested behavior, or commit more tests than the task needs. Tell it explicitly:

- do not fix pre-existing issues unless the requested behavior depends on them;
- implement the reading most directly supported by the wording and surrounding code, then state the assumption;
- do not commit scratch validation scripts;
- keep committed tests proportional and add them when the task asks for tests or the repository normally keeps tests for this kind of change;
- scope control applies only to extras—the requested behavior must still be implemented completely.

## 12. Trigger search at low effort

At `low` effort, Fable 5.1 is more likely to answer from memory and less likely to use search or retrieval. Raise effort only for affected turns, or tell the model that recognizing a name is not the same as knowing its current state.

When a query centers on an unfamiliar name—or a fast-moving area such as AI models and developer tools—search before answering and include the name exactly as the user wrote it in at least one query. Partial familiarity is often what makes stale answers sound authoritative.

## 13. Reduce safeguard false positives

Fable 5.1's safety classifiers generate fewer false positives than Fable 5 did at launch, and finding vulnerabilities in source code is allowed. Three cases can still increase `stop_reason: "refusal"` responses:

- **Compile-check phrasing:** ask whether a program has bugs instead of asking whether it compiles without errors.
- **Less-known programming languages:** provide context and access to the language documentation.
- **Base64 in tool output:** remove Base64-encoded data from model context when possible.

## 14. Prefer targeted edits

Fable 5.1 is more likely than Fable 5 to rewrite an entire text file for a small change. The result is often correct, but it consumes more output tokens and time. Add:

```text
The number of tokens used to edit files is best minimized, all else being equal. Therefore, when it will not affect the end result, try to surgically edit a file rather than rewrite the entire thing.
```

Prefer localized edits unless the file is short or most of it genuinely needs to change.

## 15. Leave room for long outputs at xhigh and max

At `xhigh`, and especially `max`, Fable 5.1 may draft a long deliverable in thinking and then write it again in the answer. That increases latency and risks hitting `max_tokens`.

Start long-form requests at `high` and move higher only when evaluations demonstrate a quality gain. At higher effort:

- size `max_tokens` for both thinking and the answer;
- tell the model not to create the whole deliverable once in reasoning and again in the response;
- use reasoning to understand the task, verify inputs, settle structure, and make difficult decisions, then use output tokens for the actual artifact.

## 16. Let the lead agent work while subagents run

If a coding agent can delegate, do not force the lead to wait immediately after starting a subagent. A better harness design is:

1. make the spawn tool return immediately;
2. pass each completed result back to the lead in a later `user` message;
3. offer a separate wait tool for the point where the result is genuinely needed.

The lead may still choose to wait, but on tasks with independent work this design lowers average completion time at similar quality, token usage, and cost.

## 17. Give vision workflows crop and zoom tools

Fable 5.1 has stronger vision capabilities, but dense charts and complex images benefit from iterative analysis, cropping, enlargement, and visual verification.

The ideal setup gives the agent a container with raw images or video plus basic libraries such as PIL and OpenCV. If a container is too expensive, a single tool that returns a selected region cropped and enlarged captures much of the gain. Vision quality depends not only on the model, but also on whether the harness lets it focus on the right detail.

## Conclusion: treat this as an agent-product checklist

The guide's value is not a universal system prompt. It is four design principles:

1. **Choose effort through evaluations, not by reflexively using the highest setting.**
2. **Make long work visible and require the agent to complete steps it has already committed to.**
3. **Treat conversation history as an append-only log so thinking blocks and prompt caching remain valid.**
4. **Make scope, testing, tool parallelism, and subagent scheduling part of the harness contract.**

Prompts can calibrate the model, but the product still has to receive progress blocks correctly, preserve history, deliver asynchronous results, and provide the right tools. That is why this document is more useful than a generic prompt collection: it describes the interface between the model and the agent runtime.
