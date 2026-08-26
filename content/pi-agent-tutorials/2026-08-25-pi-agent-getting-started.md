---
title: "安装 Pi：完成你的第一个终端 Agent 任务"
description: "安装 Pi、完成登录和模型选择，在一个练习仓库中让 Agent 先读后做，并学会检查它实际改了什么。"
date: 2026-08-25
lastmod: 2026-08-25
draft: false
weight: 6
slug: "pi-agent-getting-started"
sourceUrl: "https://github.com/earendil-works/pi"
tags: ["Pi Agent", "安装", "终端", "模型配置", "新手教程"]
---

## 安装前检查

Pi 当前要求 Node.js `22.19.0` 或更高版本。先在终端确认：

```bash
node --version
npm --version
```

然后使用官方 npm 包安装：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts` 会禁止依赖在安装阶段运行生命周期脚本；Pi 的正常 npm 安装不依赖这些脚本。安装完成后执行：

```bash
pi --version
```

## 登录并选择模型

进入一个准备练习的 Git 项目，再启动 Pi：

```bash
cd /path/to/your-project
pi
```

在交互界面输入：

```text
/login
```

你可以使用 ChatGPT Plus/Pro、Claude Pro/Max、GitHub Copilot 等订阅登录，也可以为 Anthropic、OpenAI、DeepSeek、Gemini 等提供方配置 API Key。登录完成后，用 `/model` 或 `Ctrl+L` 选择模型。

![从安装、登录到完成第一个任务的 Pi 终端流程](/media/pi-agent-tutorials/pi-first-session.svg)

## 第一次不要急着让它写代码

先发送一个只读任务：

```text
先不要修改任何文件。阅读 README 和 package.json，告诉我：
1. 这个项目解决什么问题；
2. 本地如何启动；
3. 应该运行哪些检查。
```

这一步能让你观察 Pi 怎样使用 `read` 和 `bash`，也能检查模型是否理解了项目。确认理解正确后，再让它完成一个小改动：

```text
给 README 增加一个“本地开发”小节。完成后运行项目已有的 Markdown 检查，
并用 git diff 总结改了什么。不要提交代码。
```

好的第一个任务应当同时具备三个条件：范围小、结果可检查、失败可回滚。

## 看懂终端里的四个区域

Pi 的交互界面由四部分组成：

- **顶部信息**：已加载的上下文文件、Skills、Extensions 和快捷键；
- **消息区**：你的请求、模型回复、工具调用与结果；
- **编辑器**：输入消息，边框颜色会反映当前思考强度；
- **底部状态**：工作目录、会话名、模型、Token、缓存与成本信息。

输入 `/` 可以查看命令补全。初学阶段最常用的是：

| 命令 | 用途 |
| --- | --- |
| `/model` | 切换模型 |
| `/settings` | 调整主题、思考强度等设置 |
| `/session` | 查看当前会话信息 |
| `/resume` | 选择过去的会话继续 |
| `/tree` | 查看并切换会话分支 |
| `/compact` | 压缩较早的上下文 |

## 三种日常输入方式

### 引用文件

输入 `@` 后搜索项目文件，或者启动时直接传入：

```bash
pi @README.md "用三句话解释这个项目"
```

### 执行命令

在编辑器里输入：

```text
!npm test
```

命令结果会进入模型上下文。如果只想自己运行、不想把输出交给模型，使用 `!!npm test`。

### 一次性任务

不进入交互界面也可以执行：

```bash
pi -p "总结这个代码库，并列出最重要的三个入口文件"
```

## 完成任务后的检查清单

不要把“Agent 说完成了”当成唯一证据。至少检查：

```bash
git status --short
git diff --check
git diff
```

再运行项目自己的测试或构建命令。Pi 有 `bash` 工具并不等于它一定会自动选择正确的检查；你可以把必要命令写进项目的 `AGENTS.md`，下一篇会专门解释。

上一篇：[认识 Pi 与 Agent Loop](/pi-agent-tutorials/pi-agent-overview/) · 下一篇：[让 Pi 读懂你的项目](/pi-agent-tutorials/pi-agent-project-context/)
