---
title: "给 Pi 增加能力：Skills、Extensions 与 Pi Packages"
description: "分清提示模板、Skill、Extension 和 Package，先做一个安全的项目 Skill，再理解何时需要 TypeScript 扩展。"
date: 2026-08-25
lastmod: 2026-08-25
draft: false
weight: 9
slug: "pi-agent-skills-extensions"
sourceUrl: "https://github.com/earendil-works/pi"
tags: ["Pi Agent", "Skills", "Extensions", "Pi Packages"]
---

## 先选对扩展层级

很多人第一次定制 Agent，就想写复杂插件。Pi 把扩展能力分成几个层次，是为了让你从最小成本开始：

- **Prompt Template**：只是复用一段输入；
- **Skill**：为一种任务提供按需加载的说明、脚本与参考资料；
- **Extension**：通过 TypeScript 介入工具、命令、事件、模型请求和终端 UI；
- **Pi Package**：把多个资源打包并分发。

![Prompt、Skill、Extension 与 Pi Package 的能力层级](/media/pi-agent-tutorials/pi-extension-layers.svg)

判断标准很简单：只需要告诉模型“怎样做”，先用 Skill；需要让程序“新增行为”，再用 Extension。

## 创建第一个项目 Skill

在项目中创建：

```text
.pi/skills/release-check/
└── SKILL.md
```

内容示例：

```markdown
---
name: release-check
description: 发布前检查版本、测试、构建产物和 Git 状态。
---

# Release Check

1. 读取 package.json，确认版本与发布脚本。
2. 运行 npm run check、npm test 和 npm run build。
3. 检查 git status --short，不允许把 .env 或密钥加入提交。
4. 输出通过项、失败项和需要人工确认的风险。
5. 未经用户明确要求，不执行发布命令。
```

重启 Pi 或运行 `/reload` 后，Skill 会进入可用资源列表。默认情况下，Skills 按需加载；也可以通过 `/skill:release-check` 主动调用。

Pi 同时支持 Agent Skills 标准，并会从 `~/.pi/agent/skills/`、`~/.agents/skills/`、项目 `.pi/skills/`、`.agents/skills/` 和 Packages 中发现技能。

## Skill 的安全边界

Skill 不只是“文档”。它可以要求模型运行附带脚本、读取文件或调用外部工具，因此陌生 Skill 也可能带来风险。

安装或信任前至少检查：

- `SKILL.md` 是否要求传输文件、密钥或个人数据；
- `scripts/` 中是否有下载、删除、上传或修改系统设置的操作；
- 是否把宽泛目录作为写入目标；
- 是否把项目提示词或网页内容当成可信指令。

## 什么时候需要 Extension

当你想新增以下能力时，再编写 TypeScript Extension：

- 新的工具，例如数据库查询或内部 API；
- 新的斜杠命令；
- 在工具执行前请求确认或阻止危险路径；
- 自定义顶部、底部、消息或工具结果的终端 UI；
- 监听会话开始、每轮结束、工具调用等事件；
- 动态修改系统提示或模型请求。

源码仓库的 `packages/coding-agent/examples/extensions/` 包含大量小例子，比如 `hello.ts`、`confirm-destructive.ts`、`git-checkpoint.ts`、`status-line.ts` 和 `todo.ts`。学习 Extension 时，先从一个单文件例子开始，比直接阅读整个扩展运行器更容易。

## 一个最小 Extension 的结构

项目级 Extension 可以放在 `.pi/extensions/`。典型结构是导出一个函数，并通过传入的 Pi API 注册命令或工具。不同版本的类型和事件会更新，因此代码应以当前仓库的 `docs/extensions.md` 和示例为准。

初学者可以先实现一个只读命令，例如 `/project-info`：读取当前工作目录、Git 分支和 `package.json` 名称，然后显示在终端。确认生命周期和 UI API 后，再接触会修改文件的工具。

## 用 Pi Package 分享配置

当一个 Skill、Extension、主题或提示模板已经在多个项目中稳定使用，可以把它们声明为 Pi Package，通过 npm 或 Git 安装。Package 解决的是分发与组合，不会自动让第三方代码变得可信。

一个成熟的 Package 应当包含：

- 清楚的能力和权限说明；
- 最小必要依赖；
- 可重复的安装与卸载步骤；
- 版本记录和兼容范围；
- 不含真实凭据的示例配置。

## 从哪里继续深入

完成这五篇后，你已经具备一条完整的入门路径：理解 Agent Loop、跑通真实任务、管理项目上下文、控制长会话，并知道如何选择扩展层级。

继续学习可以从这些官方源码与文档入口开始：

- [`packages/agent/src/agent-loop.ts`](https://github.com/earendil-works/pi/blob/dcd461925db2edf69a43c8135db1180d418afd54/packages/agent/src/agent-loop.ts)：Agent Loop；
- [`packages/coding-agent/src/core/agent-session.ts`](https://github.com/earendil-works/pi/blob/dcd461925db2edf69a43c8135db1180d418afd54/packages/coding-agent/src/core/agent-session.ts)：会话、压缩与工具整合；
- [`docs/skills.md`](https://github.com/earendil-works/pi/blob/dcd461925db2edf69a43c8135db1180d418afd54/packages/coding-agent/docs/skills.md)：Skills；
- [`docs/extensions.md`](https://github.com/earendil-works/pi/blob/dcd461925db2edf69a43c8135db1180d418afd54/packages/coding-agent/docs/extensions.md)：Extensions；
- [`examples/extensions/`](https://github.com/earendil-works/pi/tree/dcd461925db2edf69a43c8135db1180d418afd54/packages/coding-agent/examples/extensions)：可运行示例。

上一篇：[会话、分支与上下文压缩](/pi-agent-tutorials/pi-agent-sessions/) · 返回：[Pi Agent 教程目录](/pi-agent-tutorials/)
