---
externalId: "claude-design"
kind: "article"
title: "Claude Design"
description: "HyperFrames explains how Claude Design's brand-aware HTML and CSS output can move directly into a video workflow, and where Claude Code improves the final render."
date: 2026-07-25
sourceUrl: "https://x.com/HyperFrames_/status/2081184676430160379"
cover: "https://pbs.twimg.com/media/HOHZIi2awAAbSIF?format=jpg&name=large"
tags: ["Claude", "Design", "HyperFrames", "Video"]
featured: true
draft: false
---

[Original article by HyperFrames](https://x.com/HyperFrames_/status/2081184676430160379)

![Image](https://pbs.twimg.com/media/HOHZIi2awAAbSIF?format=jpg&name=large)

# Day 20 of 30: Hyperframes with Claude Design

Nineteen days of this series have started from the same place: the design already exists. HyperFrames captures a website, reads the brand out of the pixels, and writes it into a [FRAME.md](http://frame.md/). That works because somebody already did the design work.

Day 20 covers the other half: when the design does not exist yet. Anthropic has a tool for exactly that moment, and because of one convenient fact about how it works, it plugs straight into a HyperFrames pipeline.

## What Claude Design is

[Claude Design](https://claude.com/product/design) is Anthropic's design tool, live at [claude.ai/design](https://claude.ai/design) as a research preview for Pro, Max, Team, and Enterprise plans. You describe what you want, Claude designs it on a canvas, and you refine it the way you would in a design tool instead of a chat window: click an element and leave an inline comment, drag the sliders it spawns for color and type size, or just edit the thing directly.

Two details make it different from every "AI makes you a mockup" tool before it:

- **It has taste.** The model behind it is trained for design work, and it shows. Layouts, spacing, and type come out considered instead of generated. It is the closest thing yet to Figma for non-designers, but simpler: no artboards to learn, no pen tool, just intent and iteration.
- **It learns your brand first.** During onboarding, Claude Design builds a design system for your team by reading your codebase and design files. Every project after that automatically uses your colors, your typography, your components.

## The unlock

Everything it produces is on-brand by construction instead of by correction.

Our HeyGen design system already lives in it: the ABC Solar Display and TT Norms Pro families, the full color token set, and about forty real components, from buttons to player controls. So when we ask Claude Design to ideate a frame, a title card, or an end screen, it is not guessing at HeyGen's look. It is composing with the same pieces our product ships with.

## Using it with HyperFrames

Here is the part that makes this a video story and not just a design story: Claude Design projects are real HTML and CSS. And HyperFrames renders video from HTML. There is no translation layer between the two.

So the workflow is four steps:

1. **Give it your design system.** Onboarding builds one from your codebase and design files, or sync an existing component library from Claude Code with /design-sync.
2. **Ideate in Claude Design.** Describe the frames you want. Comment, slide, and nudge until the taste is right. This is the Figma-for-non-designers step.
3. **Download the project.** What comes out is not a screenshot of a design. It is the design: working HTML, CSS, fonts, and tokens.
4. **Hand it to Claude Code.** Because HyperFrames speaks the same language, the downloaded design is not a reference to recreate. It is source material. Claude Code drops it into the composition and animates it: the layout becomes the scene, the components become the cast.

Design tool on one side, video tool on the other, and the border between them disappears because both sides are HTML.

The real run

We did this for Day 20 itself. One sentence into Claude Design, with the Prism design system and the day's background pattern attached:

```text
make me a 15 sec sizzle animation for HeyGen HyperFrames Day 20 Claude Design. using our brand fonts and colors
```

Before touching the canvas it asked the questions a producer would ask: where the video will live, what aspect ratio, how to use the uploaded pattern, tone, typography, audio. We answered the ones that mattered (a landing page loop, 1:1 square, the pattern as the background, no audio in the file so music can come in post) and told it to decide the rest.

![Image](https://pbs.twimg.com/media/HOHYfL1bsAA_4FV?format=jpg&name=large)

What came back was a 15 second, 1080 by 1080 looping sizzle in four beats: a grid of twenty frames lighting up one by one, the HYPERFRAMES title in ABC Solar Display, a counter rolling to Day 20, and the HeyGen lockup end card. TT Norms Pro Mono for the film chrome, Prism blue accents, the pattern tinted toward brand blue. It even shipped its own Tweaks panel: pattern opacity, accent color, and a film-chrome toggle.

Exporting is one click. Share, then Export, and you get the MP4 next to the thing this whole day is about: the entire project as HTML.

![Image](https://pbs.twimg.com/media/HOHqqLBbsAAY2eS?format=png&name=large)

That downloaded HTML project is what goes to Claude Code next. One honest note from our run: the export's background flickered. Claude Design's player restarts the pattern video in every scene and its exporter steps through the video frame by frame, so the bed never settles. Keep that in mind, because fixing it is exactly what the handoff is for.

## The final output

We handed the downloaded project to Claude Code and rebuilt it as a HyperFrames composition. Same four scenes, same type, same easings. One structural change: the pattern video becomes a single continuous background layer that plays once under the whole cut instead of restarting in every scene. HyperFrames owns media playback at render time, so the bed is frame-exact. Measured frame to frame, the old export's background jumped at every scene cut. This one holds steady for the full 15 seconds.

**Output:**

![](https://pbs.twimg.com/amplify_video_thumb/2081182786984222720/img/HXOnWsItNGEAEON7.jpg?name=large)

## The pro move: teach Claude Design to speak HyperFrames

Everything above used Claude Design out of the box, which is why the export needed a rebuild on the way in. There is an official shortcut. HyperFrames ships an instruction file, [claude-design-hyperframes.md](https://github.com/heygen-com/hyperframes/blob/main/docs/guides/claude-design-hyperframes.md), built for exactly this pairing.

Attach that file in a new Claude Design chat along with your brief, screenshots, and brand assets. It hands Claude Design pre-valid HyperFrames skeletons with the structural rules already embedded, so the model spends its taste on palette, typography, scene content, and GSAP motion instead of on format. What comes back is a ready HyperFrames project: index.html, preview.html, README.md, and DESIGN.md.

Download it and refine in Claude Code (or Cursor):

```text
npx skills add heygen-com/hyperframes
npx hyperframes lint
npx hyperframes preview
```

Three tips from the official guide:

- **Attachments beat everything.** Screenshots and brand guides steer the design harder than pasted text, and both beat URLs.
- **Do not judge motion in the pane.** The in-pane preview scrubber is unreliable; preview locally.
- **Claude Design does not lint.** Run npx hyperframes lint locally to catch structural issues before you render.

⭐ If this series is useful, [star the HyperFrames repo](https://github.com/heygen-com/hyperframes).

- Claude Design: [claude.ai/design](https://claude.ai/design) · [announcement](https://www.anthropic.com/news/claude-design-anthropic-labs)
- Official pairing guide: [Claude Design for HyperFrames](https://hyperframes.heygen.com/guides/claude-design)
- Install the skills: npx skills add heygen-com/hyperframes

Day 20 down. 10 to go.
