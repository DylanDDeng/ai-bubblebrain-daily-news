---
externalId: "warp-self-improving-agents-claude"
kind: "article"
title: "How Warp builds self-improving agents on Claude"
description: "Warp turns one-off human feedback into skill files: an inner base skill does the work, an outer improver skill digests feedback on a schedule and opens PRs, so agent output keeps getting sharper with use."
date: 2026-08-27
sourceUrl: "https://www.anthropic.com/webinars/how-warp-builds-self-improving-agents-on-claude"
tags: ["Agent", "Skills", "Claude", "Code Review", "Feedback Loops"]
featured: false
draft: false
---

[Original article: How Warp builds self-improving agents on Claude](https://www.anthropic.com/webinars/how-warp-builds-self-improving-agents-on-claude)

*From Anthropic's startup series. In this article, we share how Warp turned stateless user feedback into a self-improvement loop for its agents.*

<table><thead><tr><th colspan="2">The quick pitch</th></tr></thead><tbody><tr><td>Name</td><td>Warp</td></tr><tr><td>Founded</td><td>2020</td></tr><tr><td>Founders</td><td>Zach Lloyd (CEO)</td></tr><tr><td>Stack</td><td>Rust, Golang, GitHub Actions, internal agent orchestration platform (Oz), Claude Platform</td></tr><tr><td>Growth</td><td>$73M raised. 800K monthly developers build on Warp. 56% of the Fortune 500 uses Warp. 10M Claude Code sessions run inside Warp to date, 400K+ per week. 40M total Warp Agent conversations.</td></tr></tbody></table>

Agents need to handle recurring tasks reliably and effectively. A first-pass prompt that gets 80% of the task correct can create a noisy and annoying experience for the user. Warp learned this the hard way, and used this to inform its product strategy, creating an improved experience for nearly 1M developers worldwide.

Warp, the AI-powered terminal and agentic development environment, builds on the Claude Platform. The team ran into this “noisy experience” problem with their internal code review agent. Engineers complained that their agent made unhelpful comments and produced low-quality output.

The team initially tried stopgap solutions, like manually rewriting the prompt based on observed code review failures. This made output more usable but didn’t scale. Improving context files like AGENTS.md also helped, but was far from a complete fix.

Ultimately, they realized, the real issue was that feedback to an agent, no matter what its purpose, typically disappears when the session ends, removing critical context from the agentic loop. Their solution: an [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)-based framework to create self-improving agents where feedback compounds over time to continually refine and enhance agent output.

Read on to learn how they built it with skills on top of the Claude Platform.

## Agent self-improvement loops built on skills

The central technique is a self-improvement loop using [**skills**](https://support.claude.com/en/articles/12512176-what-are-skills), which are file based encodings of knowledge that keep instructions out of the raw prompt. Warp evolved a self-improving agent architecture consisting of two skills, with human feedback in between.

![Warp's self-improvement loop](https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6a8f1a9a1b33f40618a9d59a_selfimprove-loop.jpg)

The **inner/base skill** holds the functional domain knowledge and instructions. For example, when a PR is opened, Warp’s code agent executes using that base skill and context to produce its review.

**Human feedback** on agent output is a critical component for the self-improvement loop. For code review this could be something as simple as a thumbs up, but the more explicit the better.

“A human could affirm, ‘this was a good, useful comment’,” Warp founder Zach Lloyd explains, “But the human could also give detailed reasons why a code review wasn't good. Specifics like ‘you suggested renaming this variable, but our code base convention is this type of global variable uses this particular naming context’ tell the agent how to do it right next time.”

The **outer/improver skill** functions as an observer agent that runs on a schedule rather than per-task. It pulls the accumulated human feedback, compares what the agent suggested against how humans responded, and proposes a small, focused edit to the base skill.

Because skills are plain files, agents are extremely good at updating them. These updates, which are reviewable, approvable, and mergeable, can flow through a normal PR/code-review workflow; once merged, the next run of the inner skill inherits the improvement.

Warp now runs this pattern across its entire open-source repo, with separate spec-writing, review, and triage agents, each carrying their own self-improvement loop.

“File-based skills are a way of encoding knowledge for agents without putting that knowledge directly in the prompt, as something the agent can simply look up in the course of doing its job,” says Zach. “The framework is really simple actually: there's the base domain-specific skill and then there's the improver skill that refines that domain-specific skill. This simplicity is the beauty of this approach.”

## How to write self-improving skills for agents

Here are some of the Warp team’s tried and true tips for writing self-improving skills for agentic loops:

- **Write principles, not rules.** "Construct the skill as though you're instructing a smart person, not like you're programming a computer,” Zach says. “Including direction in the skill like ’Look for repeated code’ provides better direction than exhaustive variable naming rules.”
- **Explain the why.** Providing the rationale behind the rule lets the agent reason about the problem instead of following rigid instructions, again allowing for better generalization.
- **Make feedback effortless to give.** Capture it where people already work, like by commenting directly on a PR or issue. Also, make this happen automatically, with no extra submission step. “Low friction is what keeps signal flowing,” Zach notes. “If you make it too hard you're not going to get the feedback and you're not going to be able to improve the skill."
- **Keep skills small and use progressive disclosure.** [A good skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) file isn't large; it references resource files and scripts rather than dumping everything into context at once.
- **Feedback quality > volume, but volume helps.** A small amount of detailed, domain-specific feedback from a senior engineer can be worth more than lots of cursory feedback because binary thumbs up/down doesn't say *why*. “You can get really good signal even from a relatively small sample size if it's very detailed feedback from a person around domain specific knowledge that the agent otherwise would have no way of getting,” Zach continues. “That said, the bigger the corpus of quality signal, the better. At Warp we're using a loop to manage our whole open source repo. We have hundreds of people contributing and we're doing thousands of code reviews.”
- **Put extra effort into the improver skill**. Putting extra effort into writing the improver skill (the observer agent) pays off beyond the immediate agent loop, because improver skills are very reusable across different use cases. “Outside of the domain specific knowledge component, this is a fairly reusable mechanism—the improver skill for a code review agent is not that different from the improver skill for any other agent.”

## The loop in action: Warp’s issue triage agent

[Warp’s issue triage agent](https://github.com/warpdotdev/warp-agents-demo-github-issue-triage) demonstrates the self-improving agent skills framework. The pattern is triggered whenever someone files a new GitHub issue: a GitHub Action fires an agent that analyzes the issue for complexity and feasibility, assigns labels, and suggests a direction for the fix. That triage agent runs off an inner skill file holding the domain knowledge about what each label means and how to research the codebase before acting.

On a sample issue, the first-stage inner skill did a solid job but missed one label, ready to spec, which signals that a contributor can start building product and technical specs against the issue. A maintainer on the Warp team caught the gap and left feedback directly on the issue, exactly where the work was happening. Critically, he explained both what he expected and why he expected it: actionable feedback easy for the agent to absorb later.

The outer improver skill runs in [Oz, Warp's agent orchestration platform](https://docs.warp.dev/), as a scheduled “update triage” agent. The agent authenticated to GitHub, ran a Python script bundled with the skill to pull recent issues carrying feedback, summarized them into a JSON file, and read that back into context. The bundled script is itself a best practice; skills can reference resource files instead of writing fresh code on every run.

From there, the agent identified the concrete feedback signals in the maintainer comments and proposed the smallest edit that captured them. It opened a PR editing the inner skill to apply the "ready to spec" label when an issue describes a real problem, even though the exact UI or UX shape is not yet defined.

Because the whole update is a skill file, it moves through the normal code-review workflow. The PR arrived with a description explaining which signals prompted the change and what it altered. A human reviews, approves, and merges, and the next run of the triage skill inherits the new knowledge. That final human step closes the loop and keeps a person in control of what actually changes.

This is the same mechanism Warp now runs at scale across its open-source repo, where spec-writing agents, review agents, and triage agents each carry their own self-improvement loop.

Any agent, no matter what its task, gets better over time if you build one of these loops into it from the start to capture human feedback signals, turn them into skill updates, and expand agents from one-off helpers into capable systems that compound across your org.

<table><thead><tr><th colspan="2">Best practices from the Warp team</th></tr></thead><tbody><tr><td>Are you conflating skills with memory?</td><td>Skills are procedural and stable—"how to do X," run-agnostic, changed deliberately. Memory is auto-written by the agent at inference time and never stops changing.</td></tr><tr><td>Do you need one improver loop, or one per agent?</td><td>Meet in the middle: a templated base loop captures the overlap across your agents, with domain-specific weights layered on. A handful of improvers can each own one; a hundred should share.</td></tr><tr><td>What happens when the feedback is wrong?</td><td>Assume it will be. Don't let the agent accept feedback blindly — give it context to sanity-check, filter whose input counts, and keep a human in the loop at either the filtering or final-review stage.</td></tr><tr><td>Is your domain verifiable?</td><td>Build the verification harness first, then let the agent tune against it: generate a reference corpus, compare output to reference, fix, repeat.</td></tr><tr><td>And if it isn't domain verifiable?</td><td>Lean on deterministic evals against golden outputs wherever they exist. Where you must use human feedback, restrict it to domain experts — don't open the floodgates.</td></tr><tr><td>How do you know the whole system is improving?</td><td>Track the global metrics humans already eyeball—time to merge, contributor count, cost—and feed them back into the improver agents. Go crawl-walk-run on deployment.</td></tr></tbody></table>

[*View the full webinar*](https://www.anthropic.com/webinars/how-warp-builds-self-improving-agents-on-claude) *for a live demo and deeper discussion of how Warp uses Claude to build agents that learn from team feedback and improve themselves over time.*

*Start building with the* [*Claude Platform*](https://platform.claude.com/) *today.*
