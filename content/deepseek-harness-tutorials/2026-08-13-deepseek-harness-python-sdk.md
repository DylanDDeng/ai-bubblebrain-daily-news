---
title: "Python SDK：在程序中调用 DeepSeek Harness"
slug: "deepseek-harness-python-sdk"
description: "安装 deepseek-harness-sdk，运行官方 JSON-RPC 示例，并正确管理 workspace、session id 与 Harness 生命周期。"
date: 2026-08-13T02:00:00Z
weight: 6
tags: ["DeepSeek Harness", "Python SDK", "JSON-RPC", "Agent API", "自动化"]
author: "BubbleBrain"
sourceUrl: "https://github.com/deepseek-ai/deepseek-harness"
---

> CLI 适合让脚本启动一个任务；Python SDK 适合把 Harness 作为自己程序中的一个组件。本篇基于官方 `deepseek-harness-sdk` 与仓库内置 `jsonrpc-agent` 示例。

## 运行条件

官方当前列出的条件包括：

- Python 3.10 或更高版本。
- Git。
- Linux x64、Linux arm64，或 macOS 14 以上的 arm64。
- DeepSeek 兼容 API 端点与凭据。
- 一个允许 Agent 修改的隔离 workspace。

通过 PyPI 安装的 SDK 会带同版本内置运行时，普通使用不需要系统再提供 Node.js。

## 安装 SDK

克隆仓库是为了直接使用官方可运行示例：

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness

python -m venv .venv
. .venv/bin/activate
python -m pip install deepseek-harness-sdk
```

Windows 的虚拟环境激活命令不同，但当前官方 JSON-RPC 最小组合依赖 POSIX 持久终端，因此不支持 Windows Agent。

## 设置运行环境

```bash
export DEEPSEEK_API_KEY="sk-your-key"
```

使用 OpenAI 兼容代理时，可以增加：

```bash
export DEEPSEEK_BASE_URL="http://127.0.0.1:8000/v1"
```

还可以覆盖模型与系统提示词：

```bash
export DSH_MODEL="deepseek-v4-flash"
export DSH_SYSTEM_PROMPT="You are a helpful software engineer assistant."
```

这些模型名称来自当前预览版示例，后续版本可能变化。实际使用时请以官方仓库和你的端点支持情况为准。

## 运行官方最小示例

先准备两个互相分离的目录：

```bash
mkdir -p /tmp/dsh-sdk-workspace
mkdir -p /tmp/dsh-sdk-sessions
```

运行任务：

```bash
python examples/jsonrpc-agent/minimal.py +  --workspace /tmp/dsh-sdk-workspace +  --session-root /tmp/dsh-sdk-sessions +  --session-id example-001 +  "Inspect the workspace and create a short README."
```

脚本会打印最终回答，会话目录则保存 JSONL 日志，其中包括组装后的模型请求与工具调用。

## 在自己的代码中使用

```python
from pathlib import Path

from deepseek_harness import DeepSeekHarness

config = Path("examples/jsonrpc-agent/minimal.cordis.yml").resolve()
workspace = Path("/tmp/dsh-sdk-workspace").resolve()
sessions = Path("/tmp/dsh-sdk-sessions").resolve()

with DeepSeekHarness(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cwd=str(workspace),
    session_root=str(sessions),
    cordis=str(config),
) as harness:
    result = harness.run(
        "Inspect the workspace and create a short README.",
        session_id="example-001",
    )

print(result.final_response)
```

`DeepSeekHarness` 会延迟启动内置运行时，并在上下文管理器退出前复用它。把它放进 `with` 块，可以确保运行结束后正确释放资源。

## Workspace 与 Session ID 不要混淆

`cwd` 决定 Agent 在哪里工作；`session_root` 决定日志与状态存在哪里；`session_id` 决定这次调用属于哪段持续会话。

| 参数           | 作用                 |
| -------------- | -------------------- |
| `cwd`          | Agent 的 workspace   |
| `session_root` | 会话日志与状态根目录 |
| `session_id`   | 一段会话的稳定身份   |

复用同一个 Harness 与 session id，会保留这段会话的历史和 Bash 进程状态，包括当前目录、已导出的变量和 shell 函数。

因此：

- 独立任务使用新的 session id。
- 只有确实要继续同一段对话时才复用 id。
- 不要让两个无关用户共享 session id。

## 最小示例到底包含什么

官方 `minimal` 组合有意保持简单：

- 面向模型的工具只有持久 `bash` 与 `str_replace_editor`。
- Bash 超时为 300 秒。
- 编辑器输出上限为 16,000 字符。
- 上下文压缩关闭。
- 会话持久化为未压缩 JSONL。

它省略了 Harness 身份、workspace 提示词、Skills、一次性 Bash、任务工具与其他插件。这非常适合学习 API，但不代表 Web profile 的完整能力。

## 重要安全警告

官方最小 JSON-RPC 组合使用 `danger-full-access`，Bash 与编辑器可以修改运行时进程能够访问的路径。

务必：

- 使用可丢弃的 checkout、容器或隔离目录。
- 不要把 workspace 指向主目录。
- 为每个外部请求校验任务文本与 session id。
- 不要把完整日志直接暴露给不受信任的用户。

## 什么时候选择 Python SDK

选择 SDK：

- 需要在 Python 服务中重复调用 Harness。
- 需要明确控制 workspace、会话和运行时生命周期。
- 需要读取结构化结果，而不是只解析 CLI 输出。

继续扩展能力时，下一步不再是增加 if/else，而是学习 Harness 的插件机制：

[开发第一个 DeepSeek Harness 插件与工具](/deepseek-harness-tutorials/deepseek-harness-first-plugin/)。
