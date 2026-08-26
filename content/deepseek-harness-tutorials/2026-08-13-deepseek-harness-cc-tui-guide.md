---
title: "cc-tui 插件：在终端运行 DeepSeek Harness"
slug: "deepseek-harness-cc-tui-guide"
description: "安装 dsh-cc-tui，用 dsh --profile cc-tui 启动终端界面，并完成模型、模式、主题和会话的基础操作。"
date: 2026-08-13T00:00:00Z
weight: 8
tags: ["DeepSeek Harness", "cc-tui", "终端", "插件", "新手教程"]
author: "BubbleBrain"
sourceUrl: "https://github.com/ccch1mneyyy/dsh-TUI"
---

> 这一篇只做一件事：把 `dsh-cc-tui` 安装到独立的 `cc-tui` profile，然后用 `dsh --profile cc-tui` 打开一个可交互的 DeepSeek Harness 终端界面。

## cc-tui 是什么

DeepSeek Harness 官方发布包提供 Web UI、Headless CLI 和 SDK。`dsh-cc-tui` 是社区开发的 Cordis 插件，它没有修改 Harness 核心，而是在官方 `dsh-base` profile 上增加一个终端交互界面。

它适合希望留在终端里工作的用户：对话、思考过程、工具调用、上下文占用、TPS、Git 分支和工作目录都集中在同一个界面中。原来的 Web UI 不会被替换，需要时仍可继续运行 `dsh web`。

## 安装前先检查环境

当前 `dsh-cc-tui` 0.3.3 要求 Node.js `^22.19` 或 `>=24`，并且安装过程需要 `pnpm`。

```bash
node --version
npm --version
pnpm --version
```

如果还没有官方 DSH CLI 和 pnpm，先安装：

```bash
npm install -g @deepseek-ai/dsh
npm install -g pnpm
```

再确认 CLI 可以使用：

```bash
dsh --version
```

如果你使用 nvm、fnm 或其他 Node 版本管理器，安装和启动时要保持在同一个、符合要求的 Node 版本中。

## 安装 cc-tui profile

执行插件仓库给出的安装命令：

```bash
dsh plugin --profile cc-tui add dsh-cc-tui
```

第一次执行时，DSH 会自动创建 `cc-tui` profile，并在其中安装插件。加载顺序是：

```text
dsh-base → dsh-cc-tui bundle → 用户 cordis.patch.yml
```

`dsh-working-activity` 已经作为依赖自动安装和挂载，不要再对同一个 profile 单独添加一次。

安装日志中可能出现 peer dependency warning。本文用当前 npm 发布版实测时也看到了这些 warning；只要命令最终显示安装完成，并且下一步能正常进入 TUI，就不等于安装失败。

## 用 `dsh --profile cc-tui` 启动

先进入希望 Agent 操作的项目目录，再启动 profile：

```bash
cd /absolute/path/to/your-project
export DEEPSEEK_API_KEY="你的 DeepSeek API Key"
dsh --profile cc-tui
```

不要把真实 API Key 写进仓库文件或提交到 Git。当前插件默认从 `DEEPSEEK_API_KEY` 环境变量读取凭据；如果只想确认界面能否启动，可以暂时不发送模型请求。

启动成功后会看到像素鲸鱼、模型和思考强度、当前工作目录，以及下方的输入区。

![dsh-cc-tui 启动后的终端首屏](/media/deepseek-harness-tutorials/cc-tui/splash.png)

_图片来自 dsh-TUI 官方仓库。窄终端会自动收起鲸鱼，因此手机或小窗口中的布局可能与图中不同。_

## 完成第一个任务

在输入框中先发一个只读任务：

> 阅读当前仓库的 README 和 package.json，告诉我这个项目做什么、如何启动。先不要修改文件。

常用输入操作：

| 操作          | 效果                             |
| ------------- | -------------------------------- |
| `Enter`       | 发送当前消息                     |
| `Shift+Enter` | 在消息中换行                     |
| `Tab`         | 补全命令或 `@` 文件路径          |
| `Ctrl+C`      | 中断当前回合；空闲时连续两次退出 |
| `Ctrl+O`      | 展开或折叠思考过程与工具详情     |
| `?`           | 打开快捷键菜单                   |

如果模型报凭据错误，先检查当前终端是否真的导出了 `DEEPSEEK_API_KEY`；如果工具找不到项目文件，再检查启动命令前的 `pwd` 是否是目标仓库。

## 看懂工作状态行

模型运行时，输入框上方会显示当前在做什么、已经运行多久、正在调用的工具和 token 变化。底部状态栏则显示模型、思考强度、上下文占用、TPS、Git 分支与工作目录。

![dsh-cc-tui 的工作状态行、任务列表和上下文信息](/media/deepseek-harness-tutorials/cc-tui/working-line.png)

_图片来自 dsh-TUI 官方仓库。红框标出了实时工作状态行；底部的分段条用于观察上下文组成和剩余空间。_

回合完成后，工作状态行会变成简短统计。上下文接近上限时会变黄或变红，这时可以用 `/compact` 压缩当前会话，或用 `/new` 开始新会话。

## 先掌握三个选择器

### 切换模型

输入：

```text
/model
```

选择新模型后，插件会通过会话 fork 继续对话。原会话不会被删除，仍能在 `/resume` 中找到。

### 选择 Agent preset

输入：

```text
/preset
```

目前提供四种模式：

| preset     | 适合什么任务                                     |
| ---------- | ------------------------------------------------ |
| `standard` | 默认模式，包含完整的编码、检索、计划和子代理能力 |
| `code`     | 用 TypeScript 程序组合多步工具操作               |
| `minimal`  | 只保留持久 Bash 和文本编辑工具                   |
| `cordis`   | 检查运行时并实验自定义插件                       |

空白会话可以立即切换 preset。会话已经产生对话后，新选择会保存为后续新会话的默认值，运行 `/new` 后生效。

### 切换主题

输入：

```text
/theme
```

内置主题有 `light`、`dark` 和 `dark-ansi`。不手动选择时，插件会尝试根据终端背景自动决定明暗主题。

## 恢复、搜索和回溯

几个很实用的会话操作：

- `/resume`：从最近会话列表中恢复工作。
- `Ctrl+R`：搜索历史消息。
- `/`：在当前会话中全文搜索，使用 `n` 和 `N` 跳转结果。
- 空输入时双击 `Esc`：选择历史节点并回溯；插件会 fork 会话，不会覆盖原历史。
- `/export`：把当前会话导出为 Markdown。

第一次使用时建议主动执行一次 `/resume`，确认会话已持久化，再开始较长的任务。

## profile 配置放在哪里

默认情况下，用户补丁位于：

```text
~/.dsh/profiles/cc-tui/cordis.patch.yml
```

如果设置了 `DSH_HOME`，则位置是：

```text
$DSH_HOME/profiles/cc-tui/cordis.patch.yml
```

先用默认配置跑通，再编辑这个文件。Cordis patch 命中某个 `id` 时会替换该行的整个 `config`，漏掉原有字段可能改变其他行为；修改前最好备份，并用下面的命令检查最终组合结果：

```bash
dsh --profile cc-tui --dump-config
```

## 常见问题

| 现象                             | 处理方式                                       |
| -------------------------------- | ---------------------------------------------- |
| 安装时报 Node engine 不兼容      | 切换到 Node 22.19 或 24+，再重新运行安装命令   |
| 提示找不到 pnpm                  | 安装 pnpm，或运行 `corepack enable pnpm`       |
| 安装出现 peer dependency warning | 先看命令是否最终完成，再以能否启动 TUI 为准    |
| 启动成功但模型不能回复           | 检查 `DEEPSEEK_API_KEY`、网络和账户状态        |
| 工作状态行重复出现               | 不要再单独安装 `dsh-working-activity`          |
| `/model` 后出现另一条会话        | 这是当前通过 fork 切换模型的设计，不是历史丢失 |
| `/permission` 不可用             | 当前 TUI 尚未适配 Harness 的审批界面           |
| 想回到 Web UI                    | 退出 TUI 后运行 `dsh web`，两个入口可以并存    |

当前版本中的 `/vim`、`/connect`、`/hooks` 和 `/memory` 是兼容占位命令，不代表对应能力已经在这个 TUI 中实现。

## 结束与卸载

空闲时连续按两次 `Ctrl+C` 可以退出。只是不想使用 TUI 时无需卸载，继续运行 `dsh web` 即可。

如果确实要从这个 profile 中移除插件：

```bash
dsh plugin --profile cc-tui remove dsh-cc-tui
```

插件源码、完整命令列表和版本变化请查看 [dsh-TUI 仓库](https://github.com/ccch1mneyyy/dsh-TUI)。下一篇可以再单独讲 `cc-tui` 的 MCP、全屏鼠标模式和自定义主题，不必把高级配置一次全部塞进本篇。
