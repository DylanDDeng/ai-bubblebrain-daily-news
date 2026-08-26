---
title: "Pi 的 Extension 系统"
slug: "pi-agent-extensions"
description: "一个 TypeScript 文件怎么改变 Pi 的行为：扩展从哪里被发现和加载、事件钩子挂在循环的哪些位置、一次工具调用是怎么被拦下的。"
date: 2026-08-25
lastmod: 2026-08-25
draft: false
weight: 6
sourceUrl: "https://github.com/earendil-works/pi"
tags: ["Pi Agent", "Extension", "扩展系统", "Agent Harness"]
---

> 本系列基于 `earendil-works/pi` 仓库的 `dcd4619` 版本编写。Pi 更新很快，具体命令变化时请优先核对[官方文档](https://pi.dev/docs/latest)。

## 一个 Extension 长什么样

前五章看到的都是 Pi 自带的机器：循环、上下文、压缩、工具、存储。Extension 是 Pi 留给你的改装接口——**一个导出默认函数的 TypeScript 文件**，函数收到一个 `pi` 对象，想改什么就在上面注册什么。官方仓库里最小的例子是 `hello.ts`（`packages/coding-agent/examples/extensions/hello.ts`）：

```ts
const helloTool = defineTool({
	name: "hello",
	label: "Hello",
	description: "A simple greeting tool",
	parameters: Type.Object({
		name: Type.String({ description: "Name to greet" }),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		return {
			content: [{ type: "text", text: `Hello, ${params.name}!` }],
			details: { greeted: params.name },
		};
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(helloTool);
}
```

眼熟吗？`name` + `description` + `parameters` + `execute`——**和第四章解剖的内置工具 `read` 是同一个形状**。第四章说"学会解剖 `read`，就学会了写自己的工具"，指的就是这里：自定义工具经 `pi.registerTool()` 注册后，和内置工具走完全一样的校验、调度、截断流水线。

这里先把一个容易混淆的点说清：**Extension 不等于自定义工具**。注册工具只是扩展能做的两类事之一：

- **加装备**——让 Pi 能干更多的事：`pi.registerTool()` 给模型添一样新工具，`pi.registerCommand()` 给你添一条 `/mycommand`，`pi.registerShortcut()` 绑快捷键，`pi.registerProvider()` 接自定义模型服务；
- **改流程**——改变 Pi 干事的方式：用 `pi.on()` 订阅事件，在 Pi 原有的流程里插一脚，比如拦下一条危险命令、改写发给模型的消息、换掉整个压缩策略。这是扩展真正的能量所在，下面两节细讲。

两类可以写在同一个文件里。另外扩展还能用 `pi.appendEntry()` 往会话文件里写自定义记录——第五章"一切皆 entry"的设计在这里又赚了一次：扩展的状态也是树上的一行，随会话一起保存和恢复。

## 扩展从哪里被发现

Pi 启动时会去固定的位置找扩展，`loader.ts` 的注释把规则写得很清楚（`packages/coding-agent/src/core/extensions/loader.ts`）：

```ts
/**
 * Discovery rules:
 * 1. Direct files: `extensions/*.ts` or `*.js` → load
 * 2. Subdirectory with index: `extensions/* /index.ts` or `index.js` → load
 * 3. Subdirectory with package.json: `extensions/* /package.json` with "pi" field → load what it declares
 *
 * No recursion beyond one level. Complex packages must use package.json manifest.
 */
```

找的位置有三处，按顺序：**项目本地** `.pi/extensions/`、**全局** `~/.pi/agent/extensions/`、以及 `settings.json` 里显式配置的路径（包括 `npm:` 和 `git:` 开头的 Pi Package——第一章末尾那张四层结构图的最后一层）。

加载方式也值得一提：扩展是 TypeScript 源文件，Pi 用 [jiti](https://github.com/unjs/jiti) 直接加载运行，**不需要你先编译**；改完文件敲 `/reload` 就能热重载。写扩展的反馈循环短到和改配置差不多。

## 事件：把钩子挂进循环

第一章的循环是一条自顾自转的流水线：用户输入 → 组装上下文 → 调用模型 → 执行工具，一圈一圈转。正常情况下，你的代码插不进去。**`pi.on("事件名", 函数)` 做的事，就是在流水线的某个工位旁安一个"检查员"**：流水线每转到那个工位，先停下来，把手里的东西递给你的函数过目，再决定怎么继续。你的函数就是"钩子"（hook），事件名决定了它安在哪个工位：

![Agent Loop 五个阶段旁的事件钩子：session_start 只可观察；input 可拦截改写；before_agent_start 和 context 可修改消息；tool_call 返回 block 即拦下；tool_result 可改写结果；turn_end、agent_end 只可观察](/media/pi-agent-tutorials/pi-extension-hooks.svg)

检查员分两种。一种**只能看**（图里灰色）：`session_start`、`turn_end`、`agent_end` 递过来的东西只供登记，适合做统计、通知、收尾清理。另一种**能出手**（图里橙色）：`input` 能拦截或改写你敲的内容，`context` 能修改发给模型的消息列表（第二章重建的结果，扩展还有最后一次修改的机会），`session_before_compact` 能取消或接管一次压缩（第三章的策略不合口味，可以整个换掉）。而所有工位里用得最多的那个，安在"执行工具"旁边——单独用一节讲。

## 拦截一次工具调用

官方文档开篇的例子就是一道权限闸——模型想跑 `rm -rf`，先问过你：

```ts
pi.on("tool_call", async (event, ctx) => {
	if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
		const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
		if (!ok) return { block: true, reason: "Blocked by user" };
	}
});
```

一次 `toolCall` 递到检查员手里，结局只有三种——什么都不返回是放行，返回 `block` 是拦下，原地改 `event.input` 是改写：

![一次 toolCall 的三种结局：什么都不返回则 execute 照常执行；返回 block:true 则工具不执行，reason 作为失败结果回给模型；原地修改 event.input 则照常执行但用的是改过的参数](/media/pi-agent-tutorials/pi-extension-gate.svg)

"改写"那条值得多说一句：类型定义里写明了口径（`types.ts`）——*`event.input` is mutable. Mutate it in place to patch tool arguments before execution*。不用返回任何东西，直接改 `event.input`，后续检查员和真正的执行看到的就是改过的参数。

这套机制在 `runner.ts` 里（`packages/coding-agent/src/core/extensions/runner.ts`）。第四章讲过一次工具调用的旅程：校验参数 → `execute` → 截断 → 进上下文。现在补上被省略的一步——**`execute` 之前，先把这次调用递给每一个检查员过目**：

```ts
async emitToolCall(event: ToolCallEvent): Promise<ToolCallEventResult | undefined> {
	// …
	for (const ext of this.extensions) {
		const handlers = ext.handlers.get("tool_call");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			const handlerResult = await handler(event, ctx);

			if (handlerResult) {
				result = handlerResult as ToolCallEventResult;
				if (result.block) {
					return result;
				}
			}
		}
	}

	return result;
}
```

规则一眼可读：**按加载顺序依次问过每个检查员，谁先返回 `block`，立刻短路**——后面的检查员不再被问，工具不执行，`reason` 作为失败结果回给模型。是不是想起第四章调度器的"一票否决"？Pi 在两处用了同一种保守哲学：拦截权是每个检查员独立的，放行却需要全体沉默。

`tool_call` 管进，配套的 `tool_result` 管出——它在工具执行完后触发，可以改写进上下文的结果。一进一出两个检查员，足够实现权限门、路径保护、结果脱敏这类安全层。

## 实践上你需要知道的

- **扩展以你的全部系统权限运行**，源码和文档都反复强调：只装信得过的来源；项目本地的 `.pi/extensions/` 要等你信任（trust）该项目后才会加载；
- 官方 `examples/extensions/` 目录下有三十多个可以直接抄的例子：权限门（`confirm-destructive.ts`）、git 检查点、自定义压缩、甚至一个 DOOM——写之前先去翻一圈；
- 别在工厂函数里启动后台资源（进程、watcher、定时器）——工厂可能在不开会话的场合被调用，官方建议把这类初始化推迟到 `session_start`，并注册 `session_shutdown` 收尾；
- 文档第一行就写着：*pi can create extensions. Ask it to build one for your use case*——让 Pi 给自己写扩展，本身就是最好的第一个练习。

到这里，六章的源码线索合上了：循环怎么转、每轮输入怎么组装、上下文怎么瘦身、工具怎么定义和调度、一切最终落盘在哪、以及怎么把自己的代码挂进这台机器——Pi 的图纸你已经完整看过一遍了。剩下的事，就是装上它，亲手转一圈。
