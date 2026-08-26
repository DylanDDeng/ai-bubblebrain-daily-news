---
title: "认识 Pi"
description: "先不急着安装，从源码结构和 Agent Loop 理解 Pi 是什么、它与模型是什么关系，以及它为什么刻意保持极简。"
date: 2026-08-25
lastmod: 2026-08-25
draft: false
weight: 1
slug: "pi-agent-overview"
sourceUrl: "https://github.com/earendil-works/pi"
tags: ["Pi Agent", "Agent Harness", "Agent Loop", "新手教程"]
---

> 本系列基于 `earendil-works/pi` 仓库的 `dcd4619` 版本编写。Pi 更新很快，具体命令变化时请优先核对[官方文档](https://pi.dev/docs/latest)。

## Pi 到底是什么

Pi 是一个运行在终端里的编程 Agent，也是一套可以嵌入其他产品的 Agent Harness。这里的 **Harness** 可以理解为“让模型真正做事的工作台”：它负责准备上下文、把工具交给模型、执行工具调用、把结果送回模型，并保存整段会话。

模型本身只会接收消息并生成下一段内容。Pi 在模型外面补上了四类关键能力：

- **工具**：默认提供 `read`、`write`、`edit` 和 `bash`；
- **状态**：记住消息、当前模型、思考强度与正在执行的工具；
- **循环**：只要模型还在调用工具，就把结果送回去继续推理；
- **界面**：在终端里呈现消息、工具调用、编辑器和会话状态。

![Pi Agent Loop：模型调用工具，再根据结果继续工作](/media/pi-agent-tutorials/pi-agent-loop.svg)

## 从源码看 Agent Loop

在源码的 `packages/agent/src/agent-loop.ts` 中，一轮工作的主干非常清楚，这是 `runLoop` 里的核心循环：

```ts
// Inner loop: process tool calls and steering messages
while (hasMoreToolCalls || pendingMessages.length > 0) {
	// …

	// Stream assistant response
	const message = await streamAssistantResponse(
		currentContext, config, signal, emit, streamFunction,
	);
	newMessages.push(message);

	// Check for tool calls
	const toolCalls = message.content.filter((c) => c.type === "toolCall");

	const toolResults: ToolResultMessage[] = [];
	hasMoreToolCalls = false;
	if (toolCalls.length > 0) {
		const executedToolBatch =
			message.stopReason === "length"
				? await failToolCallsFromTruncatedMessage(toolCalls, emit)
				: await executeToolCalls(currentContext, message, config, signal, emit);
		toolResults.push(...executedToolBatch.messages);
		hasMoreToolCalls = !executedToolBatch.terminate;

		for (const result of toolResults) {
			currentContext.messages.push(result);
			newMessages.push(result);
		}
	}

	await emit({ type: "turn_end", message, toolResults });
	// …
}
```

![一轮之内的六步：消息交给模型、流式接收回复、找出 toolCall、执行工具生成 toolResult、结果加入上下文，直到模型不再调用工具，本轮结束](/media/pi-agent-tutorials/pi-agent-turn-steps.svg)

左边是循环里的六步，右边是同一时间上下文里发生的事：用户消息、模型回复、`toolCall` 和 `toolResult` 一条条堆进去。只要还有工具调用，就带着新上下文回到第一步；没有了，这一轮才算结束。

这就是为什么一句“帮我理解这个项目并运行测试”，最终可能变成读取 `README`、搜索源码、执行测试、检查报错再修复的连续动作。

## Pi 为什么看起来很简洁

Pi 的官方介绍明确写着：它提供强力默认配置，但不会把Subagent、Plan Mode 等所有能力都内置进去。你可以让 Pi 编写一个扩展插件，或者安装第三方 Pi Package，把工作流变成自己想要的样子。

它的可扩展结构可以分成四层，每一层在源码里都有对应实现：

- **Prompt Templates**：复用一段常用提示，本质是带 frontmatter 的 Markdown 文件（`packages/agent/src/harness/prompt-templates.ts`）；
- **Skills**：按需加载专门知识、流程与脚本，同样是 Markdown + frontmatter 的目录约定（`packages/agent/src/harness/skills.ts`）；
- **Extensions**：用 TypeScript 订阅事件，改变工具、命令与界面——官方示例 `auto-commit-on-exit.ts` 只靠一个 `pi.on("session_shutdown")` 钩子就实现了退出时自动 git commit（`packages/coding-agent/examples/extensions/`）；
- **Pi Packages**：把上面这些资源打包后通过 npm 或 Git 分享（`packages/coding-agent/src/core/package-manager.ts`）。

![Pi 的四层扩展结构：Prompt Templates、Skills、Extensions 三类资源被装进一个 Pi Package，再通过 npm 或 Git 分享](/media/pi-agent-tutorials/pi-four-layers.svg)

前三层是三类资源，第四层是它们的分发方式：装进一个 Pi Package，别人一条 `npm install` 或 `git clone` 就能接走你的整套工作流。有个彩蛋可以佐证这套机制的成色——Pi 仓库自己就在用它：根目录的 `.pi/extensions/` 里放着团队开发 Pi 时的四个自用 Extension。

因此，Pi 的重点是核心足够小，扩展边界足够清楚。

## 你将学到什么

这套入门教程分为九篇：

1. 当前这篇：理解 Model、Harness、Tools 与 Agent Loop；
2. [从源码看 Pi 的 Compaction 策略](/pi-agent-tutorials/pi-agent-compaction/)；
3. [Pi 的会话存储](/pi-agent-tutorials/pi-agent-session-storage/)；
4. [Pi 的上下文工程](/pi-agent-tutorials/pi-agent-context-engineering/)；
5. [Pi 的工具系统](/pi-agent-tutorials/pi-agent-tool-system/)；
6. [安装 Pi，并完成第一个真实任务](/pi-agent-tutorials/pi-agent-getting-started/)；
7. [用 AGENTS.md 和文件引用让 Pi 读懂项目](/pi-agent-tutorials/pi-agent-project-context/)；
8. [理解会话、分支与上下文压缩](/pi-agent-tutorials/pi-agent-sessions/)；
9. [用 Skills 与 Extensions 扩展 Pi](/pi-agent-tutorials/pi-agent-skills-extensions/)。

## 开始前需要知道的安全边界

Pi 默认以启动它的用户权限运行，并没有内置文件、进程、网络或凭据沙箱。`read`、`write`、`edit`、`bash` 都是在你的真实环境里工作。

初学者最好遵循三条规则：

- 在有 Git 的练习项目里开始，方便查看和回滚改动；
- 不要在不可信仓库里直接加载陌生 Extensions 或 Skills；
- 无人值守或高风险任务放进容器、虚拟机或独立沙箱。

下一篇我们顺着这个循环继续看源码：上下文一轮轮变大之后，Pi 是怎么给它“瘦身”的。
