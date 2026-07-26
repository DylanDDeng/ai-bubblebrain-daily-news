---
externalId: "why-software-factories-fail"
kind: "article"
title: "为什么软件工厂会失败"
description: "Dex Horthy 分析无人值守的 AI 软件工厂为何会持续损害代码库的可维护性、现有基准为何无法衡量设计质量，以及人工评审为什么仍不可替代。"
date: 2026-07-24
sourceUrl: "https://x.com/dexhorthy/status/2080697380379427275"
cover: "https://pbs.twimg.com/media/HN8ZwOdbUAAi97D?format=jpg&name=large"
tags: ["Agent", "软件工程", "代码质量"]
featured: true
draft: false
---

![图片](https://pbs.twimg.com/media/HN8ZwOdbUAAi97D?format=jpg&name=large)

[原文：Why Software Factories Fail — Dex Horthy](https://x.com/dexhorthy/status/2080697380379427275)

或者说：光有 harness 还不够

更新：这篇文章的演讲版已经上线 YouTube：[https://www.youtube.com/watch?v=Ib5GBkD555M](https://www.youtube.com/watch?v=Ib5GBkD555M)

这是系列文章的第一部分。第二部分在这里：[https://x.com/dexhorthy/status/2081058573556306030](https://x.com/dexhorthy/status/2081058573556306030)

## 看来我们现在都在搞循环了

所有人都在争先恐后地把 AI 编码投入生产。关于循环工程（loop engineering）已经有过很多讨论，而主流观点似乎是：我们大概应该写更多循环。

![图片](https://pbs.twimg.com/media/HN8Ped8aEAAF-zc?format=jpg&name=large)

[StrongDM 介绍过他们的无人值守软件工厂](https://factory.strongdm.ai/)：没有人读代码，也没有人写代码。

这套叙事大致是这样的：

1. 你才是瓶颈。
2. 模型已经足够好了。
3. 代码是免费的。
4. 只管发布更多东西。

OpenAI 的 [Ryan Lopopolo](https://x.com/_lopopolo) [在二月写过这件事](https://openai.com/index/harness-engineering/)，并在四月[做了一场演讲](https://www.youtube.com/watch?v=am_oeAoUhew)，介绍 OpenAI 的软件工厂 Symphony。

这些人都非常聪明，我也十分尊敬他们。但如果用最愤世嫉俗的方式来解读，这不过是又一个把更多风险投资砸进“垃圾内容大炮”的借口。

## 呃……进展还算“顺利”

我们的朋友 [Mario](https://x.com/badlogicgames) 在 AI Engineer Europe 上台，[恳求大家慢一点](https://www.youtube.com/watch?v=RjfbvDXpFls)——因为一些本不该因编码 Agent 操作失误而宕机的公司，确实正在[因为编码 Agent 的失误而宕机](https://www.ft.com/content/00c282de-ed14-4acd-a948-bc8d6bdb339d)。

正如 [Matt Pocock](https://x.com/mattpocockuk) 所说，[代码库正在以前所未有的速度分崩离析](https://www.youtube.com/watch?v=3MP8D-mdheA)。

我一直没能找到 StrongDM 那座“黑灯工厂”后来究竟运行得怎么样的确切数据或结论。他们的 [weather report](https://factory.strongdm.ai/weather-report) 在今年二月至六月之间只有几次零散更新。**编辑补充**——[7 月 23 日，团队成员在 Hacker News 上参与了一些讨论](https://news.ycombinator.com/item?id=49026625)，听起来我们或许很快就能看到一份更正式的更新。

[Faros AI 的团队](https://www.faros.ai/research/ai-acceleration-whiplash) 发布了一份报告：自从我们[2](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#user-content-fn-1b-f56fe9a973fe7c6ebb6a9673c1bc64cb)在一、二月份开始使用这些 AI 编码工具后，Pull Request 的评审质量显著下降。

- 评论更多了、评论更长了，而且大量 PR 在完全没有评审的情况下就被合并。
- 事故大幅增加。
- 每位开发者产生的缺陷数量大幅增加。

![图片](https://pbs.twimg.com/media/HN8PswLa8AApp4d?format=jpg&name=large)

这份报告更像是一个相关性信号，而不是可以验证的确凿证据（是的，我是故意选这个词的，别让我开始吐槽 Claude 式文风）。而且这篇文章的重点本来就是要警惕垃圾数据，但就我所看到的情况而言，它在方向上是可信的。

## “是你拿错了方式”（其实不是）

很多人会告诉你，这是一个技能问题——如果你得不到好结果，那是你自己的错。

但无论你选择怎样……呃……“拿着它”，我都敢保证，总会有人告诉你：如果把 token 拉满还没有用，那就是你的技能有问题。你只需要花更多 token，别再读代码。假如你刚开始走这条路，我保证这就是过程的一部分。[去年夏天我也这么想](https://hlyr.dev/ace)。

不幸的是，为了打击我的自尊，我以前讲过一些关于“怎样拿得更好”的蠢话，后来被录了下来，如今在 YouTube 上累计大约有一百万次观看。我不是在炫耀；我说这些，只是为了说明：我已经深入研究如何更好地使用编码 Agent **很长时间**了，而且确实发现了一些被很多人认为**真正有用**的方法。

- [面向编码 Agent 的高级上下文工程](https://hlyr.dev/ace)
- [禁止凭感觉——在复杂代码库中解决困难问题](https://hlyr.dev/nva)
- [我们对 RPI 的所有误解](https://hlyr.dev/qrspi-mlops)

总之，我们被迫听了这么久“只要更用力地烧 token”之类的网络鼓噪，**它所承诺的结果**可以简洁地概括为：只要做足 harness 工程，我们就能两全其美：

- 速度提高 10 到 100 倍；
- 质量依然很高；
- 再也没人需要做那件所有人都讨厌的事——代码评审。

我们只需配置更多 Linter，再给足够多的 PR 评审机器人撒上一些“对抗性评审”之类的魔法词语，软件就会开心地自我构建，而且永远不会出事故。

## 这不是技能问题

我想尝试说服你：无论做多少 harness 工程，或者把循环堆到多么极端，都解决不了一个本质上属于模型训练的问题。

为了真正理解它，我不得不研究编码模型究竟是如何训练和评估的——既包括 [RLVR](https://github.com/opendilab/awesome-RLVR)，也包括各种基准测试。

这篇文章会依次讨论：

1. 软件工厂的历史可以追溯到 1968 年；它后来如何演变，AI 又怎样改变了它；
2. 为什么模型可以在轻松拿下基准测试（甚至全新的“前沿”基准）的同时，生成堆积如山的垃圾代码；
3. **尽管如此**，你仍然可以快速前进，而不用点燃自己的代码库。

我会尽量穿过每天都会冒出来的新 Skills 插件炒作，以及那场 AI 精神错乱式的“token 拉满”建议瘟疫，用一般性的语言讨论**真正有效的方法类型**，而不引用任何特定 Skill 或框架。

**视频版本：**本文基于我在 [AI Engineer World's Fair 2026 的主题演讲](https://www.youtube.com/watch?v=Ib5GBkD555M)，并在其基础上做了扩展。

感谢 [@addyosmani](https://x.com/addyosmani)、[@CyrusNewDay](https://x.com/CyrusNewDay)、[@HamelHusain](https://x.com/HamelHusain)、[@zeeg](https://x.com/zeeg)、[@dillon\_mulroy](https://x.com/dillon_mulroy)、[@nayshins](https://x.com/nayshins) 和 [@jeffreyhuber](https://x.com/jeffreyhuber) 对本文提出的反馈。

## 题外话：这和 vibe coding 无关

[Addy Osmani](https://x.com/addyosmani/status/2066595308629594363) 理清了一个值得特别指出的问题：

> 一个开发者用 vibe coding 做一个可能只有十几个人会运行的业余项目，和一个团队为了再撑一个季度而维护一套十年历史的企业系统，两者几乎没有任何值得一提的共同约束；而流传中的大多数建议，其实只是其中一类人在告诉另一类人该怎样生活。

如果你喜欢 vibe coding，请继续尽情 vibe。我自己仍会用 vibe coding 做很多东西，只不过我也维护着大量生产软件（并通过 HumanLayer 帮助另外数千名工程师做同样的事），所以接下来的内容面向的是那些在复杂代码库中解决困难问题的人。

我经常听人用 **brownfield（棕地项目）**来描述这种差异。过去它通常指某个有十年历史的 Java 项目，但按照我们现在的发布速度，一个由 Agent 构建的代码库可能只要 **三到六个月**就会开始举步维艰——你会逐渐慢下来，而增加新功能的方式也必须随之改变。

## 软件工厂简史

我的整个职业生涯都在构建和研究软件工厂，但直到最近我才知道：“软件工厂”这个词最早可以追溯到 [1968 年的一次 NATO 会议](http://homepages.cs.ncl.ac.uk/brian.randell/NATO/nato1968.PDF)——也正是那次会议带来了“软件工程”这个说法。

此后我唯一觉得格外有趣的事情，是[美国国防部曾写过一份 31 页的 PDF，大意似乎是国防部需要开始更好地使用 Jenkins](https://dodcio.defense.gov/Portals/0/Documents/Library/DevSecOpsReferenceDesign.pdf)。

## 2022 年的软件工厂

让我们把“软件工厂”的定义固定在 2022 年，也就是 AI 大规模进入开发流程之前。在一个典型的软件工厂中：

- **人决定构建什么**——工程师、产品经理和管理层共同推动愿景；
- **需求进入跟踪系统**——Linear、Jira 或其他工具：它们是描述工作下一步状态的状态机；
- **有人领取工单并完成开发**——过程中可能会做一些手动或自动测试；
- **提交 Pull Request**——自动检查、人工代码评审，也许还会有人拉到本地测试；
- **发现问题？返回“有人完成开发”这一步继续循环**；
- **发布到生产环境**——产品开始真正接触用户；
- **增加监控**——整个行业都在研究怎样在系统出故障时，于凌晨三点呼叫一名工程师；
- **用户抱怨**——提出需求、发现缺陷、提交功能请求，然后团队再把它们放回跟踪系统。

![](https://pbs.twimg.com/amplify_video_thumb/2080400367033217024/img/fzKh_OaEyf3OqYzU.jpg?name=large)

就这样不断循环。我们甚至还没谈到 AI，图中就已经存在好几个循环了。

## 把共识前置

几十年前，团队就意识到一件事：开发需要几小时甚至几天，评审也同样如此。

![图片](https://pbs.twimg.com/media/HN8RQdDakAA1V99?format=jpg&name=large)

因此，我们把工作前置——规划、架构提案、Sprint 计划——让团队共同参与。这意味着：

- **减少返工**，因为在任何人写代码前，大家已经达成共识；
- **减少逐行评审所需的时间**。如果你读过一个很长但完成得很好的 PR，就知道当它已经接近完美时，评审可以有多快。

![图片](https://pbs.twimg.com/media/HN8RTX9bwAAMpir?format=jpg&name=large)

后面我们还会回到这一点。现在先看看把 Agent 式编程带进流程后会发生什么。

## Agent 式软件工厂

现在，几乎每家公司——

- [Ramp](https://infoq.com/news/2026/01/ramp-coding-agent-platform/)
- [Stripe](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents)
- [WorkOS](https://workos.com/blog/project-horizon)
- [Brex](https://www.latent.space/p/brex)

都花了今年的大部分时间解释他们怎样构建了一座 Agent 工厂，能够产出大约 **75% 的代码**。

Agent 式工厂基本上就是把 **“有人完成开发”替换成“Agent 完成开发”**——里面当然还有编排、harness、沙箱、模型、计算机操作等东西。关于这些细节我不会深入，因为坦白说，我已经读腻了，而且我相信你也一样。

![图片](https://pbs.twimg.com/media/HN8RZ2vbAAATZJh?format=jpg&name=large)

当 Agent 负责开发时：

- 构建时间从几小时或几天降到几分钟或几小时；
- 评审仍然需要几小时或几天。人类仍需阅读代码并测试改动，因此评审现在成了瓶颈。

![图片](https://pbs.twimg.com/media/HN8RbyUa4AAPx8a?format=jpg&name=large)

于是，你也加速评审：

- 用 Agent 进行代码评审，检查风格、缺陷和安全问题；
- 用 Agent 做回归测试，通过浏览器、计算机操作等方式从外部测试产品，也许完成后还会发给你一段可爱的小视频。

![图片](https://pbs.twimg.com/media/HN8Rd9VbYAA-z7L?format=jpg&name=large)

评审现在变快了，但它很可能依然是瓶颈。不过，我们可以增加更多循环。

下一步，你可能会把事故直接接入工厂。工程师不再于凌晨三点被叫醒；早晨醒来时，面前可能已经有一个修复问题的 PR。

![图片](https://pbs.twimg.com/media/HN8RgOcasAA3KGC?format=jpg&name=large)

我们还可以把用户反馈接入工厂。用户提出需求，然后系统自动把它构建出来。

![图片](https://pbs.twimg.com/media/HN8Rh7gaEAAqx76?format=jpg&name=large)

到这里，工作就只剩两个问题：你能往队列里塞多少东西，以及你能以多快的速度评审和测试产出？

![图片](https://pbs.twimg.com/media/HN8RjrBaMAAj5CR?format=jpg&name=large)

这就把我们带到了无人值守的软件工厂。

## 无人值守的软件工厂

[Dan Shapiro 创造了这个说法](https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/)，[Simon Willison 则介绍过 StrongDM 对它的实现](https://simonwillison.net/2026/Feb/7/software-factory/)——在这座工厂里，我们不再阅读代码。

你看着自己那座美丽的软件工厂，发现它被那个烦人的代码评审步骤毁掉了，于是你说：让人类阅读每一次改动？算了吧。

![图片](https://pbs.twimg.com/media/HN8RmztaEAAOd9g?format=jpg&name=large)

所以你去掉了它，把精力投到其他地方：

- 投资测试，让 Agent 测试自己的工作；
- 投资沙箱和编排；
- 投资自动评审；
- 投资监控；
- 投资发布流程；
- 投资收集用户反馈信号。

![图片](https://pbs.twimg.com/media/HN8RoxQbEAAcloG?format=jpg&name=large)

现在，工作真的只剩一个问题：我们能让 Agent 构建多少东西？我们想把[多大的一片海烧开](https://garryslist.org/posts/boil-the-ocean)？

## 这一切一定会很顺利（并不会）

![图片](https://pbs.twimg.com/media/HN8Wwh1akAAgZBY?format=jpg&name=large)

我要提出一个可能有争议的观点：无人值守的软件工厂行不通。

下面来谈谈软件工厂为什么会失败。

## 我们试过了

2025 年 7 月，我们彻底进入无人值守模式：只读规格和工单，让后台 Agent 处理所有小型和中型任务，整套流程全部自动运行。

如果你真的这样做过几个月，就已经知道它会怎样收场。你终究会遇到至少一个棘手到 Agent 无法解决的问题——即使你已经使用了最先进的提示词和工作流。

- 你会做深入、理解上下文的研究，把所有正确的信息汇集到模型最擅长处理的区域；
- 你会让 Agent 用十种不同方式尝试复现问题。

最终，你还是得咬牙钻进那个已经三个月没认真读过的代码库，试图搞清楚究竟哪里坏了。

与此同时：

- 你的网站宕机了；
- 用户非常愤怒；
- 如果你和我差不多，你自己也痛苦不堪——不得不阅读那些被你放进系统的垃圾代码。

第一次发生这种事时，我把它甩在了脑后。尽管我刚刚花了差不多两周，在 Claude 制造的意大利面式代码里艰难穿行，我仍然觉得“速度带来的收益值得承担下行风险”。到了十一月，大约第三次发生时，我们决定从头重写可能更容易；我的联合创始人整整花了**两个星期**待在 VS Code 里（甚至不是 Cursor），亲手把所有模式重新搭了一遍。

## 模型会随着时间推移降低代码库质量

我真正想说的是：模型存在一个缺陷。没有相当程度的人类引导，它们无法随着时间推移维持并改善代码库质量。[4](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#user-content-fn-3-f56fe9a973fe7c6ebb6a9673c1bc64cb)

我所说的可维护性，指的是这样一种具体情况：修改代码库的一部分而不破坏另一部分，会变得越来越困难。这就是 [Martin Fowler 所说的“霰弹式修改”（shotgun surgery）](https://refactoring.guru/smells/shotgun-surgery)。

关于可维护性我不打算再展开。已经有很多书可以读：

- [John Ousterhout 的《软件设计的哲学》](https://web.stanford.edu/~ouster/cgi-bin/aposd.php)
- [Robert C. Martin 的《代码整洁之道》](https://www.oreilly.com/library/view/clean-code-a/9780136083238/)
- [Martin Fowler 的《重构》](https://martinfowler.com/books/refactoring.html)

那么，为什么模型做不好软件可维护性？

## “但模型从那以后肯定变强了吧”

读到这里，你可能已经迫不及待地想说：Dex，模型从去年七月以后肯定已经强了很多吧？

确实如此——某些方面强了很多，另一些方面则差不多。

- 解决一次性问题，或者用 vibe coding 做一个新的营销网站？是的，强多了。
- 随时间推移改善代码库质量？在我看来，没有好多少。

![图片](https://pbs.twimg.com/media/HN8RwLqbQAA-pQT?format=jpg&name=large)

我无法证明这一点，你也无法证明。我们没有任何优秀的基准，可以衡量模型维持代码库质量的能力。（稍后会谈到这个方向正在发生什么。）

> **没有优秀的基准，可以衡量模型维持代码库质量的能力。**

但如果你已经和编码 Agent 共事了一段时间——而且很多人正在公开谈论同样的问题——你大概已经有这种感觉：随着时间推移，它们往往会让事情变得更糟，让代码库越来越难以维护。

为了理解为什么会这样，我想把视角拉远一点，看看第一个真正伟大的编码 Agent。

## Claude Code 赢在 harness 内的强化学习

Claude Code 在不到一年里，收入从零增长到约 40 亿美元——现在似乎已经接近 90 亿美元。

![图片](https://pbs.twimg.com/media/HN8R0_naMAApmn2?format=jpg&name=large)

这有点不可思议，因为当时已经存在很优秀的命令行 Agent。[aider](https://aider.chat/)、[cline](https://cline.bot/)、[codebuff](https://codebuff.com/) 都早于 Claude Code 出现，都有真正优秀的上下文工程，也拥有你可能归功于 Claude Code 的同一组工具：读取、写入、编辑、搜索、Bash。我都用过，它们很好。但工具调用有时就是会……失败——你会眼看着它连续三次在同一个编辑操作上挣扎，最后只好重新打开编辑器，自己完成。

2024 年的 [SWE-Agent 论文](https://arxiv.org/abs/2405.15793) 说明了：工具形态上的微小变化会产生明显差异。例如，在 ReadFile 的结果中加入行号，或者把 Edit 工具从查找/替换改成按行范围编辑。

![图片](https://pbs.twimg.com/media/HN8R3wya8AAYoJi?format=jpg&name=large)

随后 Claude Code 上线，并迅速垂直增长。你可以把它简单归因于分发能力，但广泛接受的解释是：Claude Code 获胜是因为它更好；而它之所以更好，是因为 Anthropic **在 harness 内部对模型做了强化学习**——这是第一次有实验室针对自己即将发布的那套确切工具来训练模型。于是，它变得极其擅长在 Agent 循环中调用这些工具。

不断调整工具定义和评估，直到找到模型最喜欢的形态，是一回事——我曾为不同场景在这上面耗费数周。拥有模型权重，并且可以**修改模型本身**，让它更善于使用一组特定工具，则完全是另一种游戏。

OpenAI 团队[在十一月的一场演讲](https://www.youtube.com/watch?v=wVl6ZjELpBk)中把这一点讲得很清楚：如果你构建了 harness，却不拥有模型权重，也无法在其中对模型做强化学习，那么和同时拥有两者的团队相比，你永远处于劣势。

## 60 秒理解编码 Agent 的强化学习

为了弄懂这个主题，我做了很多研究，也制作了不少可视化来解释其中重要的部分。但后来我发现，[Calvin French-Owen](https://x.com/calvinfo)（Codex 团队 MTS、Segment 创始人）在 [AI Council](https://www.youtube.com/watch?v=q-ntX4DLW_c) 的演讲中讲得更好、更清楚，所以我直接放上这段受他幻灯片启发的动画：

![](https://pbs.twimg.com/amplify_video_thumb/2080401322218758144/img/f7ow19XebOIFqSPf.jpg?name=large)

为了让模型更擅长编码，你会：

1. 生成一些用于解决问题的编码 Agent 轨迹（例如“修好我的测试”）；
2. 根据某些标准对这些轨迹评分（验证器）；
3. 更新模型权重，让好的轨迹更有可能出现，让坏的轨迹更少出现。

然后在数周或数月里，把这个过程重复数百万次。

但这类系统中的“评分”部分，往往异想天开地只有一个维度。

## 糟糕设计不会受到惩罚

以 [SWE-bench Multilingual](https://huggingface.co/datasets/SWE-bench/SWE-bench_Multilingual) 为例。它的任务规模很小——每项大约十五分钟——来自 Redis、jq、Django 等开源仓库。奖励只有 0 或 1，依据是：

- **FAIL\_TO\_PASS**——你是否修复了被要求解决的问题？
- **PASS\_TO\_PASS**——你是否在不破坏其他东西的情况下完成修复？

这里有一个真实任务 **fastlane\_\_fastlane-19304**，来自 Ruby 项目 [fastlane](https://github.com/fastlane/fastlane)。它的 zip action 读取两个可选参数，然后立刻对它们调用 `.empty?`；所以只要没有填写 include 和 exclude，它就会崩溃：

![图片](https://pbs.twimg.com/media/HN8U8yhbMAAZjQj?format=jpg&name=large)

最终关闭这个 Issue 的人工修复只有两行（把默认的 nil 转换为空数组）：

![图片](https://pbs.twimg.com/media/HN8U_keaIAAotk_?format=jpg&name=large)

在评估过程中，模型：

1. 从一个**基础提交**开始——仓库被检出到这个修复落地前的一刻；
2. 获得缺陷报告——在这个例子里是：`zip_command`: undefined method `empty?` for nil:NilClass。

Agent 会根据 Issue 自行编写代码。它看不到标准答案补丁，也看不到作为评分器的**测试补丁**：

![图片](https://pbs.twimg.com/media/HN8VCrpbIAACaZp?format=jpg&name=large)

然后：

1. 保留它生成的补丁；
2. 丢弃它对测试文件做出的所有修改（我们见过模型悄悄注释掉失败测试，或者塞入一个让测试失去意义的 Mock）；
3. 在补丁上应用基准提供的测试补丁；
4. 运行完整测试套件：既包括现有的 zip 测试（PASS\_TO\_PASS），也包括新增测试（FAIL\_TO\_PASS），确认两者都能通过。

![图片](https://pbs.twimg.com/media/HN8VNn8bUAA3D4N?format=jpg&name=large)

**题外话**——基准测试不是验证器；事实上，它们必须彼此留出独立样本（不要在测试集上训练，诸如此类）。我主要想表达的是“判断一条编码 Agent 轨迹质量”的基本形态，以及它的局限。

模型怎样得到正确答案并不重要。只要测试通过，我们就赢了；但侵蚀代码库可维护性**不会受到任何惩罚**。

侵蚀代码库可维护性不会受到任何惩罚。

于是你就会得到无处不在的 try/catch：

![图片](https://pbs.twimg.com/media/HN8VhxEboAAS7gG?format=jpg&name=large)

## 验证质量比“测试是否通过”难几个数量级

运行测试只需几秒，就能得到明确的通过或失败结果。这正是强化学习可以运行数百万次循环、优化每一代模型的原因。

但糟糕架构的成本函数，要以数周、数月，甚至数年来衡量。它会在某个人为了修改一行代码而第一次打开那个文件，却发现根本不可能只改一行时显现出来——有人当初 vibe 得太用力了，现在我们必须在十一个地方做同样的修改，还要祈祷隔着三个文件的某处不会悄悄坏掉。

![图片](https://pbs.twimg.com/media/HN8Vr0nakAAEKz4?format=jpg&name=large)

测试能在几秒内给出反馈，但糟糕架构的成本函数，要以数周、数月，甚至数年来衡量。

糟糕设计恰恰是今天的基准无法评估的东西。我知道，强化学习不等于基准测试；但如果这个问题已经在强化学习中解决，我相信它多少也会开始体现在基准的设计方式上。

无论如何，我个人不会把当今基准上的任何提升，视为模型突然变得善于保护代码库质量的证明。

## 前沿在进步，只是很慢

当然，很多聪明人都在解决这个问题。我的观点不是它永远做不到，而是[炒作的速度已经超过了纪律建设](https://www.youtube.com/watch?v=c35YoMdnI78)。

下面这些工作，我认为方向是正确的：

- [SWE-Marathon](https://www.swe-marathon.org/)（Abundant AI）：约 400 小时的任务，例如“克隆完整的 Excel，包括每一个功能”；奖励渠道是复合的，而不再只有一个通过/失败位；
- [DeepSWE](https://deepswe.datacurve.ai/blog/deepswe)（Datacurve）：在开源仓库中设置现实世界从未真正实现过的大型任务，因此它们按定义不可能已经出现在训练集中（解决了污染问题，但没有解决质量问题）；
- [Frontier Code](https://cognition.com/blog/frontier-code)（Cognition）：包含跨多个 PR 的任务，并采用一种很聪明的确定性质量评估方式——如果模型写出的测试在应用补丁之前不会失败，就对模型进行惩罚（如果你没听说过[变异测试](https://en.wikipedia.org/wiki/Mutation_testing)，接下来会很有意思[5](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md#user-content-fn-5-f56fe9a973fe7c6ebb6a9673c1bc64cb)）。它还会**让一个评审模型检查 diff 是否符合代码质量规则**。

![图片](https://pbs.twimg.com/media/HN8VxryaoAAtjN2?format=jpg&name=large)

但让模型判断质量，能力终究有限。

事实上，不难想象：如果一个模型能够可靠区分好代码和坏代码，它一开始也许就会直接写出好的版本。强化学习需要一个快速而可靠的预言机，但我们还没有能判断可维护性的这种工具。

如果模型能够可靠地区分好代码和坏代码，它一开始也许就会直接写出好的版本；但可维护性不存在快速的预言机，因此我们无法在强化学习中为它提供奖励。

当然，增加评审 Agent 和 token 确实有帮助——它们可以提高下限，捕获那些愚蠢的错误。

但它们无法抬高上限，因为上限取决于我们在强化学习中成功教给模型的东西，而优秀设计正是我们仍不知道如何教给模型的能力。

所以，我仍然不会拿自己的代码库押注在这些方法上。但这是我第一次看到有评估真正尝试给可维护性打分，而不是止步于通过或失败。

**题外话**：也许未来的某个模型会彻底理解这一切，我们就可以停手。如果你想一直 yolo 提示词，等 GPT-7 发布后看看结果，请自便——但先别管什么苦涩的教训，我们现在就有问题需要解决，而接下来我会说明我们怎样处理它们。

## 重新把灯打开

今天我才知道，Twitter Articles 有一个“媒体数量限制”。因此剩余内容会放进第二部分——敬请期待。
