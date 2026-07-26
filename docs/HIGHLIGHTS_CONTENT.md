# 精选阅读内容规范

`content/highlights/` 是精选阅读的唯一内容源。Astro 从同一份 Markdown 生成列表、详情页、标签和 RSS；不要再创建或维护 `static/highlights.json`，也不要向旧 Highlights 数据库接口写入内容。

## 书签

书签只在精选列表展示，标题直接链接原始资料。

```md
---
externalId: "openai-agents-sdk"
kind: "bookmark"
title: "OpenAI Agents SDK 官方教程"
description: "OpenAI 官方发布的 Agent 开发教程。"
date: 2026-07-26
sourceUrl: "https://openai.github.io/openai-agents-python/"
cover: "/media/highlights/openai-agents-sdk.webp"
tags: ["Agent", "OpenAI", "官方教程"]
featured: false
draft: false
---
```

## 解读文章

解读文章使用相同元数据，并在 frontmatter 后编写完整正文。文件名决定永久链接，例如：

```text
content/highlights/2026-07-26-openai-agents-sdk.md
→ /highlights/2026-07-26-openai-agents-sdk/
```

```md
---
externalId: "openai-agents-sdk-guide"
kind: "article"
title: "OpenAI Agents SDK：核心机制与完整实践"
description: "从官方资料出发，理解 Agent、工具调用、Handoff 与 Tracing。"
date: 2026-07-26
updatedAt: 2026-07-26
sourceUrl: "https://openai.github.io/openai-agents-python/"
cover: "/media/highlights/openai-agents-sdk.webp"
tags: ["Agent", "OpenAI", "官方文档"]
featured: false
draft: false
---

## 为什么值得阅读

正文……
```

## 字段

- `externalId`：当前语言内稳定且唯一的内容标识。
- `kind`：`bookmark` 或 `article`。
- `title`、`description`：列表和页面使用的标题与简介。
- `date`：精选日期；无法可靠确认的历史记录可以省略。
- `updatedAt`：文章最近一次实质更新日期，可选。
- `sourceUrl`：原始资料的 HTTPS 地址。
- `cover`：HTTPS 地址或站内绝对路径，可选。
- `tags`：用于筛选和检索的标签。
- `featured`：是否作为重点内容，默认 `false`。
- `draft`：为 `true` 时不发布。

英文内容使用相同文件名并增加 `.en.md` 后缀。只有 `kind: article` 的文件生成站内详情页；`bookmark` 不进入 Sitemap，也不会产生空白详情页。

## 发布检查

从 `astro/` 目录运行：

```sh
npm run check
npm run lint
npm run test
npm run verify
```

内容通过 PR 合并后进入现有构建和生产发布流程。
