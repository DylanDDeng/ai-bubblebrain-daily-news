---
title: "模型配置：DeepSeek 与自定义 Provider"
slug: "deepseek-harness-model-configuration"
description: "学会保存 DeepSeek API Key、添加 OpenAI 兼容端点、声明图片输入能力，并处理常见模型配置错误。"
date: 2026-08-13T04:00:00Z
tags:
  [
    "DeepSeek Harness",
    "DeepSeek API",
    "模型配置",
    "OpenAI Compatible",
    "Provider",
  ]
author: "BubbleBrain"
sourceUrl: "https://github.com/deepseek-ai/deepseek-harness"
---

> 本篇对应官方 Web UI 的“设置 → 模型”。目标不是列出所有提供方，而是让你理解 Harness 如何保存凭据、注册模型路由并为会话选择模型。

## 配置官方 DeepSeek

启动 Web UI 后，打开**设置 → 模型**。DeepSeek 卡片会提供 API Key 输入框。

![DeepSeek Harness 模型设置页](/media/deepseek-harness-tutorials/model-configuration/providers-models-page.png)

输入密钥并保存后，下一次请求立即使用新配置，不需要重启服务。

官方 DeepSeek 路由的内部 Provider ID 是 `deepseek-official`。默认配置会公布 DeepSeek 模型供选择器使用，但真正发起请求前仍然必须找到有效凭据。

## 密钥保存在哪里

DeepSeek Harness 把“连接配置”和“明文凭据”分开：

- `$DSH_HOME/settings.yaml` 保存设置与凭据引用。
- `$DSH_HOME/.credentials.yaml` 保存受管密钥。
- 当前目录的 `.env` 与 `$DSH_HOME/.env` 也可以作为启动环境层。

Web 页面读取到的是脱敏描述符，不是你刚刚输入的明文密钥。

如果要在命令行模式使用环境变量，可以写：

```bash
export DEEPSEEK_API_KEY="sk-your-key"
```

更稳妥的做法是把变量放进一个不会提交到 Git 的 `.env`，并确认 `.gitignore` 已排除它。

## 添加内置目录提供方

点击**添加提供方**，可以选择 Anthropic、OpenAI 等已安装目录提供方。目录会预置端点、协议和模型列表，你只需要补齐相应凭据。

并不是所有提供方都只需要一个 API Key：

- Bedrock 需要 AWS 凭据与区域。
- Vertex 使用 Google ADC 与项目配置。
- Azure 需要 `api-version` 等信息。
- Codex 使用 OAuth。

遇到认证错误时，不要反复修改模型名，先核对该提供方真正需要的认证方式。

## 添加自定义 OpenAI 兼容端点

如果你使用公司网关、本地推理服务或目录中没有的提供方，选择**添加自定义提供方**。

![DeepSeek Harness 自定义 Provider 表单](/media/deepseek-harness-tutorials/model-configuration/providers-custom-form.png)

至少要填写：

- 小写 Provider ID。
- 显示名称。
- Base URL。
- API 协议。
- 凭据。
- 至少一个模型 ID。

Provider ID 会进入请求、模型默认值、会话记录和凭据引用，因此保存后应把它当作永久标识。想改显示名称可以直接编辑；想改 Provider ID，应该新建一个提供方，再删除旧项。

如果服务支持 `GET /models`，可以使用**获取可用模型**。有些兼容端点没有这个接口，此时手动输入模型 ID 即可。

## 视觉模型为什么可能拒绝图片

手动添加的模型默认只按纯文本模型处理。即使端点实际上支持图片，Harness 也不会凭空猜测。

需要在 `$DSH_HOME/settings.yaml` 中显式声明：

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      models:
        - id: text-model
        - id: vision-model
          input: [text, image]
```

如果这个路由下所有模型都支持图片，可以设置回退值：

```yaml
defaultInput: [text, image]
```

这只是你对端点能力的声明，不是自动检测。声明了图片能力，但服务实际不支持，最终仍会由提供方拒绝请求。

官方 DeepSeek chat-completions 路由目前是纯文本路由，不能靠这项配置把它改成视觉模型。

## 模型选择与会话的关系

在模型选择器里选中一个模型时，它也会成为新会话的默认值。已经发送过请求的会话会保留日志中记录的模型。

因此，切换模型后如果旧会话仍表现得像之前的模型，最简单的验证方式是新建一个会话。

## 常见错误

| 错误                 | 含义                     | 处理方式                                 |
| -------------------- | ------------------------ | ---------------------------------------- |
| `MISSING_CREDENTIAL` | 找不到对应凭据           | 在模型页保存密钥，或提供被引用的环境变量 |
| `UNKNOWN_MODEL`      | 当前路由没有该模型       | 重新选择模型，或补充自定义模型 ID        |
| 获取模型返回 401     | 模型发现请求认证失败     | 检查 Base URL 与密钥                     |
| 图片发送前被拒绝     | 模型没有声明图片输入     | 为模型增加 `input: [text, image]`        |
| 提供方拒绝图片       | 声明能力与真实端点不一致 | 移除错误的 `image` 声明并新建会话        |

## 安全检查清单

- 不要把真实 API Key 写进教程、截图或 Git。
- 自定义 Provider 的 Base URL 必须是你信任的服务。
- 删除 Provider 前，确认没有需要继续使用它的历史会话。
- 配置完成后，用一个低风险、短提示词先验证连通性。

到这里，Web UI 的基础使用已经完整跑通。下一篇进入适合自动化的运行方式：

[使用 CLI 与 Headless 模式执行一次性任务](/deepseek-harness-tutorials/deepseek-harness-cli-headless/)。
