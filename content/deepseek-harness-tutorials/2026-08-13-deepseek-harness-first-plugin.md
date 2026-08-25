---
title: "插件开发：添加第一个自定义工具"
slug: "deepseek-harness-first-plugin"
description: "从源码启动 Harness，创建最小 Cordis 插件，再注册一个能被模型调用的 greet 工具。"
date: 2026-08-13T01:00:00Z
weight: 7
tags: ["DeepSeek Harness", "插件开发", "Cordis", "Tool", "TypeScript"]
author: "BubbleBrain"
sourceUrl: "https://github.com/deepseek-ai/deepseek-harness"
---

> DeepSeek Harness 的模型、工具、文件系统、会话和界面都建立在插件组合之上。本篇用最小例子完成两步：先确认插件被加载，再给 Agent 增加一个 `greet` 工具。

## 为什么这一篇需要从源码运行

`npx @deepseek-ai/dsh web` 适合使用发布好的产品；本地 TypeScript 插件教程需要仓库源码、依赖与构建产物。

准备源码：

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
```

当前仓库声明使用 `pnpm@11.7.0`。如果系统没有 pnpm，可以先启用 Corepack：

```bash
corepack enable
```

## 创建最小插件

在仓库根目录创建练习项目：

```bash
mkdir -p scratch-plugin/src
```

创建 `scratch-plugin/src/my-plugin.ts`：

```typescript
import type { Context } from "@deepseek-ai/cordis";

export const name = "hello-plugin";

export function apply(ctx: Context) {
  console.log("[hello-plugin] plugin loaded!");
}
```

插件只需要导出一个 `apply` 函数。Cordis 加载插件时会把 `ctx` 上下文传进来，后续的服务、事件与工具都通过它注册。

## 用 Patch 插入插件

先在仓库根目录运行 `pwd`，记下绝对路径。

创建 `scratch-plugin/cordis.yml`，把示例路径替换为你自己的绝对路径：

```yaml
- insert:
    - id: hello
      name: "/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts"
```

然后启动：

```bash
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

打开 [http://127.0.0.1:3080](http://127.0.0.1:3080)。终端出现下面这行，就说明 patch 已经把插件插入配置树：

```text
[hello-plugin] plugin loaded!
```

## 把插件变成模型工具

现在把 `scratch-plugin/src/my-plugin.ts` 替换为：

```typescript
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "greet-tool";
export const inject = ["tools"];

export function apply(ctx: Context) {
  ctx.tools.register(
    defineTool({
      name: "greet",
      description: "Greet someone by name.",
      parameters: {
        name: {
          type: "string",
          required: true,
          description: "The name to greet",
        },
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      async execute(args) {
        return `Hello, ${args.name}!`;
      },
    }),
  );
}
```

`inject = ['tools']` 告诉 Cordis：必须等工具注册表准备好，再加载这个插件。

`defineTool` 中几个字段分别负责：

- `name`：模型调用时使用的稳定工具名。
- `description`：帮助模型判断什么时候调用。
- `parameters`：输入参数与校验规则。
- `execute`：真正执行的业务逻辑。
- `output.schema`：工具返回的规范值。
- `output.render`：把规范值转换成模型可见内容。

## 在 Web UI 中调用

保持 Web UI 运行，新建会话并输入：

> Use the greet tool to greet Ada.

模型应调用 `greet`，并收到：

```text
Hello, Ada!
```

如果模型只生成文字、没有调用工具，检查：

1. 启动终端是否显示插件已经加载。
2. `inject` 是否包含 `tools`。
3. 工具名称和描述是否足够清楚。
4. 当前会话与模型是否能够使用工具调用。

## 自动清理与副作用

通过 `ctx` 注册的事件、工具和定时器会在插件卸载时自动清理。

需要手动释放的外部资源可以放进 `ctx.effect()`：

```typescript
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log("heartbeat");
    }, 5000);

    return () => clearInterval(timer);
  });
}
```

返回的函数会在插件卸载时执行。

## 新手最容易踩的坑

| 问题                 | 原因                             | 处理方式                          |
| -------------------- | -------------------------------- | --------------------------------- |
| 找不到本地插件       | patch 中的路径不正确             | 使用 `pwd` 得到绝对路径           |
| 源码运行时报缺少产物 | 还没有构建仓库                   | 在根目录运行 `pnpm run build`     |
| 插件比依赖更早加载   | 没有声明依赖                     | 增加 `inject = ['tools']`         |
| 配置改了但行为没变   | patch 命中了错误行或替换范围过大 | 用 `--dump-config` 查看最终配置树 |
| 工具参数不稳定       | 没有声明严格 schema              | 在 `parameters` 中完整定义字段    |

## 下一步学什么

完成 `greet` 之后，可以继续沿三条路扩展：

- 为插件增加经过 schema 校验的配置。
- 把能力拆成 Service Definition、Provider 与 Consumer。
- 开发模型适配器、文件系统后端或 UI 插件。

官方进一步资料：

- [插件入门](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/user/develop/basic)
- [Cordis 教程](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/cordis-tutorial)
- [扩展实操手册](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md)

至此，六篇入门路径已经完整串起来。你可以回到[DeepSeek Harness 教程目录](/deepseek-harness-tutorials/)，按需要继续查阅。
