---
externalId: "cloud-rendering"
kind: "article"
title: "Cloud Rendering"
description: "HyperFrames explains how its cloud renderer moves the same project from local Chrome and FFmpeg to managed infrastructure, including templates, CI, callbacks, and idempotent production workflows."
date: 2026-07-26
sourceUrl: "https://x.com/HyperFrames_/status/2081491370485952790"
cover: "https://pbs.twimg.com/media/HOLvr4jaAAAJHtE?format=jpg&name=large"
tags: ["HyperFrames", "Cloud Rendering", "Video", "Automation"]
featured: true
draft: false
---

[Original article by HyperFrames](https://x.com/HyperFrames_/status/2081491370485952790)

![Image](https://pbs.twimg.com/media/HOLvr4jaAAAJHtE?format=jpg&name=large)

# Day 21 of 30: A different way to render

For twenty days, every video in this series has ended the same way: hyperframes render, a Chrome window you never see, an FFmpeg pass, and an MP4 on the local disk. That works great when the machine doing the asking is a laptop with the whole toolchain installed. Day 21 is about what happens when it is not.

## What cloud rendering is

Cloud rendering runs the exact same render on HeyGen's managed infrastructure instead of your machine. The CLI zips your project, uploads it, renders it in the cloud, and downloads the finished video back to disk. No local Chrome. No FFmpeg. No AWS account to babysit. Billing is credit based: you pay per render, not per idle server.

The entire workflow is two commands:

```text
hyperframes auth login
hyperframes cloud render
```

That is genuinely the whole thing. Everything below is detail.

## How to use it

Sign in once

`hyperframes auth login` opens a browser, runs OAuth, and stores credentials at `~/.heygen/credentials` with locked-down permissions. Check yourself with `hyperframes auth status`.

On a CI box or anywhere without a browser, use an API key instead:

```text
echo "$HEYGEN_API_KEY" | hyperframes auth login --api-key
```

The CLI also reads `HEYGEN_API_KEY` straight from the environment, so in most pipelines you set one secret and never think about auth again. Credentials are shared with the standalone heygen CLI: sign in once, both tools work.

## What happens when you render

`hyperframes cloud render` resolves your project folder, reads the aspect ratio straight from your composition's `data-width` and `data-height` (no flag needed), zips everything up, uploads it, submits the render, polls until it finishes, and drops the video in `renders/`.

The zip step is smarter than it sounds. It automatically excludes `renders/`, `snapshots/`, `.git`, `node_modules`, and the usual dev clutter. The upload limit is 200 MB, and if your project carries heavy source footage you can trim the archive with a `.hyperframesignore` file, which works exactly like `.gitignore`. Not sure what will get shipped? Ask first:

```text
hyperframes cloud render . --dry-run
```

## The dials

Every knob from local rendering is here: `--fps` up to 240, `--quality` draft to high, `--format` mp4, webm, or mov (webm and mov carry alpha, so transparent overlays render in the cloud too), and `--resolution` 1080p or 4k. Two fine-print notes on 4k: it bills at 1.5x credits, and it is mp4 only (the alpha formats render at native resolution). A full-dress render looks like this:

```text
hyperframes cloud render . \
  --composition compositions/intro.html \
  --quality high --fps 60 \
  --output ./renders/intro.mp4
```

## The part that changes how you work: templates

Here is the feature that makes cloud rendering more than "my render, but elsewhere." A HyperFrames composition can declare variables: a title, a name, a theme. Upload the project once, then re-render it with different values, and the zip step never happens again:

```text
# First run uploads the project and prints an asset id
hyperframes cloud render ./card-template

# Every run after that reuses it
hyperframes cloud render --asset-id asst_abc123 --variables '{"name":"Ada"}'
hyperframes cloud render --asset-id asst_abc123 --variables '{"name":"Linus"}'
```

One upload, a hundred personalized videos, zero re-zipping. This is the shape of every "generate a custom video per user" product you have ever seen, and it is one flag.

## Fire and forget

You do not have to sit and watch the poll. `--no-wait` submits the render and exits immediately with a render id, and `--callback-url` sends a webhook to your server when the video is done. Later, manage everything from the CLI:

```text
hyperframes cloud list          # recent renders
hyperframes cloud get hfr_def456    # status + fresh download URL
hyperframes cloud delete hfr_def456
```

One production note: retries. If your script resubmits after a network blip, pass `--idempotency-key` with any unique string and the platform guarantees you get one asset and one bill, not two.

## Why this matters with HyperFrames

HyperFrames is built for agents, and agents do not always live on a MacBook. A CI job that renders a changelog video on every release. A serverless function that answers a webhook with a personalized clip. A teammate who wants to render your project without installing anything. None of those machines want Chrome and FFmpeg on them, and now none of them need it: rendering becomes an API call.

The full picture:

- `hyperframes render` for authoring: the fastest loop while you build, everything local.
- `hyperframes cloud render` for shipping: zero infrastructure, HeyGen runs it, credits per render.

You write the composition once. Where it renders is a deployment decision, not a rewrite.

## The real run

Day 21's own sting is the proof. We built an 8 second title sting from three assets (the day's pattern loop, the title wordmark, the lockup), checked it locally, then sent the exact same project up with one command. Here is the actual terminal output:

```text
$ hyperframes cloud render . --quality high

   Detected aspect ratio: 1:1 (from index.html dims 1080x1080)

◆  Zipping day21-sting
   16 files · 20.5 MB

◆  Uploading (direct-to-S3)
   asset_id: 057fdac497f240cc8d7914ed66da76eb · 2.6s

  Polling every 10s …
  rendering  0.2s
  completed  51.9s

◆  Downloading to renders/video-cloud.mp4
   25.3 MB written
```

52 seconds from submit to downloaded video, and no Chrome window ever opened on our machine. We frame-compared the cloud render against the local one: pixel-identical color. Same video, different computer.

**Output:**

![](https://pbs.twimg.com/amplify_video_thumb/2081490257699274752/img/Zzhd9JB5miRCdg9b.jpg?name=large)

**⭐** **If this series is useful,** [star the HyperFrames repo](https://github.com/heygen-com/hyperframes)**.**

**Cloud rendering docs:** [hyperframes.heygen.com/deploy/cloud](https://hyperframes.heygen.com/deploy/cloud)

**Install the skills: npx skills add heygen-com/hyperframes**
