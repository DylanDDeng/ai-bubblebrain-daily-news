---
title: "Pi 的工具系统"
slug: "pi-agent-tool-system"
description: "解剖 Pi 的工具：一个工具由什么构成、四个内置工具各有哪些参数、多个调用怎么调度，以及并行执行时怎么保证不打架。"
date: 2026-08-25
lastmod: 2026-08-25
draft: false
weight: 4
sourceUrl: "https://github.com/earendil-works/pi"
tags: ["Pi Agent", "工具系统", "Tools", "Agent Harness"]
---

> 本系列基于 `earendil-works/pi` 仓库的 `dcd4619` 版本编写。Pi 更新很快，具体命令变化时请优先核对[官方文档](https://pi.dev/docs/latest)。

## 一个工具长什么样

前面几章反复出现"工具"这个词，现在拆开看一个。Pi 的每个工具都是同一个形状的对象：一个名字、一段写给模型看的说明、一份参数定义、一个真正干活的 `execute` 函数。以 `read` 为例（`packages/agent/src/harness/tools/read.ts`）：

```ts
const readSchema = Type.Object({
	path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
	offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});
```

**参数定义就是一份 JSON Schema**——模型这一侧看到的就是它：有哪些字段、哪些可选、每个字段什么意思。模型"会用工具"，本质上是会按这份 Schema 填参数。

工具的 `description` 同样是写给模型的，而且写得相当讲究——`read` 的原文里直接教了用法：

```
Read the contents of a file. Supports text files and images (jpg, png, gif, webp, bmp).
… For text files, output is truncated to 2000 lines or 50KB (whichever is hit first).
Use offset/limit for large files. When you need the full file, continue with offset until complete.
```

截断规则（第二章的闸门 2）、遇到大文件该怎么办，全都提前写进了工具说明——**工具描述本身就是一层提示词工程**：与其等模型撞上截断再猜，不如注册工具时就把路指好。

## 四个内置工具，各带什么参数

harness 层内置的核心工具就四个，参数都不复杂：

| 工具 | 参数 | 干什么 |
| --- | --- | --- |
| `read` | `path`、`offset?`、`limit?` | 读文件，支持图片（作为附件送给模型） |
| `write` | `path`、`content` | 整文件写入 |
| `edit` | `path`、`edits[]`（每项 `oldText` + `newText`） | 精准替换，一次可提交多处修改 |
| `bash` | `command`、`timeout?` | 执行 shell 命令，无默认超时 |

`edit` 的设计值得停一下：它接收一个 `edits` 数组，而每个 `oldText` 的 Schema 描述里写明了两条硬规则——*必须在原文件中唯一*、*不得与同一次调用里的其他 `oldText` 重叠*。这两条都是在防"替换错地方"：不唯一就无法确定改哪处，重叠就会互相踩。约束直接写进参数说明，模型在生成参数时就被引导着遵守。

在这套核心之上，coding-agent 层又加了 `grep`、`find`、`ls`、`powershell` 等扩展工具——还记得第一章的分层吗：harness 提供最小核心，产品层按需增配。

## 一次调用的完整旅程

模型发出的 `toolCall` 只是一段 JSON。Pi 拿到后：按 Schema 校验参数 → 调用工具的 `execute` → 拿到结果内容（文本或图片块）→ 经过截断（第二章）→ 包成 `toolResult` 进上下文。

`execute` 的签名透露了不少设计：

```ts
async execute(_toolCallId, { path, offset, limit }, signal, _onUpdate, { env }) {
	const absolutePath = await resolveReadToolPath(env, path, signal);
	const bytes = getOrThrow(await env.readBinaryFile(absolutePath, signal));
	// …
}
```

- `signal`：每个工具都可以被中途叫停（你按下 Esc 时就是它在起作用）；
- `onUpdate`：长任务可以流式上报进度（终端里 bash 的实时输出就来自这里）；
- `env`：注意工具**不直接碰文件系统**，所有读写都走注入的 `ExecutionEnv` 接口——这正是 Pi 能被嵌进其他产品、能在测试里跑的原因：换一个 `env`，工具就在另一个世界里工作。

## 多个调用怎么调度

模型一条回复里经常带好几个 `toolCall`。谁先谁后？源码里的判定只有几行（`agent-loop.ts`）：

```ts
const hasSequentialToolCall = toolCalls.some(
	(tc) => currentContext.tools?.find((t) => t.name === tc.name)?.executionMode === "sequential",
);
if (config.toolExecution === "sequential" || hasSequentialToolCall) {
	return executeToolCallsSequential(currentContext, assistantMessage, toolCalls, config, signal, emit);
}
return executeToolCallsParallel(currentContext, assistantMessage, toolCalls, config, signal, emit);
```

![调度判定：默认并行执行；任一工具声明 sequential 或全局配置要求时，整批降级顺序执行；并行时同文件修改自动排队；每个调用产出一条 toolResult 进入上下文](/media/pi-agent-tutorials/pi-tool-dispatch.svg)

规则读起来很直白：**默认并行**——三个调用同时开跑，读三个文件不必排队等。但只要**任何一个**工具声明了 `executionMode: "sequential"`（或全局配置要求顺序），整批就降级为顺序执行。这是个"一票否决"设计：有副作用顺序要求的工具（比如必须先建目录再写文件的自定义工具）一出现，宁可全体变慢，也不冒乱序的险。

并行还有一道保险丝：`file-mutation-queue.ts` 会把**指向同一个规范路径的文件修改自动排队**——`edit("a.ts")` 和 `write("a.ts")` 就算并行发出，落到文件上也是一个接一个。按"规范路径"排队意味着软链接也骗不过它。

## 实践上你需要知道的

- 模型选错工具、填错参数，第一个该检查的是工具的 `description` 和 Schema 里的字段说明——那是模型唯一的"说明书"，改说明比改提示词管用；
- 自定义工具（通过 Extension 注册）和内置工具是同一个形状：name + description + Schema + execute——学会解剖 `read`，就学会了写自己的工具；
- 如果你的自定义工具对执行顺序敏感，声明 `executionMode: "sequential"`，让调度器替你兜底；
- `bash` 没有默认超时——长命令会一直跑。给可能卡住的命令带上 `timeout` 参数，或让模型这么做。

工具系统看完，“Pi 是怎么干活的”这条线就齐了。最后一篇看这一切落盘的地方：循环生产的消息、压缩写下的摘要，都存进了哪个文件、长成了什么形状。
