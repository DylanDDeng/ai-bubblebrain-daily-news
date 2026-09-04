---
externalId: "how-our-agents-build-on-brand-pages-with-design-md"
kind: "article"
title: "Vercel 如何让 Agent 用 design.md 构建符合品牌的页面"
description: "Vercel 公开了 design.md 的构建方法：把设计判断、公共样式表、人工评审和自动检查组成持续演进的评测循环，让不同 Agent 生成稳定且符合品牌的页面。"
date: 2026-08-31
sourceUrl: "https://vercel.com/blog/how-our-agents-build-on-brand-pages-with-design-md"
tags: ["Vercel", "design.md", "Design System", "AI Agent", "Evals", "Codex"]
featured: true
draft: false
---

[Vercel 官方原文](https://vercel.com/blog/how-our-agents-build-on-brand-pages-with-design-md)

Vercel 会用 Coding Agent 设计和构建报告、提案、微型网站等页面。这些产物需要延续 Vercel 已上线页面中的字体、色彩、构图与设计判断。作者 John Phamous 介绍了团队如何把这套能力从代码仓库里的 `product-design` Skill 扩展到任何 Agent 都能读取的公共文件 [`design.md`](https://vercel.com/design.md)，以及他们怎样用持续评测让它真正发挥作用。

## 1. 从仓库里的 Skill 走向公共设计文件

Vercel 先前发布的 [`product-design`](https://vercel.com/blog/teaching-agents-product-design-at-vercel) Skill 与产品代码放在同一个仓库。Agent 可以同时读取设计系统、产品规则、真实组件和已经上线的页面示例。这套方法适合仓库内开发，但报告、续约提案和一次性页面常常在无法访问源码的工具里生成。

团队因此确定了两个要求：

- 提供一个公开 URL，让任何环境中的 Agent 都能直接加载；
- 覆盖品牌、布局、文案、设计系统、响应式设计与信息架构等完整知识。

最初的方案是把 `product-design` 的参考文件合并成一份公共 Prompt。视觉语言虽然描述得很清楚，不同模型仍会从同一段描述生成差异巨大的页面。“保持布局干净”一类语言缺少可观察的标准；离开仓库后，真实组件与上线案例也随之缺席，模型只能根据文字重新猜测品牌样式。

团队随后从零编写新文件，并让每次改动接受一组固定评测。他们从真实工作中提炼了七个场景，并为每个场景准备模拟数据：

- 使用情况与性能报告；
- 续约提案；
- 基准测试报告；
- 交互式规划页面；
- 自建与采购对比简报；
- 安全治理简报；
- 演示文稿。

Prompt、数据和渲染设置保持固定，输出变化便能追溯到 `design.md`。

## 2. 第一次对照实验

第一次实验使用同一个模型、Prompt、数据和视口生成两份续约提案，其中一份加载 `design.md`，另一份保持原始环境。每份结果只生成一次，没有重新抽样。

![同一份续约提案在加载 design.md 前后的对比](https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/4kNmeRfQq0MgbJMdN7XCIQ/6e701e79b08e90bd0312f06884f890db/Frame_1400003192__5_.png "[wide] Prompt、数据、模型和视口完全相同，两份结果都只生成一次。")

原始结果采用了常见的 SaaS Dashboard 结构。加载 `design.md` 后，页面把续约建议放在首位，将商业证据收进同一个网格，把同类数值放到统一尺度上比较，同时让辅助细节保持可查阅状态。文件影响了信息结构与视觉层级，也为后续逐条积累设计规则提供了足够清晰的信号。

## 3. 让系统运转的三个部分

反复测试后，这套方法形成了三个相互配合的层次：

- [`design.md`](https://vercel.com/design.md) 负责判断，告诉 Agent 如何理解读者任务、组织证据和选择构图；
- 公共的 [`vercel-brand.css`](https://vercel.com/geist/vercel-brand.css) 提供边界明确的类名与 Design Token；
- 评测循环把重复出现的人工反馈转成更准确的指导和可执行检查。

`design.md` 涵盖快速的管理层阅读与深入审阅、具体且诚实的文案、证据与正文之间的层级关系，以及 Vercel 字标和三角形 Logo 的使用规则。它还给常见的 AI 生成设计套路命名，让 Agent 更容易识别并避开这些模式。

![design.md 中对常见生成式设计模式的命名](https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/5ddvYwvA6TmgyMRnBnTk82/1319c6b7f77f1f6c04efd6d8366cc7b0/Frame_1400003199.png "design.md 明确命名反复出现的生成式设计模式，帮助 Agent 识别并避开它们。")

公共样式表则接管字体、间距与布局等重复性决定，并封装标题、表格、数据条和图表样式。`design.md` 记录可用的类名和 Token，Agent 可以在 HTML 中直接调用。浏览器在渲染时加载 CSS，样式代码无需占用模型上下文。

评测循环负责连接前两层。代码检查捕捉表格宽度等机械问题，人类评审层级、构图，以及页面能否帮助读者完成真实任务。

## 4. 每条指导都来自评测循环

团队从固定场景生成页面、审阅结果、写入认可的修正，再重新运行场景，确认修正持续生效。某项改动可能改善一类页面，同时伤害另一类页面，因此每条规则都要用输出证明自己的价值。

### 场景与轮次

一个场景由固定 Prompt、模拟输入和渲染设置组成。一个完整轮次会让七个场景分别在 Claude Opus 4.8 和搭载 GPT-5.5 的 Codex 上重新生成。若改动只影响表格，团队也可以仅重跑相关场景或单个模型，缩短迭代周期。

七种页面共享 Vercel 的字体、色彩和间距，同时围绕各自读者的任务组织结构。交互式规划页面突出控件，续约提案优先呈现建议与商业比较。统一品牌语言并没有把所有页面压成同一个模板。

![不同场景共享视觉语言，同时采用不同页面结构](https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/7H9KorueiLZ2DiimG5FMiw/bcda164e35375394bd55ec5a1b5e942f/Frame_1400003196__1_.png "[wide] 不同场景共享 Vercel 的视觉语言，并根据读者任务选择不同结构。")

### 审阅每一次运行

Vercel 构建了一个本地评审工具，用完整页面截图进行盲测 A/B 对比。它后来发展成评测 Harness，保存每次运行的 Prompt、输入、模型配置、`design.md` 版本、截图和评审反馈。每条修正都能回到产生问题的准确运行记录。

<video controls playsinline preload="metadata" src="https://assets.vercel.com/video/upload/contentful/video/e5382hct74si/33d9KrOHYeH4jVpGfRvN4w/1e533a11ac2bee8d1d971da80f42ac8c/johnphamous_2026-08-14_at_12.20.06_Aside.mp4"></video>

_本地评审工具会展示完整页面，并对每次运行进行盲测 A/B 比较。_

### 把修正写成规则和检查

每条反馈会进入能够稳定执行它的最小层级：设计判断写进 `design.md`，可复用机制进入样式表，可机械判断的失败转成代码检查，Harness 自身的问题留在 Harness 中。若某种失败只在单个模型上出现，团队会等待它再次发生，再决定是否升级为通用规则。

例如，早期续约提案把商业条款表格挤进正文宽度，页面两侧仍有大量空间。历史输出表明这个问题反复出现，于是团队同时增加了一条“证据表格应使用可用全宽”的设计规则和一项自动布局检查。

![商业条款表格在反馈写入 design.md 前后的变化](https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/3mNy5CuYb5RzJo50MID1eo/95404ecb3be7a04eba93c2edeb155a99/Frame_1400003195__2_.png "[wide] 商业条款表格在反馈写入 design.md 前后的变化。")

相关场景会在规则更新后立即重跑。到达阶段性节点时，新版本还会与较早版本进行盲测 A/B 对比，用结果决定保留、修改或撤回规则。

## 5. 测量 design.md 是否有效

`design.md` 的构建经历了 200 多次运行，包括完整轮次、定向检查、试运行和失败尝试。人类评审之外，模型评委也会为每一轮写出批评意见，推动下一轮调整。

![评测轮次中的页面逐步吸收反馈](https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/6gM4GTG3rpgP4QgFIL9dt/7b0c3e2932e501f9a5a2915985524abe/Frame_1400003202.png "[wide] 图中每隔三次展示一个生成结果，每轮反馈都会进入下一次改进。")

最终测试选择三个桌面场景，让搭载 GPT-5.5 的 Codex 分别在加载和未加载 `design.md` 的条件下生成页面。团队保留六次生成的第一版结果，并运行所有确定性检查。加载文件的三张页面共出现 39 个已知失败，未加载文件的三张页面出现 91 个，相差 57%。

这个数字有两项重要限制。检查只能识别团队已经见过并编码的问题，无法评价页面整体设计质量；六张页面的样本量也很小，而且每张页面仍至少包含一个足以阻止发布的严重问题。它能证明的是：一个失败被明确命名并写入系统后，再次出现的频率会明显下降。

## 6. 用真实使用让文件持续更新

固定场景帮助文件上线，真实使用负责让它保持有效。Vercel 在 Slack 中使用基于 [eve](https://eve.dev/) 构建的 `@design-agent`，处理设计点评、文案备选、图标建议，以及根据粘贴数据生成报告网站等工作。收到网页请求后，它会加载当前 `design.md`，使用公共样式表构建页面，再把整页截图和部署地址发回讨论串。

这些讨论串记录真实请求、真实输出和后续反馈。团队每周把 Slack、GitHub Review 与 Figma 评论汇总到一起，自动聚类重复意见，再由人判断修正应该进入 `@design-agent`、`product-design` Skill、`design.md`、样式表或确定性检查。遇到新的页面类型时，请求本身会成为新的评测场景。

团队持续统计同类投诉的出现频率。规则生效后，相应投诉应该减少；若没有下降，就需要检查规则表述、加载时机、样式原语或自动检查是否选错了层级。

## 7. 建立自己的设计评测循环

Vercel 给出了一条从手工比较起步的路径：

1. **选一种重复出现的产物。** 从真实提案、性能报告、Benchmark 或微型网站开始，先写下事实是否保留、读者决策是否清楚、常见人工修正是否解决等评分标准。
2. **先保存基线。** 在添加设计上下文前生成一次，保存 Prompt、输入、配置和截图，并保留第一次输出。
3. **从最近十条修正开始。** 把“让表格感觉宽松些”改写成“让证据表格使用全部可用宽度”这类可观察规则，并按作用范围、读者任务、可观察决定和可用原语组织成第一版 `design.md`。
4. **约束重复机制。** 当 Agent 经常自创字体、间距和布局时，发布一份样式表，明确它可以使用的类名与 Token。判断留在文字中，重复机制进入 CSS 或自动检查。
5. **执行一次匹配对照。** 使用相同输入、模型和视口重新生成，随机打乱基线与新结果，再按评分标准盲测。一次实验足以暴露明显问题，可靠性则需要多个独立的首次尝试；Vercel 也链接了 [Anthropic 的 Agent 评测指南](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)。
6. **编码修正。** 记录用户反复强调的要求、缺失或含糊的规则、样式表能否表达修正、问题能否由代码检查，以及修正能否覆盖更多场景。更新指导文件，再通过下一次对照观察首轮输出是否改善。

手工循环开始产生价值后，可以逐步加入适用与排除场景、隐藏保留集、模型和规则版本记录、自动检查与多位盲测评审。最终修改始终由人确认，并持续观察同类投诉是否真的减少。

Vercel 每天都会把公开的 [`design.md`](https://vercel.com/design.md) 加载进 [v0](https://v0.app/)、Codex 和 Claude。团队还公开了 [eve design agent template](https://github.com/vercel-labs/eve-design-template)，用于搭建类似的 Slack 设计 Agent。文章由 Vercel Design Engineer John Phamous 撰写，Kevin Corbett 参与贡献。
