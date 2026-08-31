---
title: "大家都在说的「知识库」到底是什么"
description: "不讲架构图，从「让 AI 开卷考试」这件事出发，看明白企业知识库是怎么回答问题的、为什么也会答错，以及怎么判断一个知识库靠不靠谱。"
date: 2026-08-30
lastmod: 2026-08-30
draft: false
weight: 2
slug: "what-is-a-knowledge-base"
tags: ["新手村", "知识库", "RAG", "新手教程"]
---

新同事在群里问：「出差住宿能报多少？」老同事回一句：「飞书文档里有，自己搜一下。」老板在另一个会上说：「我们要做一个 AI 知识库。」

「知识库」这个词现在有两层意思。第一层很朴素：公司那一堆制度、文档、会议纪要，放在飞书、Notion 或网盘里，这就是知识库。第二层是最近一年大家真正在说的：**给这堆资料接上一个大模型，让它能直接回答问题**。这篇讲的是第二层。

如果你读过上一篇[《为什么大模型会有幻觉》](/newbie-tutorials/why-llms-hallucinate/)，还记得结尾说的「给它资料，让它翻书而不是背书」——企业知识库，就是把这件事做到公司规模。

## 先说清楚：知识库不是把资料「教」给模型

最常见的误解是：做知识库，就是把公司文档「训练」进模型，让模型「学会」公司的事。

实际上几乎没有人这么做。模型本身一个字都不改。上一篇里那个读遍图书馆、但被关进没有书的考场的考生，现在的变化只有一个：**允许开卷了**。

但开卷有个新问题：公司的资料摞起来几万页，模型一次能看的只有几十页。所以还得有一个人，先根据问题把对的那几页翻出来，放到它面前。这个「翻页的人」，才是知识库真正新增的东西。

于是一个 AI 知识库其实是三个角色的合作：

| 角色 | 它是什么 | 类比 |
| --- | --- | --- |
| 资料 | 公司文档、制度、纪要，切成一段一段 | 图书馆里的书 |
| 检索 | 根据问题找出最相关的几段 | 帮你翻到对的那一页的管理员 |
| 模型 | 只读这几段，据此写出回答 | 开卷考试的考生 |

这三样合起来，术语叫 **RAG**（Retrieval-Augmented Generation，检索增强生成）。名字很唬人，拆开看每个词都对得上：先检索（翻页），拿检索结果增强模型的输入（把那几页放到它面前），再生成回答（答题）。

## 一个问题在知识库里走一遍

把「出差住宿能报多少」这个问题丢进去，它会经过五步：

![一个问题在知识库里走一遍：提问、检索出最相关的几段、把问题和段落拼成输入、模型只读这几段作答、回答附上出处。右侧演示模型实际看到的内容依次出现](/media/newbie-tutorials/kb-pipeline.svg)

注意右边那块「模型实际看到的」：它拿到的不是你的一句话，而是**你的问题 + 检索出来的两段原文**。模型读的是原文，答的也是原文里的数字，最后还能告诉你出自哪一条。

这就是知识库和裸模型最大的差别：上一篇里模型只能凭印象「接着说」，现在它面前摆着原文，可以照着念。回答的可靠程度，从「模型记得多准」变成了「翻出来的那几页对不对」。

而翻页这一步，是可以出错的。下面请你亲自当一次管理员。

<div class="nb-lab" data-nb-lab="retrieve">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 01</span>
    <strong>你来当一次图书管理员</strong>
    <p>新同事问：「出差住宿能报多少？」知识库里有下面 6 段资料。你最多挑 2 段交给模型，看看它会怎么答。</p>
  </div>
  <div class="nb-lab-stage">
    <p class="nb-lab-hint" data-nb-hint aria-live="polite">最多选 2 段</p>
    <div class="nb-chunks">
      <label class="nb-chunk"><input type="checkbox" data-nb-chunk="a"><span class="nb-chunk-body"><span class="nb-chunk-src">差旅管理制度（2025 版）· 第 3 条</span><span>住宿标准：一线城市 500 元/晚，其他城市 350 元/晚，超标部分自理。</span></span></label>
      <label class="nb-chunk"><input type="checkbox" data-nb-chunk="b"><span class="nb-chunk-body"><span class="nb-chunk-src">差旅管理制度（2023 版）· 第 3 条</span><span>住宿标准：一线城市 400 元/晚，其他城市 300 元/晚，超标部分自理。</span></span></label>
      <label class="nb-chunk"><input type="checkbox" data-nb-chunk="c"><span class="nb-chunk-body"><span class="nb-chunk-src">差旅管理制度（2025 版）· 第 5 条</span><span>报销需在出差结束后 10 个工作日内提交发票与行程单。</span></span></label>
      <label class="nb-chunk"><input type="checkbox" data-nb-chunk="d"><span class="nb-chunk-body"><span class="nb-chunk-src">差旅管理制度（2025 版）· 第 1 条</span><span>出差需提前 3 个工作日在 OA 提交审批，由直属上级审批。</span></span></label>
      <label class="nb-chunk"><input type="checkbox" data-nb-chunk="e"><span class="nb-chunk-body"><span class="nb-chunk-src">员工手册 · 第 8 章</span><span>年假按工龄计算：满一年 5 天，满三年 10 天，满十年 15 天。</span></span></label>
      <label class="nb-chunk"><input type="checkbox" data-nb-chunk="f"><span class="nb-chunk-body"><span class="nb-chunk-src">差旅管理制度（2025 版）· 第 4 条</span><span>本制度所称一线城市，指北京、上海、广州、深圳。</span></span></label>
    </div>
    <div class="nb-lab-actions"><button type="button" class="nb-btn" data-nb-submit disabled>交给模型</button> <button type="button" class="nb-btn nb-btn-ghost" data-nb-reset hidden>重新选</button></div>
    <div class="nb-lab-result" data-nb-result hidden></div>
    <p class="nb-lab-nojs">这个小实验需要开启 JavaScript 才能操作。</p>
  </div>
</div>

试几种选法你会发现：选对了，模型答得又准又有出处；选到 2023 年那段，它会同样自信地告诉你一个**已经作废的数字**，出处也写得清清楚楚；什么相关的都没选到，好的模型会老实说「资料里没有」。

模型自始至终都在认真读你给它的东西。**它答得对不对，几乎完全取决于你翻给它的是哪几页**。

## 资料是怎么被「找到」的

那真实的知识库里，「翻页」是怎么做的？总不能真的有个人坐在后面。

第一反应是关键词搜索，像 Ctrl+F 一样。但这里有个坑：新同事问的是「住酒店能报多少」，制度里写的是「住宿标准」。没有一个字相同，Ctrl+F 什么都搜不到。

所以现在的知识库用的是另一种办法，分三步：

![资料是怎么被找到的：先把文档切成小段；每一段变成语义地图上的一个点，意思相近的点挨得近；问题也变成一个点，离它最近的几个点就是检索结果](/media/newbie-tutorials/kb-chunks-and-embeddings.svg)

1. **切块**：一份几十页的制度太长，先切成一条一条的小段，每段几句话。
2. **变成点**：每一小段都被换算成一张「语义地图」上的一个坐标。这一步叫向量化，你只需要记住它的效果：**意思相近的段落，在地图上挨得近**。「住宿标准」和「一线城市定义」是邻居，「年假天数」离它们很远。
3. **找最近的**：问题本身也被换算成同一张地图上的一个点。离它最近的几个点，就是检索结果。「住酒店能报多少」和「住宿标准」一个字不重合，但意思接近，在地图上就是邻居。

这张地图存在哪儿？存在一个叫[向量数据库](/vibe-coding/terms/vector-database/)的东西里。名字先不用管，它就是那张地图的仓库。

<div class="nb-lab" data-nb-lab="search">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 02</span>
    <strong>关键词搜索 vs 语义检索</strong>
    <p>同一个问题换三种问法，分别用两种方式去知识库里找。看看哪些段落会被找到。</p>
  </div>
  <div class="nb-lab-stage">
    <p class="nb-lab-hint">先选一种问法</p>
    <div class="nb-choices nb-choices-inline" data-nb-queries role="group" aria-label="问法"></div>
    <fieldset class="nb-rules nb-rules-inline">
      <legend>再选一种找法</legend>
      <label class="nb-rule"><input type="radio" name="nb-search-mode" value="keyword" checked><span>关键词搜索</span><small>文档里必须出现问题里的词</small></label>
      <label class="nb-rule"><input type="radio" name="nb-search-mode" value="semantic"><span>语义检索</span><small>比的是意思，不是字面</small></label>
    </fieldset>
    <ol class="nb-hits" data-nb-hits aria-live="polite"></ol>
    <p class="nb-verdict" data-nb-verdict></p>
    <p class="nb-lab-nojs">这个小实验需要开启 JavaScript 才能操作。</p>
  </div>
</div>

语义检索不是万能的。它找的是「意思最接近的几段」，不是「正确答案」——所以 2023 年的旧版和 2025 年的新版，在它眼里几乎是同一个位置。这就引出了下一个问题。

## 知识库为什么也会答错

接了知识库，幻觉会大幅减少，但「答错」并没有消失，只是换了原因。顺着那条流水线，故障通常出在四个地方：

![知识库答错时多半坏在哪一步：资料本身过期、冲突或缺失；检索没找到；找到的段落太多太杂；资料里没有但模型还是编了](/media/newbie-tutorials/kb-failure-points.svg)

用户看到的症状，和背后坏掉的那一步，往往对不上号。可以照这张表反查：

| 你看到的症状 | 多半坏在 | 该做什么 |
| --- | --- | --- |
| 答案自信、有出处，但数字是旧的 | 资料：旧版没下线 | 清理资料，废止的文档要真的移除 |
| 同一个问题，换个说法就答不出来 | 检索：问法和文档用词差太远 | 检查是不是还在用关键词搜索；给文档补一段「常见问法」 |
| 答案把两份制度的内容混在一起 | 拼装：塞进去的段落太多太杂 | 只给最相关的几段；冲突的文档二选一 |
| 资料里明明没有，它还是给了个答案 | 模型：又回到幻觉 | 在提示词里写死「资料里没有就回答没找到」 |

第一行值得特别记住。它是 LAB 01 里你选到 2023 版时看到的那种错：**回答形式完美，出处真实，内容作废**。这种错比幻觉更难发现，因为所有「可疑信号」都不在——它甚至能点开原文。所以一个知识库最不起眼、也最重要的工作，是有人持续维护资料本身。

## 你该怎么看一个「AI 知识库」

不管是公司内部要上，还是供应商来演示，你不需要懂技术，问五个问题就能看出成色：

1. **资料从哪来，多久更新一次？** 没有人负责更新的知识库，上线那天就开始过期。
2. **回答带不带出处，点开是不是原文？** 没有出处的回答，和裸模型没有区别。
3. **资料里没有的问题，它会不会说「没找到」？** 当场问一个明显不在资料里的问题试试。
4. **换个说法再问，答案一样吗？** 不一样，说明检索不稳。
5. **不同的人能看到的资料一样吗？** 薪酬制度不该被实习生问出来，权限是知识库的一部分。

<div class="nb-lab" data-nb-lab="risk">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 03</span>
    <strong>这个知识库靠谱吗？</strong>
    <p>下次有人给你演示 AI 知识库，对照勾选它做到了哪几条。</p>
  </div>
  <div class="nb-lab-stage">
    <div class="nb-checks">
      <label class="nb-check"><input type="checkbox" data-nb-risk="2"><span>回答附出处，而且点开就是原文</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="2"><span>问一个资料里没有的问题，它说「没找到」而不是硬答</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="2"><span>有人负责更新资料，废止的旧版会被移除</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="1"><span>换个说法再问，答案一致</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="1"><span>不同权限的人看到的资料不一样</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="-3"><span>演示时只让你问他们准备好的几个问题</span></label>
    </div>
    <div class="nb-risk-meter" data-nb-risk-meter data-level="low" data-nb-good data-nb-medium="2" data-nb-high="5" data-nb-label-low="不靠谱" data-nb-label-medium="再看看" data-nb-label-high="靠谱" data-nb-empty="勾选它做到的项。什么都没做到，就是一个裸模型加了个搜索框。" data-nb-tip-low="离能用还差得远。至少先把出处和「没找到」这两条做出来，否则它给出的每个数字都得人工复核。" data-nb-tip-medium="骨架有了，但缺的那几条正是日常会出问题的地方。重点追问：资料谁维护、多久更新。" data-nb-tip-high="五个问题都能过，说明资料、检索、模型三个角色各司其职。剩下的事是持续维护资料。">
      <span class="nb-risk-label">评价</span>
      <strong class="nb-risk-level" data-nb-risk-level>不靠谱</strong>
      <span class="nb-risk-tip" data-nb-risk-tip aria-live="polite">勾选它做到的项。什么都没做到，就是一个裸模型加了个搜索框。</span>
    </div>
  </div>
</div>

## 小结

回到开头那句「我们要做一个 AI 知识库」。现在你知道它在说什么了：

- 模型**不变**，变的是作答前有人先把对的那几页翻给它看。资料、检索、模型三个角色合作，术语叫 RAG。
- 翻页靠的是**语义地图**：资料切成小段变成点，问题也变成点，找最近的几个。所以一个字不重合也找得到。
- 知识库答错，多半**不是模型的错**：旧资料没下线、没检索到、塞得太杂，前三步就能解释大部分问题。
- 判断一个知识库靠不靠谱，看**出处、「没找到」、更新、稳定、权限**五件事，不用懂技术。

上一篇讲的是模型为什么会编，这一篇讲的是怎么让它照着念。下一次再听到「知识库」「RAG」「向量」这些词，你可以在脑子里把它们翻译回去：书、翻页的管理员、开卷考试的考生。

> 想再往下走一步？术语图解里的 [RAG](/vibe-coding/terms/rag/) 和[上下文窗口](/vibe-coding/terms/context-window/)两页，分别解释了「检索增强生成」的每个字，以及模型一次到底能看多少页。
