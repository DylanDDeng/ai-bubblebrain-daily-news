---
title: "大模型是怎么被训练出来的"
description: "没有人往里写知识，也没有人教它规则。从一万亿道填空题出发，看明白 Pretraining、SFT、RLHF 这三站各自做了什么，以及为什么它上线那天起就不再学习。"
date: 2026-09-01
lastmod: 2026-09-01
draft: false
weight: 4
slug: "how-llms-are-trained"
tags: ["新手村", "大模型", "训练", "RLHF", "新手教程"]
---

前三篇把大模型的三个毛病讲完了：它会编（[第一篇](/newbie-tutorials/why-llms-hallucinate/)）、它得翻书（第二篇）、它会忘（第三篇）。这一篇回答最根上的问题：这个东西到底是怎么造出来的？

很多人的想象是这样的：工程师把维基百科灌进去，再写上几万条规则——「巴黎是法国首都」「回答要礼貌」。真实过程比这个奇怪得多——而且圈内人挂在嘴边的那几个黑话，**Pretraining、SFT、RLHF**，说的正是这个过程的三站。这篇顺便帮你把它们一一对上号：不用记公式，但下次刷到发布会或论文解读，你能听懂他们在聊流水线的哪一站。

## 先破三个误解

| 流行的想象 | 实际情况 |
| --- | --- |
| 知识是程序员一条条写进去的 | 没有人写过任何一条知识，它的本领全是「练」出来的 |
| 它一直在联网自学，天天进步 | 它训练完就**冻结**了，上线那天起一个字也没再学过 |
| 跟它聊天，它会越聊越懂你 | 你的对话不会改变它分毫——第三篇讲过，它连记都不记 |

那本领到底从哪来？答案说出来有点朴素：**做题**。确切地说，是做了一场持续几个月、总量以万亿计的填空题马拉松。

## 第一步：做一万亿道填空题

还记得第一篇的结论吗——大模型只会一件事：猜下一个词。这个「猜」的本事，就是训练的全部内容。

刚出厂的模型里有几百亿个**参数**（parameters），你可以把它们想象成几百亿个**旋钮**，出厂时全是随机位置。这时候让它说话，出来的是纯乱码。然后训练开始，就是不停重复这四步：

![训练就是重复做四步：从图书馆里抽一段文字，遮住最后一个词变成填空题，让模型猜，对答案后把几百亿个旋钮微调一点点；右侧显示同一道题上它从乱猜「香蕉」进步到猜对「好」](/media/newbie-tutorials/train-loop.svg)

猜错了怎么办？不批评、不讲道理，就做一个动作：**把导致这次猜错的旋钮，各自回拧一丝丝**，让它下次的猜测离正确答案近一点点。这个「猜错就回拧」的动作，行话叫**梯度下降**（gradient descent）——名字唬人，内容就是你刚看到的这一下。一道题只拧一丝丝，但架不住题多——数万亿个词（还记得 [Token](/vibe-coding/terms/token/) 吗），每个词都是一道题，几万张显卡不分昼夜地做上几个月。这一整站，就是圈内说的**预训练**（Pretraining）：在见到任何用户之前，先用海量文本把底子打出来。

亲手拧几轮，你就明白了：

<div class="nb-lab" data-nb-lab="fill">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 01</span>
    <strong>亲手训练一道填空题</strong>
    <p>这道题是：「小猫蹲在____上」，正确答案是「垫子」。下面是模型此刻对三个候选词的把握——刚出厂，基本靠瞎蒙。点按钮做一轮训练，看它的把握怎么变。</p>
  </div>
  <div class="nb-lab-stage">
    <p class="nb-lab-hint" data-nb-fill-round aria-live="polite">还没开始训练 · 三个词差不多，纯瞎蒙</p>
    <div class="nb-scores" data-nb-fill-bars></div>
    <div class="nb-lab-actions"><button type="button" class="nb-btn" data-nb-fill-step>对答案：是「垫子」，把旋钮拧一丝</button> <button type="button" class="nb-btn nb-btn-ghost" data-nb-reset hidden>重来</button></div>
    <div class="nb-lab-result" data-nb-result hidden></div>
    <p class="nb-lab-nojs">这个小实验需要开启 JavaScript 才能操作。</p>
  </div>
</div>

没有人告诉过它「猫喜欢蹲垫子」。这条知识——连同世界上几乎所有高频知识——是从亿万道填空题里自己**长**出来的。第二篇说它「只有印象、没有资料库」，印象就是这么来的：见得多的刻得深，见得少的刻得浅。

预训练毕业的模型有个正式名字，叫**基座模型**（Base Model）——一台史上最强的「接话茬机器」。但它有个大问题：**它只会接话茬**。

## 第二步：教它好好说话

不信你问刚毕业的它一个问题，画风是这样的——它不回答，而是接着你的话往下写，因为在它读过的网页里，一个问题后面往往跟着更多问题。

<div class="nb-lab" data-nb-lab="basevs">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 02</span>
    <strong>接话茬机器 vs 助手</strong>
    <p>同一个模型，微调前后判若两人。选一句话发给它，再切换两种状态对比。</p>
  </div>
  <div class="nb-lab-stage">
    <p class="nb-lab-hint">你发给它的话</p>
    <div class="nb-choices nb-choices-inline" data-nb-basevs-prompts role="group" aria-label="输入"></div>
    <fieldset class="nb-rules nb-rules-inline">
      <legend>它现在的状态</legend>
      <label class="nb-rule"><input type="radio" name="nb-basevs-mode" value="base" checked><span>刚做完填空题的它</span><small>预训练毕业，还没上过「礼仪课」</small></label>
      <label class="nb-rule"><input type="radio" name="nb-basevs-mode" value="sft"><span>微调之后的它</span><small>看过几万条示范对话</small></label>
    </fieldset>
    <div class="nb-kb-input" data-nb-basevs-out></div>
    <p class="nb-verdict" data-nb-basevs-verdict aria-live="polite"></p>
    <p class="nb-lab-nojs">这个小实验需要开启 JavaScript 才能操作。</p>
  </div>
</div>

修法不是写规则，还是训练——只是换了教材。工程师准备**几万条人写的示范对话**（一个问题，配一个理想回答），让模型继续做填空题，只不过这次要补全的「正确答案」是人类示范的回答。这一步叫**指令微调**，论文里更常见的名字是 **SFT**（Supervised Fine-Tuning，监督微调）——「监督」的意思是有标准答案可对，答案就是那几万条人类示范。

注意量级的悬殊：预训练读了数万亿词，微调只有几万条对话——像一个读了一辈子书的人，上了一周岗前培训。知识早就在肚子里了，这一周学的只是：**被问到问题时，应该回答，而不是接着出题**。

## 第三步：人类来打分

会回答还不够。同一个问题，模型能生成一百种回答：详细的、敷衍的、靠谱的、跑偏的——哪种算「好」？这事写不成规则，但人看一眼就知道。

于是第三步干脆让人来挑：

![性格不是写出来的，是挑出来的：同一个问题生成三个回答，标注员挑出更好的，这些选择训练出一个学会人类口味的打分器，模型再朝高分方向调整；底部警告：总挑自信流畅的版本，就会把幻觉固化进模型](/media/newbie-tutorials/train-rlhf.svg)

模型对每个问题生成多个回答，标注员挑出更好的那个；几十万次挑选汇成一个学会了人类口味的**打分器**；模型最后对着打分器反复练习，把能拿高分的路子拧进旋钮里。

这套流程叫 **RLHF**（Reinforcement Learning from Human Feedback，基于人类反馈的强化学习）。名字长，拆开正好是三个零件：**人类反馈**＝标注员的挑选；那个打分器有个正式名字，叫**奖励模型**（Reward Model）；**强化学习**＝模型对着奖励模型反复试、朝高分方向调。类比记这个就够了：**实习生反复揣摩主管的口味，最后长成了主管喜欢的样子**。

模型的「性格」——耐心、礼貌、有分寸——就是这一步挑出来的。但第一篇的老问题也在这一步埋下：标注员也是人，也会偏爱「听起来自信流畅」的回答。现在轮到你来体会这份工作有多微妙：

<div class="nb-lab" data-nb-lab="rank">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 03</span>
    <strong>你来当一次标注员</strong>
    <p>三道题，每道两个回答。凭直觉选出你觉得更好的那个——选完才揭晓每道题的玄机。</p>
  </div>
  <div class="nb-lab-stage">
    <div data-nb-rank></div>
    <div class="nb-lab-result" data-nb-result hidden></div>
    <div class="nb-lab-actions"><button type="button" class="nb-btn nb-btn-ghost" data-nb-reset hidden>再当一次</button></div>
    <p class="nb-lab-nojs">这个小实验需要开启 JavaScript 才能操作。</p>
  </div>
</div>

## 毕业那天起，它就不再学习了

三步走完，模型上线。从这一刻起，几百亿个旋钮**全部冻结**——它这一生的学习结束了。

![从原料到上线：数万亿词文本经过预训练、指令微调、人类打分三步，产出补全器、助手、有分寸的助手，最后上线冻结；想懂新东西只能现场翻资料或等下一代重走流水线](/media/newbie-tutorials/train-pipeline.svg)

把「冻结」想明白，前三篇的很多现象就串起来了：

- **训练截止日期**从哪来？流水线停在哪天，它的世界就定格在哪天——第三篇里「没有印象」的那一档，指的就是定格之后的事。
- **为什么聊天不会让它变聪明？** 你的每一句话都只是摊在桌面上的输入（第三篇），一个旋钮也拧不动。会话删了，就什么都没发生过。
- **那 AI 不是天天在进步吗？** 进步的是「下一代」：更好的数据重新训练、更大的桌面、更强的知识库外挂。你正在聊的这一个，从上线起就没变过。
- **想让它懂你公司的事？** 两条路：把资料现场翻给它看——第二篇的知识库；或者花大钱用你的资料再训练一轮。绝大多数场景，前者又快又便宜。

## 小结

回到开头的想象。现在你知道真实的配方了：

- **没有人写知识。** 全部本领来自一场填空题马拉松：猜、对答案、拧旋钮，重复数万亿次。
- **三步各管一件事。** 预训练给本事，指令微调给应对方式，人类打分给性格——哪一步的教材有偏差，毛病就留在模型身上。
- **上线即冻结。** 截止日期、聊不聪明、要靠翻书，全是「冻结」的直接推论。

最后，把这篇出现过的黑话收进一张表。它们听起来高深，其实每个都对应你已经亲手玩过的东西：

| 黑话 | 本文叫它 | 干的事 |
| --- | --- | --- |
| Pretraining · 预训练 | 填空题马拉松 | 数万亿道填空题，长出全部知识（LAB 01） |
| Base Model · 基座模型 | 接话茬机器 | 预训练的产物，什么都能接，不懂对话（LAB 02 左边） |
| SFT · 监督微调 | 岗前培训 | 几万条示范对话，教会「被问就答」（LAB 02 右边） |
| RLHF | 实习生学主管口味 | 按人类偏好塑造性格与分寸（LAB 03） |
| Reward Model · 奖励模型 | 打分器 | 学会人类口味，替人给回答打分 |
| Parameters · 参数 | 旋钮 | 几百亿个，训练就是拧它们，上线即冻结 |

到这里，新手村的四篇连成了一个闭环：它为什么会编、怎么让它照着念、它为什么会忘、这一切是怎么被造出来的。你现在对大模型的理解，已经足够解释日常遇到的绝大多数「AI 行为」了。

> 想再往下走一步？回头看[第一篇的评分规则实验](/newbie-tutorials/why-llms-hallucinate/)——现在你知道那张考卷是谁出的、在流水线的哪一站出的了。
