---
title: "知识卡片提示词"
slug: "knowlege-card"
description: "适用于Claude等前端能力较强的模型"
date: 2025-11-16
tags: ["知识卡片",]
model: "Claude" 
---   


```text 
你是一名资深的前端工程师 + 信息结构设计师。  
请将我提供的文章自动转换成一页「深色知识卡片」HTML 页面。  

【目标效果】
- 深色背景、浅色文字、黄色强调色；
- 两列知识卡片布局（移动端自动单列）；
- 顶部包含主标题、副标题、右上角圆形头像与用户名；
- 页面末尾含总结区（footer）；
- 直接输出完整 HTML 文件（含内联 CSS），不需任何说明文字。

--------------------
【输入格式】
<<<ARTICLE
内容
ARTICLE>>>

--------------------
【生成逻辑】
1. 自动通读文章，抽取核心结构。
2. 将内容拆解为 4–6 张知识卡片，每张卡片包括：
   - 小标题（card-subtitle），如 “01 · 引言”
   - 主标题（card-title）：一句总结性观点
   - 正文（card-body）：2–4 段短句或 `<ul><li>` 结构
   - 可选图片占位符 `<div class="image-placeholder">插图说明</div>`
   - 一句标签 `<span class="tag">#关键词</span>`
3. 生成顶部标题区：
   - 主标题：自动从主题生成，如 “如何通过日常刻意练习来 <span class="highlight">提升审美</span>”
   - 副标题：一句简短说明
   - 作者模块：
     ```html
     <div class="author-info">
       <img src="【头像地址】" alt="作者头像" class="author-avatar" />
       <p class="author-handle">【用户名】</p>
     </div>
     ```
     样式要求：圆形头像（48px），下方用户名，右上角对齐；移动端自动居中。
4. 页尾（footer）包括：
   - 一句总结性标题；
   - 2–3 个短句要点；
   - 一段收尾文案（可含 `<span class="highlight">`）。

--------------------
【HTML / CSS 模板要求】

请直接输出如下结构的完整 HTML 文件：

<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>自动生成的知识卡片</title>
  <style>
    :root {
      --bg: #1A1A1A;
      --text: #FFFFFF;
      --accent: #FFC400;
      --card-bg: #2A2A2A;
      --radius: 16px;
      --shadow: 0 4px 12px rgba(0,0,0,0.15);
      --subtle-border: 1px solid rgba(255,255,255,0.08);
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: Inter, 'PingFang SC', sans-serif;
      margin: 0;
      -webkit-font-smoothing: antialiased;
    }

    .page {
      max-width: 1000px;
      margin: 0 auto;
      padding: 60px 20px;
    }

    .page-title {
      text-align: center;
      margin-bottom: 32px;
      position: relative;
    }

    .page-title h1 {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.4;
    }
    .highlight { color: var(--accent); }
    .page-title p { margin-top: 8px; font-size: 14px; color: #B3B3B3; }

    /* 作者头像模块 */
    .author-info {
      position: absolute;
      top: 0;
      right: 0;
      text-align: center;
    }
    .author-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    }
    .author-handle {
      font-size: 13px;
      color: #B3B3B3;
      margin-top: 6px;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }

    .card {
      background: var(--card-bg);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      border: var(--subtle-border);
      padding: 24px 28px;
    }

    .card-subtitle {
      font-size: 12px;
      color: #BBBBBB;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    .card-title {
      font-size: 20px;
      font-weight: 700;
      color: #FFFFFF;
      margin-bottom: 12px;
    }

    .card-body {
      font-size: 14px;
      color: #CCCCCC;
      line-height: 1.7;
    }

    .tag {
      display: inline-block;
      margin-top: 16px;
      padding: 4px 10px;
      border-radius: 20px;
      background: var(--accent);
      color: #1A1A1A;
      font-size: 12px;
      font-weight: 600;
    }

    .image-placeholder {
      margin-top: 12px;
      border: 1px dashed rgba(255,255,255,0.2);
      border-radius: 12px;
      padding: 10px 12px;
      color: #AAAAAA;
      font-size: 12px;
    }

    .footer {
      background: var(--card-bg);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      border: var(--subtle-border);
      text-align: center;
      margin-top: 40px;
      padding: 32px 24px;
    }
    .footer-title { color: var(--accent); font-size: 18px; font-weight: 700; margin-bottom: 16px; }
    .footer-pill { display: inline-block; padding: 6px 14px; border-radius: 999px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); margin: 4px; }
    .footer-note { color: #AAAAAA; font-size: 13px; margin-top: 12px; }

    
@media
 (max-width: 768px) {
      .cards-grid { grid-template-columns: 1fr; }
      .author-info { position: static; margin-top: 16px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="page-title">
      <!-- 自动生成标题、副标题、头像模块 -->
    </header>
    <section class="cards-grid">
      <!-- 自动生成 4–6 张知识卡片 -->
    </section>
    <section class="footer">
      <!-- 自动生成总结与要点 -->
    </section>
  </main>
</body>
</html>

--------------------
【输出要求】
- 直接生成完整 HTML；
- 不添加任何解释或提示；
- 结果应可立即复制为 `.html` 文件并在浏览器中打开。 
```