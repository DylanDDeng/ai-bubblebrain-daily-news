---
externalId: "templates-variables"
kind: "article"
title: "Templates & Variables"
description: "HyperFrames explains how typed composition variables turn one video build into reusable templates for personalized local, cloud, and Lambda batch rendering."
date: 2026-07-29
sourceUrl: "https://x.com/HyperFrames_/status/2082197435246600341"
cover: "https://pbs.twimg.com/media/HOVxksYaUAAUjJ9?format=jpg&name=large"
tags: ["HyperFrames", "Templates", "Variables", "Video Automation"]
featured: true
draft: false
---

[Original article by HyperFrames](https://x.com/HyperFrames_/status/2082197435246600341)

# Day 23 of 30: Turning your video into a template

For 22 days, every render in this series has produced exactly one video. New headline meant a new edit. New name meant a new render. Day 23 removes that ceiling. Variables turn a HyperFrames composition into a template, and a template turns one build into as many videos as you have rows of data.

```text
npx hyperframes render --batch rows.json --output "renders/{name}.mp4"
```

One command. One composition. A folder of personalized videos.

## What a variable is

A variable is a typed slot declared on the composition root. The declaration is the schema, and everything else reads from it.

```text
<html data-composition-variables='[
  {"id":"title","type":"string","label":"Title","default":"Hello"},
  {"id":"accent","type":"color","label":"Accent","default":"#66d9ef"}
]'>
```

Seven types are supported: **string** (optional placeholder and maxLength), **number** (min, max, step, unit), **color**, **boolean**, and **enum** (an options list is required). Every declaration must ship a useful default. The composition previews and renders on defaults alone, so it stays a normal video until someone overrides it. Two more types, font and image, cover asset-shaped values.

## Wiring values in, no script required

Most substitutions need zero JavaScript. Three declarative bindings cover the common cases:

- data-var-text="title" swaps the element's own text and preserves its children, so animated spans survive.
- data-var-src="heroImage" swaps an image’s src. The authored src stays in place as the fallback.
- Every scalar variable is applied automatically as a --{id} CSS custom property on the composition root, so color: var(--accent) responds to overrides with no boilerplate.

```text
<h1 class="clip" data-start="0" data-duration="5" data-var-text="title">Fallback</h1>
<img class="clip" data-start="0" data-duration="5" data-var-src="heroImage" src="fallback.jpg" />
```

For anything past direct substitution (loops, conditionals, derived values) read the values once at init:

```text
const { title = "Untitled", accent = "#66d9ef" } = __hyperframes.getVariables();
```

Sub-compositions get the same treatment per instance. One card.html can appear three times in a master file with three different titles via data-variable-values:

```text
<div
  data-composition-id="card-pro"
  data-composition-src="compositions/card.html"
  data-variable-values='{"title":"Pro","accent":"#ff4d4f"}'
></div>
```

## Overriding at render time

Values come in from the CLI as plain JSON:

```text
# Inline JSON
npx hyperframes render --variables '{"title":"Q4 Report"}'

# From a file
npx hyperframes render --variables-file vars.json

# CI mode: undeclared keys and wrong types become errors
npx hyperframes render --variables '{"title":"Q4"}' --strict-variables
```

And then the flag that changes what the tool is. Batch mode points the renderer at a file of data rows, and the output path takes {key} placeholders from each row:

```text
npx hyperframes render --batch rows.json --output "renders/{name}.mp4"
```

Each row merges over the declared defaults exactly as if it had been passed with --variables. Ten rows in, ten videos out.

## Rendering the fleet in the cloud

Day 21 covered cloud rendering. Templates are the reason that infrastructure exists. Two paths, same idea: the template goes up once, and every render after that is just a new set of values.

**HeyGen-hosted cloud.** The first render uploads the project and prints an asset\_id. Every render after that reuses it. No re-zip, no re-upload:

```text
# Upload and render once
hyperframes cloud render ./card-template

# Re-render with new values, skipping the upload entirely
hyperframes cloud render --asset-id asst_abc123 --variables '{"name":"Ada"}'
hyperframes cloud render --asset-id asst_abc123 --variables '{"name":"Linus"}'
```

**Your own AWS.** Deploy the Lambda stack once, upload the template once with lambda sites create, then feed lambda render-batch a JSONL file with one line per recipient. Each line is an object with its own outputKey and variables. It runs 50 renders concurrently by default:

```text
hyperframes lambda render-batch ./my-template \
  --site-id abc1234deadbeef0 \
  --batch ./recipients.jsonl \
  --width 1920 --height 1080
```

For local projects the CLI validates your variables against the declared schema before anything uploads. For asset-id renders the check happens server side.

## Field notes

- **Two JSON shapes, easy to confuse.** The declaration is an array of {id, type, label, default} objects. The values are an object keyed by id. Mixing them up is the number one variables mistake.
- **Precedence is per composition, not one global chain.** A sub-composition reads its own declared defaults, overridden by data-variable-values on its host. CLI values override the top-level composition only, and never reach a sub-composition.
- **Not everything can be a variable.** Canvas size, root duration, frame rate, and codec are parsed once at compile time. Variables change content, not the container.
- **Media src is not variable-swappable.** data-var-src works on an \<img>, but on \<video> and \<audio> the renderer plays and mixes the authored src, so a variable-swapped src never reaches the output. To vary framework-owned media, change the authored src, one sub-composition instance per clip.
- **Variables carry data, not files.** The convention across every deploy target: typed values go in variables, and media assets go in as URL references the composition resolves at render time.

## How we built today's video

Today's film is the feature demonstrating itself. There is exactly one card composition in the project, compositions/card.html, and it declares three variables: a label, a title, and an accent color. The master file instances that single template eight times. The first instance passes no values at all, so what you see is the card running on its declared defaults. Then Austin, Seattle, Atlanta, and Miami each arrive as a data-variable-values override on a new instance, and the closing grid is four more instances side by side. Nothing on screen was designed twice. Four city market updates, one template, and the only thing that changed between them is a row of JSON.

## Output

The finished Day 23 video: 22 seconds, four cities, one template.

![](https://pbs.twimg.com/amplify_video_thumb/2082196246132092928/img/UndjWtJC1tc33Zq0.jpg?name=large)

⭐ If this series is useful, [star the HyperFrames repo](https://github.com/heygen-com/hyperframes).

- Variables docs: [hyperframes.heygen.com/concepts/variables](https://hyperframes.heygen.com/concepts/variables)
- Cloud templates: [hyperframes.heygen.com/deploy/cloud](https://hyperframes.heygen.com/deploy/cloud#templates-and-variables)
- Templates on Lambda: [hyperframes.heygen.com/deploy/templates-on-lambda](https://hyperframes.heygen.com/deploy/templates-on-lambda)
- Install the skills: npx skills add heygen-com/hyperframes
