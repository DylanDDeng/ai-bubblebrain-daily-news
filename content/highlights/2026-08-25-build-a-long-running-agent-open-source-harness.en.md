---
externalId: "build-a-long-running-agent-open-source-harness"
kind: "article"
title: "Build a Long-Running Agent With an Open Source Harness"
description: "A complete walkthrough of the model loop, MCP, skills, sandbox execution, subagents, context compaction, approval gates, and durable event streams behind a long-running agent."
date: 2026-08-25
sourceUrl: "https://x.com/Sumanth_077/status/2092242081154847137"
tags: ["Agent", "Agent Harness", "MCP", "Skills", "Sandbox", "Context Engineering", "TrueForge"]
featured: true
draft: false
---

[Original article: Build a Long-Running Agent With an Open Source Harness](https://x.com/Sumanth_077/status/2092242081154847137)

*By Sumanth｜Originally published on August 25, 2026*
![Image](https://pbs.twimg.com/media/HQj4DgfbAAAf_9G?format=jpg&name=large)

Sam Altman recently wrote one line that captures where agent engineering is heading: “also, a reason to favor open-source harnesses.”

> Jul 14
> 
> also, a reason to favor open-source harnesses.

Most of the attention in AI still goes to the model. Which model reasons better, which one writes better code, how large the context window is, or how well it performs on a benchmark. But once you ask an agent to work for several minutes, search across sources, execute code, delegate work, and take dozens of steps, the model is only one part of what keeps the task running.

A raw model has no persistent execution loop. It doesn’t automatically know how to call tools, decide what context to keep, isolate code execution, recover from a dropped connection, or pause before a sensitive action. All of that comes from the runtime around it.

That runtime is the **agent harness**.

In this article, we’ll break down how a long-running agent actually executes by following a web research agent through the entire run: the model loop, MCP, skills, sandbox execution, subagents, context compaction, approval checkpoints, and the event stream that keeps the session durable.

## What an agent is actually made of

![Image](https://pbs.twimg.com/media/HQj0TMhaoAAV_g3?format=jpg&name=large)

A language model by itself is stateless between API calls. You send it some context, it produces an output, and the call ends. It has no built-in concept of a task that needs to keep running across twenty or fifty separate steps.

The harness wraps the model in an execution system. At its simplest, that means repeatedly calling the model, giving it access to tools, feeding tool results back into context, and deciding when the task is complete.

But a useful agent needs more than the loop itself. It usually has a model for reasoning, MCP servers or other tools for accessing external systems, skills that describe how specific tasks should be performed, and a sandbox where code can run and files can be created without sharing the agent server itself.

Then there are capabilities that become increasingly important as the run gets longer: subagents for parallel work, context management for keeping the model window under control, approval checkpoints before sensitive actions, and persistent sessions so the task does not disappear when the client disconnects.

To make the architecture concrete, we’ll use **TrueForge** as the worked example and follow a web research agent through one complete execution. TrueForge is an open-source agent harness from TrueFoundry

Github Repo: [https://github.com/truefoundry/trueforge](https://github.com/truefoundry/trueforge)

## Setting up the research agent

To make the rest of the architecture concrete, we’ll build a small web research agent on TrueForge and then follow what happens inside the harness when it runs.

The agent has one job: give it a research question, and it searches the web, researches different parts of the problem in parallel, and turns everything into a single interactive page with the sources cited.

For this agent, we only need four building blocks: a model, an MCP connector for web search, a skill that defines how the final artifact should be created, and a sandbox where the agent can execute code and write files.

Start the local server with:

```shell
npx @truefoundry/trueforge
```

Then open http://localhost:8790.

![Image](https://pbs.twimg.com/media/HQjz8kVaoAAcdIG?format=png&name=large)

From there, the agent can be assembled directly in the UI.

1. **Add a model.** Go to Settings → Models, choose a provider, add your API key, and enable the model you want the agent to use.
2. **Connect Exa.** Go to Settings → Connectors, find Exa, and connect it. This gives the agent web search through MCP.
3. **Enable the skill.** Under Settings → Skills, enable web-artifacts-builder. This contains the procedure the agent follows to turn its research into an interactive one-page brief.
4. **Turn on a sandbox.** The skill executes inside a sandbox rather than directly on the agent server. On macOS or Linux, including WSL, TrueForge can use its built-in local sandbox. On native Windows, you can connect a Daytona sandbox instead.
5. **Compose and save the agent.** Return to the chat, choose the model, enable Exa and web-artifacts-builder, and keep Dynamic sub-agents enabled. Send a test question to make sure the agent can search, delegate research, and render the final artifact. Then save the configuration as an agent.

Once the agent is saved, the model, tools, skill, and sandbox stay attached to that configuration. Your application only needs to reference the saved agent rather than rebuilding the entire setup on every run.

At this point the agent works. The more interesting question is what the harness is actually doing once we send it a task.

## What happens when the agent starts running

![Image](https://pbs.twimg.com/media/HQj0MvRboAAB8N5?format=png&name=large)

When you send a research question, the harness creates a new turn and calls the model with the task, the relevant instructions, and the capabilities currently available to it.

The model does not receive the question and magically complete the entire workflow in one response. It usually decides on an action first. In our case, that might mean searching for information through Exa.

The execution therefore starts looking something like this:

1. The model receives the task.
2. It decides which tool or capability it needs.
3. The harness executes that action.
4. The result is returned to the model.
5. The model reasons over the result and decides what to do next.
6. The cycle repeats until the task is complete.

At the core, this is still just an execution loop.

You could write a basic version yourself in an afternoon: call the model, inspect whether it requested a tool, run the tool, append the result, and call the model again.

The difficulty is not writing the loop. The difficulty is making that loop survive a real task.

What happens if the model keeps calling tools forever? What happens when one search returns 20,000 tokens? What happens when three pieces of research can run in parallel? What happens when the agent wants to execute a destructive action? What happens if the browser disconnects halfway through the run?

Those are harness problems.

Our research agent hits several of them during a single run.

## MCP connects the agent to the web

The model itself cannot search the live web. It needs an external tool.

In this setup, Exa is exposed through MCP. When the model decides it needs to search, the harness sends the corresponding MCP request, receives the result, and makes that information available to the next model call.

For a small agent with one or two tools, this is simple. But production agents often have many MCP servers and potentially hundreds of tools.

That creates a context problem before the agent has even started working.

Every tool comes with a description and schema explaining what it does and what arguments it accepts. If the harness inserts every full definition into every model request, a large portion of the model's context window gets consumed by tools that may never be used.

This is where progressive disclosure becomes useful.

Rather than loading everything up front, the agent can initially see enough information to discover that a capability exists. The full definition is only loaded when the model actually needs that tool.

The same principle applies throughout a long-running agent: the model should have access to everything it may need, without carrying all of it inside the active context at the same time.

## Skills give the agent procedures

MCP tools describe what an agent can do.

Skills describe how it should perform a particular kind of task.

For this research agent, web-artifacts-builder contains the instructions for taking the research, organizing it, and turning it into the final interactive artifact.

The distinction matters because the entire procedure does not need to live inside the system prompt.

Imagine an agent with thirty different capabilities: writing a report, reviewing code, creating a dashboard, analyzing logs, researching the web, and so on. Putting the complete instructions for all thirty workflows into every model call would create the same problem we just saw with tool schemas.

Instead, the agent can know which skills are available and load the detailed procedure only when one becomes relevant.

That keeps the base context smaller while still allowing the same agent to perform many different kinds of work.

In our run, once the research has been collected, the agent loads the artifact-building skill and uses it to decide how the final page should be generated.

But generating that page requires more than language-model reasoning. It needs somewhere to execute code and create files.

## The sandbox is where execution happens

A model can generate code, but it should not be running that code directly inside the same process that hosts the agent.

The sandbox gives it an isolated environment for execution.

For our research agent, the sandbox is where the skill can process search results, create files, execute code, and assemble the final interactive page.

This separation also turns out to be useful for context management.

Suppose Exa returns a very large search response. One option is to paste all of it back into the conversation and let the model carry those thousands of tokens through every future step.

That works for a while, but it scales badly.

A better approach is to move the heavy data somewhere else. The agent can process the raw result inside the sandbox, write large outputs to files, and return only a compact summary or reference to the model.

The information is still available if the agent needs to inspect it again, but it is no longer taking up space inside every model request.

This matters because once the agent starts researching several things in parallel, context becomes the main constraint.

## Where long-running agents start breaking: context

A short agent run is easy to reason about because there simply isn't much history.

A long-running one keeps accumulating information with every step: model responses, tool outputs, search results, skill instructions, files, previous decisions, and results returned by other agents.

Eventually the system has to answer a difficult question:

**What does the model actually need to see right now?**

There are two kinds of context involved.

The first is context we intentionally give the model: the system prompt, tool definitions, skill instructions, files, and task state.

The second is context the run generates on its own: search results, intermediate outputs, old messages, tool responses, and reasoning from earlier steps.

The second category grows continuously.

TrueForge uses several techniques to prevent all of that information from accumulating inside the parent model context.

Progressive disclosure

As we saw earlier, tools and skills do not need to be loaded in full before they are used.

The agent can discover capabilities first and pull in the detailed definitions later.

Code Mode

Large tool results can be processed programmatically rather than sent raw to the model.

If a search returns hundreds of records, the agent can filter or transform them in code and only send the useful output back into context.

Large-result offloading

If a result is too large to keep in the conversation, it can be written to a file in the sandbox.

The model receives a preview or reference instead of carrying the full payload through the rest of the run.

Compaction

Even with those techniques, the conversation itself eventually grows.

When the context crosses a configured threshold, older parts of the session can be summarized into a smaller representation. The agent loses some verbatim detail from the early steps but keeps enough state to continue the task.

The goal behind all four techniques is the same: preserve the information required for reasoning without forcing the model to reread the full execution history on every step.

And then there is another way to stop context from growing: don't put the work in the parent context in the first place.

## Subagents isolate parallel research

Our web research agent is a good example.

Suppose the user asks it to compare three different developer tools.

The simplest implementation is to research tool one, then tool two, then tool three, all inside the same agent context.

By the time the research finishes, the parent conversation contains every search query, every page read, every tool response, and every intermediate note from all three branches.

Instead, the harness can create a separate subagent for each item.

Each subagent receives its own context and works independently. It searches the web, reads the relevant pages, reasons over what it finds, and eventually returns a compact conclusion to the parent.

The parent does not need to see the entire research process.

It only needs the output.

So the run can look more like:

Parent agent → Subagent A researches tool A → Subagent B researches tool B → Subagent C researches tool C

Each child works with an isolated context and returns its findings to the parent, which then performs the final comparison.

For our research agent, Dynamic sub-agents allow exactly this kind of fan-out.

This has two advantages. The work can happen in parallel, and the parent context stays much smaller because it receives conclusions instead of complete research histories.

But subagents are not automatically better.

If a task fits comfortably inside one context window, splitting it into several independent agents adds more orchestration and more opportunities for something to fail. Subagents become useful when the work is genuinely parallel or when the child task would otherwise dump too much information into the main context.

## Approval gates belong between reasoning and action

So far, our agent only reads information and creates files inside its sandbox. There is no dangerous external action.

But imagine replacing Exa with tools that can merge a GitHub pull request, modify infrastructure, send a Slack message, or update a production database.

The execution loop would normally look like:

Model decides to call tool → Harness executes tool

For sensitive actions, that is too much authority to give the model automatically.

The harness needs another state:

Model decides to call tool → Harness pauses → Human reviews → Harness continues or stops

TrueForge can enforce approval checkpoints based on the metadata attached to the tool. If a tool is marked as requiring approval, the run stops before the call executes and shows the exact tool and arguments to the user.

This is different from putting something like “ask me before deleting anything” inside the system prompt.

A prompt is still an instruction the model has to follow.

An approval gate is a runtime rule.

The model cannot reason its way around it because the harness itself refuses to execute the tool until the checkpoint has been resolved.

Our research agent never triggers one because its external tools are read-only. If we attached a write-capable GitHub tool, the same execution loop could pause immediately before creating or modifying something.

## The run should survive the client

There is one final problem that becomes obvious only when agents start running for several minutes or longer.

What happens if you close the browser?

A chatbot request usually finishes quickly enough that the client connection and the model response can be treated as the same interaction. A long-running agent cannot make that assumption.

The execution has to exist independently of the UI watching it.

TrueForge stores the steps of a session as an ordered stream of events. As the model reasons, tools execute, subagents run, approvals occur, and results come back, those events become part of the persistent session.

So if the browser disconnects, the run does not disappear with it.

The server can continue executing the task. When the client reconnects, it can resume the stream or retrieve the events it missed.

The same design also gives you a replayable trace of the run.

If the research agent returns a bad answer, you can inspect how it reached that answer: which search it performed, which tool returned unexpected data, what the subagent concluded, and what the parent did with that conclusion.

That becomes increasingly important as agent runs become longer. The final response tells you what happened. The event stream tells you why.

## The full anatomy of the run

Now we can put the entire execution together.

The user sends the research question, and the harness starts a turn.

The model decides what it needs to do first. It discovers the available tools and calls Exa through MCP. Search results come back, but large outputs do not have to remain in the main model context.

If the problem can be split into independent branches, the harness creates subagents. Each one researches its part of the problem in an isolated context and sends a compact result back to the parent.

When the agent needs to transform those findings into the final artifact, it loads the relevant skill. Code runs inside the sandbox, where the agent can process data and create files without executing directly on the server.

As the session becomes longer, unused tool definitions stay unloaded, large results are offloaded, and older conversation history can be compacted.

If the agent eventually requests a sensitive write action, the runtime can stop before executing it and wait for approval.

Throughout the entire process, every step is persisted as an event, so the task can continue even if the client disconnects and the full execution can be inspected afterward.

That is what turns the simple model-tool loop into a long-running agent.

The model is still doing the reasoning, but most of the reliability work happens around it: deciding what the model sees, where code runs, how parallel work is isolated, when execution stops, and whether the session survives long enough to finish.

This is why the harness layer matters more as agents move beyond short demos.

TrueForge packages these runtime pieces into an open-source, vendor-neutral harness rather than requiring teams to build the same infrastructure around every agent. The web research agent is one example, but the underlying execution model stays largely the same for a codebase onboarding agent, a dependency auditor, an incident triage bot, or another long-running workflow.

What changes are the model, tools, and skills attached to the agent.

The loop, context management, sandbox, approval checkpoints, and durable session remain.

Our example is a small, read-only web research agent, but the harness underneath works the same way for much larger workflows. You could use the same setup for a codebase onboarding agent, a dependency auditor, or an incident triage bot. What changes are the tools, skills, and permissions you attach to it. The execution loop, context handling, approval gates, sandbox, and trace remain largely the same.

For this walkthrough, the agent itself is configured and saved inside TrueForge. I’ve also shared the companion GitHub repo with the TypeScript driver and setup instructions for invoking that saved agent from code and following the same workflow yourself.

[Companion driver + setup guide.](https://github.com/Sumanth077/Hands-On-AI-Engineering/tree/main/ai_agents/trueforge_web_research_briefer)

TrueForge is open source, here is the GitHub repo: [https://github.com/truefoundry/trueforge](https://github.com/truefoundry/trueforge)

Thanks to TrueFoundry for working with me on this one.
