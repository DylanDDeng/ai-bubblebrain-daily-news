---
title: "Agent 入门：Model 如何在 Harness 中完成任务"
slug: "deepseek-harness-agent-model-harness"
description: "从 Model、Tools 与 Harness 的分工出发，看懂 DeepSeek Harness 如何用 Turn、Step、工具调用和会话日志组成一个 Agent。"
date: 2026-08-14T04:00:00Z
tags: ["DeepSeek Harness", "AI Agent", "Agent Loop", "Model", "工具调用"]
author: "BubbleBrain"
sourceUrl: "https://github.com/deepseek-ai/deepseek-harness"
---

> Model 会生成下一步，Harness 让下一步真的发生。两者加上工具、上下文与反馈循环，才形成一个可以持续完成任务的 Agent 系统。

当你让一个编程 Agent修复登录页面的错误并运行测试时，看起来像是模型独立完成了一切。

实际上，模型本身通常只接收一组消息和工具说明，再生成文字或结构化工具调用。读取文件、执行命令、询问权限、保存会话与继续下一轮，都由模型外部的 Harness 完成。

这篇帮你拆开一次 Agent 任务，帮你看懂 DeepSeek Harness 中 Model、Harness 和 Tools 到底怎样合作。

## 先记住这个公式

可以先用一个不严格但很实用的公式理解 Agent：

```text
Agent = Model + Harness
```

| 部分     | 它负责什么                                         | 它不负责什么                         |
| -------- | -------------------------------------------------- | ------------------------------------ |
| Model    | 理解当前上下文，生成回答，选择下一步或工具         | 不直接读取硬盘，也不天然保存完整会话 |
| Harness  | 组装上下文，驱动循环，执行工具，管理权限与状态     | 不替代模型理解开放式目标             |

这里的 Agent 不是一个隐藏在 Model 旁边的“第二个大脑”，而是这几部分协作后表现出来的系统能力。

![Model、Harness、Tools 和 Agent 系统之间的关系](/media/deepseek-harness-tutorials/agent/model-harness-agent.svg)

_图中的流光表示信息正在系统中移动；如果系统开启了“减少动态效果”，动画会自动停止。_

## Model：负责判断下一步

在一次请求中，Model 看到的通常包括：

- 系统提示词与当前任务规则。
- 用户目标和相关会话历史。
- 当前可以使用的工具名称、说明与参数 Schema。
- 前一步工具返回的观察结果。

然后它生成两类输出之一：

1. **普通内容**：例如解释原因、汇报结果或给出最终回答。
2. **工具调用**：例如要求读取 `package.json`，运行测试，或修改某个文件。

Model 擅长处理“下一步该做什么”这种开放式判断，但它有三个天然限制：它可能猜错；它只知道本次请求中提供的上下文；它生成一个工具调用，并不等于工具已经安全执行。

所以 Model 能力再强，也不能单独构成可靠 Agent。

## Harness：负责把判断变成过程

Harness 位于 Model 和外部世界之间。在 DeepSeek Harness 当前架构中，它至少承担六项职责：

| Harness 职责            | DeepSeek Harness 中的对应部分           |
| ----------------------- | --------------------------------------- |
| 接收目标与后续消息      | Agent inbox、`turn/start`               |
| 组装提示词和工具 Schema | `ctx.systemPrompt`                      |
| 调用指定模型            | `ctx.llm` 与模型 Provider               |
| 执行和保护工具调用      | `ctx.tools`、approval、sandbox 与 guard |
| 记录可恢复的过程        | append-only `SessionEvent` log          |
| 决定继续还是结束        | Agent Loop 的 Turn / Step 生命周期      |

这也是为什么 DeepSeek Harness 把模型适配器、工具注册表、会话日志和 Agent Loop 都设计成插件：Harness 不是一条写死的脚本，而是一组可以替换和组合的运行能力。

## 一次任务怎样跑起来

假设你输入：

> 找出 README 中失效的启动命令，修正它，并运行最相关的检查。

一次合理的执行轨迹可能是：

1. Harness 打开一个 **Turn**，从 inbox 取出这条目标。
2. 它把系统提示词、会话历史和工具 Schema 组装成模型请求。
3. Model 判断需要先读取 README，于是生成文件读取工具调用。
4. Harness 记录 `tool/call`，经过权限与文件策略检查后执行工具。
5. 读取结果以 `tool/result` 写入会话日志，并进入下一个 **Step**。
6. Model 根据观察结果提出编辑，再由 Harness 执行并记录。
7. Model 选择运行检查；Harness 在沙箱与审批边界内启动命令。
8. 检查通过后，Model 生成最终说明。没有待处理工具或新输入时，Harness 关闭 Turn。

![DeepSeek Harness 中由多个 Step 组成的 Agent Loop](/media/deepseek-harness-tutorials/agent/agent-loop.svg)

_一个 Turn 可以包含多个 Step。每个 Step 通常包含一次模型请求，以及它生成的零个或多个工具调用。_

DeepSeek Harness 的官方架构文档把这条主干写得很明确：每一步都会从会话日志派生模型历史，组装提示词和工具 Schema，流式请求模型，执行工具，再把模型可见的事实写回日志。

## 为什么一定要把结果送回 Model

工具调用不是循环的终点，而是下一次判断的输入。

例如 Model 要求运行：

```bash
npm test
```

Harness 真正执行后可能得到三种不同观察：

- 测试通过：Model 可以整理最终回答。
- 测试失败：Model 可以读取错误并继续定位。
- 权限被拒绝：Model 应调整方案或向用户解释阻塞点。

这就是 ReAct 所强调的“reasoning 与 acting 交错”：推理帮助系统维护计划，行动让系统从环境取得新信息。真正有价值的不是让模型一次猜完整答案，而是让它在每次观察之后更新下一步。

不过，循环并不会自动带来正确性。Harness 能保证结果被记录和重新提供，不能保证 Model 一定读懂错误、一定运行验证，或一定在正确时机停止。因此高质量任务还需要明确的完成标准。

## 用完成标准约束 Agent

比较下面两种提示：

```text
帮我看看这个项目。
```

```text
阅读 README 和 package.json，说明项目用途、启动命令和测试命令。
先只读取，不要修改文件；回答前核对两个文件中的命令是否一致。
```

第二种更适合 Agent，因为它同时定义了：

- **范围**：只看 README 和 package.json。
- **权限**：本轮只读。
- **产物**：用途、启动命令、测试命令。
- **验证**：核对两个来源是否一致。

可以复用下面这个模板：

```text
目标：<最终要得到什么>
范围：<允许读取或修改什么>
约束：<不能做什么，需要询问什么>
验证：<运行什么检查，或怎样证明完成>
输出：<最后希望看到的格式>
```

Model 决定具体路径，Harness 执行并记录路径，而完成标准帮助它们知道何时应该停止。

## Agent 与 Workflow 不完全相同

Anthropic 在《Building Effective AI Agents》中给出了一个很实用的区分：

- **Workflow**：LLM 和工具按预先写好的代码路径执行。
- **Agent**：LLM 动态决定自己的过程与工具使用方式。

例如“每天读取固定 CSV，再按固定模板生成周报”更像 Workflow；“进入陌生仓库，自己决定读哪些文件、运行哪些检查并修复问题”更像 Agent。

两者没有高低之分。预定义流程通常更便宜、更稳定、更容易测试；Agent 用更高的延迟与成本换取对未知步骤的适应能力。

## 什么时候不需要 Agent

下面这些任务通常先考虑一次 Model 调用或确定性 Workflow：

- 翻译一段已经给出的文字。
- 按固定 Schema 从一份文档提取字段。
- 对输入执行明确、稳定、没有分支的转换。
- 任何必须逐步可预测、不能让模型自由选择路径的操作。

下面这些任务更能发挥 Agent + Harness 的价值：

- 需要先探索环境，步骤无法提前完全确定。
- 需要在工具结果、错误和新信息之间反复调整。
- 任务跨越多个文件、命令或外部服务。
- 可以定义清楚的权限边界与完成验证。

最好的 Agent 不是最复杂的系统，而是刚好能够可靠完成目标的系统。

## 在 DeepSeek Harness 中观察这套循环

如果你已经完成[启动 Web UI](/deepseek-harness-tutorials/deepseek-harness-getting-started/)，可以在一个练习仓库中发送：

> 只读取 package.json。先说明你准备调用什么工具，再读取文件，最后列出 scripts 中的启动和测试命令。不要修改任何内容。

观察界面中的三个位置：

1. Model 生成的工具调用及参数。
2. Harness 返回的工具结果或权限提示。
3. 下一次模型响应是否真正引用了刚取得的观察。

如果更喜欢终端，也可以在 [`cc-tui` 插件](/deepseek-harness-tutorials/deepseek-harness-cc-tui-guide/)中按 `Ctrl+O` 展开思考和工具详情。

## 最后总结

读完这一篇，只需要带走四句话：

1. Model 负责根据当前上下文生成下一步，不直接等于 Agent。
2. Harness 负责上下文、循环、工具、权限、会话和恢复。
3. 工具结果必须成为下一步观察，Agent 才能根据现实调整。
4. 清楚的范围、权限和验证标准，比盲目增加自主性更重要。

继续实践可以从[启动 Web UI：从零完成第一个任务](/deepseek-harness-tutorials/deepseek-harness-getting-started/)开始；想理解底层插件组合，再回到[认识 DeepSeek Harness](/deepseek-harness-tutorials/deepseek-harness-overview/)。

## 参考资料

- [DeepSeek Harness Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/architecture.md)
- [DeepSeek Harness Agent Turn and Step Lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/agent-lifecycle.md)
- [DeepSeek Harness Tool Execution Pipeline](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/tool-execution-pipeline.md)
- [Building Effective AI Agents — Anthropic](https://www.anthropic.com/research/building-effective-agents)
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
