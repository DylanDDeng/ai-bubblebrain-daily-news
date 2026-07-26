---
externalId: "why-software-factories-fail"
kind: "article"
title: "Why Software Factories Fail"
description: "Dex Horthy examines why lights-off AI software factories degrade codebase maintainability, why current benchmarks miss design quality, and where human review still matters."
date: 2026-07-24
sourceUrl: "https://x.com/dexhorthy/status/2080697380379427275"
cover: "https://pbs.twimg.com/media/HN8ZwOdbUAAi97D?format=jpg&name=large"
tags: ["Agent", "Software Engineering", "Code Quality"]
featured: true
draft: false
---

![Image](https://pbs.twimg.com/media/HN8ZwOdbUAAi97D?format=jpg&name=large)

[Original article by Dex Horthy](https://x.com/dexhorthy/status/2080697380379427275)

or: the harness is not enough

Update - the talk version of this post is live on youtube: [https://www.youtube.com/watch?v=Ib5GBkD555M](https://www.youtube.com/watch?v=Ib5GBkD555M)

Part 1 in a series. Part 2 is here: [https://x.com/dexhorthy/status/2081058573556306030](https://x.com/dexhorthy/status/2081058573556306030)

## i guess we doin loops now

We're all racing to put AI coding into production. A lot has been said about loop engineering, and the prevailing wisdom is that we should probably write more loops.

![Image](https://pbs.twimg.com/media/HN8Ped8aEAAF-zc?format=jpg&name=large)

[StrongDM wrote about their lights-off software factory](https://factory.strongdm.ai/) where no human reads code and no human writes code.

The narrative goes something like this:

1. You are the bottleneck.
2. The models are good enough.
3. Code is free.
4. Just ship more stuff.

[Ryan Lopopolo](https://x.com/_lopopolo) of OpenAI [wrote about this in February](https://openai.com/index/harness-engineering/) and [gave a talk in April](https://www.youtube.com/watch?v=am_oeAoUhew) about OpenAI's software factory, Symphony.

These people are all really dang smart and I have a ton of respect for them. But the most cynical take here would be to call this yet another excuse to pump more VC money into the slop cannon.

## it's uh...it's going

Our friend [Mario](https://x.com/badlogicgames) got up at AI Engineer Europe and [begged us to slow down](https://www.youtube.com/watch?v=RjfbvDXpFls) -- because companies that have no business having outages due to coding-agent mishaps, are, well... [having outages due to coding-agent mishaps](https://www.ft.com/content/00c282de-ed14-4acd-a948-bc8d6bdb339d).

As [Matt Pocock](https://x.com/mattpocockuk) put it, [codebases are falling apart faster than they ever have before](https://www.youtube.com/watch?v=3MP8D-mdheA).

I haven't been able to dig up any definitive data/findings from StrongDM on how that whole dark factory went. The [weather-report](https://factory.strongdm.ai/weather-report) has a few sparse updates between February and June of this year. **edit** - [there is some conversation with the team on hacker news on July 23](https://news.ycombinator.com/item?id=49026625) - sounds like we might get a more formal update soon!

[The folks at Faros AI](https://www.faros.ai/research/ai-acceleration-whiplash) put out a report: since we[2](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#user-content-fn-1b-f56fe9a973fe7c6ebb6a9673c1bc64cb) all picked up these AI coding tools back in January and February, pull-request review quality is way down.

- More comments, longer comments, and tons of PRs getting merged with no review at all.
- Incidents are way up.
- Bugs per developer are way up.

![Image](https://pbs.twimg.com/media/HN8PswLa8AApp4d?format=jpg&name=large)

This report is more of a correlation signal than a verifiable smoking gun (yes i chose that word on purpose, don't get me started on claude prose), and the whole point of this post is to be wary of slop data, but it feels directionally valid based on what I've seen.

## "You're holding it wrong" (you're not)

A lot of people will tell you that this is a skill issue -- that if you're not getting good results, that's your fault.

But however you're choosing to...erhm...hold it, I guarantee you're being told that if token-maxxing isn't working for you, it's a skill issue. You just need to spend more tokens. Let go of reading the code. And if you're just getting there, I promise it's part of the progression. [I thought this way last summer too](https://hlyr.dev/ace).

Unfortunately for my ego, some dumb stuff I decided to say about "how to hold it better" got recorded and now has about a million cumulative views on YouTube. I am not trying to brag here, I share this only to establish that I've been going deep on the best ways to use coding agents for a **long time** now, and have discovered some things that many others have found **genuinely useful**.

- [Advanced Context Engineering for Coding Agents](https://hlyr.dev/ace)
- [No Vibes Allowed -- Solving Hard Problems in Complex Codebases](https://hlyr.dev/nva)
- [Everything We Got Wrong About RPI](https://hlyr.dev/qrspi-mlops)

Anyhow, **The promise** of all this online "just token harder" yapping we've been forced to endure is, succinctly: with enough harness engineering, we can get the best of both worlds:

- 10 to 100x faster,
- high quality, and
- nobody ever has to do that thing we all hate called code review

All we have to do is configure more linters and sprinkle some magic words like "adversarial review" onto enough PR review bots, and our software will happily build itself without incident.

## This is not a skill issue

What I'm gonna try to convince you is that no amount of harness engineering or loopsmaxxing can solve what is fundamentally a model-training issue.

To grapple with this, I had to dig into how coding models are actually trained and evaluated - with respect to both the [RLVR](https://github.com/opendilab/awesome-RLVR) and the benchmark side of things.

In this post I'm gonna run through:

1. Software factories date back to 1968, how have they evolved, and how has AI changed them
2. Why models can generate mountains of slop despite ace-ing benchmarks (even the brand new "frontier" benchmarks)
3. **In spite of this**, you can move pretty fast without setting your codebase on fire

I'm gonna try to cut through the hype of every daily-emerging skills plugin and the ai-psychosis-tokenmaxxing advice pandemic, and talk in general terms about the **types of things that work** without referencing any particular skill or framework.

**Video Version:** this post is based on (and expands upon) [my keynote at AI Engineer World's Fair 2026](https://www.youtube.com/watch?v=Ib5GBkD555M).

Thanks to [@addyosmani](https://x.com/addyosmani), [@CyrusNewDay](https://x.com/CyrusNewDay), [@HamelHusain](https://x.com/HamelHusain), [@zeeg](https://x.com/zeeg), [@dillon\_mulroy](https://x.com/dillon_mulroy), [@nayshins](https://x.com/nayshins), and [@jeffreyhuber](https://x.com/jeffreyhuber) for feedback on this post.

## An aside: this has nothing to do with vibe coding

[Addy Osmani](https://x.com/addyosmani/status/2066595308629594363) detangled this thing that is worth highlighting:

> A developer vibe-coding a side project a dozen people will ever run, and a team keeping a ten-year-old enterprise system alive for another quarter, share almost no constraints worth naming, and most of the advice in circulation is really one of those two people telling the other how to live.

If you love vibe coding, please, go on vibing. I still vibe code lots of things, I just also maintain lots of production software (and through HumanLayer, help 1000s of other engineers do the same), so the rest of this is aimed at folks solving hard problems in complex codebases.

I hear the word **brownfield** a lot to talk about this split. Historically that meant some ten-year-old Java thing, but at the pace we can ship now, it feels like an agent-built codebase starts to struggle after maybe **three to six months** -- you start to slow down, and the way you approach adding new things has to change.

## A brief history of the software factory

I've been building and studying software factories my whole career, but I only learned this recently: the term traces all the way back to a [NATO conference in 1968](http://homepages.cs.ncl.ac.uk/brian.randell/NATO/nato1968.PDF) -- the same one that gave us "software engineering."

The only other bit I find super interesting since then is that the [US Department of Defense wrote a 31-page pdf about how the DoD needs to start using jenkins better or something](https://dodcio.defense.gov/Portals/0/Documents/Library/DevSecOpsReferenceDesign.pdf).

## The 2022 software factory

Let's ground our "software factory" definition around 2022, right before AI. In a typical software factory:

- **People decide what to build** -- engineers, PMs, leadership driving the vision
- **It goes in a tracker** -- Linear, Jira, whatever: a state machine of what needs to happen
- **Someone grabs a ticket and builds it** -- probably does some manual/automated testing while they're at it
- **Pull request** -- automated checks, a human reviews the code, maybe someone pulls it down to test
- **Anything wrong? Loop back** to "someone builds the thing"
- **Ship to prod** -- and it makes contact with users
- **Add monitoring** -- there's an entire industry built around paging an engineer at 3am when something breaks
- **Users complain** -- ask for things, find bugs, file feature requests → back to the team to add to the tracker

![](https://pbs.twimg.com/amplify_video_thumb/2080400367033217024/img/fzKh_OaEyf3OqYzU.jpg?name=large)

And on and on. We haven't even hit AI yet, and there are already several loops in this picture.

## front-loading alignment

There's a thing teams figured out decades ago: building takes hours or days, and so does review.

![Image](https://pbs.twimg.com/media/HN8RQdDakAA1V99?format=jpg&name=large)

So we front-load the work -- planning, architecture proposals, sprint planning -- together, as a team. That means:

- **less rework**, because we aligned before anyone wrote code
- **less time reviewing every line**, if you've ever read a long-but-well-done PR, you know how fast the review goes when it's close-to-perfect

![Image](https://pbs.twimg.com/media/HN8RTX9bwAAMpir?format=jpg&name=large)

We'll come back to this later - let's look at what happens when you bring agentic coding into the picture.

## The agentic software factory

Now every company and their mother --

- [Ramp](https://infoq.com/news/2026/01/ramp-coding-agent-platform/)
- [Stripe](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents)
- [WorkOS](https://workos.com/blog/project-horizon)
- [Brex](https://www.latent.space/p/brex)

has spent the better part of this year explaining how they built an agent factory that ships on the order of **75% of their code**.

The agentic factory looks mostly like swapping **"someone builds the thing" → "an agent builds the thing"** -- there's some stuff here like orchestration, a harness, a sandbox, a model, computer use, etc. I won't go in depth on those details because quite frankly I'm sick of reading about it and I'm sure you are too.

![Image](https://pbs.twimg.com/media/HN8RZ2vbAAATZJh?format=jpg&name=large)

When the agent builds the thing:

- Building drops from hours or days to minutes or hours.
- Review still takes hours or days. A human still has to read the code and test the change. So review is now the bottleneck.

![Image](https://pbs.twimg.com/media/HN8RbyUa4AAPx8a?format=jpg&name=large)

So you speed review up too:

- Agentic code review, to catch style, bugs, security.
- Agentic regression testing, to poke it from the outside with browsers and computer use and maybe send you a cute little video when it's done

![Image](https://pbs.twimg.com/media/HN8Rd9VbYAA-z7L?format=jpg&name=large)

Review is faster now, but it's also probably still the bottleneck. But we can do more loops.

Next you might route incidents into the factory. Instead of paging someone at 3am, they wake up to a PR that maybe already fixes it.

![Image](https://pbs.twimg.com/media/HN8RgOcasAA3KGC?format=jpg&name=large)

We can also route user feedback into the factory. People ask for stuff, it gets built.

![Image](https://pbs.twimg.com/media/HN8Rh7gaEAAqx76?format=jpg&name=large)

At which point the job is two questions: how much can you stuff into the queue, and how fast can you review and test what comes out?

![Image](https://pbs.twimg.com/media/HN8RjrBaMAAj5CR?format=jpg&name=large)

Which brings us to the lights-off software factory.

## The lights-off software factory

[Dan Shapiro coined this term](https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/) and [Simon Willison wrote about StrongDM's implementation of it](https://simonwillison.net/2026/Feb/7/software-factory/) -- where we no longer read the code.

You look at your beautiful software factory. It's ruined by that annoying little code review step and you say: you know what, that thing where a human reads every change? No thanks.

![Image](https://pbs.twimg.com/media/HN8RmztaEAAOd9g?format=jpg&name=large)

So you drop it, and you put the effort somewhere else:

- Invest in testing and letting the agent test its own work
- Invest in sandboxes and orchestration
- Invest in automated review
- Invest in monitoring
- Invest in rollout
- Invest in collecting feedback signals from users

![Image](https://pbs.twimg.com/media/HN8RoxQbEAAcloG?format=jpg&name=large)

And now the job really is just one question: how much stuff can we ask the agent to build? How much of the [ocean do we want to boil](https://garryslist.org/posts/boil-the-ocean)?

## This is going to go great (its not)

![Image](https://pbs.twimg.com/media/HN8Wwh1akAAgZBY?format=jpg&name=large)

I'm going to posit something potentially controversial: the lights off factory does not work.

Let's get into why software factories fail.

## We tried this

In July 2025 we went full lights-off. Just read the specs and the tickets, background agents for all the small/medium stuff, the whole thing.

If you've tried this seriously for a few months, you already know how it ends. You find at least one issue gnarly enough that the agent can't solve it -- even with your most advanced prompting and workflows.

- You do deep context-aware research, collating all the right parts into the smart zone for the model to analyze
- You have the agent try to reproduce in 10 different ways

Eventually you have to suck it up and go dig into the codebase you stopped reading three months ago, trying to figure out what's broken.

And in the meantime:

- Your site was down.
- Your users were pissed.
- And you, if you're anything like me, were miserable -- reading all the slop code you let slip into your system.

The first time this happened to us, I shook it off. Even though I'd just spent the better part of two weeks digging through claude spaghetti, "the downside risk was worth the velocity". By the ~third time in november, we decided it would be easier to rewrite from scratch, and my cofounder spent **two whole weeks** in VS Code (not even cursor) plumbing out all the patterns by hand.

## models degrade codebase quality over time

What I want to get to is this: models have a shortcoming. They can't maintain and improve codebase quality over time -- not without a decent amount of human steering.[4](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#user-content-fn-3-f56fe9a973fe7c6ebb6a9673c1bc64cb)

When I say maintainability, I mean the specific thing where it becomes really, really hard to change one part of the codebase without breaking another part. This is [Martin Fowler's shotgun surgery](https://refactoring.guru/smells/shotgun-surgery).

I'm not going to say much more about maintainability. There are a bunch of books you can go read about it

- [John Ousterhout's A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/aposd.php)
- [Robert C. Martin's Clean Code](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)
- [Martin Fowler's Refactoring](https://martinfowler.com/books/refactoring.html)

So, why can't models do software maintainability?

## "But surely the models have gotten better since then"

At this point you might be dying to say: but Dex, surely the models have gotten much better since July

They have -- in some ways. In others they're about the same.

- Solving one-off problems, or vibe-coding a new marketing site? Yes. Way better.
- Improving codebase quality over time? Not much better, as far as I can tell.

![Image](https://pbs.twimg.com/media/HN8RwLqbQAA-pQT?format=jpg&name=large)

I can't prove this. You can't prove it either. There are no good benchmarks for a model's ability to maintain codebase quality. (More on where that's going later.)

> **THERE ARE NO GOOD BENCHMARKS for a model's ability to maintain codebase quality**

But if you've worked with coding agents for a while -- and a lot of people are posting about exactly this -- you probably have the vibe already: they tend to make things worse over time, and make the codebase harder to work in.

So to figure out why this happens, I want to zoom out to the first great coding agent.

## Claude Code won because of Reinforcement Learning inside the harness

Claude Code went from nothing to ~$4B -- now something like ~$9B -- in revenue in under a year.

![Image](https://pbs.twimg.com/media/HN8R0_naMAApmn2?format=jpg&name=large)

Which is a little wild, because there were already great CLI agents. [aider](https://aider.chat/), [cline](https://cline.bot/), [codebuff](https://codebuff.com/) -- all predated Claude Code, all with genuinely great context engineering built in, all with the same tool set you might attribute to claude code: read, write, edit, grep, bash. I used them. They were good. But also, tool use would just... fail sometimes -- you'd watch it flail at the same edit three times and open your editor back up to do it yourself.

[The SWE-Agent paper from 2024](https://arxiv.org/abs/2405.15793) outlines how small changes in tool shape make noticeable differences, e.g. including line numbers in ReadFile results, or changing an Edit tool from find/replace to line-range edits.

![Image](https://pbs.twimg.com/media/HN8R3wya8AAYoJi?format=jpg&name=large)

Then Claude Code launched and went vertical pretty quickly. You can hand-wave this as distribution, but the canonically-accepted explanation is that claude code won because it was better, and that it was better because Anthropic RL'd the model **inside the harness** -- the first time a lab trained a model against the exact tools they were going to ship it with. And it got **really, really** good at calling those tools in an agentic loop.

It's one thing to fiddle with tool definitions and evals until you find the shape the model likes best -- I've burned weeks doing this for various use cases. It's a different game when you own the weights and can **modify the model itself** to be better at a particular set of tools.

The OpenAI team [gave a talk in November](https://www.youtube.com/watch?v=wVl6ZjELpBk) that put this pretty well: if you build a harness but you don't own the weights and can't RL the model inside it, you'll always be at a disadvantage to a team that owns both.

## Coding Agent RL in 60 seconds

I did a bunch of research on this topic and cooked up a bunch of visualizations to try to explain the parts that matter, but I found that [Calvin French-Owen](https://x.com/calvinfo) (MTS on the codex team, founder of Segment) did a talk at [AI Council](https://www.youtube.com/watch?v=q-ntX4DLW_c) that did a much better and cleaner job, so I'm just gonna drop this animation here inspired by his slides:

![](https://pbs.twimg.com/amplify_video_thumb/2080401322218758144/img/f7ow19XebOIFqSPf.jpg?name=large)

To make a model better at coding, you're gonna:

1. generate some coding agent traces to solve a problem (e.g. fix my tests)
2. score the traces based on some criteria (verifier)
3. update the model weights to make the good traces more likely, and the bad traces less likely

And then you do this millions of times over the course of weeks or months.

The "scoring" part of these things can tend to be whimsically one-dimensional though.

## There's no penalty for bad design

Take [SWE-bench Multilingual](https://huggingface.co/datasets/SWE-bench/SWE-bench_Multilingual). The tasks are small -- about fifteen minutes of work apiece -- scraped out of open-source repos like Redis, jq, and Django. The reward is one or zero based on:

- **FAIL\_TO\_PASS** - did you fix the thing you were asked to fix?
- **PASS\_TO\_PASS** - did you do it without breaking anything else?

Here's a real one, **fastlane\_\_fastlane-19304**, from [fastlane](https://github.com/fastlane/fastlane) -- a Ruby project. Its zip action grabs two optional params and calls .empty? on them straight away, so the moment you leave include and exclude off, it falls over:

![Image](https://pbs.twimg.com/media/HN8U8yhbMAAZjQj?format=jpg&name=large)

The human fix that closed this particular issue is two lines (default nils to empty arrays):

![Image](https://pbs.twimg.com/media/HN8U_keaIAAotk_?format=jpg&name=large)

During the evaluation, the model

1. starts from a **base commit** -- the repo checked out to the moment right before that fix landed
2. the bug report - in this case 'zip\_command': undefined method 'empty?' for nil:NilClass

The agent goes off and writes some code based on the issue. It doesn't see the golden patch or the **test patch** that serves as the grader:

![Image](https://pbs.twimg.com/media/HN8VCrpbIAACaZp?format=jpg&name=large)

Then:

1. We keep whatever patch it produced, then
2. Throw away any edits it made to the test files (we've caught a model quietly commenting out the failing test or splicing in a mock that makes the test useless)
3. Apply the benchmark's test patch on top, and
4. Run the whole suite: the existing zip tests (PASS\_TO\_PASS) plus the new one (FAIL\_TO\_PASS) to see if they both pass

![Image](https://pbs.twimg.com/media/HN8VNn8bUAA3D4N?format=jpg&name=large)

**Aside** - Benchmarks are not verifiers - in fact they have to be held out from each other (don't train on test, yada yada) - I primarily mean this to convey the shape of "judging the quality of a coding agent trace" and its limitations.

How the model got to a correct answer doesn't matter. If the tests pass, we win, but there is **no penalty** for eroding codebase maintainability.

there is no penalty for eroding codebase maintainability

That's how you get try catches around everything:

![Image](https://pbs.twimg.com/media/HN8VhxEboAAS7gG?format=jpg&name=large)

## Verifying quality is orders of magnitude harder than "did the tests pass"

Running the tests gets you a clean pass or fail in ~seconds. That's why RL can run millions of loops to optimize each model generation.

But the cost function of bad architecture is measured in weeks, months, maybe even years. It happens the first time someone opens that file for a one-line change and realizes they can't make it in one line -- that someone vibed this a little too hard, and now we have to make the same edit in eleven places and hope nothing quietly breaks three files over.

![Image](https://pbs.twimg.com/media/HN8Vr0nakAAEKz4?format=jpg&name=large)

Tests give you feedback in seconds, but the cost function of bad architecture is measured in weeks, months, maybe even years

Bad design is the one thing today's benchmarks can't evaluate. And I know, I know, RL != Benchmarks, but if this was solved in RL, I'm pretty sure it would start to show up in how our benchmarks are designed too.

In any case, I personally don't trust any improvements on today's benchmarks as an indicator that the models are suddenly good at not slopping up your codebase.

## The frontier is getting better, slowly

Of course lots of smart folks are working on this. My point is not that it can't be done, it's that [the hype is outrunning the discipline](https://www.youtube.com/watch?v=c35YoMdnI78).

A few efforts I think are pointed the right way:

- [SWE-Marathon](https://www.swe-marathon.org/) (Abundant AI): ~400-hour tasks like "clone all of Excel, every feature" -- with a compound reward channel instead of a single pass/fail bit
- [DeepSWE](https://deepswe.datacurve.ai/blog/deepswe) (Datacurve): big tasks on OSS repos that were never actually built in the real world, so by construction they can't already be sitting in the training set (solves contamination, but not quality)
- [Frontier Code](https://cognition.com/blog/frontier-code) (Cognition): multi-PR tasks, and a clever move that evaluates quality deterministically -- it penalizes the model for writing tests that don't fail on the pre-patch code (if you've never heard about [mutation testing](https://en.wikipedia.org/wiki/Mutation_testing) you are in for a fun ride[5](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#user-content-fn-5-f56fe9a973fe7c6ebb6a9673c1bc64cb)). It also **runs a judge model over the diff checking code-quality rules**.

![Image](https://pbs.twimg.com/media/HN8VxryaoAAtjN2?format=jpg&name=large)

But a model judging quality can only go so far.

In fact, it's not hard to imagine that if a model could reliably tell good code from bad, it might have written the good version to begin with. RL needs a fast+reliable oracle, and we don't yet have one for maintainability

if a model could reliably tell good code from bad, it might have written the good version to begin with, but maintainability has no fast oracle, so we can't reward for it during RL

Of course, more review agents and more tokens do help -- they raise the floor, catching the dumb stuff.

But they don't move the ceiling, because the ceiling is whatever we managed to teach the model in RL, and good design is the thing we still don't know how to teach it.

So I still wouldn't bet my codebase on any of these. But they're the first evals I've seen even trying to score maintainability instead of stopping at pass/fail.

**Aside** Maybe a future model just gets this and we can stop. If you want to yolo prompts until GPT-7 ships and find out, be my guest -- but bitter lesson be damned, we've got problems to solve now, and I'm gonna walk through how we do that.

## Turning the lights back on

Today I learned that Twitter Articles have a "media limit" which means the rest of this is going into a part II post - stay tuned
