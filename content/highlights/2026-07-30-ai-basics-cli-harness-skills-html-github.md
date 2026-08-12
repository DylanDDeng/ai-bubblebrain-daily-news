---
externalId: "ai-basics-cli-harness-skills-html-github"
kind: "article"
title: "学会这些 AI 基本常识，你也能把老板忽悠瘸了"
description: "用通俗的方式解释 CLI、Harness、Skills、HTML 与 GitHub，帮助非技术用户建立一套实用的 AI 基础认知。"
date: 2026-07-30
sourceUrl: "https://mp.weixin.qq.com/s/xOzJ2m6_7d1YGv_dG3nwJQ"
cover: "/media/highlights/ai-basics-cli-harness-skills-html-github/img_004.png"
tags: ["AI 基础", "CLI", "Harness", "Skills", "GitHub"]
featured: true
draft: false
---

[原文：学会这些 AI 基本常识，你也能把老板忽悠瘸了](https://mp.weixin.qq.com/s/xOzJ2m6_7d1YGv_dG3nwJQ)

![BubbleBrain](/media/highlights/ai-basics-cli-harness-skills-html-github/img_001.png)

Hello 啊，大家好！

![BubbleBrain 动画](/media/highlights/ai-basics-cli-harness-skills-html-github/img_002.gif)

之前后台有小伙伴留言，问我 CLI 是什么？！

![读者关于 CLI 的留言](/media/highlights/ai-basics-cli-harness-skills-html-github/img_003.png)

我当时愣了一下，怎么能让还有看我文章的小伙伴不知道这是什么意思呢？

别说了，那肯定是我工作不到位了，才让有的小伙伴还有这样的盲点。

所以我决定还是写这一篇来给不清楚的小伙伴科普下一些类似的基本常识。别的不说，争取让大家看完之后，都能去忽悠一下不懂的土老板。

## 一、CLI

我们先从 CLI 开始。

CLI 的全称是 Command Line Interface，中文是命令行交互。它不像我们平时通过图标来操作电脑，它是直接通过一条条指令来完成对电脑的操作。

最大的特点是，它天然不适合人类使用、阅读，但，非常适合 Agent。

为什么？

我们举个例子来说。

比如飞书的 Lark CLI。

![Lark CLI 命令](/media/highlights/ai-basics-cli-harness-skills-html-github/img_004.png)

就是靠着这么一堆命令来操作飞书的。你说人要使用的话，这不得先理解，再记忆，最后反复练习才能熟练使用么。

但是 Agent 就没这难度，这玩意对它来说就是一个说明书，它看了就知道怎么用。

相反，人类经常使用的图形界面，对 Agent 使用起来，还更加折磨一点。因为 GUI 是为人类视觉和直觉设计的，按钮在哪里、菜单怎么展开、拖拽怎么操作，这些都是依赖视觉理解和空间记忆的隐性知识。

Agent 如果通过 GUI 操作，就需要像人一样“看屏幕、找按钮、点击”，效率反而更低，也更容易受到界面变化影响。

现在 Agent 的能力都很强了，让它们使用某个 CLI 方法其实很简单，直接把东西丢给 Agent，它们自己都能整明白。

比如像下面这样直接说就行：

![让 Agent 使用 CLI 的示例](/media/highlights/ai-basics-cli-harness-skills-html-github/img_005.png)

Agent 会自己整明白怎么做的。

## 二、Harness

这个词其实算一下是前阵子比较火的词了，最近又火了一些新的词，但我觉得本质上大同小异，但是 Harness 确实是我认为还是需要知道一下的。

我用一句话来定义一下我对它的理解吧，也是我之前在网上看到我比较认同的定义。

假设我们现在要骑着一匹马从起点走向终点，马如果是模型的话，那一切可以让这匹马从起点走到终点的方式都可以称之为 Harness。

那有的小伙伴可能会问了：为啥要用马举例子啊？！

因为 Harness 本身就是马具的意思呀。

那所谓的 Harness Engineering，也就是马具工程是什么意思呢？

就是围绕模型设计的一套能让模型稳定、持续工作最终完成任务的环境。

再简单点来说，我们日常用的 Codex、Claude Code 还有 WorkBuddy 等等其实都是 Harness。

这里要特别注意的是：

同一个模型放在不同的 Harness 里，效果也是完全不一样的。推荐大家可以看看模型厂商每次发布用的几个 Benchmark，

比如 Terminal Bench。

![Terminal Bench 中的 Harness 信息](/media/highlights/ai-basics-cli-harness-skills-html-github/img_006.png)

除了模型这一列之外，还会把所使用的 Harness 也给列出来。

还有大家经常见到的 Artificial Analysis。

![Artificial Analysis 的 Harness 排名](/media/highlights/ai-basics-cli-harness-skills-html-github/img_007.png)

也有专门的 Benchmark 来看同一个模型下，不同 Harness 的排名。

所以大家日常使用的时候，肯定会发现一个情况，

“怎么同样是 GLM 5.2，在 Claude Code 里和在 Cursor 里，感觉效果不一样呢？”

## 三、Skills

我单方面宣布把 Skills 认定为本年度最火的 AI 词汇了。

我觉得大家现在能看到 Agent 各种各样的无所不能都是因为有了 Skills。

简单点讲，它就是一份用 Markdown 写给 Agent 的说明书，当然有的还会配套相关的资源。

任何重复三遍以上的动作，我觉得都可以提炼成一个 Skill，来提升效率。

举个例子，比如写周报这件事。

每周都得写，每周都得交。Agent 当然一开始不知道怎么给你写周报，你得告诉它让它去读取你的工作文档，自己总结出来，写成周报，再存到电脑本地的哪个目录下面。

好，那这个让 Agent 每周都要重复做的这个流程就可以提炼成一个 Skill，这个 Skill 写清楚了你的工作文档在哪里，周报的要求是什么，以什么样的格式写好，再存到哪个位置。

这样一来，下次写周报的时候，你就不用再重复把你的要求讲给 Agent 听了。

所以，换个角度来想，Skills 其实就是沉淀下来的属于你自己的资产。

你可以今天使用 Claude Code，明天用 Codex，后天再用 WorkBuddy，这些都可以换，但是你的 Skills 是带不走的，放在哪里都可以使用。

## 四、HTML

感觉古老的 HTML 再一次在 AI 时代文艺复兴了属于是。

HTML 本身其实是一种标记语言，通过各种标签来告诉浏览器，网页长什么样子。

本身 HTML 其实没啥，但是因为 AI 写前端网页的能力越来越强，做的网页又美观好看，速度还贼快，人本身又是视觉动物，所以我们就会看到各种基于 HTML 衍生出来的东西。

比如大家最常见的 HTML 格式的 PPT。

GitHub 上已经有各种各样的 HTML 格式的 PPT 项目，随便拿一个出来都足以给不懂 AI 的小老板们一点点视觉上的震撼。

![HTML PPT 示例](/media/highlights/ai-basics-cli-harness-skills-html-github/img_008.png)

比如这里就很推荐歸藏老师的 PPT Skill，我已经见到不少人用了。

但是这里要特别提醒的一点是，

HTML 格式的 PPT 目前还是用在线下的演示会更方便一点，正式的场合里还是建议大家写正规的 PPT 好一点，方便别人改动和查看主要是。

除了用 HTML 做 PPT 之外，还有一个比较火的是用 HTML 来做视频。

是的，你没看错，HTML 也可以用来做视频。

HeyGen，一个做数字人的公司，专门做了一个库，叫 HyperFrames，专门用来做视频。

![HyperFrames](/media/highlights/ai-basics-cli-harness-skills-html-github/img_009.png)

你不需要自己专门去写 HTML，直接把这个发给你的 Agent，它学了之后，就可以帮你用这个库做视频了。

```shell
npx skills add heygen-com/hyperframes --full-depth
```

如果实在还不行，我推荐大家去 WorkBuddy 或者 Codex 的插件市场里找找，都是能够找得到。

![WorkBuddy 中的 HyperFrames Skills](/media/highlights/ai-basics-cli-harness-skills-html-github/img_010.png)

在 WorkBuddy 里的专家技能连接器里搜了一下 HyperFrames，找到这么多相关的 Skills……大家就懂它到底有多火了吧。

这里要特别提醒的是，不同的模型用 HyperFrames 做出来的效果是不一样的。

我自己实际测试的感觉是做前端好的模型，做出来的效果更好。

## 五、GitHub

GitHub 对程序员来说肯定是不陌生的了，以往是程序员之间协作、托管代码的平台。

但是 AI 时代，既然赋予了每个人都可以创造属于自己的产品的权力，那 GitHub 的定位我觉得也可以改一改了。

现在的它简直就是属于每个人的多啦 A 梦。

全世界所有的创造者、厂商，都会在这上面发布有意思的东西。你完全可以基于他们的成果上再进行深一步的创造。

很多时候站在巨人的肩膀上，才能看得更高更远。

我们简单地讲下 GitHub 最基本的一些用法。

![GitHub 仓库界面](/media/highlights/ai-basics-cli-harness-skills-html-github/img_011.png)

一个项目里，我们日常会用到的几个地方就是 Issue、Pull Request、Fork、Star 和 Clone。

先从最简单的讲起。

Star 其实很好理解，就是星星。觉得这个项目非常好，点个 Star，就是对开发者最大的奖励。

我们可以简单粗暴地理解成社媒平台上的点赞、收藏这一类作用。

那 Issue 呢，其实顾名思义，是问题。

就是当你觉得项目中有一些问题，包括 Bug，或者你自己有一些跟项目相关的想法，都可以在 Issue 里提，开发者会跟进，进行修复。

那 Fork 呢，是当你觉得这个项目不错，然后想基于它做一些自己的修改，你就可以把项目复制一份到自己的仓库里。

Pull Request 也就是我们常说的 PR，就是比如当你 Fork 了这个项目，做了一些修改，然后觉得自己改得还不错，对原项目有帮助，你就可以提一个 PR 给原作者，它看到之后呢就会考虑把你的改动给合并进原始项目。这样你也算得上是这个项目的贡献者了。

Clone 就比较好理解了，就是把项目给拉到本地来进行改动。它和 Fork 的不同是，Fork 是在 GitHub 上创建一个属于自己的项目副本，相当于获得了一份独立的远程仓库；而 Clone 只是把代码复制到本地电脑，GitHub 上的仓库归属仍然属于原作者。

还有就是提醒一点，每个项目有不同的开源协议，每个开源协议对项目的开放程度不同。

比如刚刚讲到的 HyperFrames 这个仓库采取的是 Apache 2.0 协议。

![HyperFrames 的 Apache 2.0 许可证](/media/highlights/ai-basics-cli-harness-skills-html-github/img_012.png)

开源项目不等于可以免费使用。

对开源协议不熟悉的小伙伴可以在使用前多去问问 AI。

## 最后写点

好啦，今天的分享差不多就到这儿了。

我觉得我们身处于这个时代最大的好处就是，

知识平权。

从前那些你不敢想、不敢做、不敢问的事情都可以借助 AI，一点点学会它，实现它。

只能说，

我可太爱这个充满 AI 魔力的世界了。

以上。

若觉得内容有帮助，欢迎点赞、推荐、关注。别错过更新，给公众号加个星标 ⭐️ 吧！祝您在 2026 年里天天开心，快乐，身体健康，万事如意！期待与您的下次相遇～
