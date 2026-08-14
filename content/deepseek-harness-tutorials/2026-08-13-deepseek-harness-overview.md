---
title: "认识 DeepSeek Harness：它解决什么问题"
slug: "deepseek-harness-overview"
description: "先理解模型、Agent 与 Harness 的区别，再看 DeepSeek Harness 的插件架构、适用人群和学习路线。"
date: 2026-08-13T06:00:00Z
tags: ["DeepSeek Harness", "Agent Harness", "Cordis", "入门教程"]
author: "BubbleBrain"
sourceUrl: "https://github.com/deepseek-ai/deepseek-harness"
---

> 本系列基于 DeepSeek 官方仓库 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的公开代码与文档整理。核对版本为 2026-08-13 的开发者预览版；项目仍在快速迭代，命令与界面以后可能发生变化。

![DeepSeek Harness 官方字标](/media/deepseek-harness-tutorials/overview/deepseek-harness-wordmark.svg)

如果把大模型比作“大脑”，那么 Harness 更像一套让大脑真正工作的操作系统：它负责把模型、工具、文件、终端、会话、权限和界面连接起来。

DeepSeek Harness，简称 `dsh`，就是 DeepSeek AI 开源的一套 Agent Harness。它不是一个新模型，也不只是一个聊天页面，而是一套可以组装、替换和扩展 Agent 能力的运行框架。

## 先分清三个概念

| 概念    | 可以怎么理解     | 主要负责什么                             |
| ------- | ---------------- | ---------------------------------------- |
| 模型    | 大脑             | 理解问题、推理并生成下一步行动           |
| Agent   | 会行动的助手     | 根据目标调用工具、读写文件并反复执行     |
| Harness | Agent 的运行环境 | 连接模型、工具、权限、会话、界面和持久化 |

只调用一次模型 API，通常得到一段文本。把模型放进 Harness 后，它才能在一个受控环境中持续读取项目、运行命令、修改文件、调用子 Agent，并把完整过程保存下来。

## DeepSeek Harness 的核心特点

### 一切皆插件

DeepSeek Harness 最重要的设计原则是“Everything is a plugin”。模型提供方、工具、文件系统、终端、会话存储、权限策略和 Web UI 都可以作为插件组合。

底层由 [Cordis](https://github.com/cordiverse/cordis) 驱动。你不需要在入门阶段先学会 Cordis，但要记住一个好处：某项能力不是写死在主循环里，而是可以被替换。

例如，文件和命令默认可以在本地执行；更换对应的能力提供方后，也可以把它们放进远程沙箱，而不必重写整个 Agent。

### Profile 决定启动哪套能力

`dsh` 用 profile 表示一套可运行的插件组合：

- `web`：启动浏览器界面，适合第一次体验。
- `headless`：接收一个任务，执行完后打印结果并退出。
- 自定义 profile：安装额外插件，组合成自己的 Agent 产品。

profile 不是一个单独的模型。它更接近“这次运行要装哪些能力、使用什么配置”的清单。

### 配置可以叠加

默认组合、profile 自己的配置、用户级配置和命令行 `--patch` 会按顺序叠加。后面的层可以覆盖前面的层，因此你能保留官方默认值，只调整少数需要改变的部分。

这套机制很适合实验，也意味着新手不要一开始就复制整份配置。先跑通默认 Web UI，再针对具体需求做最小修改。

## 它适合谁

DeepSeek Harness 当前更适合下面几类人：

- 想使用开源编程 Agent，同时希望保留本地工作区和完整会话记录的人。
- 想把 Agent 放进脚本、CI 或内部工具的开发者。
- 想研究模型、工具、沙箱、会话和子 Agent 如何组合的人。
- 想开发自己的工具、模型适配器或 Harness 插件的人。

如果你只想找一个稳定的日常聊天客户端，目前它不一定是最省心的选择。官方明确把 0.1 版本标记为开发者预览，并提示未来会出现破坏兼容性的变更。

## 推荐学习路线

这套教程会继续分篇扩展，目前推荐按下面的顺序入门：

1. **认识 DeepSeek Harness**：建立整体概念，也就是你正在看的这一篇。
2. [理解 Agent、Model 与 Harness 如何协作](/deepseek-harness-tutorials/deepseek-harness-agent-model-harness/)。
3. [启动 Web UI，完成第一个任务](/deepseek-harness-tutorials/deepseek-harness-getting-started/)。
4. [配置 DeepSeek 与自定义模型](/deepseek-harness-tutorials/deepseek-harness-model-configuration/)。
5. [使用 CLI 与 Headless 模式](/deepseek-harness-tutorials/deepseek-harness-cli-headless/)。
6. [使用 Python SDK 调用 Harness](/deepseek-harness-tutorials/deepseek-harness-python-sdk/)。
7. [开发第一个插件与工具](/deepseek-harness-tutorials/deepseek-harness-first-plugin/)。
8. [用 cc-tui 在终端运行 Harness](/deepseek-harness-tutorials/deepseek-harness-cc-tui-guide/)。
9. [用 better-sidebar 把 Web UI 变成开发工作台](/deepseek-harness-tutorials/deepseek-harness-better-sidebar-guide/)。

只想先体验产品，读到第三篇即可；想把它用于自动化，再继续学习 CLI 和 Python SDK；想扩展框架，最后进入插件开发。

## 继续之前记住两件事

第一，Harness 能执行真实命令、读写真实文件。练习时请使用单独的测试目录或可以随时丢弃的 Git checkout。

第二，开发者预览意味着教程会尽量解释“为什么这样做”，而不是只给一串容易过期的按钮位置。遇到界面差异时，优先回到[官方仓库](https://github.com/deepseek-ai/deepseek-harness)核对最新 README。

下一篇：[启动 DeepSeek Harness Web UI，完成第一个任务](/deepseek-harness-tutorials/deepseek-harness-getting-started/)。
