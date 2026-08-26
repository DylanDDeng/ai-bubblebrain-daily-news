---
title: "Codex App 纯小白入门指南"
slug: "codex-app-beginner-guide"
description: "从安装登录、界面布局到 AGENTS.md、内置浏览器、插件、Computer Use、自动化和 Hatch Pet，完整了解 Codex App 的核心用法。"
date: 2026-05-04
weight: 1
tags: ["Codex", "Codex App", "入门教程", "AGENTS.md", "Computer Use"]
author: "BubbleBrain"
sourceUrl: "https://mp.weixin.qq.com/s/rOnvAP3tQw2e9WPk-tlyIQ"
---

> 本文由 BubbleBrain 发布于微信公众号，原题为《OpenAI超级应用Codex 的纯小白入门指南，我奶奶看了都说好。》。[查看原文](https://mp.weixin.qq.com/s/rOnvAP3tQw2e9WPk-tlyIQ)

这是 Bubble 2026 年的第 52 篇更新。

Hello 大家好啊，

Codex App 这一个多月以来真是疯狂更新，加了不少功能，大有一种成为新时代 All-in-One 产品的趋势。

之前写过一篇关于我认为好用的 Codex 技巧：[分享几个我觉得好用的 Codex 技巧给你](https://mp.weixin.qq.com/s?__biz=MzkyNjcyNjczMA==&mid=2247493550&idx=1&sn=04f119632b5dfa1df6b6290ebea2f1fb&scene=21#wechat_redirect)，但好像还没真正写过一篇从 0 到 1 的教程，那这不就来了嘛！

废话少说，我们直接开始。

> 开始之前，我们先准备好一个 GPT Plus 或者 Pro 的会员账号。

## 安装与登录

我们先从最简单的安装开始，直接去网站上下载就好：

[下载 Codex App](https://developers.openai.com/codex/app)

![Codex App 下载页面](/media/codex-tutorials/codex-app-beginner-guide/img_001.png)

如果你是 macOS 或 Windows 用户，直接点击图中框出的链接下载即可。

下载好之后，我们开始登录。

![Codex App 登录界面](/media/codex-tutorials/codex-app-beginner-guide/img_002.png)

直接点击使用 ChatGPT 账号登录。

![使用 ChatGPT 账号登录](/media/codex-tutorials/codex-app-beginner-guide/img_003.png)

然后选择你的账号登录 Codex。

![选择登录账号](/media/codex-tutorials/codex-app-beginner-guide/img_004.png)

看到 Codex App 弹出这个界面，就算登录成功了，可以开始愉快使用。

## 界面介绍

在开始之前，我们先看看整个 Codex App 的布局。

![Codex App 三栏界面](/media/codex-tutorials/codex-app-beginner-guide/img_005.png)

整体上分为左、中、右三栏。现在大部分 Agent 客户端都是类似布局。

左侧又分为上、中、下三个部分：上面是新建对话、搜索、插件、自动化等功能；中间是基于项目文件的对话记录；最下面是无需选择项目路径的纯对话。

中间是主要聊天窗口，也是主要工作界面。你可以在这里选择对话模型、项目工作目录和 Agent 权限等。

右侧主要展示 Agent 修改文件后的 diff、总结、浏览器，以及 commit、push 等操作。

Codex App 里同样也有终端。

![Codex App 内置终端](/media/codex-tutorials/codex-app-beginner-guide/img_006.png)

点击顶部按钮，终端就会出现在下方。你可以在同一个 Codex App 中同时使用 Codex 和 Claude Code。

## 实用技巧

其实到这里，最基本的部分已经讲完了。你可以直接上手创造，试着做一个自己喜欢的网页、游戏或实用小工具。

但还有一些东西值得了解。掌握它们，能够帮助你最大化地用好 Codex。

### AGENTS.md

如果你用过 Claude Code，肯定对 `CLAUDE.md` 不陌生。`AGENTS.md` 在某种程度上可以被认为是与它等价的东西。

简单说，`AGENTS.md` 是一个给 Agent 看的 README 文件。我们可以在里面定义需要 Agent 遵守的规则，例如代码规范、回答语言风格和测试标准。

一个 `AGENTS.md` 示例：

````markdown
# AGENTS.md

这个文件是给 AI 编程助手看的。

在修改代码前，请先阅读并遵守下面的规则。

## 项目简介

这是一个 Web 应用项目。

请优先理解现有代码结构，不要一上来就重构。

## 技术栈

- React / Next.js
- TypeScript
- Tailwind CSS
- pnpm

如果不确定，请先看 `package.json`、`README.md` 和现有代码，不要凭空猜。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
````

当然，这个文件并不是必需的。你完全可以不专门配置它，也能做出一堆有意思的东西。我自己其实就不太专门编写这个文件。

但随着开发过程逐步深入、代码越来越复杂，为了让 Agent 行为不偏离，请记得还有这个东西，关键时刻它很有用。

`AGENTS.md` 可以分为三层。第一层是全局路径，默认放在：

```text
~/.codex/AGENTS.md
```

第二层放在当前工作的项目根目录；第三层则放在项目中的子目录下。

如果三层之间存在冲突，会以距离 Agent 正在修改的文件最近的那份 `AGENTS.md` 为准。

### 内置浏览器

为什么要把浏览器单独拿出来讲？因为我认为它的重要性被大大低估了。

有了内置浏览器之后，我们编写网页时不必再打开其他浏览器预览调试。

![从文件打开内置浏览器](/media/codex-tutorials/codex-app-beginner-guide/img_008.png)

直接点击文件名，右侧内置浏览器会帮你打开页面。如果看到哪里不满意，可以使用评论模式框出要修改的地方并进行说明。

Codex 会自动把你的评论和要修改的区域同步到对话框中。

![在内置浏览器中评论页面](/media/codex-tutorials/codex-app-beginner-guide/img_009.png)

这是使用各种 CLI 很难体会到的交互顺滑感。

Codex App 里还专门提供了 Browser Use 插件。

![Browser Use 插件](/media/codex-tutorials/codex-app-beginner-guide/img_010.png)

它天然适配 Codex App 的内置浏览器，可以帮助你完成截图、点击和网页应用测试等交互。

### 插件

既然说到了 Browser Use，就不得不专门说说插件。插件绝对是 Codex App 值得关注的一大亮点。

![Codex App 插件入口](/media/codex-tutorials/codex-app-beginner-guide/img_011.png)

OpenAI 在这里提供了一大批实用插件。

![Codex App 插件列表](/media/codex-tutorials/codex-app-beginner-guide/img_012.png)

从 Hugging Face、Vercel、Netlify 等开发服务，到 Canva、Figma、Gmail、Slack、Linear 等设计和生产力工具，应有尽有。

这正是我认为 Codex App 像新时代 All-in-One 产品的原因：它真的什么都能干。

配置过程非常简单，找到想要的插件，点击“+”号即可。

下面用日常常见的 Gmail 举个例子。

![安装 Gmail 插件](/media/codex-tutorials/codex-app-beginner-guide/img_013.png)

绑定 Gmail 插件之后，我们就可以让 Codex 查看最近两天的新邮件。

![使用 Gmail 插件查看邮件](/media/codex-tutorials/codex-app-beginner-guide/img_014.png)

也可以让它起草一封邮件。

![使用 Gmail 插件起草邮件](/media/codex-tutorials/codex-app-beginner-guide/img_015.png)

同样的操作也可以搭配其他插件。你可以点进每个插件的详情，查看它支持哪些操作。

例如，Notion 插件支持在 Notion 中创建文档、任务和数据库，也支持会议、研究等操作。

![Notion 插件能力](/media/codex-tutorials/codex-app-beginner-guide/img_016.png)

还有一个很强大的插件叫 Computer Use。

![Computer Use 插件](/media/codex-tutorials/codex-app-beginner-guide/img_017.png)

配置之后，Codex App 可以操作电脑上的其他应用，比如播放音乐中的歌单。

与以往常见的 Computer Use 功能不同，Codex App 里的 Computer Use 可以在后台执行任务。

过去很多 Computer Use 功能在执行任务时会直接弹出应用界面：鼠标在屏幕上飞来飞去，窗口不断打开，页面持续跳转。虽然很像 AI 在替你使用电脑，但它会占用屏幕、打断工作流，有时你还得在旁边盯着。

而 Codex App 的 Computer Use 可以在后台安静执行。你可以继续做自己的事情，它在另一边运行代码、读取文件、修改文档、执行命令并检查结果。

![Computer Use 后台执行任务](/media/codex-tutorials/codex-app-beginner-guide/img_018.png)

它更像一个真正被放进工作流里的后台工程助理：独立执行任务，不打扰你的工作，完成后再告诉你结果。

我甚至在网上看到一种很有意思的玩法：用 Computer Use 打开 Xcode 和 iOS 模拟器进行测试，同时在主聊天界面开发移动端应用。这样终于不用再为 Xcode 中不好用的 AI 功能烦恼了。

### 自动化流程

另一个非常好用的是自动化功能。

![Codex 自动化入口](/media/codex-tutorials/codex-app-beginner-guide/img_019.png)

如果每天都要做重复的事情，这个功能能帮上大忙。

点击创建一条新的自动化工作流。

![创建自动化工作流](/media/codex-tutorials/codex-app-beginner-guide/img_020.png)

输入需求，选择项目路径和每日运行时间。

它虽然也是工作流，但完全不需要去画布上拖拽节点，只需要描述清楚需求即可。就这一点而言，它比 Dify、n8n 的节点画布更容易上手。

![面对复杂工作流时的崩溃表情](/media/codex-tutorials/codex-app-beginner-guide/img_021.jpeg)

我自己有一条自动化流程：每天 3 点让 Agent 使用 Codex 内置的图像生成 Skill 批量生成图像。

![批量生成图像的自动化](/media/codex-tutorials/codex-app-beginner-guide/img_022.png)

这比自己一张张生成快得多，一个像走路，另一个简直像坐火箭。

### 认领一只宠物

现在你也可以在 Codex App 里认领一只宠物。

这是 OpenAI 给 Codex 新增的功能。打开 Codex App，进入 Settings，然后找到外观设置 Appearance。

![Appearance 中的宠物设置](/media/codex-tutorials/codex-app-beginner-guide/img_023.png)

OpenAI 内置了八种电子宠物，可以任意选择。更有意思的是，你还可以定制自己的电子宠物。

这一切都基于 Hatch Pet Skill。

![Hatch Pet Skill](/media/codex-tutorials/codex-app-beginner-guide/img_024.png)

最简单的定制方法，就是使用这个 Skill，让 Codex 帮你一步步实现。

![让 Codex 创建宠物](/media/codex-tutorials/codex-app-beginner-guide/img_025.png)

根据 Skill 的设定，Codex 会启用 Subagent 生成一整行动画帧。

![宠物动画帧](/media/codex-tutorials/codex-app-beginner-guide/img_026.png)

生成完成后，可以在 Settings 的 Appearance 中看到它；如果没有出现，刷新或退出重启应用即可。

![在 Appearance 中选择自定义宠物](/media/codex-tutorials/codex-app-beginner-guide/img_027.png)

启用之后，这只小小的电子宠物会浮在应用界面上。

如果你正在让 Codex 执行任务，宠物旁边还会显示任务进度。OpenAI 在 Codex App 的交互细节上确实打磨得很用心。

![宠物显示任务进度](/media/codex-tutorials/codex-app-beginner-guide/img_028.png)

网上甚至已经有人制作了各种宠物的收集网站。

![Petdex 宠物网站](/media/codex-tutorials/codex-app-beginner-guide/img_029.png)

里面有许多有意思的宠物，可以前往 [Petdex](https://petdex.crafter.run/) 查看。

只能说，当年 QQ 宠物那么火是有原因的。人类真的天生喜欢各种各样的小宠物，不管它是电子的还是 AI 的。

## 最后写点

终于把这篇一直想写的 Codex 从 0 到 1 指南写完了。

我知道内容肯定还不够全面，还有一些遗漏。毕竟，短短几千字想把整个 Codex App 的使用方法和技巧全部涵盖，基本是不可能的。

但我还是希望这篇文章能起到抛砖引玉的作用，让正在阅读的你产生一种最原始的冲动：“这好有趣，让我下载来试试。”

我自己一直有个暴论：AI 时代，再好、再详细的教程，都比不上自己亲自动手做一遍。

纸上得来终觉浅，绝知此事要躬行。

我相信这句话无论在哪个时代，都是亘古不变的真理。

那就让我们在这个特殊的时代，尽情创造吧。

以上。
