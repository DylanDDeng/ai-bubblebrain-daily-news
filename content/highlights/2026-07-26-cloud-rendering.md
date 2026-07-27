---
externalId: "cloud-rendering"
kind: "article"
title: "云端渲染"
description: "HyperFrames 介绍如何将同一个视频项目从本地 Chrome 与 FFmpeg 迁移到托管云端，并覆盖模板复用、CI、回调和幂等生产流程。"
date: 2026-07-26
sourceUrl: "https://x.com/HyperFrames_/status/2081491370485952790"
cover: "https://pbs.twimg.com/media/HOLvr4jaAAAJHtE?format=jpg&name=large"
tags: ["HyperFrames", "云端渲染", "视频", "自动化"]
featured: true
draft: false
---

[原文：Cloud Rendering — HyperFrames](https://x.com/HyperFrames_/status/2081491370485952790)

![图片](https://pbs.twimg.com/media/HOLvr4jaAAAJHtE?format=jpg&name=large)

# 30 天第 21 天：换一种渲染方式

在前二十天里，这个系列的每一支视频都以相同的方式结束：运行 `hyperframes render`，启动一个你看不到的 Chrome 窗口，经过一次 FFmpeg 处理，最后在本地磁盘上得到一个 MP4。当发起请求的机器是一台装好了完整工具链的笔记本电脑时，这套方法非常好用。第 21 天要讨论的是：如果那台机器不是这样的环境，会发生什么。

## 什么是云端渲染

云端渲染会在 HeyGen 的托管基础设施上运行完全相同的渲染，而不是使用你的机器。CLI 会压缩项目、上传到云端、完成渲染，再把成片下载回本地磁盘。不需要本地 Chrome，不需要 FFmpeg，也不需要维护 AWS 账号。计费以点数为基础：按每次渲染付费，而不是为空闲服务器付费。

整个流程只有两条命令：

```text
hyperframes auth login
hyperframes cloud render
```

真的就是这么简单。下面的内容全是细节。

## 如何使用

只需登录一次

`hyperframes auth login` 会打开浏览器、完成 OAuth 流程，并以严格受限的文件权限把凭据存储在 `~/.heygen/credentials`。可以运行 `hyperframes auth status` 检查当前状态。

在 CI 机器或任何没有浏览器的环境里，可以改用 API Key：

```text
echo "$HEYGEN_API_KEY" | hyperframes auth login --api-key
```

CLI 也会直接从环境中读取 `HEYGEN_API_KEY`，因此在大多数流水线中，你只需设置一个 secret，之后就不用再考虑认证。凭据还会与独立的 heygen CLI 共享：登录一次，两个工具都能使用。

## 渲染时会发生什么

`hyperframes cloud render` 会定位项目文件夹，直接从合成项目的 `data-width` 和 `data-height` 读取宽高比（不需要额外参数），把所有内容压缩、上传并提交渲染任务，轮询到任务完成，最后将视频放入 `renders/`。

压缩步骤比听上去更智能。它会自动排除 `renders/`、`snapshots/`、`.git`、`node_modules` 和常见的开发杂项。上传上限是 200 MB；如果项目包含体积很大的源视频，可以用 `.hyperframesignore` 文件精简压缩包，它的工作方式和 `.gitignore` 完全一样。不确定哪些内容会被上传？可以先查看：

```text
hyperframes cloud render . --dry-run
```

## 可调参数

本地渲染中的所有控制项都可以使用：`--fps` 最高支持 240；`--quality` 可以从 draft 调到 high；`--format` 支持 mp4、webm 或 mov（webm 和 mov 可以携带 Alpha 通道，因此透明叠加层也能在云端渲染）；`--resolution` 支持 1080p 或 4k。关于 4k 有两个小细节：它按 1.5 倍点数计费，而且只支持 mp4（带 Alpha 的格式会按原生分辨率渲染）。一条完整配置的渲染命令如下：

```text
hyperframes cloud render . \
  --composition compositions/intro.html \
  --quality high --fps 60 \
  --output ./renders/intro.mp4
```

## 真正改变工作方式的部分：模板

下面这个功能让云端渲染不只是“把我的渲染放到别的地方执行”。HyperFrames 合成项目可以声明变量，例如标题、名字和主题。只需上传一次项目，之后就可以用不同的变量值反复渲染，再也不需要重新压缩：

```text
# 首次运行会上传项目并输出 asset id
hyperframes cloud render ./card-template

# 之后的每次运行都复用这个项目
hyperframes cloud render --asset-id asst_abc123 --variables '{"name":"Ada"}'
hyperframes cloud render --asset-id asst_abc123 --variables '{"name":"Linus"}'
```

上传一次，生成一百支个性化视频，完全不需要重复压缩。你见过的所有“为每位用户生成定制视频”产品，本质上都是这种形态，而这里只需要一个参数。

## 提交后就不用管

你不必坐在那里盯着轮询过程。`--no-wait` 会提交渲染任务，然后立即携带 render id 退出；`--callback-url` 会在视频完成时向你的服务器发送 Webhook。之后可以通过 CLI 管理所有任务：

```text
hyperframes cloud list          # 最近的渲染任务
hyperframes cloud get hfr_def456    # 状态和新的下载 URL
hyperframes cloud delete hfr_def456
```

生产环境里还要注意重试。如果脚本在网络短暂中断后重新提交，请通过 `--idempotency-key` 传入任意唯一字符串。平台会保证你只得到一个素材、只产生一次账单，而不是两份。

## 为什么这对 HyperFrames 很重要

HyperFrames 是为 Agent 构建的，而 Agent 并不总是运行在 MacBook 上。它可能是一项在每次发布时生成更新日志视频的 CI 任务，也可能是一个收到 Webhook 后返回个性化视频的 Serverless 函数，或者是一位不想安装任何工具、但需要渲染你项目的同事。这些机器都不想安装 Chrome 和 FFmpeg，而现在它们也不再需要：渲染变成了一次 API 调用。

完整的分工如下：

- 使用 `hyperframes render` 进行创作：构建过程中的最快反馈循环，一切都在本地完成。
- 使用 `hyperframes cloud render` 进行交付：不需要基础设施，由 HeyGen 负责运行，按每次渲染消耗点数。

合成项目只需要编写一次。在哪里渲染是一个部署决策，不需要重写项目。

## 实际运行

第 21 天自己的片头短动画就是证明。我们用三项素材——当天的循环图案、标题字标和品牌组合标志——制作了一段 8 秒的标题动画，在本地检查后，只用一条命令就把完全相同的项目发送到云端。下面是真实的终端输出：

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

从提交到视频下载完成一共用了 52 秒，而且我们的机器上从未打开过 Chrome 窗口。我们逐帧对比了云端渲染和本地渲染：颜色在像素层面完全一致。同一支视频，只是换了一台电脑。

**输出：**

![](https://pbs.twimg.com/amplify_video_thumb/2081490257699274752/img/Zzhd9JB5miRCdg9b.jpg?name=large)

**⭐ 如果这个系列对你有帮助，请为 [HyperFrames 仓库点一颗 Star](https://github.com/heygen-com/hyperframes)。**

**云端渲染文档：** [hyperframes.heygen.com/deploy/cloud](https://hyperframes.heygen.com/deploy/cloud)

**安装 Skills：`npx skills add heygen-com/hyperframes`**
