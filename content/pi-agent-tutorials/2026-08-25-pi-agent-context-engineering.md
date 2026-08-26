---
title: "Pi 的上下文工程"
slug: "pi-agent-context-engineering"
description: "模型每轮收到的输入是现场组装的：系统提示词怎么拼、消息列表长什么形状、工具输出进上下文前经过了哪些防护。"
date: 2026-08-25
lastmod: 2026-08-25
draft: false
weight: 2
sourceUrl: "https://github.com/earendil-works/pi"
tags: ["Pi Agent", "上下文工程", "System Prompt", "Agent Harness"]
---

> 本系列基于 `earendil-works/pi` 仓库的 `dcd4619` 版本编写。Pi 更新很快，具体命令变化时请优先核对[官方文档](https://pi.dev/docs/latest)。

## 每轮的输入都是现场组装的

上一章看到 Agent Loop 在一轮轮生产消息。这一章看循环的另一半：**每次调用模型之前，Pi 都要现场组装一份完整输入**——一段系统提示词，加一列消息。

值得强调的是：模型收到的从来不是"聊天记录"本身，而是这份**每轮重新拼装的投影**。理解了组装规则，你就能解释很多现象：为什么换个目录启动 Pi 表现不一样、为什么压缩后它还记得目标、为什么大文件不会挤爆窗口。

## 系统提示词是动态拼出来的

`buildSystemPrompt`（`packages/coding-agent/src/core/system-prompt.ts`）把系统提示词拼成六层：

![Pi 的系统提示词由六层现场拼成：身份、工具清单、动态指南、项目规则、Skills 清单、工作目录](/media/pi-agent-tutorials/pi-context-assembly.svg)

有意思的是那些"看条件才拼"的细节。先看第二层的工具清单。它在提示词里长这样——每行是「工具名 + 一句话简介」：

```
Available tools:
- read: 读取文件内容
- bash: 执行 shell 命令
…
```

这句简介不是自动生成的，而是注册工具的一方（内置工具或扩展）单独提供的（`toolSnippets`）。拼清单时，Pi 会过滤一遍——**只有配了这句简介的工具才会被写进清单**：

```ts
// A tool appears in Available tools only when the caller provides a one-line snippet.
const tools = selectedTools || ["read", "bash", "edit", "write"];
const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
```

注意这里的分寸：**「能不能用」和「上不上清单」是两回事**。模型真正能调哪些工具，由 API 层随请求发送的工具定义决定，那份定义总会带上；清单只是提示词里的"导览页"。没上清单的工具照样能调——提示词里紧跟着清单的下一句原文，就是给它们留的口子：

```
In addition to the tools above, you may have access to other custom tools
depending on the project.
```

设计逻辑很务实：清单占的是提示词里的注意力位置，能用一句话说清用途的工具才值得占一行，光秃秃一个工具名列上去只是噪音。

指南也是按实际工具动态生成的——只有当没有专门的搜索类工具时，才会教模型"用 bash 做 ls、rg、find"：

```ts
if ((hasBash || hasPowerShell) && !hasGrep && !hasFind && !hasLs) {
	// …
	addGuideline("Use bash for file operations like ls, rg, find");
}
```

最典型的一处防护是 Skills 清单：

```ts
// Append skills section (only if read tool is available)
if (hasRead && skills.length > 0) {
	prompt += formatSkillsForPrompt(skills);
}
```

道理一想就通：Skill 的正文要靠 `read` 工具去读，如果这个模型配置里根本没有 `read`，把技能清单塞给它只会诱导一次注定失败的调用。**提示词里的每一层，都以"模型真的用得上"为前提**——这是上下文工程和"堆提示词"的分界线。

项目规则那一层也值得记住形状：你的 `AGENTS.md` 等文件会被包在 `<project_instructions path="…">` 标签里注入——路径都带着，模型知道每条规则来自哪个文件。

## 消息列表：从树上重建，从摘要开始

另一半输入是消息列表：**对话本身就装在这里**：你的每一句话是一条 `user` 消息，模型的每次回复是一条 `assistant` 消息（`toolCall` 就在它的内容里），每个工具结果是一条 `toolResult` 消息。你刚敲下的那句话也不例外：先写进 Pi 的会话存储（第五章细讲），再随本轮重建进入列表末尾。

所以一份真正发出去的请求，形状大致是：

```
[system]                            ← 上一节拼出来的六层
[summary]                           ← 若发生过压缩（下一章细讲）
[user] [assistant] [toolResult] …   ← 活跃路径上的对话，原样按序
[user]                              ← 你最新的那句
```

Pi 把**全部**历史都存着——存成一棵会话树，第五章细讲——但发给模型的不是全部。重建逻辑在 `packages/agent/src/harness/session/context.ts`：

```ts
export function defaultContextEntryTransform(pathEntries: readonly Entry[]): Entry[] {
	let compaction: CompactionEntry | undefined;
	let compactionIndex = -1;
	for (let index = pathEntries.length - 1; index >= 0; index--) {
		const entry = pathEntries[index]!;
		if (entry.type === "compaction") {
			compaction = entry;
			compactionIndex = index;
			break;
		}
	}
	return compaction === undefined ? [...pathEntries] : [compaction, ...pathEntries.slice(compactionIndex + 1)];
}
```

一句话读完：**从活跃路径的末尾往回找最近的一条压缩记录，找到了，就从它开始截断**——摘要变成第一条消息，之后的消息原样跟上。压缩（下一章）和会话树（第五章），就在这十几行里合成了模型每轮真正看到的东西。

顺带一提，当前该用哪个模型、什么思考强度、哪些工具可用，也是从路径上回放出来的——`deriveSessionContextState` 把 `model_change`、`thinking_level_change` 这些记录从头扫一遍，最后的状态就是当前状态。"一切皆 entry"的设计在这里又赚了一次。

## 工具输出进上下文之前

一次工具调用的结果，不是原样进上下文的。防护有两道，一道在执行之前，一道在执行之后：

![两道闸：执行前，被截断的回复里所有 toolCall 判失败重来；执行后，原始输出经 2000 行 / 50KB 双限截断，附上 truncated 标记才进上下文](/media/pi-agent-tutorials/pi-tool-guards.svg)

**第一道：双限截断**（`packages/coding-agent/src/core/tools/truncate.ts`）。不管命令实际吐了多少，写进 `toolResult` 的内容有硬上限：

```ts
/**
 * Truncation is based on two independent limits - whichever is hit first wins:
 * - Line limit (default: 2000 lines)
 * - Byte limit (default: 50KB)
 *
 * Never returns partial lines (except bash tail truncation edge case).
 */
export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
export const GREP_MAX_LINE_LENGTH = 500; // Max chars per grep match line
```

行数和字节数两个限制独立起作用，先撞线的生效，而且**绝不截半行**——半行日志比没有日志更误导模型。所以一句 `cat` 大文件不会挤爆窗口：超出的部分被截掉，并附上"已截断"的标记，模型看到后自然会换 `grep`、`head` 这类更精准的姿势重试。

**第二道：残缺调用一律不执行**。如果模型的回复因为撞到输出 token 上限而中断（`stopReason === "length"`），这条回复里的每个 `toolCall` 参数都可能是不完整的。Pi 的处理是**全部判为失败、一个都不执行**，让模型带着完整参数重新调用。宁可多花一轮，也不跑半条命令。

最后还有一条协议层的不变式，源码注释写得很直白：*The last message in context must convert to a `user` or `toolResult` message*——发给模型的消息列表，最后一条必须是用户消息或工具结果。通常，它就是你刚敲下的那句话——否则 LLM 提供商会直接拒绝请求。`agentLoopContinue` 在入口就把 `assistant` 结尾的上下文挡了回去。

## 实践上你需要知道的

- `/compact` 之后发生了什么，本章解释了一半：下一轮重建上下文时，从压缩记录开始截断，摘要变成模型看到的第一条消息；另一半——这张摘要是怎么写出来的——是下一章的主题；
- 看到工具输出带"truncated"标记时，别让模型硬着头皮猜——提醒它用 `grep -n`、`head`、读指定行区间来缩小范围；
- 自定义系统提示词（`customPrompt`）不会丢掉项目规则和 Skills——源码里这两层在自定义分支下同样会被追加；
- 换目录启动 Pi、增删工具、改 `AGENTS.md`，都会改变下一轮拼出来的提示词——**上下文不是配置一次就固定的东西，它每轮都在重算**。

到这里，“Pi 在把什么喂给模型”这条线索就看清了。但这份输入会随着任务一轮轮变大，窗口迟早装不下。下一篇看 Pi 怎么给它“瘦身”：什么时候触发压缩、从哪里下刀、旧消息被改写成了什么。
