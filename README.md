# Bubble's Brain

Bubble's Brain 是一个面向 AI 实践者的个人知识库，用来沉淀值得长期检索和复用的内容，而不是追逐每日信息流。

站点内容包括：

- Codex 教程：从安装入门到真实工作流的系统指南。
- WorkBuddy 教程：从安装入门到办公自动化的实用指南。
- 精选阅读：一手资料、官方文章与深度解读。
- Prompt 库：可以直接用于真实工作流的提示词。
- 模型评测：围绕实际任务记录模型能力与边界。
- 研究笔记：论文与技术材料的整理和解释。

## 内容原则

- 优先收录长期有效、来源清晰的内容。
- Markdown 是完整文章的主要内容源。
- 内容按栏目、标签和关联主题组织，不按日期制造更新压力。
- 自动日报抓取和发布已经停用，站点不再提供日报栏目。

## 技术栈

- Astro 静态站点
- Cloudflare Pages / Workers
- 中英文内容路由
- Markdown 内容集合
- 静态全文搜索、RSS、Sitemap 与可访问性检查

## 本地开发

需要 Node.js 22.17 或更新的受支持版本。

```sh
npm install --prefix astro
npm run dev --prefix astro
```

完整验证：

```sh
npm run verify --prefix astro
```

构建产物位于 `astro/dist/`。

## 内容目录

```text
content/
  codex-tutorials/ Codex 教程
	workbuddy-tutorials/ WorkBuddy 教程
  highlights/   精选阅读
  prompts/      Prompt 库
  model-evals/  模型评测
  ai-tools/     AI 工具（暂时不公开，保留内容以便恢复）
  curations/    研究笔记
  my-publish/   我的文章（不公开，保留内容以便恢复）
  about/        关于页面
```

历史日报只保留在 Git 历史中，不会进入当前源码内容目录、Astro 构建、搜索、RSS 或站点路由。

## License

[MIT](LICENSE)
