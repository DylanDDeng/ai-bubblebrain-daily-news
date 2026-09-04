---
externalId: "the-complete-guide-to-pstack-part-1"
kind: "article"
title: "pstack 完整指南（第一部分）：验证就是你所需要的一切"
description: "poteto 的 pstack 实战指南：为 Coding Agent 建立严谨的验证 Skill，配套可复现的控制 CLI、Feature Map、Cloud Agent 与自动验证工作流。"
date: 2026-07-18
sourceUrl: "https://x.com/poteto/status/2094457600259842065"
tags: ["pstack", "Agent", "验证", "Skills", "Cursor", "Grok Bot"]
featured: true
draft: false
---

[原文：The Complete Guide to pstack Pt. 1](https://x.com/poteto/status/2094457600259842065)

_作者：[@poteto](https://x.com/poteto)｜原文发布于 2026 年 7 月 18 日_

![pstack 完整指南（第一部分）](https://pbs.twimg.com/media/HQ_0MA_aMAA9zMt?format=jpg&name=large)

在这一系列文章中，我会介绍自己如何使用 [pstack](https://x.ai/bot/plugin/9717366)。这是我为严谨工程工作打造的一套个人 Skills。借助它，我能够以很高的信心每月将 2,000 个 PR 交付到生产环境。

![pstack 的交付规模](https://pbs.twimg.com/media/HRD9GflbQAAKEXZ?format=jpg&name=large)

我过去很少重视自己写了多少行代码、合入了多少个 PR。在 Agent 出现以前，也没有人在意这些指标，这很合理，因为原始产出量未必能转化为质量或用户可见的成果，它只是一个虚荣指标。

构建 **pstack** 的过程让我发现，产出规模确实很重要，尤其是在 Agent 帮助你维持、甚至提高产品质量时。两个月前，我开始参与 Grok [@Bot](https://x.com/@Bot) 的开发。当时产品还处于早期阶段，代码库很新，也已经开始增长。如今团队规模扩大，每天有数百个 PR 进入 Grok [@Bot](https://x.com/@Bot) 的代码库。**pstack** 让我能持续监控代码、重构、添加新的 Lint 和检查，同时继续开发功能，从而为所有贡献者保持较高的代码质量。

> 8 月 20 日
>
> 每个团队都需要一位园丁。有人静静观察流入代码库的 PR，留意其中的异味：这周已经出现了第三个 `isRecord`，Lint 抑制也像藤蔓一样爬过精心规划的花园。需要一只稳定的手，照料那些可能吞没一切的杂草。

借助 **pstack**，我才能担任 Grok [@Bot](https://x.com/@Bot) 的园丁与维护者。原型完成后，我们保持着很高的早期势头，许多人陆续加入团队。我抓住了一个关键机会：在代码库继续开发和扩展、服务也完全不停机的同时，重构整个代码库，为它建立坚实基础。无论有多少工程师参与，更重要的是无论有多少非工程师参与，这套高质量代码库都能扩展。要完成这些工作，我必须在 Grok Bot 持续开发的过程中不断重构并改善基础，而基础本身也必须跟上贡献数量。

![Grok Bot 的性能表现](https://pbs.twimg.com/media/HRACOM4awAAPxUR?format=jpg&name=large)

Grok Bot 是市场上效率和性能都很出色的 AI 桌面应用之一。

Grok [@Bot](https://x.com/@Bot) 本身就是证明。接下来的几周里，我会讲清楚如何使用 **pstack** 构建并维护高质量应用。

## 第一部分：验证就是你所需要的一切

工具箱中最关键的一项能力，是高质量的验证 Skill。它的重要性和维护要求都很高，因此我更愿意把它视作关键基础设施。好的验证 Skill 能放大整个团队的产出，包括非工程师的产出。做好之后，团队整体产出可以提升 100 到 1,000 倍。

这里的“验证”是指 Agent 能够自行检查自己的工作。它可以持续执行，直到任务成功完成，因为它已经能够闭合反馈循环，无需由你充当瓶颈。如果你想了解我为 Cursor 创建第一个验证 Skill 的过程，可以阅读上一篇文章 [Loops You Can Trust](https://x.com/poteto/status/2069824386283319343)。

## 一起构建验证 Skill

首先安装 pstack，然后运行 [/create-verification-skill](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md)。我还建议把 [Dr Eggbot](https://x.ai/bot/93gOz3op1UQdBdbekQFLK) 加入你的 Bot 阵容。它是我用来帮助大家创建高质量 Bot 的 Bot，并随 [pstack](https://x.ai/bot/plugin/9717366) 一起提供。Dr Eggbot 会教 Coding Bot 如何使用 pstack，也能以同样严谨的方式创建非编程类 Bot。

你可以让 Dr Eggbot 创建一个 Engineer Bot，再让这个 Bot 运行 `/create-verification-skill`，并设置每天执行 `/maintain-verification-skill` 的例行任务。

![Dr Eggbot](https://pbs.twimg.com/media/HRBrZTOagAET8Vw?format=jpg&name=large)

很喜欢 Dr Eggbot。

在它运行期间，我们来看看这项 Skill 做了什么，以及它怎样帮你创建高质量的验证 Skill。

我把用于构建 Grok [@Bot](https://x.com/@Bot) 和 Cursor 的所有验证 Skills 提炼出来，做成了这样一项元 Skill。它会教 Agent 为你的应用创建专用的高质量验证 Skill。

这里就能看出技术栈选择的重要性。如果你构建的是 Electron 应用或 Web 应用，就可以利用 JavaScript 生态里丰富的调试工具。例如，[Chrome DevTools Protocol（CDP）](https://chromedevtools.github.io/devtools-protocol/)允许你使用浏览器开发者工具里的同类能力。如果构建的是 iOS 应用，也可以充分使用模拟器。

理想情况下，你需要具备与应用交互、调试、采集性能 Trace 的能力，以及手工开发应用时常用的其他调试与开发工具。如果运行时缺少丰富的工具，你可能需要让 Agent 创建专用工具，例如使用 lldb，或者开发一个只在开发环境中作为 Sidecar 运行的自定义包；也可以先充分利用现有能力。

在我看来，Agent 验证极其重要。为了获得工程上的明显优势和很高的开发效率，我甚至会认真建议团队构建自己的丰富调试工具，或选择一个更合适的技术栈。让 Agent 可以验证自己的工作，会让组织里的每个人都有能力做出贡献，并确认改动确实有效。技术栈越难调试和控制，Agent 就越难高效参与工作。

**让流程可复现**

**pstack** 有一项名为 [“Build the Lever”](https://github.com/cursor/plugins/blob/main/pstack/skills/principle-build-the-lever/SKILL.md) 的原则。放在创建 Skill 的语境中，它意味着我们更愿意为 Agent 提供工具，单纯 Markdown 还不够。对验证 Skill 来说，具体做法是创建一个小型 CLI，把应用交互和调试流程封装成一套精简、对 Agent 友好的工具。Agent 运行一条 CLI 命令就能完成任务，无需临时写脚本去点击界面，因此消耗的 Token 更少，验证 Skill 也更容易复现和测试。

下面是 Agent 可能为 Electron 应用创建的一套 CLI 示例：

```shell
# health
node .cursor/skills/verify-atlas/control-atlas.mjs doctor

# open a blank thread and send
node .cursor/skills/verify-atlas/control-atlas.mjs new-session
node .cursor/skills/verify-atlas/control-atlas.mjs send "list open tasks in this project"

# keyboard path
node .cursor/skills/verify-atlas/control-atlas.mjs press "Meta+KeyN"

# accessibility snapshot of the live UI
node .cursor/skills/verify-atlas/control-atlas.mjs snapshot

# screenshot for evidence
node .cursor/skills/verify-atlas/control-atlas.mjs screenshot /tmp/atlas-proof.png

# wait for streaming / layout to settle
node .cursor/skills/verify-atlas/control-atlas.mjs wait-settle

# flip a feature flag for the session
node .cursor/skills/verify-atlas/control-atlas.mjs feature-flag rooms_v2 on
```

这样一来，所有 Agent 都能使用这套 CLI 快速导航和调试应用。你还需要开始思考应用的开发体验：

- 如何为开发数据库填充种子数据；
- 如何处理身份验证、测试用户，以及对测试或预发布环境的 API 调用；
- 如何用一致的方式安装并启动开发环境。

这些也是手工编写代码时需要考虑的问题。你可以把这套 CLI 看作 Agent 做开发工作的主要工具，并持续维护和测试它。

还可以考虑加入下面这些命令：

```markdown
- **Inspection:** `info`, `snapshot`, `screenshot`, `components`
- **Navigation:** `home`, `new-session`, `select-project`, `select-runtime`, `scroll`
- **Interaction:** `send`, `click`, `click-xy`, `aria-click`, `type`, `press`, `eval`, `upload-image`, `add-context`, `feature-flag`
- **Performance:** `trace`, `profile`, `record`, `perf-metrics`, `wait-settle`
- **Streaming:** `console`, `network-log`, `network-summary`
- **Health & cleanup:** `doctor`, `cleanup`, `watch --restart`
```

完成这套基础配置后，Agent 的表现应该已经会明显改善，它们能够轻松导航和调试应用。

我建议先投入时间，让 CLI 达到稳定且无错误的状态，再继续更高级的工作。你还需要思考如何设计一套对 Agent 友好的 CLI，也可以直接让 Agent 帮你设计。网上有很多相关资源可供参考，我看重的关键特性包括：

- API 容易组合，可以参考 John Ousterhout 的深模块理念；
- 任何可能产生破坏性副作用的命令都应提供 `--dry-run` 选项；
- 使用子命令逐步披露功能，避免一次展示全部能力；
- 错误信息应足够具体，并告诉 Agent 接下来应该怎么做；
- 提供内容丰富的 `--help` 文本；
- 以机器可读格式返回输出，例如 JSON。

**使用 [Cloud Agents](https://cursor.com/docs/cloud-agent) 并行提速，减少对 Worktree 的依赖**

当验证 Skill 已经帮助你成功合入几个 PR 后，你很可能会开始考虑扩大并行度。比如，Agent 已经能够接收 Prompt，并大体独立推进到可合并状态，那么你也获得了同时运行更多 Agent 的空间。

很多人的第一反应是增加 Worktree 支持，让 Agent 使用 Git 创建一份受版本控制的独立仓库副本，在隔离环境中修改代码。理论上，这允许多个 Agent 同时运行，并避免互相覆盖改动。

我不建议采用这种方式。它会消耗大量磁盘空间和机器资源。具体上限取决于仓库大小和电脑性能，你也许最多只能并行运行 10 个使用 Worktree 的 Agent。还有一种更好的方式。

Cursor 的 [Cloud Agents](https://cursor.com/docs/cloud-agent) 运行在 Cursor 的云基础设施上。它们可以访问一台真实计算机，因此能够安装依赖、运行应用、拍摄视频和截图，也能像真人一样与应用交互。如果你已经在前一步中完善了开发体验，配置 Cloud Agents 应该不会带来太多额外工作。第一次配置云环境时，Cursor 会安排一个 Agent 协助完成设置。首个 Build 结束后，系统会创建一个[快照](https://cursor.com/docs/cloud-agent/builds)，后续的 Cloud Agent 任务都能快速启动。

我很建议花时间配置 Cloud Agents，因为它能显著提高并行工作的产能。在后续文章中，我会展示自己如何在云端并行运行数百个子 Agent。眼下先把环境配置好，让你可以逐步建立起在云端运行全部 Agent 的信心。

**用 Feature Map 让 Agent 保持聪明**

随着应用变得复杂，Agent 需要更多指引，才能找到功能并与它们交互。为此，我提出了 Feature Map。顾名思义，它是一份容易搜索的应用功能地图，记录每项功能的作用，以及用户怎样到达该功能。

我为一个名为 Atlas 的虚构应用准备了一份 [Feature Map 示例](https://github.com/poteto/verification-skill-example/blob/main/.cursor/skills/verify-atlas/references/features/README.md)。它由几份 Markdown 文件组成，并在验证 Skill 的 `SKILL.md` 中被引用。

你可以把这份文件放在任何位置。`/create-verification-skill` 会自动创建一个 `references/features` 目录，并在其中生成 `README.md`。这个 README 就是地图本身：它从高层概括所有主要功能，并链接到具体细节。某项功能的记录可能是这样：

```markdown
# Preferences

Full-screen preferences overlay and its tab set.

## Sub-features

- settings-overlay: full-screen overlay opened from the gear or Cmd/Ctrl+,
- settings-nav: left nav of tabs (General, Appearance, Models, Plan & Usage, ...).
- settings-search: in-overlay search (Cmd/Ctrl+K while settings is open).
- theme-picker: quick theme control on Appearance.

## How to get to it (user POV)

Click the gear next to the account avatar, or press Cmd/Ctrl+,. Pick a tab from the left nav. Type in the preferences search box to jump. Escape or the close control dismisses.

## Driving it with control-atlas

bash
node .cursor/skills/verify-atlas/control-atlas.mjs press "Meta+Comma"
node .cursor/skills/verify-atlas/control-atlas.mjs snapshot
node .cursor/skills/verify-atlas/control-atlas.mjs press "Escape"

- Overlay root: look for a dialog/region named Preferences in the a11y tree.
- Tabs: click by visible name. Plan & Usage may be absent for some account states.
- While settings is open, Cmd/Ctrl+K is preferences search, not the global palette (see `multi-surface-journeys.md`).

## Gotchas

- Closing settings mid-suite can leave focus nowhere useful. `new-session` or `home` recovers.
- Some tabs are entitlement-gated. Skip with an explicit account reason.
```

你无需亲自编写这些内容。运行 **/create-verification-skill** 后，Agent 会自动检查应用、梳理全部功能，并创建这些参考文件。

Feature Map 与 CLI 结合，是 pstack 验证 Skills 表现出色的主要原因之一。Agent 由此获得每一项功能的上下文，知道功能用途与到达路径，既节省了上下文窗口中的宝贵 Token，也能准确理解功能并找到它。

你可以把 Feature Map 理解为一种“物化记忆”。如果你已经使用 Agent 一段时间，应该很熟悉记忆的概念。它可以存储在简单的 Markdown 文件里，例如 Obsidian Vault，也可以放入更复杂的载体，例如向量数据库。我认为代码库才是记忆的最终形态。代码投射了你和团队做过的决策，也代表着事情如何发生、系统如何运作的事实来源。Feature Map 是更紧凑的代码库记忆，专门用来节省 Token。它以 Markdown 形式存在于 Skill 中，因此每位代码贡献者都能从这份共享记忆中受益。

因此，维护验证 Skill 非常重要。我建议每天至少运行一次 **/maintain-verification-skill**，确保 Agent 始终掌握控制应用的最新细节。随着验证 Skill 被持续使用，你也可能看到 Agent 在工作时主动更新它。`/maintain-verification-skill` 会补上遗漏的内容。

## 如何使用验证 Skill

这里有一份为虚构应用制作的完整验证 Skill 示例：[https://github.com/poteto/verification-skill-example](https://github.com/poteto/verification-skill-example)。再次提醒，运行 **/create-verification-skill** 即可创建一套包含基础 CLI 和 Feature Map 的验证 Skill。

下面是我通常将它与 **pstack** 配合使用的方式。

首先，在 Prompt 开头输入 **/poteto-mode**。如果通过 Cursor 使用 pstack，在自动补全 `/poteto-mode` 时，可以按 Opt + Enter 代替普通的 Enter。这样会把该 Skill 添加为 [Custom Mode](https://cursor.com/changelog/08-19-26#custom-modes)，并将它固定下来，使 Agent 在每个新 Turn 中都收到使用该 Skill 的提醒。

![将 poteto-mode 固定为 Custom Mode](https://pbs.twimg.com/media/HRAqVoyb0AEwvnc?format=png&name=large)

输入 `/poteto-mode`，再按 Opt + Enter，把它固定为 Custom Mode。

在 Grok [@Bot](https://x.com/@Bot) 中，先安装[插件](https://x.ai/bot/plugin/9717366)，再输入 `/poteto-mode`。

![在 Grok Bot 中使用 pstack](https://pbs.twimg.com/media/HRArLIFa4AApHT3?format=png&name=large)

你也可以在 Grok Bot 中使用 pstack。

**示例：开发新功能**

开发新功能时，我通常把验证 Skill 与 `/poteto-mode` 配合使用，让 Agent 主动验证自己的工作。例如，我会这样写 Prompt：

> /poteto-mode build \<description of feature, any useful context>. use /control-app to verify your changes and show me a video and screenshots as proof

这里的 `/control-app` 是 `/create-verification-skill` 生成的结果。在 Grok [@Bot](https://x.com/@Bot) 中，我会这样写：

> spawn a cloud agent to use /poteto-mode to build \<description of feature, any useful context>. use /control-app to verify your changes and show me a video and screenshots as proof

这里有一个小区别：在 Grok [@Bot](https://x.com/@Bot) 中，你会让 Bot 创建 Cloud Agent 来工作，而不让 Bot 自己执行。这样可以释放 Bot，让它同时处理其他事情，也能保持上下文窗口干净。从这个角度看，我更愿意把 Bot 视为管理和监督 Cloud Agents 的协调者。Cloud Agents 还能使用 Cursor 提供的全部模型，每个 Agent 都有自己的独立机器，因此 Bot 所在的计算机也可以保持空闲。

**示例：性能优化**

> spawn a cloud agent to use /poteto-mode to improve the initial loading time of our app. first use /control-app to take a trace of the status quo, and identify opportunities for improvement. then do a targeted fix and use /control-app + a [/swarm](https://github.com/cursor/plugins/blob/main/pstack/skills/swarm/SKILL.md) to confirm the win

[/swarm](https://github.com/cursor/plugins/blob/main/pstack/skills/swarm/SKILL.md) 是最适合与验证 Skill 组合使用的 Skills 之一。它会展开任意数量的 Cloud Agents，让它们运行你的验证 Skill。比如，你可以用足够大的样本确认性能收益，也可以进行模糊测试，确保功能没有出现破坏或回归。

**示例：自动复现用户反馈**

当验证 Skill 达到满意状态后，可以把它放进 Grok [@Bot](https://x.com/@Bot) 的 Routines，或放进 [Cursor Automations](https://cursor.com/docs/cloud-agent/automations)。Routines 和 Automations 可以按计划运行，也可以在事件发生时触发。

例如，如果你把用户反馈接入 Slack，或者团队有自己的内部反馈频道，就可以让 Bot 监听每一条反馈，并自动创建 Cloud Agent 尝试复现问题。当验证 Skill 和 Feature Map 足够完善时，你甚至可以进一步让它自动修复问题。

前面已经强调过，验证是工具箱中最重要的 Skills 之一。它为构建其他 Skills 和 Routines 打下基础，更关键的是，团队中的每个人都能从中受益。

## 持续投入验证 Skill

验证 Skill 创建完成后，要继续使用 `/maintain-verification-skill` 保持它的敏锐度。持续改善 CLI，并像投资关键基础设施一样投入这项 Skill。你甚至可以为它安排值班轮换，因为它对释放团队 100 到 1,000 倍的产能非常重要。

这项 Skill 也是后续 **pstack** 指南中许多其他 Skills 的基础，并且可以与它们很好地组合。

- pstack：[https://x.ai/bot/plugin/9717366](https://x.ai/bot/plugin/9717366)（[GitHub 链接](https://github.com/cursor/plugins/tree/main/pstack)）
- Dr Eggbot：[https://x.ai/bot/93gOz3op1UQdBdbekQFLK](https://x.ai/bot/93gOz3op1UQdBdbekQFLK)

我建议把 [Dr Eggbot](https://x.ai/bot/93gOz3op1UQdBdbekQFLK) 加入你的 Bot 阵容。它是我用来帮助大家创建高质量 Bot 的 Bot，并随 pstack 一起提供。Dr Eggbot 会教 Coding Bot 如何使用 pstack，也能以同样严谨的方式创建非编程类 Bot。

你可以让 Dr Eggbot 创建一个 Engineer Bot，再让这个 Bot 运行 `/create-verification-skill`，并设置每天执行 `/maintain-verification-skill` 的例行任务。

感谢阅读，第二部分见！
