# Bubble's Brain Astro site

Astro 是 Bubble's Brain 知识库的正式展示层。它从 `../content` 读取 Codex 教程、Pi Agent 教程、WorkBuddy 教程、Vibe Coding、精选阅读、Prompt、模型评测、研究笔记与个人文章，并生成静态站点。AI 工具内容暂时保留在源码中，但不会生成公开栏目、搜索结果或 RSS。

## 站点能力

- Astro 7 静态构建与严格 TypeScript。
- 中文和英文内容路由。
- Markdown 驱动的知识栏目。
- 面向所有知识内容的静态搜索。
- RSS、Sitemap、canonical、hreflang 与无 JavaScript 可读性。
- 构建产物路由契约、CSP 与内部链接验证。

日报页面和结构化日报数据不会进入构建产物；生产 Worker 也不再注册自动抓取 cron。

## 文章图片

正文中的独立 Markdown 图片会自动渲染为响应式 Figure：本地栅格图在 `npm run dev`
和 `npm run build` 前生成 640、960、1440 像素以内的 AVIF/WebP 版本，SVG 与 GIF 保留原格式。
首张图片直接加载，后续图片延迟加载；点击图片会打开站内查看器，原文件仍可单独打开。

默认尺寸根据图片比例与像素宽度在 `compact`、`default`、`wide` 三档中自动选择。需要人工覆盖
尺寸或 Caption 时，在 Markdown 图片标题中使用尺寸前缀：

```md
![描述图片内容的替代文本](/media/example.png '[wide] 显示在图片下方的说明')
```

前缀可取 `[compact]`、`[default]`、`[wide]`。未填写标题时，非通用的替代文本会同时作为
Caption；`图片`、`截图`、`Image` 等通用文本只保留为替代文本，不显示 Caption。

## Commands

```sh
npm install
npm run dev
npm run check
npm run lint
npm run test
npm run build
npm run verify
```

构建产物位于 `dist/`。

## Content flow

```text
content/**/*.md
  -> Astro content collections
  -> knowledge pages and search index
  -> RSS, sitemap, and static release artifact
```
