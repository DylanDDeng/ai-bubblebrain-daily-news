---
title: "6 个实用的 Codex App 技巧"
slug: "codex-app-practical-tips"
description: "从自由聊天、内置浏览器和 Computer Use，到 Plan、Agent Team、Memory 与 Chronicle，整理 Codex App 的实用玩法。"
date: 2026-04-20
weight: 2
tags:
  ["Codex", "Codex App", "使用技巧", "Computer Use", "Agent Team", "Chronicle"]
author: "BubbleBrain"
sourceUrl: "https://mp.weixin.qq.com/s/gJnEGiCM4Jm_th1MqYal0g"
---

> 本文由 BubbleBrain 发布于微信公众号，原题为《分享几个我觉得好用的codex技巧给你》。[查看原文](https://mp.weixin.qq.com/s/gJnEGiCM4Jm_th1MqYal0g)

这是 Bubble 2026 年的第 44 篇更新。

OpenAI 对桌面端 Codex App 进行大更新后，它不再只是一个写代码的工具。日常聊天、网页浏览、文档编写和电脑操作，现在都可以在 Codex 中完成。

![“总之，牛逼”熊猫头表情](/media/codex-tutorials/codex-app-practical-tips/img_001.png)

下面整理几个我觉得有意思、也很实用的玩法。

## 1. 使用 Chat 直接聊天

在日常 Vibe Coding 过程中，经常会突然想起另一个问题，需要临时问一下 AI。

以前使用 Codex 时，开启对话前必须先选择项目路径。新版 Codex 新建聊天窗口后，可以选择“不在项目中工作”，直接开始普通对话。

![Codex 新建聊天时选择不在项目中工作](/media/codex-tutorials/codex-app-practical-tips/img_002.png)

这样就不需要为了一个临时问题切换到其他聊天应用。

## 2. 内置浏览器与评论模式

Codex App 加入内置浏览器后，可以直接在右侧预览网页，不必再切换到系统浏览器。

![在 Codex 内置浏览器中预览网页](/media/codex-tutorials/codex-app-practical-tips/img_003.png)

如果对页面中的某个区域不满意，可以打开右上角的评论模式，直接点击页面元素并留下修改意见。

![在浏览器评论模式中选择页面元素](/media/codex-tutorials/codex-app-practical-tips/img_004.png)

评论会自动成为对话附件，发送给 Codex 后，它就能准确知道需要修改的位置。

![页面评论作为附件加入 Codex 对话](/media/codex-tutorials/codex-app-practical-tips/img_005.png)

有了这个功能，修改前端时不再需要反复截图和描述位置。

## 3. Computer Use

Computer Use 不是全新功能，但它是最近 Codex 更新中非常实用的一项能力。GPT-5.4 也针对 Computer Use 做过专门优化。

它以插件形式出现在 Codex 中。除此之外，Codex 还有 Gmail、Hugging Face 等插件，也提供了用于开发自定义插件的工具。

![Codex 的 Computer Use 与其他插件](/media/codex-tutorials/codex-app-practical-tips/img_006.png)

![用于开发 Codex 插件的工具](/media/codex-tutorials/codex-app-practical-tips/img_007.png)

开启权限后，Codex 可以操作电脑上的其他应用。例如打开备忘录并记录内容。

![Codex 使用 Computer Use 操作备忘录](/media/codex-tutorials/codex-app-practical-tips/img_008.png)

整体速度已经比较快，而且操作过程不会持续抢占主屏幕，体验比以前顺畅很多。

## 4. Plan 模式

Codex App 同样支持 Plan 模式。我通常不会在每次写代码时都开启它，因为 GPT 系列模型本身已经比较谨慎，思考时间也较长。

![对 AI 模型口头禅感到崩溃的表情](/media/codex-tutorials/codex-app-practical-tips/img_009.jpeg)

当一个功能还没有想清楚，或者需要先梳理思路时，Plan 模式会更有帮助。它适合在真正修改代码前，先确定目标、约束和实施步骤。

## 5. Agent Team

在进行深入研究、定位复杂 Bug 或理解大型代码实现时，可以让 Codex 组建 Agent Team。

开启方式很简单，可以直接告诉 Codex：

> 开启一个 Agent Team，解决……

![要求 Codex 开启 Agent Team](/media/codex-tutorials/codex-app-practical-tips/img_010.png)

Codex 会创建多个 Agent，并为它们分配不同任务。

![Codex 创建并命名多个 Agent](/media/codex-tutorials/codex-app-practical-tips/img_011.jpeg)

这个功能在单个 Agent 难以解决的问题上可能有奇效，但 Token 消耗也会明显增加，Plus 用户需要谨慎使用。

## 6. Memory 与 Chronicle

Memory 需要一段时间积累，才能在日常使用中逐渐体现价值。Chronicle 则通过屏幕截图补足当前上下文。

在设置中打开 **Personalization**，然后启用 **Memory** 和 **Chronicle**。

![在 Codex 设置中启用 Memory 与 Chronicle](/media/codex-tutorials/codex-app-practical-tips/img_012.png)

Chronicle 会以 Skill 的形式存在，不会在每次对话中强制调用。

![Chronicle 作为 Codex Skill 出现](/media/codex-tutorials/codex-app-practical-tips/img_013.png)

### 通过屏幕理解问题

例如，屏幕左侧正在显示 CI 失败日志。用户只问“为什么这个失败了”，没有说明“这个”具体指什么。Codex 可以调用 Chronicle 读取屏幕，获得上下文并定位到类型错误。

![Chronicle 读取屏幕并分析 CI 失败原因](/media/codex-tutorials/codex-app-practical-tips/img_014.gif)

### 补足人物和文档上下文

当用户要求“同步最新的文档改动并发送给 Romain”时，对话中可能没有说明具体文档和联系人。Codex 可以结合 Chronicle 与 Memory，找到相关材料和正确联系人，再完成操作。

![未使用 Chronicle 时缺少任务上下文](/media/codex-tutorials/codex-app-practical-tips/img_015.png)

![使用 Chronicle 后补足任务上下文](/media/codex-tutorials/codex-app-practical-tips/img_016.png)

### 记住工作流

Chronicle 还可以参考用户最近完成类似任务时所使用的工具和步骤。例如制作内部发布沟通材料时，即使用户没有说明流程，Codex 也能从近期工作中找到线索。

![未使用 Chronicle 时需要用户说明工作流](/media/codex-tutorials/codex-app-practical-tips/img_017.png)

![使用 Chronicle 后参考近期工作流](/media/codex-tutorials/codex-app-practical-tips/img_018.png)

Chronicle 目前主要面向 Pro 用户，额度消耗较快。使用时也需要注意隐私和 Prompt 注入风险：浏览敏感信息或参加他人在线会议时，不应在未经允许的情况下开启屏幕记录；网页中的恶意指令也可能影响模型行为。

整体来看，这种通过屏幕和历史工作补全上下文的思路很有价值，能够明显减少重复解释。

如果你还有其他有趣的 Codex 使用技巧或体验，也欢迎继续补充。
