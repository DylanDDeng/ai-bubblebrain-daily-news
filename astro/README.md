# Bubble's Brain Astro site

Astro 是 Bubble's Brain 知识库的正式展示层。它从 `../content` 读取 Codex 教程、WorkBuddy 教程、精选阅读、Prompt、模型评测、研究笔记与个人文章，并生成静态站点。AI 工具内容暂时保留在源码中，但不会生成公开栏目、搜索结果或 RSS。

## 站点能力

- Astro 7 静态构建与严格 TypeScript。
- 中文和英文内容路由。
- Markdown 驱动的知识栏目。
- 面向所有知识内容的静态搜索。
- RSS、Sitemap、canonical、hreflang 与无 JavaScript 可读性。
- 构建产物路由契约、CSP 与内部链接验证。

日报页面和结构化日报数据不会进入构建产物；生产 Worker 也不再注册自动抓取 cron。

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
