---
externalId: "inside-the-harness-pi"
kind: "article"
title: "Inside the Harness: Four Months of Being Wrong About pi"
description: "Nick Nisi explains why treating pi as a faster Claude Code missed its real value: an extension surface that lets tooling move from outside the coding harness into the session itself."
date: 2026-08-10
sourceUrl: "https://nicknisi.com/posts/inside-the-harness/"
cover: "/media/highlights/inside-the-harness-pi/cover.jpg"
tags: ["pi", "Coding Agents", "Harnesses", "Extensions", "Developer Tools"]
featured: true
draft: false
---

[Original article: Inside the Harness: Four Months of Being Wrong About pi](https://nicknisi.com/posts/inside-the-harness/)

*By Nick Nisi*

On July 20th, a coworker asked this in our `#pi` Slack channel:

> Why did @nicknisi say he no longer thinks pi is a good idea before I get any deeper into it?

Zack had started building on pi and had just heard me say it wasn’t worth it. Fair question. He wanted the reasoning.

My entire reply was: “Love pi though! :homer-disappear:”

I dodged it.

Two weeks later I’d run 188 pi sessions in ten days and 17 Claude Code sessions. Zack, here’s the actual answer.

## The city I’d already built

I live in the terminal. tmux, Neovim, `rg` piped into `fzf`, a statusline I’ve tuned past the point of anyone else being able to read it.

By this spring I’d built an entire city around Claude Code. [case](https://nicknisi.com/posts/case-statement) dispatched agents through a pipeline and enforced conventions mechanically. [Fleet](https://nicknisi.com/posts/fleet) watched every agent in my tmux server and sorted the ones that needed me to the top. [sessions](https://github.com/nicknisi/sessions) indexed every Claude, Codex, and pi conversation on my machine so any session could query any previous one. My plugins repo carried the skills, and the tmux statusline carried the notifications.

None of it ran inside Claude Code. All of it ran *next to* Claude Code, in bash and Bun and files under `~/.cache`, reaching in through whatever seams the harness happened to expose.

## The pitch that worked on me

Somewhere in our Slack this spring, people started describing pi as the Neovim of coding agents, with Claude Code as the VS Code. One packs in everything you might want; the other hands you a bare loop and gets out of the way.

If you’ve seen my dotfiles, you know why that stuck.

It took a couple of weeks to actually try it. Then, at 2:36pm on Wednesday, March 18th, I was in `#pi` making a joke about pi’s team also owning `shittycodingagent.ai`.

At 2:48pm I opened pi for the first time and typed `hello`.

At 3:07pm I asked it “what can pi do?”, read the answer, and tried to leave with `:qa`.

By 3:20pm I was symlinking `~/.pi` into my dotfiles repo. By 3:27pm I’d pasted in my Claude Code statusline script and asked: “Can we recreate this for pi?” That same evening I committed a pi statusline extension, a tmux status bridge, a Night Owl theme, and spinner verbs.

Day two, I asked pi whether it could write its own extensions. It wrote one. I posted the result in Slack with a single 🤯.

## The drift

Here’s my pi usage by month, measured in sessions on disk:

| Month | pi sessions | Claude Code sessions |
| --- | ---: | ---: |
| March | 111 | ~1,200 |
| April | 17 | ~590 |
| May | 29 | ~535 |
| June | 2 | ~400 |
| July | 0 | ~710 |

Pi commits in my dotfiles tell the same story: 19 in March, then 2, 5, 1, 4. Zero sessions in July.

pi wasn’t bad. It was great — faster, quieter, fewer permission prompts, model swapping that actually worked. Everyone in `#pi` kept saying so, and they were right.

My city just didn’t move with me. Fleet only knew how to read Claude Code’s hooks. case only knew how to dispatch Claude. My tmux notifications only lit up for Claude panes. Every hour in pi was an hour outside the tooling I’d spent months sharpening.

The most telling commit in my dotfiles is from May 28th: `feat: cut tmux + Claude Code over to fleet`. Same day I published the Fleet post. Peak of the city, and the moment pi became structurally impossible for me.

So when Zack asked, I told him it wasn’t worth it. I wasn’t lying. I was describing a real cost. I just had the cause wrong.

## What I’d been missing

Saturday, August 1st, 10:08am. I opened pi in my dotfiles repo and typed:

> so far I’ve been using pi like i’ve been using claude code. I know I can go deeper and make things better with pi, but I’m not sure exactly how. What are the capabilities beyond a simple claude code-like coding harness?

Four months as a faster terminal chat window, and I still hadn’t asked what else it could do.

pi deliberately ships *without* subagents, plan mode, permission popups, todos, background bash, and MCP. Each of those is an extension point on purpose. An extension is a TypeScript module that can register tools, replace the built-in `read` / `edit` / `bash` tools, hook every lifecycle event, block or rewrite tool calls, and take over the editor, footer, header, and overlays. That module surface *is* the product. If it isn’t an extension, pi doesn’t ship it.

## The statusline proof

I’d built both sides of this comparison, which is why it hit.

To know whether a Claude Code agent is working, waiting, or done, Fleet fuses three signals, none of which it can trust alone. Bash hooks writing status files (fast, structured, arrive out of order). A per-pane JSONL event log (knows intent, lags). And `tmux capture-pane` (ground truth, costs ~50ms, and Claude’s spinner *animates*, so a fixed glyph match misses half the frames). The whole lesson of that project was **each layer is authoritative only for what it can actually be trusted on** — because nothing in the stack could just ask the agent what it was doing.

The pi statusline extension is 519 lines of TypeScript. It subscribes to `tool_execution_start` and `agent_end`, calls `ctx.getContextUsage()`, hands a render function to `ui.setFooter()`, and reads the branch off `footerData`. No scraping, no fusion, no freshness rule. Every bash hook and `capture-pane` scrape in my old Fleet stack was doing work that one subscription replaces.

## Ten days

August 3rd alone: 58 sessions.

I posted “Anyone have their pi configs open source? I’d love to scour them!” in `#pi` and then read every one I could find (oh-my-pi, pikit, LazyPi, a stranger’s `my-pi-setup`), the way you read someone else’s dotfiles at 1am.

I ported the creature comforts I actually missed: dynamic workflows, `/goal` and `/loop`, `/btw`, session auto-naming, `AskUserQuestion`, draft stashing, recap cards. I replaced the web search tool I’d been complaining about for weeks. I built `/mg` — a Severance-style “100% File Completion” animation starring a pixelated version of my CEO, with audio — because I could and nobody could stop me. Two hours later I [posted it](https://x.com/nicknisi/status/2084377731123355695) with the only caption it deserved: the work of a Developer and Agent Experiences Engineer at WorkOS is mysterious and important.

I also asked pi, seriously, whether I should package all of it as a distro for other people. It spun up an 18-agent research workflow, came back, and told me no. The distro slot in that ecosystem is filled and empty at the same time, and capability packages beat curated configs by roughly 400×. Then it kept going and told me two things I hadn’t asked about: I was loading ~2,600 lines of broken code into every single session, and my `trust.json` was committed to a public repo with my absolute paths in it.

That was the useful part. It disagreed with me, backed it up with numbers, and then went looking for what else was wrong.

On August 6th at 10:36am I moved everything out of my dotfiles into its own monorepo. One commit: 53 files changed, 25 insertions, **25,635 deletions**.

## Coming home

Today `pi-extensions` is 26 packages and 32,847 lines of TypeScript. Statusline, composer, header, spinner, turn timer, pinned prompts. Subagent dispatch, workflows, codemode, an LLM council. `relay` for session-to-session messaging. `cloak` to redact secrets out of `read` results before they hit the model. `claude-compat`, so my Claude Code plugins keep working. Most of them are on npm now.

And there’s `bosun`: a pi session that turns into a liaison over a fleet of headless pi crewmates — spawning tasks, relaying progress, approving delivery. One night I pointed it at seven agents at once and went to bed.

It’s Fleet again. Same problem, same shape. The difference is Fleet is a compiled binary outside the harness squinting at terminal output, and bosun is a package inside the session.

There’s a work version of this story too, which I’ll tell properly when I’m allowed to. Short version: the same week I was tearing my dotfiles apart, we started building on pi at WorkOS. Because pi’s entire surface is extensions, the distance between “what would our own harness even look like” and “here, install it” turned out to be measured in days.

The switch wasn’t speed or cost or model choice. Those matter, and none of them moved me for four months. What moved me was noticing how much of my stack (case, Fleet, the scrapers, the files under `~/.cache`) only existed because I couldn’t get inside the harness. pi lets you in. Zack, sorry for the dodge — this is what I should have said.
