---
externalId: "why-software-factories-fail-benchmarking-new-frontier"
kind: "article"
title: "软件工厂为何失败：评测新的前沿"
description: "Dex Horthy 使用 SlopCodeBench 测试 Opus 4.8、Sonnet 5 和 Opus 5，衡量前沿模型能否在需求逐步揭示的过程中持续演进代码库。"
date: 2026-07-28
sourceUrl: "https://x.com/dexhorthy/status/2081797628552270027"
cover: "https://pbs.twimg.com/media/HOQAZm0aEAAvAks?format=png&name=large"
tags: ["软件工厂", "SlopCodeBench", "编程智能体", "基准测试"]
featured: true
draft: false
---

[原文：Why Software Factories Fail: Benchmarking the new frontier — Dex Horthy](https://x.com/dexhorthy/status/2081797628552270027)

![图片](https://pbs.twimg.com/media/HOQAZm0aEAAvAks?format=png&name=large)

本文是《软件工厂为何失败》第一、二部分的续篇：

- [第一部分：仅有 harness 还不够](https://x.com/dexhorthy/status/2080697380379427275)
- [第二部分：重新把灯打开](https://x.com/dexhorthy/status/2081058573556306030)

## 我们有了更好的基准测试

还记得我在第一部分里说过这句话吗？

> 对于模型维持代码库质量的能力，目前根本没有好的基准测试。

这话并不完全正确，只是我想先把真正的重点藏一会儿。在本文中，我们来看看未来。

我们将深入研究 [SlopCodeBench](https://arxiv.org/html/2603.24755v1)。这是威斯康星大学麦迪逊分校 [@GOrlanski](https://x.com/GOrlanski) 实验室在 2026 年 3 月推出的一项较新的长程编程基准。它恰好解决了我们在[第一部分](https://x.com/dexhorthy/status/2080697380379427275)指出的问题：即使规模“更大”、复杂度更高的基准测试，仍然会一开始就把整个问题全部透露给模型。

![图片](https://pbs.twimg.com/media/HOQAxAjagAAiJgS?format=png&name=large)

而 SlopCodeBench 的每项挑战都包含多个“检查点（checkpoint）”。模型事先不知道完整问题，而必须随着新需求逐步公开，不断演进代码库。这是一篇很好的论文，而且并不长，你应该[读一读](https://arxiv.org/html/2603.24755v1)。

![图片](https://pbs.twimg.com/media/HOQA3gZbkAAb7OY?format=jpg&name=large)

这个基准最酷的地方在于，它**尚未饱和**。测试当时最好的模型 GPT-5.4 和 Opus 4.6，严格通过率分别只有 11% 和 17%。

![图片](https://pbs.twimg.com/media/HOQA7YkboAAg5Vz?format=png&name=large)

## 用 SlopCodeBench 测试 Opus 5

上周五，我让三个 Claude 模型——Opus 4.8、Sonnet 5 和 Opus 5——跑了 [SlopCodeBench](https://arxiv.org/html/2603.24755v1) 的一个子集，并现场看了整整六个小时。从技术上说 Opus 5 获胜了，但在我看来，它们没有一个做得很好。之后我还会加入 Fable 和 5.6 Sol，发布更多结果。

![图片](https://pbs.twimg.com/media/HOQBBV8a4AAacuv?format=jpg&name=large)

最醒目的结果是：在我运行的这个小型子集上，Opus 5 得到了 **24%**，只比原论文中 Opus 4.6 的 17% 严格通过率高一点。在每项挑战推进的过程中，所有受测模型的冗长程度、复杂度和许多其他代码异味指标都显著上升。在同一组挑战中，Opus 5 写出的函数或可调用对象数量是 Opus 4.8 的**五倍**。

![图片](https://pbs.twimg.com/media/HOQBEcqbQAArgxX?format=jpg&name=large)

我个人对这个 23% 通过率的解读是：SlopCodeBench 提供了一项信号，印证了我在[第一部分](https://x.com/dexhorthy/status/2080697380379427275)里的直觉——面对形态接近真实世界、一次实现一个 issue 的软件工程工作，今天的模型还无法在没有人工引导的情况下可靠地“关灯运行（lights-off）”。

## 基准测试子集

我让 Claude 从仓库中挑选了三个问题，共计 17 个检查点，混合了标注为简单、中等和困难的问题：

- circuit\_eval —— **简单**（8 个检查点）
- database\_migration —— **中等**（5 个检查点）
- dynamic\_config\_service\_api —— **困难**（4 个检查点）

文末附录详细解释了全部 17 个检查点，这里先不全部展开。

随后，我让三个模型并行完成这些问题，每个检查点都使用全新的上下文窗口。所有模型得到完全相同的提示词，并在 Claude Code harness 中运行。

我决定关注的指标是**严格通过（strict pass）**：所有新增测试必须是绿色的，而且从之前检查点继承的每一项回归测试也必须通过。

如果解决方案存在**缺陷（defect）**，模型就无法通过该检查点。缺陷的检测方式是：取得模型产出的程序，通过一个可运行的 CLI，或者在某些情况下通过一个可交互探测的 API 服务器，对**实际产出的入口点**运行一组保留的黑盒测试。

- 模型为 **ck1** 编写代码
- 评测 harness 对 **ck1** 运行黑盒测试
- 模型为 **ck2** 编写代码
- 评测同时运行 **ck1** 和 **ck2** 的黑盒测试
- 依此类推

再强调一次，严格通过意味着：如果模型在检查点 4 搞砸了某项功能，由于出错的代码会继续保留，它也无法通过之后的检查点。除非模型在检查点 6 无意中修复了检查点 4 中失败的评测用例——但实际测试中没有发生这种情况。

在全部 9 次测试运行中，没有任何模型能在任意一项挑战的最后保持所有测试通过，甚至包括那个被标记为“简单”的问题。

## 运行过程中

Sonnet 的第一个检查点成本更高，但到了第一个问题结束时，它反而成了三个模型中最便宜的一个。似乎当基础部分搭建完毕、工作进入维护阶段之后，成本优势才开始显现。

在第一项挑战中，上一代模型持续积累缺陷；Opus 5 则在检查点 4 和 5 各出现了一个缺陷。

![图片](https://pbs.twimg.com/media/HOQBLPvaoAAhQzR?format=jpg&name=large)

最初两个小时里，Opus 5 是唯一拿到过严格通过的模型，而且一开局连续通过了三个检查点。

![图片](https://pbs.twimg.com/media/HOQBNoNagAE50C_?format=jpg&name=large)

随着测试继续，情况不断演变。Claude 也很勤快地更新着 HTML。

![图片](https://pbs.twimg.com/media/HOQBQfkaEAA3Brw?format=jpg&name=large)

与其他模型相比，Opus 5 在第一个问题 circuit\_eval 上的确更好。但在完美通过最初三个检查点后，它后续的每个解决方案都至少存在一个缺陷，也就是至少一个测试用例失败。

## 最终结果

如果成功的定义是“到达最后一个检查点时没有任何缺陷”，那么 Opus 5 在三个问题上全都失败了；只不过它失败得比其他模型稍微好看一点。

![图片](https://pbs.twimg.com/media/HOQBelubIAAp2MW?format=jpg&name=large)

在“成本与缺陷”报告中，我其实很讨厌那些典型的 Claude 式表达，但这句话我决定保留：

> 每一美元都买到了一些正确性，只是没有人买得足够多。

（显然，这个很小的基准子集无法明确证明花更多钱就一定会带来更高的通过率。）

![图片](https://pbs.twimg.com/media/HOQBib6bEAE9lOZ?format=jpg&name=large)

就严格通过而言，Opus 5 通过了四个检查点，通过率为 24%：circuit\_eval 的前三个检查点，加上 database\_migration 的 ck1。

Opus 4.8 和 Sonnet 5 都只严格通过了一个检查点，通过率为 6%，也就是 Opus 5 同样通过的 database\_migration ck1。

因此，获胜者只通过了 17 个检查点中的 4 个，而且其中 3 个都是同一个问题最开头的检查点。看来，我们终于有了一项能够检验下一代前沿模型、目前还远未饱和的基准测试。[@GOrlanski](https://x.com/GOrlanski) 和团队干得漂亮。

## Slop 指标

我目前还不完全相信可以靠“Lint 把劣质代码消灭掉”，因为我认为我们还无法用确定性方法解析某个代码库检查点的“可维护性”。不过，这些指标仍然值得持续关注。

代码质量指标很值得观察，而且从方向上看可能是正确的。

SlopCodeBench 会在每个检查点之后提供多种质量指标结果，结果文件中总共有 41 项，大致可以分成：

- **规模** —— 源代码行数、文件、函数、方法、类、语句，以及该检查点新增和删除的行数
- **复杂度** —— 圈复杂度的均值、最大值和分布，落入“高”和“极高”区间的函数数量，复杂度集中程度，最大嵌套深度，以及平均函数长度
- **重复** —— 克隆代码行数，以及克隆行占源代码的比例
- **分解程度** —— 只使用一次的函数、无实质作用的包装器、未使用变量、每个符号对应的代码行数
- **规则违规** —— Lint 错误及其中可自动修复的数量、ast-grep 对测试用 slop 规则的命中次数，以及被标记为冗长的代码行比例
- **依赖图** —— 传播成本（一次修改会扩散多远）、循环依赖规模、依赖熵（这大概是我最感兴趣的一项）

每一项指标都根据每个检查点完成后的当前代码状态，以确定性方式计算。

下图展示了 circuit\_eval 挑战中，各模型从 ck1 到 ck8 的指标变化范围，也就是在整个挑战的检查点推进过程中，slop 指标**增加**了多少。最有意思的是，大多数指标并不能真正区分这些模型。

![图片](https://pbs.twimg.com/media/HOQBnmNbcAAgtZD?format=jpg&name=large)

我喜欢这些指标可重复，而且不需要另一个模型来评判。但任意单项指标与“这个代码库是否容易修改和演进”之间的联系，目前还没有得到证实。

## 更高的正确性以多得多的代码为代价

![图片](https://pbs.twimg.com/media/HOQBqKIaMAAXl5_?format=jpg&name=large)

不过，其中很大一部分是“更多测试”。如果只看实际生产代码量，Opus 5 大约是 Opus 4.8 的 1.8 倍。

![图片](https://pbs.twimg.com/media/HOQBshQaAAAXsvx?format=jpg&name=large)

我的猜测是：这里出现了代价高昂的冗长输出，却没有直接转化为好得多的结果。

还需要进一步深入分析，才能知道这是模型自身的某种习惯信号，还是因为“这确实是一个非常困难的问题，本来就需要这么多代码”。

## 几乎所有写出的代码都触发了 Slop 指标

对所有模型来说，绝大多数代码行都会触发至少一条基准测试的 slop 规则。三个问题的平均值为：

- Opus 4.8 —— **98%**
- Opus 5 —— **93%**
- Sonnet 5 —— **89%**

具体来说，每个模型被标记为过度冗长的代码行比例都会沿着执行轨迹上升：ck1 时约为 65%，到 ck8 时达到约 80%，连 Opus 5 也不例外。

实际上，我可能会把这理解为：部分代码质量指标**有些过于激进**。我研究过把这套规则应用到我们的 TypeScript monorepo，但当前 slop-code-bench 的检测器只支持 Python。

于是我让 5.6-Sol 为 TypeScript 编写了一组规则子集。它只做出了 76 个 slop 检测器，而 SCB 的 Python 库有 200 多个。不过它还是给出了一些方向性结果：**Opus 5 在无人值守状态下生成的解决方案，每千行代码触发的 slop 规则数量，是我们那个 99% 由 AI 生成、但经过认真审查的 TypeScript monorepo 的 11 倍以上**，也就是增加了 1000%。

![图片](https://pbs.twimg.com/media/HOQCiQjaUAASErV?format=jpg&name=large)

显然，这项发现附带一大堆限制条件：规则数量更少、尚未审查规则是否对等，等等。但无论如何，它都相当有意思。

## 这些模型会写出大量函数

另一个有趣的数据点是：Opus 5 写出的函数数量是另外两个模型的五倍。但 Opus 4.8 的单次使用函数占比更高，几乎 50% 的函数只被调用了一次；Sonnet 5 的单次使用函数比例最高，达到 71.5%。

![图片](https://pbs.twimg.com/media/HOQDOW0aEAA5nHq?format=jpg&name=large)

顺便说一句，我不认为大量小函数本身是坏事。如今我会对这种观点有所保留，但以前我可是 [Clean Code](https://www.amazon.com/dp/0132350882) 的死忠。简短而具有描述性的函数名，远比到处写注释好，诸如此类。

## 所有模型的复杂度都会随时间增长

过去大约一年里，我一直凭直觉说模型会随着时间推移降低代码库质量。现在我们终于有了一些数据。

![图片](https://pbs.twimg.com/media/HOQDYQTbkAAUgpW?format=jpg&name=large)

没有一个模型能在完成所有挑战的同时，不让复杂度在各检查点之间增长。虽然 Opus 5 的平均复杂度最低，但它也写了 2000 个函数。这里存在一种取舍：大量小函数，还是数量更少但体积更大的函数。我认为任何单项复杂度指标都不能独立说明问题，但它们共同提供了某种复合信号。

![图片](https://pbs.twimg.com/media/HOQGyTOaoAARfcp?format=jpg&name=large)

面对挑战检查点不断增加的复杂度，Sonnet 和 Opus 4.8 都选择让单个函数变得更大，而不是重新调整结构。Opus 4.8 最为极端：八个检查点下来增长了 70%，其中最糟糕的单个函数最终达到了 93 的圈复杂度。

它们在重复代码上出现了分化。Opus 4.8 从 4.6% 增长到 16.8%，转折点出现在 ck3——大致就是新需求开始与最初设计发生冲突的位置。

顺带一提，下面是 circuit\_eval 最初三个检查点的要求，所有挑战的完整列表都在文末附录中：

- **ck1** —— 一个带有 `--help`、`--version`、JSON 输出模式和 `check` 命令的 CLI；它能够解析并验证 `.circ` 电路文件，每个信号都是单个 bit
- **ck2** —— 一个 `eval` 命令：向电路传入一些输入，取回输出；每个信号仍然只有一个 bit，使用标准布尔运算符
- **ck3** —— 信号变成**向量**：使用 `data[7:0]` 而不是 `data`，并加入切片、索引、拼接、新运算符，以及对每个操作数的位宽检查

到最后，每六行代码中就有一行是另一行的复制。另两个模型在同一阶段的重复率反而下降了。

不过，Opus 5 的重复指标基本持平，只从 2.41 增长到 2.64。在第一部分中，我曾用一张图推测“随时间提高代码库质量”这项能力在不同模型世代之间没有太大进展。因此，如果你相信重复率是黄金指标，也可以说过去约三个月里我们确实取得了一点增量进步。但这是个非常大的“如果”，而且我认为大多数[软件架构专家](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)都会同意，问题并不是非黑即白的。

## 更好的软件质量判定器应该是什么样

代码质量指标固然有趣，但我不认为它们说明了全部问题，而且模型很容易针对任意一项指标进行奖励钻空子。SWE-bench 形态的问题之所以曾经是“单次解决一个软件问题”的最佳验证器，是因为它们在那个“观察尺度”上对应着真实世界工作。同理，我认为“对逐步揭示的规格通过全部验证器”，是衡量“模型能否长期维护代码库”的一种非常贴近现实的评测。

也就是说，如果代码库变得难以维护，模型就会在后期检查点失败。因此，更高的严格通过率能够说明模型更擅长构建可维护的代码库。

随着 Fable、Sol 等前沿模型证明自己是优秀的调试器和逆向工程专家，把成本、时间和 token 指标纳入评测可能会越来越重要。Fable 和 Sol 这类模型也许能在最糟糕的代码库里把任务硬做出来，但我猜，结构良好的代码库通常会让未来问题的解决过程更短、消耗更少 token。

虽然“跨 8 个检查点构建完整功能”比“解决一道 15 分钟的 SWE-bench Multilingual 问题”慢得多，但它可以在无人看守的情况下执行，并在最后接受确定性行为验证器的检查。因此在我看来，它远比“另一个模型觉得这段代码干净吗”更适合作为质量判定器（oracle）。

还有一种可能更强的信号：让非常擅长维护代码库的前沿模型——例如 Opus 5、Fable 5 或 GPT-5.6-Sol——编写前 N 个检查点，再看看 Sonnet 5 或 GPT-5.6-Terra 这类能力较弱的模型能否实现检查点 N+1。

![图片](https://pbs.twimg.com/media/HOQDipdaAAEc_g1?format=png&name=large)

这样会放大一个**信号**：聪明模型是否真的维护出了一套高质量、容易修改的代码。Sonnet、Terra 甚至 Haiku 这样的小模型能否实现检查点 8，会反过来影响聪明模型在检查点 1 至 7 上的得分。

## 软件工厂为何失败：终于有了可测量的东西

我个人对这一切的解读是：SlopCodeBench 提供了一项信号，印证了我在[第一部分](https://x.com/dexhorthy/status/2080697380379427275)中的部分直觉——面对形态接近真实世界、一次实现一个 issue 的软件工程工作，今天的模型还不能在没有人工引导的情况下可靠地关灯运行。

SCB 是一个我会持续密切关注的未来指标。我在第一部分中说过，我不会把自己的代码库押在 Frontier Code、SWE-Marathon 或 DeepSWE 上；但如果有一天，模型能在 SlopCodeBench 这种衡量长期迭代、并且测试集得到良好保密的基准上取得 80% 以上，我会放心很多，更愿意让它们在无人看守的情况下自由运行。

我不会猜测这一天什么时候到来，因为相比“什么时候”，“拥有一个能够判断它正在发生的良好信号”更加重要。当然，前提是这期间没有人“不小心”用测试集训练模型。

## 下一步，以及我会改变的做法

我会更深入地阅读 SlopCodeBench 的一些问题，从中寻找灵感，并挑选几个与我们在 [@humanlayer\_dev](https://x.com/humanlayer_dev) 日常开发工作高度对应的问题。

Claude 决定按模型并行，让每个模型依次完成三项挑战。其实我们完全可以让 3 个模型乘以 3 项挑战，在 9 个并行会话中运行，这样只需 1 至 2 小时，而不是 6 小时。

正如前面所说，我研究过把这套规则应用到我们的 TypeScript monorepo，但目前 slop-code-bench 的检测器只支持 Python。把它们移植到 TypeScript 和其他几种语言会很有意思。虽然我不想成为说这种话的人，但我敢打赌，Python 比大多数语言更容易产生 slop。

我认为，与其只关注严格通过和缺陷总数，更值得探索的是基准测试的更多维度。在当前计分方式中，沿途发生的任何失败都会被视为累计缺陷。除非模型在未来某次会话中碰巧解决过去的缺陷，否则剩余的所有检查点都无法通过。

许多软件工厂会在提示词中要求更好的代码风格，也会在编码循环中针对复杂度和其他软件质量指标提供确定性反馈。今天的结果并没有评估在这些护栏存在时，模型的代码质量或成功率会怎样。我们使用的是 SlopCodeBench 提供的“只管解决问题”版本提示词，但它还有其他变体，例如在提示词中加入关于质量和重复代码的要求。如果使用以下一种或两种机制重新运行整套评测，结果会非常有趣：第一，加入由模型判断质量的“对抗式审查”循环；第二，针对圈复杂度等指标加入代码质量反压。

我的钱和时间都不是无限的，但如果能扩大数据集，应该会很好玩。

当然，最有意思的还是这个想法：“把 Fable 写出的代码库交给 Sonnet 之类的小模型，能否放大 slop 信号？”

## 直觉检查：前沿模型还是蠢得离谱

就在这项实验进行期间，另一个会话里的 Opus 5 突然失控，用新格式重写了一封邮件草稿，然后没向我确认就把它发给了 100 个人。太糟糕了。

> 用户很生气，因为我犯了一个严重错误：我用最终版本覆盖了用户编辑过的草稿，然后把它发了出去。

如果你收到了那封带着丑陋顶部横幅的 HumanLayer 产品更新邮件，很抱歉。（我猜 Claude 现在喜欢把这种东西叫作 “kicker”？）

朋友们，我真切感受到了 AGI 的威力。

🫡 —— Dex

## 附言：我们仍然非常痴迷于这件事

我们正在构建 [humanlayer.com](https://humanlayer.com/?utm_source=wsff)。这是一个智能体 IDE 与协作平台，帮助你以 AI 的速度推进工作，同时维持人类水平——或者非常接近人类水平——的代码质量。

我们正围绕两个想法进行建设：“软件工厂的基础构件”，以及“更好的软件可维护性验证器”，甚至也许是更好的模型。

HumanLayer 对不超过三人的小团队免费。如果你希望获得上手帮助，可以来我们的 [Discord](https://hlyr.dev/discord) 一起交流，或发送邮件至 [founders@humanlayer.dev](mailto:founders@humanlayer.dev)。

## 本文链接

- [《软件工厂为何失败》第一部分：仅有 harness 还不够](https://x.com/dexhorthy/status/2080697380379427275)
- [《软件工厂为何失败》第二部分：重新把灯打开](https://x.com/dexhorthy/status/2081058573556306030)
- [SlopCodeBench 论文](https://arxiv.org/html/2603.24755v1)
- [SlopCodeBench runner：SprocketLab/slop-code-bench](https://github.com/SprocketLab/slop-code-bench)
- [SlopCodeBench 问题集：gabeorlanski/scb-problems](https://github.com/gabeorlanski/scb-problems)
- [Gabe Orlanski 的 X 账号](https://x.com/GOrlanski)
- [SWE-bench Multilingual 数据集](https://huggingface.co/datasets/SWE-bench/SWE-bench_Multilingual)
- [SWE-Marathon（Abundant AI）](https://www.swe-marathon.org/)
- [DeepSWE（Datacurve）](https://deepswe.datacurve.ai/blog/deepswe)
- [Frontier Code（Cognition）](https://cognition.com/blog/frontier-code)
- [变异测试（Wikipedia）](https://en.wikipedia.org/wiki/Mutation_testing)
- [HumanLayer](https://humanlayer.com/?utm_source=wsff)
- [HumanLayer Discord](https://hlyr.dev/discord)

## 附录：挑战检查点

以下是全部 17 个检查点，顺序与模型收到的提示词完全一致。每个检查点都会独立到来，模型完全不知道后面还会出现什么要求。

**circuit\_eval** —— 简单，仿真，8 个检查点

- **ck1** —— 一个带有 `--help`、`--version`、JSON 输出模式和 `check` 命令的 CLI；它能够解析并验证 `.circ` 电路文件，每个信号都是单个 bit
- **ck2** —— 一个 `eval` 命令：向电路输入数据并获得输出；每个信号仍为单个 bit，支持标准布尔运算符
- **ck3** —— 信号变成**向量**：使用 `data[7:0]` 而不是 `data`，加入切片、索引、拼接、新运算符（MUX、归约、EQ）、对每个操作数的位宽检查，以及 `--radix` 输出格式
- **ck4** —— 三值逻辑：输入现在可以是 X（未知），每个运算符都必须定义遇到 X 时的行为
- **ck5** —— 再支持两种输入格式：`check` 和 `eval` 除 `.circ` 外还可读取 `.json` 和 `.bench` 文件，并通过 `--format` 参数选择
- **ck6** —— 三个分析命令：用于指标统计的 `stats`、用于警告的 `lint`、用于导出 Graphviz 的 `dot`；全部命令都支持三种格式
- **ck7** —— `cone`（提取子电路）、`truth-table`（枚举所有输出）、`equiv`（检查两个电路是否等价），以及用于可复现随机性的 `--seed` 参数
- **ck8** —— `opt`：带有可配置优化 pass、确定性输出、可选等价性验证和 BENCH 导出的电路优化器

**database\_migration** —— 中等，数据库，5 个检查点

- **ck1** —— 一个从 JSON 文件读取迁移规格并将其应用到 SQLite 数据库的 CLI：创建表、添加列、修改表结构
- **ck2** —— 数据迁移：使用 SQL 表达式转换已有数据行，而不只是修改包围它们的 Schema
- **ck3** —— 外键、自定义索引和高级约束：保证关系完整性和查询性能
- **ck4** —— 回滚：可以逐个或批量撤销迁移，并处理依赖关系
- **ck5** —— 依赖管理：迁移会声明 `depends_on`，工具必须解析执行顺序并检测循环依赖

**dynamic\_config\_service\_api** —— 困难，系统设计，4 个检查点

- **ck1** —— 一个存储 JSON 配置对象的 REST 服务，支持不可变版本、作用域、回滚到任意早期版本，以及配置之间的导入与继承
- **ck2** —— 带有独立版本控制的 Schema 注册表；Schema 与配置绑定，在创建和解析时进行验证，并将原始 YAML、TOML、JSON 解析成内部规范化 JSON
- **ck3** —— 变更管理工作流：每个新版本都以草稿开始，提案会收集人工审查，激活需要达到法定人数，每个提案还包含确定性 diff
- **ck4** —— 组织级护栏层：针对解析后的配置及其周边关系图运行策略包，用区别于 Schema 错误的违规详情阻止不安全提案
