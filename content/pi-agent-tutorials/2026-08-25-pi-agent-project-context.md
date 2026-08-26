---
title: "让 Pi 读懂项目：AGENTS.md、文件引用与项目信任"
description: "用分层上下文文件告诉 Pi 项目规则，理解 @ 文件引用、项目资源加载和 Trust 的真实边界。"
date: 2026-08-25
lastmod: 2026-08-25
draft: false
weight: 7
slug: "pi-agent-project-context"
sourceUrl: "https://github.com/earendil-works/pi"
tags: ["Pi Agent", "AGENTS.md", "上下文工程", "Project Trust"]
---

## 为什么上下文比“更长的提示词”重要

同一个模型进入不同项目时，必须知道不同的构建命令、目录边界、代码风格和安全限制。把这些规则每次都重新粘贴，既容易遗漏，也会让团队成员得到不同结果。

Pi 会在启动时加载上下文文件，把稳定规则放到每次会话都能看到的位置；临时任务再通过你的消息和 `@文件` 补充。

![Pi 如何把全局规则、项目规则、文件和当前任务组合成上下文](/media/pi-agent-tutorials/pi-context-stack.svg)

## 写一个够用的 AGENTS.md

在项目根目录创建 `AGENTS.md`：

```markdown
# Project Instructions

- 修改代码前先阅读 README 和相关测试。
- 使用 TypeScript strict mode，不新增 any。
- 完成修改后运行 npm run check 和 npm test。
- 不执行生产数据库迁移，不提交 .env 文件。
- 工作树可能包含其他人的改动，不要覆盖无关文件。
```

Pi 会加载：

- `~/.pi/agent/AGENTS.md`：所有项目都适用的个人规则；
- 从父目录到当前目录的 `AGENTS.md` 或 `CLAUDE.md`：逐层补充项目规则；
- `AGENTS.override.md`：如果某层存在它，会取代同目录的普通上下文文件。

修改上下文文件后，重启 Pi 或运行 `/reload`。

## 哪些信息应该写进去

适合长期放在 `AGENTS.md` 中的内容：

- 构建、测试、Lint 和格式化命令；
- 核心目录及各自职责；
- 禁止修改的生成文件或生产配置；
- 提交信息、命名和代码风格；
- 工作树协作规则与安全边界。

不适合放进去的内容：

- API Key、密码和个人数据；
- 只使用一次的任务描述；
- 会频繁失效的超长文件清单；
- “永远正确”但没有实际约束意义的口号。

## 用 @ 精确补充当前任务

如果你要修一个组件，不必让 Pi 先扫描整个仓库。可以输入：

```text
@src/components/SearchBar.tsx @src/components/SearchBar.test.tsx
先解释搜索状态怎样流动，再修复清空按钮失效的问题。
```

这样能减少无关上下文，也让你明确知道模型看到了什么。终端中输入 `@` 可以模糊搜索文件；命令行也能传入多个文件。

## Project Trust 到底保护什么

当项目包含 `.pi/settings.json`、项目级 Skills、Extensions 或 Packages 时，Pi 会根据 Project Trust 决定是否加载它们。第一次进入这类项目，交互模式通常会询问是否信任。

需要特别注意：**Trust 不是沙箱。**

它只控制项目能否在启动阶段加载本地配置和可执行扩展。你一旦开始工作，模型仍然可以通过工具读取、修改文件或运行命令，权限与启动 Pi 的用户相同。

因此，面对陌生仓库时：

1. 先拒绝加载项目扩展；
2. 在只读环境检查 `.pi/`、`.agents/skills/` 和 package 配置；
3. 确认可信后再用 `/trust` 保存决定；
4. 真正不可信的代码应放入容器或虚拟机。

## 一个上下文设计练习

选择你熟悉的小项目，完成三次对比：

1. 不提供任何说明，让 Pi 说出测试命令；
2. 只附上 `@package.json` 再问一次；
3. 增加精简的 `AGENTS.md` 后重启，再让它规划修改。

你会看到，稳定规则与相关文件比“请仔细思考”更能提升结果质量。

上一篇：[安装并完成第一个任务](/pi-agent-tutorials/pi-agent-getting-started/) · 下一篇：[会话、分支与压缩](/pi-agent-tutorials/pi-agent-sessions/)
