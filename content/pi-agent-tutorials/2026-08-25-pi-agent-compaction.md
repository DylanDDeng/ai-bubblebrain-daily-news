---
title: "Pi 的 Compaction 策略"
slug: "pi-agent-compaction"
description: "前两章看到模型的输入在循环里一轮轮变大，这一章从源码看 Pi 怎么给它“瘦身”：什么时候触发压缩、从哪里下刀、旧消息被改写成了什么。"
date: 2026-08-25
lastmod: 2026-08-25
draft: false
weight: 3
sourceUrl: "https://github.com/earendil-works/pi"
tags: ["Pi Agent", "Compaction", "上下文压缩", "Agent Harness"]
---

> 本系列基于 `earendil-works/pi` 仓库的 `dcd4619` 版本编写。Pi 更新很快，具体命令变化时请优先核对[官方文档](https://pi.dev/docs/latest)。

## 为什么需要 Compaction

第一章的 Agent Loop 有个副作用：每转一轮，上下文里就多一层东西——你的消息、模型的回复、`toolCall`、`toolResult`，全部原样堆着。而模型的上下文窗口是有限的。

任务一长，就会撞上一个两难：全部保留，窗口装不下；随手丢弃，模型会忘掉目标和已经做过的决定。Pi 的答案是 **Compaction**：把较早的消息交给一次额外的 LLM 调用，改写成一张结构化的“检查点摘要”，最近的消息原样保留。

## 什么时候触发

触发条件在源码里只有一行判断（`packages/agent/src/harness/compaction/compaction.ts`）：

```ts
/** Return whether context usage exceeds the configured compaction threshold. */
export function shouldCompact(contextTokens: number, contextWindow: number, settings: CompactionSettings): boolean {
	if (!settings.enabled) return false;
	return contextTokens > contextWindow - settings.reserveTokens;
}

/** Default compaction settings used by the harness. */
export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 16384,
	keepRecentTokens: 20000,
};
```

读法很直白：当上下文用量侵入了窗口末尾预留的 `reserveTokens`，压缩就会启动。你也可以随时用 `/compact [说明]` 手动触发，附加的说明会成为摘要的侧重点。两个默认值都可以在 `~/.pi/agent/settings.json` 或项目的 `.pi/settings.json` 里改。

这里的两个数字容易混，它们管的是两件不同的事：

| 数字 | 是什么 | 管什么 |
| --- | --- | --- |
| `reserveTokens` 16k | 给模型下一次回复预留的输出空间 | 什么时候压缩：这块空间被挤占，就触发 |
| `keepRecentTokens` 20k | 压缩时保留的近期对话原文 | 从哪里下刀：从最新往回量满 20k 划线 |

打个比方：16k 是油表亮灯的位置——什么时候该进站；20k 是进站之后油箱里留多少油接着跑。一个作用在触发时刻，一个作用在压缩动作里。

## 压缩的过程

![Pi 的一次 Compaction：窗口快满时，较早的消息被折叠成一张结构化摘要卡，最近约 20k token 原样保留，响应空间重新腾出](/media/pi-agent-tutorials/pi-compaction-flow.svg)

关键问题是**从哪里下刀**。把整段对话想成一卷纸带：新消息在右端，旧消息在左端。Pi 的办法很朴素——**从最右端往左量，量出大约 20k token 的“近期内容”，在那里划一条线**：线右边的原样保留，线左边的全部送去做摘要。

`findCutPoint` 干的就是“量纸带”这件事——一条条消息数过去，数够就停（节选，内层挑选逻辑略）：

```ts
for (let i = endIndex - 1; i >= startIndex; i--) {
	const entry = entries[i];
	if (entry.type !== "message") continue;
	const messageTokens = estimateTokens(entry.message as AgentMessage);
	accumulatedTokens += messageTokens;
	if (accumulatedTokens >= keepRecentTokens) {
		// …够 20k 了：在事先筛好的合法落点（cutPoints）里，
		// 挑离这里最近的一个作为分界线
		break;
	}
}
```

划线有两条规矩：

- **线要落在“完整的话”之间**。合法的落点是用户消息、助手消息这类能独立成立的条目；**绝不能落在 `toolResult` 上**——工具结果必须和发起它的那次工具调用待在同一侧，拆到两边，模型就看不懂这段对话了；
- **尽量落在“轮”的边界上**。一轮 = 从你说一句话，到 Pi 把这件事做完。要是某一轮自己就超过了 20k（比如一口气读了几个大文件），线只能落在这轮中间——这种情况叫 **split turn**，Pi 会把“更早的历史”和“这轮的前半截”各做一份摘要再合并，两边都不丢。

线最终落下的位置，就是源码里反复出现的 `firstKeptEntryId`——意思就是“从这条消息起，往后的都原样保留”。

## 摘要长什么样

摘要不是一段随意的“前情提要”。源码里的 `SUMMARIZATION_PROMPT` 规定了严格的结构：

- **Goal**：用户到底在做什么；
- **Constraints & Preferences**：提过的要求和偏好；
- **Progress**：已完成 / 进行中 / 被卡住的事；
- **Key Decisions**：关键决定和理由；
- **Next Steps**：接下来该做什么；
- **Critical Context**：继续工作必需的数据和引用。

提示词里还专门强调：*Preserve exact file paths, function names, and error messages*——文件路径、函数名、报错信息必须原样保留。这就是为什么压缩之后 Pi 仍然记得目标、决定和改过哪些文件。再次压缩时，Pi 不会重写一份新摘要，而是用一段专门的更新提示词，把新进展**合并进上一张摘要**（完成的事从 In Progress 挪到 Done），摘要因此是迭代生长的。

除了摘要正文，每条 `CompactionEntry` 还带着累计的 `readFiles` 和 `modifiedFiles` 清单——跨越多次压缩，Pi 始终知道这个会话读过、改过哪些文件。

## 实践上你需要知道的

- 压缩由一次额外的 LLM 调用完成，会消耗 token，也需要几秒钟——长任务里看到 Pi “停下来整理笔记”，就是它在压缩；
- 摘要再好也是有损的：中间过程的细节、贴过的长日志会被浓缩掉。**重要约定别指望聊天记录**，写进 `AGENTS.md` 这类每轮都会重新读入的文件；
- 手动 `/compact 保留与部署相关的所有细节` 比被动等自动触发更可控——你来决定摘要的侧重点；
- 会话切换分支时还有一套孪生机制 Branch Summarization：把被离开分支的工作压成摘要，注入新分支。

下一篇解剖循环里真正干活的另一半：Pi 的工具系统——一个工具由什么构成、参数怎么定义、多个调用怎么调度。
