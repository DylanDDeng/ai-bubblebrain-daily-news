# Bubble's Brain

Bubble's Brain 是一个面向 AI 实践者的个人知识库，沉淀值得长期检索和复用的内容，而不是追逐每日信息流。

线上站点：<https://bubblenews.today>

本项目由 AI 日报站点转型而来：自动抓取和日报发布链路已停用，历史日报只保留在 Git 历史中，不会进入当前构建、搜索、RSS 或路由。

## 站点栏目

- **Codex 教程**（`codex-tutorials/`）：从安装入门到真实工作流的系统指南。
- **Pi Agent 教程**（`pi-agent-tutorials/`）：Pi Agent 的安装、会话存储与工具系统实践指南。
- **WorkBuddy 教程**（`workbuddy-tutorials/`）：从安装入门到办公自动化的实用指南。
- **Vibe Coding**（`vibe-coding/`）：术语表、Skills 与 Design 三个子栏目。
- **X 热门 AI 内容精选**（`x-trending/`）：亲选的 X 热门博主 AI 内容。
- **精选阅读**（`highlights/`）：一手资料、官方文章与深度解读。
- **关于**（`about/`）：站点与作者介绍。

## 内容原则

- 优先收录长期有效、来源清晰的内容。
- Markdown 是完整文章的主要内容源，`content/` 是唯一内容目录。
- 内容按栏目、标签和关联主题组织，不按日期制造更新压力。

## 技术栈

- Astro 7 静态输出 + `@astrojs/cloudflare` adapter（Cloudflare 发布）
- Markdown content collections
- 中英双语路由（zh-CN 默认，`en/` 前缀），canonical 与 hreflang
- 静态全文搜索、RSS、Sitemap、无 JavaScript 可读性
- 构建期校验：路由契约、CSP、内部链接

## 项目结构

```text
astro/     Astro 展示层：页面、组件、搜索索引与测试（见 astro/README.md）
content/   Markdown 内容源，站点内容的唯一来源
static/    全站静态资源（作为 Astro publicDir 引用）
workers/   内容发布管线 Worker，配合 GitHub Actions 完成发布
scripts/   校验脚本（verify-site.mjs 等被 astro verify 复用）
docs/      设计文档与 runbook；docs/archive/ 存放旧日报时代归档文档
```

## 本地开发

需要 Node.js ^22.17 或 >=24：

```sh
cd astro
npm install
npm run dev
```

## 验证与构建

```sh
cd astro
npm run verify   # astro check + eslint + vitest + build + CSP + 站点校验
```

构建产物位于 `astro/dist/`。

## License

[MIT](LICENSE)
