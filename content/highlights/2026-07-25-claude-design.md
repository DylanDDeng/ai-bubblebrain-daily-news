---
externalId: "claude-design"
kind: "article"
title: "Claude Design"
description: "HyperFrames 介绍 Claude Design 如何基于品牌设计系统生成可直接使用的 HTML 和 CSS，以及如何交给 Claude Code 完成更稳定的视频制作流程。"
date: 2026-07-25
sourceUrl: "https://x.com/HyperFrames_/status/2081184676430160379"
cover: "https://pbs.twimg.com/media/HOHZIi2awAAbSIF?format=jpg&name=large"
tags: ["Claude", "设计", "HyperFrames", "视频"]
featured: true
draft: false
---

[原文：Claude Design — HyperFrames](https://x.com/HyperFrames_/status/2081184676430160379)

![图片](https://pbs.twimg.com/media/HOHZIi2awAAbSIF?format=jpg&name=large)

# 30 天第 20 天：用 Claude Design 制作 HyperFrames

这个系列的前十九天都从同一个起点开始：设计已经存在。HyperFrames 会捕获一个网站，从像素中读出品牌特征，再把它写进一个 [FRAME.md](http://frame.md/) 文件。这套方法之所以有效，是因为已经有人完成了设计工作。

第 20 天讨论的是另一半：当设计还不存在时该怎么办。Anthropic 正好为这个时刻提供了一款工具，而它的工作方式有一个很方便的特点，因此可以直接接入 HyperFrames 的流程。

## 什么是 Claude Design

[Claude Design](https://claude.com/product/design) 是 Anthropic 的设计工具，目前以研究预览的形式在 [claude.ai/design](https://claude.ai/design) 上向 Pro、Max、Team 和 Enterprise 套餐开放。你描述自己想要的东西，Claude 就会在画布上完成设计；然后你可以像使用设计工具一样继续打磨，而不是困在聊天窗口里：点击某个元素留下行内评论，拖动它生成的滑块调整颜色和字号，或者直接编辑对象。

有两个特点，让它不同于过去所有“AI 帮你生成模型稿”的工具：

- **它有审美。** 背后的模型专门针对设计工作训练，结果里看得出来。布局、间距和字体都像是经过推敲，而不是随手生成。它可能是迄今最接近“面向非设计师的 Figma”的产品，但又更简单：不需要学习画板，也没有钢笔工具，只有意图和迭代。
- **它会先学习你的品牌。** 在引导过程中，Claude Design 会读取你的代码库和设计文件，为团队建立一套设计系统。之后的每一个项目都会自动使用你的颜色、字体和组件。

## 关键突破

它生成的一切从一开始就符合品牌规范，而不需要事后纠正。

我们的 HeyGen 设计系统已经放在里面：ABC Solar Display 和 TT Norms Pro 字体家族、完整的颜色 token，以及从按钮到播放器控件的大约四十个真实组件。因此，当我们让 Claude Design 构思某个画面、标题卡或片尾画面时，它并不是在猜 HeyGen 应该长什么样，而是在使用产品实际发布时所用的同一套积木进行组合。

## 如何和 HyperFrames 配合使用

下面这个特点让它不只是一个设计案例，也是一个视频案例：Claude Design 项目是真正的 HTML 和 CSS，而 HyperFrames 正是从 HTML 渲染视频。两者之间不需要任何转换层。

整个流程分为四步：

1. **把设计系统交给它。** 引导流程可以从代码库和设计文件中建立一套设计系统；你也可以在 Claude Code 中使用 /design-sync，同步已有的组件库。
2. **在 Claude Design 中构思。** 描述你想要的画面，通过评论、滑块和细微调整不断迭代，直到审美方向正确。这就是“面向非设计师的 Figma”环节。
3. **下载项目。** 得到的不是一张设计截图，而是设计本身：可以运行的 HTML、CSS、字体和 token。
4. **把它交给 Claude Code。** 因为 HyperFrames 使用的是同一种语言，下载下来的设计并不是一份需要重新实现的参考图，而是可以直接使用的源材料。Claude Code 会把它放进合成项目并添加动画：布局变成场景，组件变成演员。

一边是设计工具，另一边是视频工具；因为两边都使用 HTML，它们之间的边界也就消失了。

实际运行

我们用第 20 天的内容亲自走了一遍流程。把 Prism 设计系统和当天使用的背景图案作为附件，只给 Claude Design 输入了一句话：

```text
make me a 15 sec sizzle animation for HeyGen HyperFrames Day 20 Claude Design. using our brand fonts and colors
```

在接触画布之前，它先问了制作人会问的问题：视频会放在哪里、使用什么宽高比、怎样使用上传的图案、整体语气、字体和音频。我们回答了真正重要的问题——用于落地页循环播放、1:1 方形画面、把图案用作背景、文件本身不带音频以便后期添加音乐——然后让它自行决定其余细节。

![图片](https://pbs.twimg.com/media/HOHYfL1bsAA_4FV?format=jpg&name=large)

最终得到的是一段 15 秒、1080 × 1080 的循环宣传动画，共有四个节拍：二十个画面组成的网格逐个亮起；使用 ABC Solar Display 字体显示 HYPERFRAMES 标题；计数器滚动到 Day 20；最后是 HeyGen 品牌组合标志的片尾卡。胶片界面元素使用 TT Norms Pro Mono，点缀色是 Prism 蓝，背景图案也被调成接近品牌蓝的色调。它甚至自带一个 Tweaks 调节面板，可以控制图案透明度、强调色和胶片界面开关。

导出只需点击一次。先点 Share，再点 Export，你会同时得到 MP4，以及这一天真正讨论的东西：完整的 HTML 项目。

![图片](https://pbs.twimg.com/media/HOHqqLBbsAAY2eS?format=png&name=large)

接下来，这个下载下来的 HTML 项目会被交给 Claude Code。这里如实说明我们遇到的一个问题：导出视频的背景发生了闪烁。Claude Design 的播放器会在每个场景里重新启动图案视频，而它的导出器又逐帧推进视频，因此背景始终无法稳定下来。请记住这一点，因为解决它恰恰就是交接给 Claude Code 的意义。

## 最终成果

我们把下载的项目交给 Claude Code，并将它重新构建为一个 HyperFrames 合成项目。四个场景相同，字体相同，缓动曲线也相同，只做了一项结构调整：图案视频改成单个连续背景层，在整段视频下方只播放一次，而不再在每个场景中重新开始。HyperFrames 在渲染时接管媒体播放，因此背景可以做到逐帧精确。逐帧测量后可以看到，旧导出的背景会在每次场景切换时跳动，而这个版本在完整的 15 秒内都保持稳定。

**输出：**

![](https://pbs.twimg.com/amplify_video_thumb/2081182786984222720/img/HXOnWsItNGEAEON7.jpg?name=large)

## 进阶玩法：让 Claude Design 学会 HyperFrames 的语言

上面的流程使用的是开箱即用的 Claude Design，因此导出结果在接入时还需要重新构建。其实有一条官方捷径。HyperFrames 提供了一个专门为这种组合方式编写的指令文件：[claude-design-hyperframes.md](https://github.com/heygen-com/hyperframes/blob/main/docs/guides/claude-design-hyperframes.md)。

在新的 Claude Design 对话中附上这个文件，再加入你的需求说明、截图和品牌素材。它会向 Claude Design 提供已经符合 HyperFrames 规范、并且内置结构规则的项目骨架，让模型把审美能力花在配色、字体、场景内容和 GSAP 动效上，而不是格式上。最终得到的是一个可以直接使用的 HyperFrames 项目，其中包含 index.html、preview.html、README.md 和 DESIGN.md。

下载后，在 Claude Code（或 Cursor）中继续打磨：

```text
npx skills add heygen-com/hyperframes
npx hyperframes lint
npx hyperframes preview
```

官方指南给出了三个建议：

- **附件比其他方式都有效。** 截图和品牌指南对设计方向的影响比粘贴文本更强，而两者又都比 URL 更有效。
- **不要在面板里判断动效。** 面板内的预览拖动器并不可靠，请在本地预览。
- **Claude Design 不会执行 lint。** 在本地运行 `npx hyperframes lint`，在渲染前发现结构问题。

⭐ 如果这个系列对你有帮助，请为 [HyperFrames 仓库点一颗 Star](https://github.com/heygen-com/hyperframes)。

- Claude Design：[claude.ai/design](https://claude.ai/design) · [官方公告](https://www.anthropic.com/news/claude-design-anthropic-labs)
- 官方配套指南：[Claude Design for HyperFrames](https://hyperframes.heygen.com/guides/claude-design)
- 安装 Skills：npx skills add heygen-com/hyperframes

第 20 天完成。还剩 10 天。
