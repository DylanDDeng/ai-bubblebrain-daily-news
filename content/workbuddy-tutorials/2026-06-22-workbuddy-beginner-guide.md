---
title: "WorkBuddy 入门指南"
slug: "workbuddy-beginner-guide"
description: "从安装登录、工作模式和模型配置，到专家、Skills、自动化、连接器与远程设置，系统了解 WorkBuddy 的核心用法。"
date: 2026-06-22
tags: ["WorkBuddy", "入门教程", "Skills", "自动化", "MCP", "AI 办公"]
author: "BubbleBrain"
sourceUrl: "https://mp.weixin.qq.com/s/n2MY3-H1k3tSLs27Pm75vw"
---

> 本文由 BubbleBrain 发布于微信公众号，原题为《腾讯超级应用 WorkBuddy 入门指南，我老板看完了让我赶紧删。》。[查看原文](https://mp.weixin.qq.com/s/n2MY3-H1k3tSLs27Pm75vw)

Hello，大家好！

假期归来第一天，坐在工位前，不禁思考：“人为什么要这么痛苦地上班？”

后来我发现，原来是我没用到 WorkBuddy 这个打工人必备的利器。

这款产品最近很火，火到我平时不怎么关注 AI 的家属都来问我了。

![WorkBuddy 产品介绍](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_001.png)

既然如此，这篇从 0 到 1 的教程就带大家快速了解 WorkBuddy，让大家工作的时候可以一边吹水，一边交差。

## 安装与登录

安装登录没有什么特别的，直接到官网下载即可。

![WorkBuddy 官网下载页面](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_002.png)

记得选择与自己设备对应的版本。比如我使用 Mac，就要下载对应的 Mac 版本。

下载完成后，打开应用准备登录。

![WorkBuddy 客户端登录入口](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_003.png)

WorkBuddy 的登录过程很顺畅，它绑定了微信，可以直接扫码登录。

![使用微信扫码登录 WorkBuddy](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_004.png)

扫码登录后，就可以直接打开应用了。

![WorkBuddy 登录后的主界面](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_005.png)

## 界面一览

我之前认为 Codex App 已经是一款非常 All-in-One 的产品，可以用来做几乎任何事。直到我打开 WorkBuddy，才发现自己还是狭隘了，感觉像找到了哆啦 A 梦。

### 三类任务入口

整个主对话界面分为三个模块：日常办公、代码开发和设计创意。

![WorkBuddy 主界面的三类任务入口](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_006.png)

点击“日常办公”，会看到对应的日常工作。例如选择文档处理：

![日常办公中的文档处理模板](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_007.png)

点击后会出现一批处理文档的模板。如果你还不知道如何更好地指挥 Agent，这其实就是一个很好的开始方式：先使用模板，再根据自己的需求慢慢修改，就会逐渐找到感觉。

如果你是开发人员，点击“代码开发”选项，同样会出现一批内置的常用开发模板。

![代码开发模板](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_008.png)

其中包括日常开发、网站开发等场景。

还有“设计创意”。

![设计创意模板](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_009.png)

如果你的工作与创意相关，可以直接点击“设计创意”选项，这里同样准备了很多模板。

### Craft、Ask 与 Plan

WorkBuddy 工作时有三种模式：Craft、Ask 和 Plan。

![Craft、Ask 与 Plan 三种工作模式](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_010.png)

Craft 就是大家日常理解的 Agent 模式。它可以自行读取、写入和搜索文件或内容。你可以把它理解为超级助手模式，大部分时候默认使用这个模式。

Ask 是纯问答和聊天，使用方式与平时使用豆包、ChatGPT 类似。

Plan 是先计划再动手。如果你对某个需求还没有想清楚，可以先用这个模式与 AI 充分讨论，把需求和计划制定清楚后再开始执行。

### 模型与自定义配置

模型方面，WorkBuddy 支持几乎所有国内主流模型。

![WorkBuddy 支持的模型列表](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_011.png)

不同模型的侧重点和积分消耗各不相同。有的模型编程能力强，有的模型知识丰富、擅长写作，按照自己的需求合理选择即可。

如果你目前对这些模型还不熟悉，我建议使用 DeepSeek：一是便宜，消耗起来不心疼；二是在便宜的同时表现也不错，只是缺少理解图片的能力。

如果你有自己偏好的模型，也完全可以配置。点击“配置自定义模型”。

![配置自定义模型入口](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_012.png)

你可以选择第三方 Coding Plan 服务，比如智谱或 Kimi，也可以直接接入第三方模型 API。

![添加自定义模型供应商](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_013.png)

供应商选择“自定义”，然后依次填入接口地址、API Key 和模型名称。通常可以在对应模型供应商的开发者平台找到这些信息。

技能和连接器也在这个区域。

![技能与连接器入口](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_014.png)

这一部分是 WorkBuddy 如此全能的重要原因，后文会专门介绍。

### 权限与工作空间

WorkBuddy 的权限配置比较简单。

![WorkBuddy 权限设置](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_015.png)

它分为默认权限和完全访问权限。简单理解，完全访问权限就是油门踩到底、不带刹车，完全信赖 Agent 的操作；默认权限则带着刹车，每做一步都更谨慎，需要你确认。

完全访问权限的好处是，Agent 执行步骤很多的任务时，不会每一步都让你点击确认。风险则是你需要完全信任 Agent 的表现；如果稍有不慎，它可能执行一些你无法控制的操作，例如删除某个文件。

输入框下方还有一个工作空间选择器。

![选择工作空间](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_016.png)

简单来说，它决定 Agent 要在哪个文件夹中完成工作。你也可以暂时不选，WorkBuddy 仍然会在默认文件夹中启动任务。

![左侧边栏中的任务](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_017.png)

你可以在左侧边栏看到刚刚启动的任务，右键点击任务并打开文件夹，就能看到 Agent 产出的结果，不用担心找不到内容。

也可以选择把任务保存到工作空间。

![将任务保存到工作空间](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_018.png)

这样可以开启多个 Agent 进行协作。任务的工作空间本质上就是电脑上的一个文件夹。

![以日期和时间命名的工作空间文件夹](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_019.png)

WorkBuddy 会自动用日期和时间为任务命名。到这里，主要操作界面就介绍得差不多了，下面进入我认为最精华的部分。

## 专家、Skills 与连接器

### 专家与专家团

你可以把“专家”理解为一种更专业、更垂直，也更符合具体业务需求的 Agent。

![WorkBuddy 专家列表](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_020.png)

我用过很多 Agent 产品，但像 WorkBuddy 这样恨不得把一整家公司的人都塞进 Agent 里的，还是头一次见。光是专家列表，我滚动三次都没有到底。

除了专家之外，还有“专家团”。专家团可以简单理解为一个 Agent 团队。三个臭皮匠顶个诸葛亮，如果团队里三个都是诸葛亮，那岂不是天下无敌。

当然，专家团消耗的积分也比普通专家高很多，大约是 3 到 5 倍。

![WorkBuddy 专家团](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_021.png)

无论是内容创作、投资分析还是法律咨询等场景，基本都能找到符合需求的专家。

### Skills 与 SkillHub

接下来是技能。

![WorkBuddy 技能列表](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_022.png)

这里很能体现腾讯生态的规模。一眼望去，不少都是腾讯自家的产品，互相打通之后方便了很多。

举个例子：平时看新闻总是东看一点、西看一点，新闻应用中的内容也经常太杂，很难快速找到真正想看的部分。但在 WorkBuddy 中，可以直接用“腾讯新闻”这个 Skill 定制自己的新闻需求。

![使用腾讯新闻 Skill](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_023.png)

比如直接让它帮我找出 AI 领域的新闻。

![Skill 返回的 AI 新闻结果](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_024.png)

为了避免内容失真，结果中还会附上对应的原文链接。

除了推荐技能，腾讯还专门做了一个 SkillHub。

![WorkBuddy SkillHub](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_025.png)

这里收录了市面上优秀创作者开源的各种 Skills，内容非常丰富。使用方法也很简单：找到需要的 Skill，点击加号即可安装。

![在 SkillHub 安装 Skill](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_026.png)

安装后，就可以在主聊天界面选择刚刚安装的技能。

![在主界面选择已安装的 Skill](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_027.png)

接下来直接提问即可。例如智谱最近的股票涨了很多，我就问它智谱的股票是否还值得投入。

![使用投资分析 Skill](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_028.png)

WorkBuddy 加载技能后开始分析，最后有理有据地得出不要追高的结论。

### 创建自己的 Skill

如果你想创建属于自己的技能，也是可以的。点击右上角的“添加技能”。

![添加自定义技能](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_029.png)

WorkBuddy 内置了一个 `skill-creator` Skill 来帮助你创建自己的技能，甚至连模板都已经准备好了。

![使用 skill-creator 创建技能](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_030.png)

直接用自然语言描述需求即可。

### 连接器与 MCP

专家区域中还有连接器，也就是大家熟悉的 MCP。它能帮助 Agent 与其他应用打通。

![WorkBuddy 连接器与 MCP 列表](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_031.png)

腾讯在这里准备了很多应用 MCP，包括自家的 IMA 知识库、QQ 邮箱、腾讯文档和企业微信，也有钉钉、携程、天眼查、企查查等外部服务。

这就是生态的力量，几乎什么都能做。

## 自动化

介绍完专家之后，还有一个很关键的功能：自动化。

![WorkBuddy 自动化功能](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_032.png)

这个功能本身并不难。如果你用过 OpenClaw 或 Codex，应该很容易理解，但它确实能够提高效率。

如果每天的任务中存在一些重复动作，例如每周五写周报、每天查看 AI 新闻，就可以把它们做成自动化。

WorkBuddy 准备了一些内置自动化模板，但我仍然推荐点击右上角的“添加”按钮，按照自己的需求创建。

![创建 WorkBuddy 自动化任务](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_033.png)

WorkBuddy 已经把自动化任务设计得很简单：按照需求编写提示词，然后选择执行频率和生效日期即可。

## 设置

### 即时通讯集成

WorkBuddy 设置中一个很强大的功能，是对多种即时通讯工具的集成。

![WorkBuddy 即时通讯集成设置](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_034.png)

其中包括微信小程序、元宝、微信客服号和微信助理。

![微信相关的集成选项](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_035.png)

也包括 QQ、飞书和钉钉。无论是腾讯自家的服务还是外部服务，基本都进行了集成。

配置过程也很简单。例如要绑定微信，点击“配置”，直接用微信扫码即可。

![扫码配置微信集成](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_036.png)

手机上会弹出一个 OpenClaw Bot 插件，直接点击配对即可。

![在手机上配对 OpenClaw Bot](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_037.png)

### 记忆

设置中另一个值得关注的选项是“记忆”。WorkBuddy 支持从其他 AI 导入记忆，也支持根据你与它的聊天自动提炼记忆。

![WorkBuddy 记忆设置](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_038.png)

当然，你也可以直接手动输入想让它记住的内容。

### 锁屏远程与存储路径

系统设置中还有两个我认为比较关键的选项。

第一个是“锁屏远程”。

![WorkBuddy 锁屏远程设置](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_039.png)

开启后，即使电脑处于锁屏状态，也不会进入休眠，方便你出门在外时通过手机远程操控。

另一个选项是默认工作存储路径。

![WorkBuddy 默认工作存储路径](/media/workbuddy-tutorials/workbuddy-beginner-guide/img_040.png)

WorkBuddy 默认的存储路径对非技术背景的用户来说可能不够熟悉，但可以在设置中修改成自己熟悉的路径。

## 总结

到这里，WorkBuddy 的主要功能基本介绍完了。虽然还不算全面，但已经足够开始上手使用。

Codex 很强，Claude Code 也很棒，但 WorkBuddy 给我的感觉更像是一个真正面向普通职场人的 AI 工作台。

不是所有人都需要写代码，但每个职场人都会经历写文档、邮件、制作 PPT 等琐碎又繁杂的任务。这些事情单独看都不稀奇，但放在一起，就很像电脑里多了一个随叫随到的同事。

所以，如果大家和我一样都是苦命打工人，不如把 WorkBuddy 用起来，让自己可以一边吹水，一边把工作简单漂亮地完成。

以上。
