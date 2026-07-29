---
externalId: "we-rewrote-our-agent-durable-object-pi-agents-sdk-code-mode"
kind: "article"
title: "We rewrote our agent to run entirely in a Durable Object with Pi, Agents SDK and Code Mode"
description: "Miguel explains how camelAI replaced always-on VMs with Durable Objects, SQLite, R2, Pi, Code Mode, dynamic Workers, and narrowly scoped Linux containers."
date: 2026-07-28
sourceUrl: "https://x.com/Vercantez/status/2082138839888589200"
cover: "https://pbs.twimg.com/media/HOU-LQ3aMAEVDxm?format=jpg&name=large"
tags: ["Durable Objects", "Pi", "Agents SDK", "Code Mode", "camelAI"]
featured: true
draft: false
---

[Original article by Miguel / @Vercantez](https://x.com/Vercantez/status/2082138839888589200)

![Image](https://pbs.twimg.com/media/HOU-LQ3aMAEVDxm?format=jpg&name=large)

We recently finished moving the camelAI agent off of virtual machines. The agent now runs inside a [Cloudflare Durable Object](https://developers.cloudflare.com/durable-objects/), its filesystem lives in SQLite and R2, and it writes JavaScript instead of bash. Most teams run coding agents in a full Linux VM or container sandbox, and we used to as well.

We wanted off VMs because giving every user an always-on machine with attached disk was too expensive to scale. The hard part is that coding agents assume Linux. They are trained to reach for bash, and the harness we launched on required a full VM, so getting here took three redesigns. The tradeoff is that the agent can now only do things we've built an explicit method for, which sounds limiting but has been good for the product.

I'm Miguel, CTO of camelAI. Our codebase recently went open source, so everything in this post is code you can read at [github.com/qaml-ai/camelAI](https://github.com/qaml-ai/camelAI). I'll link to the relevant files as we go. Here's the progression.

## Step zero: the VM era

We launched on the Claude Code harness, which needs a full virtual machine to run. We tried several VM providers, none of them fit our persistence and performance requirements, and we ended up [building our own container service](https://camelai.com/blog/we-tried-every-container-service-then-built-our-own). That post is still up, but we no longer run any of that infrastructure.

The container service worked, but it was heavy. An always-on VM for every user is expensive, and so is holding every user's files on fast attached disk. Scaling it means scaling real machines with real disks, which was going to be prohibitively expensive at the user counts we're aiming for. So instead of getting clever about VM orchestration, we started designing around not needing a VM at all.

## Step one: take the agent out of the VM

The Claude Code harness is inseparable from its VM, so the first move was building our own harness. We built it on [pi](https://github.com/badlogic/pi-mono), Mario Zechner's open-source coding agent. pi is a stack of libraries. The highest layer assumes a normal operating system, but the lower layers give you the agent primitives, like the agent loop and state management, without caring where they run. We didn't change any pi code. We imported those lower layers and built [our own harness](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/chat-thread-do.ts) on top of them, running inside a Cloudflare Durable Object instead of a Linux environment.

A Durable Object is a small stateful compute instance that spins up on Cloudflare's edge, close to the user who created it. Each chat thread gets its own Durable Object, which brought latency down on its own compared to routing everything through a centralized VM host.

At this stage we kept the VMs, but the agent no longer lived inside one. It called into the VM remotely when it needed to run commands. Anthropic describes this same split for its managed agents, the brain separated from the hands. It gave us some nice properties:

- The agent starts responding before the VM is awake, because it doesn't wait on a machine to boot.
- The VM can go back to sleep while the agent keeps working, or never wake up at all if the turn doesn't need any commands.
- One brain can control multiple hands. A single agent could operate several VMs at once.

We call those hands projects. Each project came with a VM for executing commands and a git repo created programmatically through [Cloudflare Artifacts](https://developers.cloudflare.com/artifacts/), which is git-compatible storage you can provision on the fly from a Worker. The agent didn't really know it was running outside the VM. It still had bash and worked like any other coding agent.

The problem is that this fixed latency and nothing else. We still had a VM per user, so we still had all of the cost and scaling problems from the original design.

## Step two: remove the VM

The next version kept the same project structure but dropped the VM behind it. Each project is now backed by [a filesystem that lives inside a Durable Object](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/workspace-filesystem-do.ts), with [R2](https://developers.cloudflare.com/r2/) behind it for larger files.

We didn't invent this. Cloudflare's agents team built [Shell](https://www.npmjs.com/package/@cloudflare/shell), an experimental filesystem and execution runtime for Workers, and we reused their code heavily. The mechanics are simple. A Durable Object's storage is a SQLite database with a 10 GB cap, and each row has a maximum size. Small files live directly in SQLite rows. Files over roughly 1.5 MB get written to R2, and the SQLite row just holds a pointer. To the agent it looks like a normal filesystem, but underneath it's a database and object storage, so persistence is stored data rather than infrastructure we have to keep alive.

Version history still runs through Artifacts, so every project keeps a git history without us hosting a git server.

## Step three: remove bash

Removing bash felt drastic. Coding agents are trained to reach for bash, and bash is why everyone runs them in VMs in the first place. It was also a problem beyond cost. An agent with bash and network access needs credentials to do anything useful, and our attempts at authenticated proxy URLs were getting hacky and hard to enforce.

So we removed it. Instead of bash, the agent writes JavaScript, executed through [Code Mode](https://blog.cloudflare.com/code-mode/) and Cloudflare's [dynamic Worker loaders](https://blog.cloudflare.com/dynamic-workers). Each execution runs in a fresh V8 isolate that boots in milliseconds and uses a few megabytes of memory. The sandbox comes pre-loaded with the user's data connections and with [methods for everything the platform can do](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/code-mode-tools.ts). Credentials never enter the sandbox. The agent calls a connection's methods, and authentication happens on our side.

When you look at what agents actually use bash for, losing it costs less than you'd expect. Most of it is file operations, which the agent has native tools for. We give it read, write, and edit, plus our own [grep and glob implementations](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/pi-container-tools.ts). That covers the 80-20. The rest is specific commands for specific jobs, and those became explicit methods:

- wrangler deploy through a proxy became a deploy\_project method we fully control. Since we know exactly when a deploy happens, we can hook it and open a live preview automatically. Before, we had to sniff proxied wrangler traffic to guess which thread had deployed something.
- Building the user's app and running Python notebooks became their own methods, both backed by short-lived containers.

We kept containers for those two jobs because they genuinely need Linux. User apps are built with Vite, Tailwind, and React Router, and adding dependencies means running bun install. We considered running builds inside a Worker, since the thing being built is itself a Worker, but that path isn't well supported, and Workers have a 128 MB memory limit and a fraction of a CPU. Builds would be slow and plenty of projects would blow past the memory cap. So instead a build spins up a container through the [Cloudflare Sandbox SDK](https://github.com/cloudflare/sandbox-sdk), copies the project in, runs the job, returns the result, and shuts the container down. Notebook runs work the same way. We still use full Linux, but only for the seconds of work that actually need it.

The honest downside is that we have to anticipate what the agent needs. With bash it could figure things out on its own. Now, if a capability is missing, we have to add it. In practice that pressure has been good for the product, because it forces us to think about what users are doing and build a first-class path for it instead of letting the agent improvise.

There was an unexpected benefit too. Bash is open-ended, and cheap models struggle in open-ended environments. With a smaller set of explicit methods they perform noticeably better, which matters because keeping camelAI cheap to run is the point of this architecture.

## Where that leaves us

The stack is now Durable Objects for the agent and its filesystem, R2 for large files, Artifacts for git history, pi as the harness, and Code Mode with dynamic Workers for execution. It deploys like any other Cloudflare app, and there are no external container services to manage.

Dynamic Workers are billed per execution, not per second of uptime. Thousands of executions cost about what a few minutes of container time costs on the services we used to evaluate. Latency is low because everything runs on the edge near the user, and scaling is Cloudflare's problem instead of ours.

Users still build and deploy full-stack apps to live URLs, and the agent still reads, writes, greps, and deploys. From the user's side, nothing changed.

## TL;DR

We started with the Claude Code harness on a self-built VM service, which was expensive and hard to scale. First we moved the agent itself into a Cloudflare Durable Object and let it control VMs remotely, which fixed latency but not cost. Then we replaced the VMs entirely with a filesystem stored in Durable Object SQLite and R2, based on Cloudflare's Shell project, with git history through Cloudflare Artifacts. Finally we removed bash and gave the agent a JavaScript sandbox via Code Mode and dynamic Workers, with explicit methods for deploys, builds, and notebooks. The result is cheaper by orders of magnitude, lower latency, simpler to operate, and easier for smaller models to drive. All of it is open source at [github.com/qaml-ai/camelAI](https://github.com/qaml-ai/camelAI).
