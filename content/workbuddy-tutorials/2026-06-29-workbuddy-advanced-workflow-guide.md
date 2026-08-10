---
title: "WorkBuddy 进阶指南：模型、知识库、会议、设计与自动化"
slug: "workbuddy-advanced-workflow-guide"
description: "介绍如何为 WorkBuddy 配置第三方模型、连接知识库与腾讯会议，并使用设计工具和自动化工作流提升日常办公效率。"
date: 2026-06-29
tags: ["WorkBuddy", "进阶教程", "知识库", "腾讯会议", "自动化", "AI 办公"]
author: "BubbleBrain"
sourceUrl: "https://mp.weixin.qq.com/s/yiFijIq-Oft4Bv48t8rmlA"
---

> 本文由 BubbleBrain 发布于微信公众号，原题为《WorkBuddy入门第二弹，我老板问我这玩意儿怎么啥都能干？！》。[查看原文](https://mp.weixin.qq.com/s/yiFijIq-Oft4Bv48t8rmlA)

![WorkBuddy 进阶教程题图](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_001.png)

Hello，大家好！

上次写了一篇 WorkBuddy 从 0 到 1 的速通教程，但是因为篇幅限制，加上 WorkBuddy 实在包罗万象，不少细节没能在上一篇文章里讲清楚。

没关系，我又挖掘了一下 WorkBuddy 里几个我认为有意思的点，分享给大家。

OK，废话少说，现在开始。

## 配置第三方模型 API

WorkBuddy 支持使用第三方 API 来配置驱动模型。如果你不想使用官方自带的模型，可以配置第三方 Coding Plan，或者直接接入 API。

这里以便宜、量大、稳定的 DeepSeek 为例。

![WorkBuddy 添加模型设置](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_002.png)

打开 WorkBuddy 的设置页面，选择“模型”，再点击“添加模型”，就会看到配置窗口。

![模型供应商选择列表](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_003.png)

向下滚动，找到 DeepSeek 供应商。

![DeepSeek 模型配置项](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_004.png)

这里需要填写 API Key，模型名称默认已经是 DeepSeek-V4 Pro，不需要修改。API Key 则需要前往 DeepSeek 开发者平台创建。

![在 DeepSeek 开发者平台创建 API Key](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_005.png)

创建流程很简单：点击“创建 API Key”，输入名称后，平台就会自动生成 Key。

![DeepSeek 生成的 API Key](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_006.png)

友情提示：对于刚接触 Coding 不久的同学，API Key 一定不要随便外泄，要妥善保存。

把这个 Key 填回 WorkBuddy 的设置中。

![将 API Key 填入 WorkBuddy](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_007.png)

点击保存，然后就可以测试了。

![在 WorkBuddy 首页选择新配置的模型](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_008.png)

回到首页的消息输入框，选择模型时可以看到刚刚配置好的模型。接着发送一条消息测试。

![使用 DeepSeek 模型测试对话](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_009.png)

能够正常回复，就说明配置已经成功。

如果一定要配置第三方 API 或 Coding Plan，按照我自己的使用体验，我最推荐 DeepSeek。国内很多 Coding Plan 会因为算力紧张而影响体验，综合来看，DeepSeek 的速度、价格和稳定性都比较优秀。

如果要使用 GPT 或 Claude 这些海外模型，我更推荐直接使用它们自己的 Codex 或 Claude Code。

## 打通知识库

不得不感慨腾讯生态之庞大。WorkBuddy 已经打通了大家常用的 IMA 和乐享知识库。

![WorkBuddy 中的知识库入口](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_010.png)

在首页左侧栏上方选择“更多”，找到“知识库”。这里以 IMA 知识库为例。

![IMA 知识库授权页面](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_011.png)

点击 IMA 知识库后，会看到授权页面。按照流程点击授权并登录即可，配置非常简单。

![在 WorkBuddy 中打开 IMA 知识库](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_012.png)

授权成功后，自己的知识库页面就会出现在这里。有了知识库作为 WorkBuddy 的“大脑外挂”，能做的事情会多很多。

我自己经常会把网上看到的优质文章直接放进知识库，但通常不会马上细看，而是等真正用到相关主题时再回头阅读。说白了，知识库的一部分作用就是我的素材库。

![让 WorkBuddy 查找知识库中的相关文章](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_013.png)

所以，我可以直接让 WorkBuddy 列出知识库里与某个主题相关的文章，再对这些文章进行深入阅读、整理，或者提炼最有用的内容。

比如继续问它：“从 Claude Code 相关的文章里，提炼出你觉得最有用的内容。”

![WorkBuddy 提炼知识库文章内容](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_014.png)

它会直接读取知识库内容，找出最有价值的部分。

可能有小伙伴会问：让 Agent 直接从网上抓取，效果是不是也一样？答案是可能一样，但更大的可能是不一样。

网络搜索得到的答案往往比较泛，Agent 再聪明，也不知道你具体想要什么。知识库则不同：里面的文章都是你挑选过的，至少对你有用，范围从一开始就已经限定清楚了。Agent 工作起来会更有针对性，也更加懂你。

还能继续向更深处拓展。很多工作场景都需要阅读大量又长又复杂的报告，然后基于这些报告写一份新的内容。这时可以把报告放进知识库，再让 WorkBuddy 基于它们撰写新内容。

![让 WorkBuddy 根据知识库撰写新内容](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_015.png)

WorkBuddy 会根据知识库里的内容，整理出一份新的成果。整个过程非常丝滑，你很难感觉到这其实是两个应用在协作。

## 使用腾讯会议连接器

安排会议这件事本身不稀奇，但我确实没想到 WorkBuddy 连拉会、排会这样的工作都接进来了，打工人的需求算是被考虑得很全面。

![在 WorkBuddy 中连接腾讯会议](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_016.png)

绑定过程并不复杂，点击连接后，按照页面流程完成授权即可。

为了看看腾讯会议连接器究竟能做什么，可以直接问它。

![在输入框选择腾讯会议 Skill](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_017.png)

在输入框内输入 `/`，找到并选择 `tmeet-skill`，然后直接问它能做什么。

![腾讯会议 Skill 支持的能力](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_018.png)

能做的事情还真不少。除了最基本的拉会，还支持获取 AI 会议纪要、下载会议录制文件等操作。

我比较常用的场景是查看当天会议。很多会议会提前好几天安排，真到那一天，我可能已经忘了。

![让 WorkBuddy 查询当天的会议安排](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_019.png)

现在可以直接把 WorkBuddy 当作工作台，询问今天的会议安排。它会自行调用腾讯会议相关 Skills 来查询，确实有一种“我是老板，它是秘书”的感觉。

## 设计师工作流

我觉得 WorkBuddy 很厉害的一点是，它把各种职业都考虑进来了，比如设计师。

我告诉它，我要做一个介绍球鞋文化的网站。

![让 WorkBuddy 设计球鞋文化网站](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_020.png)

WorkBuddy 会找到内置的 Ardot Design Skills，打开 Ardot Design 的画布并开始设计。后来我才反应过来，Ardot Design 也是腾讯自家的 AI 设计产品，类似 Figma。

设计出来的画布元素都可以编辑修改。比如页面里还缺少很多图片，目前只有占位符。不会用 WorkBuddy 时，设计师可能需要一张张寻找素材；会用 WorkBuddy 后，可以直接让它从网上寻找相关素材并填充到对应位置。

具体怎么做？

![将画布中的图片添加到聊天](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_021.png)

右键选中图片，选择“添加到聊天”，选中的图片就会出现在 WorkBuddy 的输入框中。接着提出对应需求即可。

![让 WorkBuddy 搜索并替换设计素材](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_022.png)

可以像我一样，比较随意地让它在网上寻找相关素材，再放到对应位置。WorkBuddy 会自动从 Pixabay 下载素材。当然，专业设计师也可以指定自己常用的素材网站。

## 创建自动化任务

自动化是一个非常好用的功能。无论你是老板、员工、OPC 还是自媒体工作者，都一定会遇到每天重复做的事情。

只要有重复工作，就需要自动化，因为它确实能够提升效率。

WorkBuddy 已经内置了不少自动化模板，可以直接从模板开始。比如很常见的需求：查看自己关心的资讯。

![WorkBuddy 自动化模板列表](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_023.png)

可以从“每日 AI 新闻推送”模板入手。

![每日 AI 新闻推送自动化模板](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_024.png)

模板中的标题、提示词、工作区间和技能都可以修改。

![配置自动化任务的技能与提示词](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_025.png)

最简单的方法是先安装 WorkBuddy 内置的腾讯新闻 Skill，然后在添加自动化任务时选中它，输入自己的提示词，再设置好推送周期。

还可以进一步做一个周报自动化。我自己每周都要写周报，但怎样把这件耗时耗力的事情自动完成？这里分享两种方法。

第一种适合写代码的工作。既然要写代码，就免不了提交 PR、Issue 和 Commit。

![使用代码记录生成周报的自动化模板](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_026.png)

WorkBuddy 已经准备好了对应模板，直接使用即可。

![WorkBuddy 内置的代码周报模板](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_027.png)

第二种适合纯文案工作，例如每天阅读报告、写报告和做 PPT。这种情况也很简单，只需要让 WorkBuddy 每周自动整理这一周与它讨论过的内容，生成周报即可。

![让 WorkBuddy 自动整理一周工作内容](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_028.png)

我比较推荐为工作周报选择一个这周一直在使用的工作目录，这样总结出来的内容会更准确。

我的总结结果是这样的：

![WorkBuddy 自动生成的工作周报](/media/workbuddy-tutorials/workbuddy-advanced-workflow-guide/img_029.png)

这份周报的水平肯定比我自己写的强。如果让我写这么长，得花上很久。

今天的分享就先到这里，算是补上了上一篇教程的一些细节。

WorkBuddy 的玩法和用法还有很多，关键还是要慢慢摸索，找到最适合自己的工作方式。

我对 WorkBuddy 的理解是：它更像一个能融合多种日常工作流的 AI 工作台。Claude Code 和 Codex 很强，但在很多企业场景中，特别是一些国企，它们并不能使用；还有很多工作根本不需要那么强的 Coding 能力。

在这些场景里，我觉得 WorkBuddy 就是最优的答案。

以上。
