---
title: "启动 Web UI：从零完成第一个任务"
slug: "deepseek-harness-getting-started"
description: "安装运行条件，用一条 npx 命令启动 DeepSeek Harness，配置密钥、选择工作区并完成第一次仓库分析。"
date: 2026-08-13T05:00:00Z
weight: 3
tags: ["DeepSeek Harness", "Web UI", "npx", "工作区", "入门教程"]
author: "BubbleBrain"
sourceUrl: "https://github.com/deepseek-ai/deepseek-harness"
---

> 这一篇只完成一个目标：在本地启动 DeepSeek Harness Web UI，并让它在一个安全的练习目录中完成第一项任务。

## 开始前准备什么

你需要：

- Node.js。当前源码要求 `^22.19.0` 或 `>=24.0.0`。
- 一个 DeepSeek API Key。
- 一个用于练习的项目目录，最好是可以随时丢弃的 Git 仓库。
- 能访问 npm 和 DeepSeek API 的网络环境。

先检查 Node.js：

```bash
node --version
```

如果版本太旧，建议使用 [Node.js 官网](https://nodejs.org/)安装当前 LTS，或用你熟悉的版本管理器切换。

## 一条命令启动

先进入希望 Agent 使用的项目目录：

```bash
cd /absolute/path/to/your-project
npx @deepseek-ai/dsh web
```

第一次运行会下载 npm 包，因此会比后续启动慢。看到下面这行输出，说明服务已经启动：

```text
dsh web: http://127.0.0.1:3080
```

在浏览器打开 [http://127.0.0.1:3080](http://127.0.0.1:3080)。

如果 3080 端口已被占用，可以换一个端口：

```bash
npx @deepseek-ai/dsh web --port 3081
```

当前 CLI 有意不支持 `--host 0.0.0.0`。入门阶段把服务保留在本机回环地址上更安全。

## 第一次打开会看到什么

首次启动会先显示开发者预览声明，随后提示配置 DeepSeek API Key。

![DeepSeek Harness 首次启动的 API Key 配置界面](/media/deepseek-harness-tutorials/getting-started/web-ui-home.png)

这张图来自本文实际启动的 npm 发布包，没有填写任何真实密钥。

你可以直接保存 API Key，也可以选择稍后配置。建议第一次就完成配置，否则模型路由虽然可见，但发送任务时会得到 `MISSING_CREDENTIAL`。

密钥不会被返回给浏览器。官方实现会把它存到 `$DSH_HOME/.credentials.yaml`，设置中只保留凭据引用。

## 选择工作区

启动 `dsh` 时所在的目录是默认文件系统位置，但新的 Web UI 在你添加工作区之前不会自动选中它。

在左侧点击**选择工作区**，添加刚才启动命令所在的项目目录，然后选中它。没有选中工作区时，输入框不可用，这是安全边界，不是页面故障。

建议第一次使用一个简单目录：

```bash
mkdir deepseek-harness-playground
cd deepseek-harness-playground
git init
npx @deepseek-ai/dsh web
```

不要一开始就在包含重要私人文件的上级目录启动。Harness 会把当前目录当作默认 workspace 根目录。

## 发出第一个任务

选中工作区后，新建会话并输入：

> 总结这个仓库的用途、主要目录和常用命令。先只读取，不要修改任何文件。

这个提示词适合第一次测试，因为它能检查三件事：

1. 模型路由与 API Key 是否有效。
2. Agent 是否能读取当前工作区。
3. 你是否能在界面中看到过程、工具调用和最终总结。

下面是本文使用 npm 发布包、`DeepSeek-V4-Flash` 与 `Read Only` 权限完成的一次真实对话。界面会把提示词、思考过程、工具调用和最终回答放在同一条会话轨迹中。

![DeepSeek Harness 使用只读权限完成真实对话](/media/deepseek-harness-tutorials/getting-started/web-ui-conversation.png)

确认只读流程正常后，再尝试一个可验证的小改动：

> 阅读 README 和 package.json，为项目补充一份不超过 10 行的 QUICKSTART.md。修改后告诉我新增了什么，并运行最相关的检查。

## 理解默认权限

新会话默认使用 `workspace-write` 权限预设。Bash 和文件修改被限制在当前 workspace 与平台临时目录内；当操作需要额外批准时，Web UI 会先询问你。

这不代表所有命令都没有风险。开始实践时请遵守三个原则：

- 把工作区放在 Git 管理下，随时查看 diff。
- 不要把密码、私钥和生产配置放进练习目录。
- 先让 Agent 解释计划，再授权高风险操作。

## 常见问题

| 现象                         | 检查方法                                 |
| ---------------------------- | ---------------------------------------- |
| `npx` 找不到或 Node 版本报错 | 重新安装符合要求的 Node.js               |
| 页面打不开                   | 检查终端是否仍在运行，以及端口是否被占用 |
| 输入框不可用                 | 先添加并选中工作区                       |
| 提示 `MISSING_CREDENTIAL`    | 前往设置 → 模型，保存 DeepSeek API Key   |
| 模型没有返回                 | 检查 API Key、账户余额和网络环境         |
| 想停止服务                   | 回到启动命令的终端，按 `Ctrl+C`          |

## 下一步

Web UI 已经跑通后，不要急着改复杂配置。下一篇先把模型提供方、模型选择和常见错误弄清楚：

[配置 DeepSeek 与自定义模型提供方](/deepseek-harness-tutorials/deepseek-harness-model-configuration/)。
