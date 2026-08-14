---
title: "CLI 与 Headless：让 Agent 完成一次性任务"
slug: "deepseek-harness-cli-headless"
description: "理解 profile、Headless 输出与退出码，在项目目录中运行一次性 Agent 任务，并检查最终组合配置。"
date: 2026-08-13T03:00:00Z
tags: ["DeepSeek Harness", "CLI", "Headless", "自动化", "Profile"]
author: "BubbleBrain"
sourceUrl: "https://github.com/deepseek-ai/deepseek-harness"
---

> Web UI 适合交互探索，Headless 模式适合“交给 Agent 一个明确任务，完成后把最终结果交还给脚本”。这一篇只讲官方 CLI 已支持的行为，不把内部测试协议当成稳定接口。

## 先理解 Profile

`dsh` 的启动单位不是某一个模型，而是一套 profile。profile 记录要叠加哪些插件组合包，以及用户自己的 patch 配置。

常用入口：

| 命令                              | 用途                                         |
| --------------------------------- | -------------------------------------------- |
| `dsh web`                         | 启动 Web UI                                  |
| `dsh --profile headless "任务"`   | 执行一个全新的持久化会话，打印最终回答后退出 |
| `dsh --profile <name>`            | 启动自定义 profile                           |
| `dsh plugin --profile <name> ...` | 为 profile 管理插件依赖                      |

`web` 和 `headless` 会在首次使用时从内置模板自动初始化。

## 准备凭据

Headless 模式没有页面让你现场输入密钥，因此需要提前提供凭据。最简单的是环境变量：

```bash
export DEEPSEEK_API_KEY="sk-your-key"
```

如果不想每次输入，可以在执行目录创建不会提交到 Git 的 `.env`：

```dotenv
DEEPSEEK_API_KEY=sk-your-key
```

确认 `.gitignore` 包含：

```text
.env
```

CLI 会依次从继承环境、`$DSH_HOME/.credentials.yaml`、当前目录 `.env` 和 `$DSH_HOME/.env` 解析凭据。

## 运行第一个 Headless 任务

先进入目标项目。当前目录就是默认 workspace 根目录：

```bash
cd /absolute/path/to/your-project
npx @deepseek-ai/dsh --profile headless +  "阅读 README 和 package.json，总结项目结构，不要修改文件。"
```

Headless profile 会：

1. 创建一个新的持久化 Agent 会话。
2. 提交任务并等待 Agent 完全停稳。
3. 刷新会话记录。
4. 从本轮事件中找出最后一段非空 assistant 文本。
5. 把它打印到标准输出。

任务以 `completed` 结束时，进程退出码是 `0`；其他结束原因返回 `1`。没有提供任务文本属于用法错误。

## 把最终回答保存下来

因为成功运行只把最终文本写到标准输出，所以可以直接重定向：

```bash
npx @deepseek-ai/dsh --profile headless +  "列出这个仓库最需要补充的三项文档。" +  > harness-review.md
```

在自动化脚本中同时检查退出码：

```bash
if npx @deepseek-ai/dsh --profile headless +  "运行测试并解释第一个失败原因。" > agent-result.txt
then
  echo "Agent completed"
else
  echo "Agent did not complete" >&2
  exit 1
fi
```

这里保存的是最终回答，不是完整事件流。不要依赖仓库测试夹具中的 JSONL 输出格式；官方文档明确说明那不是受支持的 CLI 输出协议。

## 用具体边界写任务

Headless 没有聊天界面帮你中途补充要求，因此任务文本要更完整：

不够明确：

> 帮我修一下项目。

更适合自动化：

> 运行现有单元测试，只修复第一个失败用例。不要升级依赖，不要修改测试断言。完成后重新运行该测试，并总结修改文件与验证结果。

一个好任务通常包含：

- 目标：最终要达到什么状态。
- 范围：允许查看或修改哪些内容。
- 禁止项：不能升级依赖、不能删除数据等。
- 验证：完成后要运行什么检查。
- 输出：最终回答必须包含哪些证据。

## 默认权限边界

新会话默认使用 `workspace-write`。Bash 和文件修改限于 workspace 与平台临时目录，读取、网络访问和进程可见性不受同样限制。

因此，Headless 也应该在隔离 checkout 或专用工作目录中运行。不要因为它没有界面，就把它当成一个只会输出文本的普通命令。

## 检查组合后的配置

遇到“为什么这个 profile 有某项能力”时，可以不启动 Agent，直接打印配置树：

```bash
npx @deepseek-ai/dsh --profile web --dump-default-config
npx @deepseek-ai/dsh --profile web --dump-config
```

`--dump-default-config` 只显示组合包默认层；`--dump-config` 还包含 profile、用户级配置和 `--patch` 覆盖。

如果要临时增加一个 patch：

```bash
npx @deepseek-ai/dsh --profile web +  --patch ./extra.cordis.yml +  --dump-config
```

## 什么时候使用 Headless

适合：

- 仓库巡检与摘要。
- 生成一次性报告。
- 在脚本中执行边界明确的代码任务。
- 无需浏览器界面的本地自动化。

不适合：

- 需要频繁确认方向的开放式任务。
- 需要人工逐步批准高风险操作的任务。
- 把完整会话事件当作稳定机器接口的系统集成。

如果你希望从自己的程序中控制 workspace、session id 与 Harness 生命周期，下一篇会比解析 CLI 文本更合适：

[使用 Python SDK 调用 DeepSeek Harness](/deepseek-harness-tutorials/deepseek-harness-python-sdk/)。
