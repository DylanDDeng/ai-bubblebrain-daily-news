---
externalId: "what-is-reasoning"
kind: "article"
title: "什么是推理？"
description: "解释推理轨迹为何本质上是被路由到独立通道的文本、推理强度怎样写入系统提示词，以及模型如何在关闭原生推理时泄漏思考。"
date: 2026-08-21
sourceUrl: "https://lucumr.pocoo.org/2026/8/19/what-is-reasoning/"
tags: ["LLM", "推理模型", "思维链", "系统提示词", "推理强度"]
featured: true
draft: false
---

[原文：What Is Reasoning](https://lucumr.pocoo.org/2026/8/19/what-is-reasoning/)

*作者：Armin Ronacher｜原文发布于 2026 年 8 月 19 日*

几周前，有人分享了一篇[关于如何从闭源权重模型中提取推理轨迹的论文](https://arxiv.org/html/2608.09867v1)。再加上网上关于如何诱使模型泄露推理轨迹的讨论，我出于好奇做了更多研究。Twitter 上似乎充斥着对其工作原理的一知半解和混乱说法，希望这篇文章能帮助一些人理解究竟发生了什么。

## 隐藏推理轨迹

推理轨迹通常不会展示给我们。我们曾经[为此感到遗憾](https://earendil.com/posts/session-portability/)，但多数时候只能接受。值得庆幸的是，开放权重模型会暴露这些轨迹；从它们的表现可以看到，推理轨迹可能既冗长又混乱。这大概也是把它们与通常展示给用户的内容分开的好理由。

至少，用户界面需要能够识别它们。整个行业很擅长把推理轨迹描述得特殊而神秘，但它们其实只是文本：模型被训练成先在响应中的草稿区写下思考，再输出最终答案。

GPT-OSS 的 Harmony 响应格式很直观地展示了这一点：

```
<|channel|>analysis<|message|>
I need to work this out ...
<|end|><|start|>assistant<|channel|>final<|message|>
The answer is ...
<|return|>
```

这些标记是特殊 Token，但它们之间的推理与最终答案使用的是“同一种文本”（只是 GPT 的思维链文本听起来相当有趣）。当模型采样到 `analysis` 通道 Token 时，解析器会把随后的文本路由到一个独立的数据流，并通过 Responses API 暴露出来。对于闭源模型，推测会有一个简单模型对这些内容进行删减和总结。

## 推理强度

应该为推理分配多少预算？较早的 API 会直接暴露推理 Token 预算，让人感觉它是采样过程的一项属性。实际上，推理强度被写进了系统提示词。GPT-OSS 会在系统提示词中加入：

```
Reasoning: low
```

就这么简单。训练会塑造相应的行为，例如让模型输出切换到 `analysis` 通道的 Token 序列。这也解释了为什么改变推理强度会使 KV 缓存失效。我猜闭源 GPT 模型把推理强度叫作“juice”，因为你可以询问大多数模型还剩多少 juice。

在面向 DeepSeek 的 [DwarfStar](https://github.com/antirez/ds4) 中，使用最高推理强度时，系统提示词会加入：

```
Reasoning Effort: Absolute maximum with no shortcuts permitted.
You MUST be very thorough in your thinking and comprehensively decompose the
problem to resolve the root cause, rigorously stress-testing your logic against
all potential paths, edge cases, and adversarial scenarios.
```

## “不要思考”

因此，推理 Token 最终被送往哪里，其实是一种习得的约定：模型被训练成不把草稿内容放进 `final` 通道。如果诱使模型误以为自己正处于这个通道，它就可能泄露 Token。我们甚至见过较早的模型在思考被关闭时，改在 bash 工具里推理，并把自己的想法 `echo` 到 `/dev/null`。

所以从某种意义上说，对某些模型而言，唯一“特殊”的行为反而是不思考。有时，这是通过“机械地”移除模型通常使用的思考方式来实现的。在 [DwarfStar](https://github.com/antirez/ds4) 中，关闭思考会预填充 `</think>`，而开启思考会预填充 `<think>`；它们分别是结束和开始思考的 Token。GPT-OSS 不做预填充，而是让模型自行决定采用哪一种方式。

不过，一些推理 API 很可能会在启用推理时预填充起始 Token，让模型不必自行采样；而在关闭推理时，则可能阻止模型采样推理 Token，因为这种 Token 很容易被检测出来。这或许可以解释，为什么一个[自定义 `think` 工具](https://gist.github.com/mitsuhiko/0904a3d89741e8e3bcca1ca93ea076de)能够诱使模型把一部分推理放到不该出现的位置——但只会发生在原生推理被关闭时。

有件有趣的事：这篇博客触发了安全检查。

颇为好笑的是，我原本想用 GPT-5.6 terra 给这篇博客检查拼写和语法，却因为安全过滤器无法完成，只好换成 Kimi。

![GPT-5.6 terra 拒绝为这篇博客检查拼写](/media/highlights/what-is-reasoning/gpt-5.6-terra-spell-check.png)

[复制为 Markdown](https://lucumr.pocoo.org/2026/8/19/what-is-reasoning.md) / [查看 Markdown](https://lucumr.pocoo.org/2026/8/19/what-is-reasoning.md)
