---
title: "为什么大模型会有幻觉"
description: "不讲公式，从「猜下一个词」这件事出发，看明白大模型为什么会一本正经地编出不存在的书、人和数字，以及你怎么少踩坑。"
date: 2026-08-30
lastmod: 2026-08-30
draft: false
weight: 1
slug: "why-llms-hallucinate"
tags: ["新手村", "大模型", "幻觉", "新手教程"]
---

你问 AI：「推荐三本讲注意力机制的中文书。」它流畅地给了三本，书名、作者、出版社一应俱全。你兴冲冲去搜，发现其中两本根本不存在。

这种现象叫**幻觉**（hallucination）：模型说得非常流畅、非常自信，但内容不是真的。它不是偶尔抽风的 bug，而是这类模型工作方式里自带的东西。这篇文章只回答一个问题：它为什么会这样？

## 幻觉长什么样

先认清它的几副常见面孔，之后你会更容易一眼识别：

| 类型 | 例子 | 为什么容易出现 |
| --- | --- | --- |
| 编引用 | 一篇不存在的论文、一本不存在的书、一个打不开的链接 | 引用的「格式」它见过无数次，但具体哪篇存在，它记不牢 |
| 编细节 | 把 2019 年说成 2021 年，把作者张冠李戴，把营收数字说错一位 | 数字和日期都是「只见过几次」的低频信息 |
| 编接口 | 给你一个看起来很合理、但根本没有的函数或参数名 | 它会按照这个库的「风格」补全一个最像的名字 |
| 编理由 | 结论错了，还能给出一套逻辑自洽的解释 | 解释本身也是「接着说」出来的 |

这些幻觉有一个共同特点：**流畅、自信、格式正确**。这恰恰是它们容易让人上当的原因。要理解为什么会这样，得先看清模型在做的那一件事。

## 大模型只做一件事：猜下一个词

想想手机输入法的联想功能。你打出「今天天气真」，键盘上方就冒出「好」「不错」「热」几个候选。输入法并不知道今天天气怎么样，它只是知道：在无数人打过的句子里，「今天天气真」后面最常跟的是「好」。

大模型就是这件事的超级放大版。它读过的文字比任何人一辈子能读的都多，于是对「什么词后面跟什么词」有极其精细的把握。每生成一个词，它做的都是同一件事：算出所有候选词的概率，挑一个，接到句子后面，再算下一个。

![大模型每一步只做一件事：猜下一个词。句子「今天天气真」后面，模型算出「好」的概率最高，接上去，再算一次，依次接上「，」「适合」「出去」](/media/newbie-tutorials/hallucination-next-token.svg)

注意动图里从头到尾没有出现的一步：**检查这句话是不是真的**。模型每一步只问「哪个词接在后面最像话」，从不问「这句话对不对」。

大多数时候这两件事恰好重合。训练资料里真话占多数，「最像话」的续写往往就是真的：「法国的首都是」后面接「巴黎」，既像话又正确。麻烦出在两者分开的时候。下面这个小实验，请你亲自当一次模型。

<div class="nb-lab" data-nb-lab="next-token">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 01</span>
    <strong>你来当一次大模型</strong>
    <p>下面这句话还没写完。每一步给你三个候选词和它们的「概率」，你只需要像模型一样，挑一个接上去。</p>
  </div>
  <div class="nb-lab-stage">
    <p class="nb-sentence"><span class="nb-prompt">《深入理解注意力机制》这本书的作者是</span><span class="nb-generated" data-nb-generated></span><span class="nb-caret" aria-hidden="true"></span></p>
    <p class="nb-lab-hint" data-nb-hint aria-live="polite">第 1 步 · 选一个词接上去</p>
    <div class="nb-choices" data-nb-choices role="group" aria-label="候选词"></div>
    <div class="nb-lab-result" data-nb-result hidden></div>
    <div class="nb-lab-actions"><button type="button" class="nb-btn" data-nb-reset hidden>再来一次</button></div>
    <p class="nb-lab-nojs">这个小实验需要开启 JavaScript 才能操作。</p>
  </div>
</div>

无论你怎么选，最后拼出来的句子都很通顺，都像一条百科词条。但这本书不存在，这个作者也不存在。你在每一步都只是「接着说」，没有任何一步让你停下来查证。模型也一样。

## 它没有资料库，只有印象

那它为什么不查一下呢？因为它没有可以查的东西。

想象一个人读遍了整座图书馆，然后被关进一间没有书的考场。常见的事他背得滚瓜烂熟：巴黎是法国首都，水的沸点是 100 度。但只在某本书角落里见过一次的事，比如某位小众作者的生日，他只剩下一点模糊印象。被问到时，他不会交白卷，而是顺着印象说出一个「看起来很对」的答案。

大模型的几百亿个参数，存的就是这种「印象」：词和词之间的关联强度。它不是一张可以按条查询的表格。这和数据库、搜索引擎有本质区别。

![数据库会说「没有结果」，语言模型不会：左边数据库查不到就返回空；右边模型不管印象清晰、模糊还是没有，最后都汇进同一个出口，生成一段通顺的回答](/media/newbie-tutorials/hallucination-memory-vs-database.svg)

左边的数据库查不到就返回「没有结果」，它有「空」这个选项。右边的模型没有：不管印象深浅，它的出口永远是一段像模像样的话。于是可以按印象深浅分三档：

- **印象清晰**：高频事实，训练资料里见过成千上万次。这一档基本靠谱。
- **印象模糊**：只见过几次的细节，典型的是人名、数字、日期、某本书的具体信息。这一档最容易「拼凑」，把几个相似的东西缝在一起。
- **没有印象**：训练截止之后发生的事、你公司内部的资料、或者压根不存在的东西。这一档几乎必然编造，因为它没有别的选项。

> 每个模型都有一个「训练截止日期」，之后的事它一无所知。但被问到时，它未必会告诉你「这个我不知道」，而是照样生成一个答案。

## 为什么它宁可编，也不说「我不知道」

到这里你可能会问：既然印象模糊，说一句「我不确定」不就好了？人会这么做，模型为什么不？原因有三层。

**第一层：训练目标是「像」，不是「真」。** 模型在学习时，衡量它好坏的标准是「下一个词猜得像不像」。一句编造得很像的话，和一句真话，在这个标准下拿到的分数是一样的。「真」从来不是它被优化的目标。

**第二层：考试规则鼓励猜。** 模型训练完之后，还要在各种测试题上打分排名。绝大多数测试的规则是：答对得分，答错和不答都是零分。想想看，在这样的规则下，一个考生最优的策略是什么？

<div class="nb-lab" data-nb-lab="exam">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 02</span>
    <strong>换一套评分规则，谁会赢？</strong>
    <p>两位考生各答 10 道选择题，都只真会 6 道。<b>小猜</b>不会也硬猜（四选一，平均猜中 1 道）；<b>小实</b>不会就写「不知道」。评分规则由你来定。</p>
  </div>
  <div class="nb-lab-stage">
    <fieldset class="nb-rules">
      <legend>评分规则</legend>
      <label class="nb-rule"><input type="radio" name="nb-exam-rule" value="a" checked><span>规则 A · 答对 +1，答错 0，不答 0</span><small>大多数模型排行榜的打分方式</small></label>
      <label class="nb-rule"><input type="radio" name="nb-exam-rule" value="b"><span>规则 B · 答对 +1，答错 −1，不答 0</span><small>错了要扣分</small></label>
      <label class="nb-rule"><input type="radio" name="nb-exam-rule" value="c"><span>规则 C · 答对 +1，答错 −3，不答 0</span><small>错得越离谱，罚得越重</small></label>
    </fieldset>
    <div class="nb-scores">
      <div class="nb-score-row" data-nb-score="guess">
        <span class="nb-score-name">小猜</span>
        <span class="nb-score-bar"><i data-nb-bar style="width: 70%"></i></span>
        <span class="nb-score-num" data-nb-num>7 分</span>
        <span class="nb-score-detail" data-nb-detail>对 7 · 错 3 · 空 0</span>
      </div>
      <div class="nb-score-row" data-nb-score="honest">
        <span class="nb-score-name">小实</span>
        <span class="nb-score-bar"><i data-nb-bar style="width: 60%"></i></span>
        <span class="nb-score-num" data-nb-num>6 分</span>
        <span class="nb-score-detail" data-nb-detail>对 6 · 错 0 · 空 4</span>
      </div>
    </div>
    <p class="nb-verdict" data-nb-verdict aria-live="polite">规则 A 下，<b>小猜</b>赢。不会就猜没有任何代价，这正是模型被训练和排名时最常见的规则。</p>
  </div>
</div>

只要「不答」和「答错」得分一样，敢猜的永远不吃亏。模型正是在这样的规则下被反复训练和排名的，于是「不确定也要给一个答案」被一遍遍强化。OpenAI 在 2025 年的论文[《Why Language Models Hallucinate》](https://arxiv.org/abs/2509.04664)里把这一点说得很直白：幻觉之所以顽固，很大程度上是因为我们的评测方式在奖励猜测、惩罚诚实。

**第三层：它感受不到「心虚」。** 人编造时会有点不自在，语气会变。模型没有这种信号。输出「巴黎」和输出一个编出来的人名，对它来说是同一个动作：从概率分布里取一个词。概率低一点，也照样取出来，语气一样笃定。

## 判断一个问题会不会踩雷

把上面三点合起来，就能画出一张地图：一个问题从你手里出发，会经过三个岔路口，走到哪个出口，决定了它踩到幻觉的概率。

![一个问题会不会踩到幻觉：三个岔路口。要想法还是要事实；它能不能翻书；这件事在训练资料里常不常见。三条低风险出口和一个幻觉高发区，底部是三条护栏](/media/newbie-tutorials/hallucination-risk-map.svg)

三个岔路口对应三个问题，你在提问前就能自己回答：

1. **要的是想法，还是事实？** 让它帮你润色、翻译、总结、出主意，没有标准答案，也就谈不上编。要具体事实，才进入下一关。
2. **它能翻书吗？** 你把资料贴给它、上传文件，或者用能联网搜索的模式，它就从「背书」变成了「翻书」，答案有出处可查。只能靠记忆，才进入下一关。
3. **这件事常见吗？** 常识级的事它印象很深；冷门的、最近的、涉及具体数字日期引用链接的，就进了高发区。

地图底部还有三条护栏，任何时候都能加：**允许它说「不知道」**（在问题里明确写上「如果不确定请直接说不确定，不要猜」）；**要求给出处，并且真的点开核对**；**换个问法再问一次**，两次答案对不上就是信号。

<div class="nb-lab" data-nb-lab="risk">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 03</span>
    <strong>这个问题容易幻觉吗？</strong>
    <p>想一个你正打算问 AI 的问题，勾选符合它的描述，看看风险等级。</p>
  </div>
  <div class="nb-lab-stage">
    <div class="nb-checks">
      <label class="nb-check"><input type="checkbox" data-nb-risk="2"><span>需要具体数字、日期或价格</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="3"><span>要它给出书名、论文、链接或引用</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="2"><span>涉及小众人物、冷门领域，或某家公司的内部细节</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="2"><span>是最近几个月才发生的事</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="1"><span>我没有给它任何资料，它只能靠记忆</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="-3"><span>我只是要思路、润色、翻译，或者总结我贴给它的内容</span></label>
    </div>
    <div class="nb-risk-meter" data-nb-risk-meter data-level="low">
      <span class="nb-risk-label">风险</span>
      <strong class="nb-risk-level" data-nb-risk-level>低</strong>
      <span class="nb-risk-tip" data-nb-risk-tip aria-live="polite">勾选几项试试。什么都不勾，默认按开放式问题算。</span>
    </div>
  </div>
</div>

## 小结

回到开头那三本不存在的书。现在你知道它们是怎么来的了：

- 模型在**猜词**，不在查证。它每一步只挑「最像话」的下一个词，从不检查整句是不是真的。
- 模型有**印象**，没有资料库。高频事实印象深，冷门细节印象浅，训练之后的事没有印象，但三种情况它都会给你一段通顺的话。
- 训练和评测的**规则奖励猜**，不奖励诚实。所以它宁可编，也不轻易说「我不知道」。

幻觉不会因为模型变大就彻底消失，但你可以让它少发生：给资料、要出处、允许它说不知道、对具体细节多一分警惕。理解它是怎么运转的，比记住「AI 会骗人」有用得多。

> 想再往下走一步？动图里模型一次「猜」出来的那个「词」，在术语里叫 token。术语图解里的 [Token](/vibe-coding/terms/token/) 一页有一个可以亲手拆句子的小工具。
