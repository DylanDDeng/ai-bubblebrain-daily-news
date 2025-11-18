---
title: "在企业中如何使用Claude Code"
date: 2025-11-16T10:00:00+08:00
description: "企业里是如何使用Claude Code的"
tags: ["Agent"]
---   
[原文:How three YC startups built their companies with Claude Code](https://claude.com/blog/building-companies-with-claude-code)

## 📖 博文主题

这篇文章讲述了**三家 Y Combinator (YC) 孵化的创业公司如何使用 Claude Code 构建和发展他们的业务**，展现了 AI 编码工具如何从根本上改变创业公司的开发方式。

## 🏢 三个创业公司案例

### **1. HumanLayer - 从 SQL 代理到 AI 工程团队协作**

- **创始人**: Dexter Horthy
- **核心洞察**: 公司不愿让 AI 无监督地执行敏感操作（如删除数据库表）
- **产品演进**: 
  - 最初构建 SQL 数据仓库的自动化代理
  - 转向提供 API/SDK，让 AI 代理能通过 Slack、邮件等渠道获得人类审批
  - 发布了《[12-Factor Agents](https://github.com/humanlayer/12-factor-agents)》指南，成为热门资源
  - 最终推出 **CodeLayer**，帮助团队并行运行多个 Claude 代理会话
- **成就**: 用 Claude Code 在 7 小时内完成通常需要 1-2 周的工作

### **2. Ambral - 用子代理驱动客户成功管理**

- **创始人**: Jack Stettner (CTO/唯一工程师) 和 Sam Brickman
- **解决的问题**: B2B 公司规模化后，客户经理难以有效管理 50-100 个账户
- **技术架构**:
  - **Opus 4.1** 用于深度研究和规划
  - **Sonnet 4.5** 用于代码实现
  - 使用 Claude Agent SDK 构建强大的研究引擎，为每种数据类型配备专门的子代理
- **工作流**: 研究阶段 → 规划阶段 → 实施阶段（三阶段分离）

### **3. Vulcan Technologies - 非技术创始人也能发布产品**

- **创始人**: Tanner Jones (CEO) 和 Aleksander Mekhanik（都无工程背景）
- **业务**: 用 AI 分析监管法规的复杂性
- **惊人成就**:
  - 2025 年 4 月成立，5 月 1 日就用 Claude 构建出原型
  - 击败老牌咨询公司，赢得弗吉尼亚州州长办公室的合同
  - 帮助弗吉尼亚州将新房平均价格降低 $24,000，每年为居民节省超过 10 亿美元
  - 4 个月内获得 1100 万美元种子轮融资
  - 州长签署行政令，要求所有州政府机构使用"代理式 AI 监管审查"

## 💡 最佳实践总结

文章提炼出三大核心实践：

1. **将研究、规划、实施分离为独立会话** - 避免上下文污染
2. **审慎管理上下文** - 确保提示中没有矛盾信息
3. **监控并及时中断思维链** - 在早期发现错误方向时立即纠正

## 🎯 核心观点

文章强调，传统的软件开发壁垒（技术专长、团队规模、开发时间）正在消失，新的竞争优势变成了：
- **清晰的思维**
- **结构化的问题分解能力**
- **有效与 AI 协作的能力**

这代表了公司构建方式的根本性转变——即使是非技术创始人，也能通过 Claude Code 这样的工具快速将想法变为现实产品。