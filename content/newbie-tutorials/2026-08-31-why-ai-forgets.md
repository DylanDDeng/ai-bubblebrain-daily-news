---
title: "为什么 AI 聊着聊着就忘了"
description: "不讲参数，从「一张大小固定的桌子」出发，看明白模型为什么会忘掉你最早的要求、为什么长对话会变笨，以及怎么和一个没有记忆的家伙好好合作。"
date: 2026-08-31
lastmod: 2026-08-31
draft: false
weight: 3
slug: "why-ai-forgets"
tags: ["新手村", "大模型", "上下文窗口", "新手教程"]
---

你在对话开头交代得清清楚楚：「接下来全程用中文。」聊到第 40 条消息，它突然蹦出一大段英文。你贴过预算是 3 万 5，后来再问，它笃定地说 3 万。你忍不住想：这东西的记性怎么这么差？

这一篇解释这个现象。和前两篇一样，先说一个反直觉的事实。

## 它不是忘了，是从来没记住

大模型**没有记忆**。两次回答之间，它什么都不保留——不是记性差，是压根没有「记」这个动作。

那它怎么能接得上你上一句话？因为每次你发新消息，产品都在幕后把**整段聊天记录从头到尾**重新发给它读一遍。你以为在和一个认识你的老朋友聊天，实际情况更像：每次都把完整的对话记录塞给一个初次见面的人，让他现场读完、接着写下一句。

读过第二篇的话，你会发现这和知识库是同一个思路：模型不保存任何东西，需要什么，就在作答前摆到它面前。对话记录也一样，只是这次摆的是你们聊过的每一句话。

这套机制平时运转得很好，好到你察觉不到它的存在。直到那份「对话记录」太长，放不下了。

## 桌面只有这么大

模型一次能读的内容有一个硬上限。所有东西——系统设定、你们聊过的每一句、你贴的文档、它自己写的回答——都要摊在一张**大小固定的桌面**上，它只能看见桌上的东西。这张桌面的学名叫[上下文窗口](/vibe-coding/terms/context-window/)（context window）。

桌面大小按 token 计——就是第一篇动图里，模型一次「猜」出来的那个「词」（术语页 [Token](/vibe-coding/terms/token/) 有个可以亲手拆句子的小工具）。如今主流模型的窗口有几十万 token，听起来像一张巨桌，够摊一本长篇小说。但一份长 PDF 就是几万 token，它自己一段认真的长回答也要上千，几个来回就见底了。

桌子满了会发生什么？看这张图：

![每次作答都要把一切重新摊上这张桌：你的要求先放上去，几轮问答、长合同、它的长回答陆续加入，桌子满了之后，最早的要求被挤出桌面，彻底消失](/media/newbie-tutorials/ctx-desk.svg)

注意最后一幕：被挤出去的内容**不是存档了，是对它彻底不存在**——而且没有任何提示。于是你看到的现象就是「聊着聊着忘了」：它不是变笨了，是你最早那条要求已经不在桌上。

亲手试一次，比看十遍动图都直观。

<div class="nb-lab" data-nb-lab="desk">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 01</span>
    <strong>亲手塞满一张桌面</strong>
    <p>这是一个迷你模型，桌面只有 8000 token。你的要求「全程中文、预算 3 万 5」已经放在最前面。往桌上加东西，随时问它还记不记得。</p>
  </div>
  <div class="nb-lab-stage">
    <p class="nb-lab-hint" data-nb-desk-used aria-live="polite">已用 600 / 8000 token</p>
    <div class="nb-desk" data-nb-desk-bar></div>
    <p class="nb-desk-evicted" data-nb-desk-evicted aria-live="polite" hidden></p>
    <p class="nb-lab-hint">往桌上加点东西：</p>
    <div class="nb-choices nb-choices-inline">
      <button type="button" class="nb-pill" data-nb-desk-add="ask">发一条问题 +300</button>
      <button type="button" class="nb-pill" data-nb-desk-add="chat">随便聊几句 +500</button>
      <button type="button" class="nb-pill" data-nb-desk-add="long">让它写段长回答 +1500</button>
      <button type="button" class="nb-pill" data-nb-desk-add="doc">贴一份长合同 +5200</button>
    </div>
    <div class="nb-lab-actions"><button type="button" class="nb-btn" data-nb-desk-ask>问它：我开头要求过什么？</button> <button type="button" class="nb-btn nb-btn-ghost" data-nb-reset>重来</button></div>
    <div class="nb-lab-result" data-nb-result hidden></div>
    <p class="nb-lab-nojs">这个小实验需要开启 JavaScript 才能操作。</p>
  </div>
</div>

只要那块橙色的「你的要求」还在桌上，它就答得一字不差；被挤出去之后，它会一脸无辜地反问你。它没有撒谎，也没有装傻——**那条消息对它来说，从未存在过**。

## 都在桌上，也分「记得牢」和「记不清」

那是不是只要不被挤出去就万事大吉？可惜还有第二个问题。

桌上摊了两百张纸的时候，模型「读」的质量并不均匀。研究者发现一个稳定的规律：**开头和结尾的内容用得最牢，埋在中间的最容易被漏掉**——这个现象有个形象的名字，叫「迷失在中间」（lost in the middle）。

![迷失在中间：一排消息卡代表长对话，两端颜色深表示记得牢，中间逐渐变浅表示容易被漏掉，你的第 3 条要求恰好埋在正中间](/media/newbie-tutorials/ctx-lost-middle.svg)

这解释了另一种常见的「忘」：要求明明还在窗口里，它却没照做。不是丢了，是被淹没了。塞得越满，中间那片沼泽就越大——这也是第二篇里知识库「只给最相关的几段」的原因：多塞不但占地方，还会互相淹没。

对策也写在图里了：**重要要求放开头；聊久了，把它再说一遍**——一头一尾，占住两个好位置。

## 桌子快满时，它会偷偷做总结

被挤出去、被淹没，都还不是全部。很多产品在桌子快满时会做第三件事：把前面几十条对话**压缩**成一小段摘要，用摘要换掉原文，给新消息腾地方。

![桌子快满时它会偷偷做总结：八条带具体细节的对话被压缩成一段摘要，清点后发现「全程用中文」保住了，预算数字、色号、评审时间只剩模糊说法，对接人完全消失](/media/newbie-tutorials/ctx-compaction.svg)

压缩是个不错的折中——总比把最早的内容整条扔掉强。但总结这个动作天然**保大意、丢细节**：「预算 3 万 5」变成「已确定预算」，「色号 #1B3A6B」变成「主色」。丢了之后你再问细节，它手里只有摘要，要么答不上，要么——想起[第一篇](/newbie-tutorials/why-llms-hallucinate/)了吗——现编一个听起来很对的数。**长对话后期的数字错误，十有八九是这么来的。**

<div class="nb-lab" data-nb-lab="compact">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 02</span>
    <strong>压缩之后，还剩下什么</strong>
    <p>下面是一段聊了很久的对话。桌子快满了——点「压缩」，然后问它几个问题试试。</p>
  </div>
  <div class="nb-lab-stage">
    <div class="nb-transcript" data-nb-transcript>
      <p class="nb-msg">你：官网改版的事开始推进吧，后面全程用中文沟通。</p>
      <p class="nb-msg">你：预算定了，3 万 5，不能超。</p>
      <p class="nb-msg">它：好的。两种改版方案的对比是……</p>
      <p class="nb-msg">你：主色就用那个深蓝，色号 #1B3A6B。</p>
      <p class="nb-msg">它：收到，按深蓝出了三版配色……</p>
      <p class="nb-msg">你：评审定在周四下午 3 点，记得提醒我。</p>
      <p class="nb-msg">你：供应商那边对接人是林工。</p>
      <p class="nb-msg">它：都记下了：预算 3 万 5、深蓝主色、周四评审、对接林工。</p>
    </div>
    <div class="nb-lab-actions"><button type="button" class="nb-btn" data-nb-compact>桌子快满了，压缩</button></div>
    <div class="nb-summary" data-nb-summary hidden>
      <span class="nb-chunk-src">压缩后，桌上只剩这一段</span>
      <p>用户在推进官网改版，已确定预算、主色与评审安排，后续用中文沟通。</p>
    </div>
    <div class="nb-choices nb-choices-inline" data-nb-compact-questions hidden>
      <button type="button" class="nb-pill" data-nb-q="budget">预算是多少？</button>
      <button type="button" class="nb-pill" data-nb-q="color">主色是什么？</button>
      <button type="button" class="nb-pill" data-nb-q="lang">用什么语言沟通？</button>
    </div>
    <div class="nb-lab-result" data-nb-result hidden></div>
    <div class="nb-lab-actions"><button type="button" class="nb-btn nb-btn-ghost" data-nb-reset hidden>重来</button></div>
    <p class="nb-lab-nojs">这个小实验需要开启 JavaScript 才能操作。</p>
  </div>
</div>

## 怎么和一个没有记忆的家伙合作

把这一篇的机制翻成几条日常习惯：

1. **重要设定放开头，聊久了重复一遍。** 一头一尾，两个好位置都占住。
2. **一个会话只干一件事。** 换话题就开新会话，别让不相干的内容抢桌面、加深「中间的沼泽」。
3. **感觉它变笨时，主动做一次「人工压缩」。** 让它「把目前的结论、约定和所有关键数字总结成一段」，你核对补全——尤其是数字——然后开个新会话，把这段贴在第一条。和产品偷偷做的压缩相比，你亲手核对过细节。
4. **贴文档只贴相关部分。** 整份丢进去，既吃桌面，又淹没你真正想问的那几段。
5. **长对话后期，对它嘴里的数字多留个心眼。** 可能来自被压缩过的摘要，回到第一篇的老规矩：要出处，再核对。

<div class="nb-lab" data-nb-lab="risk">
  <div class="nb-lab-head">
    <span class="nb-lab-kicker">LAB 03</span>
    <strong>该开新会话了吗？</strong>
    <p>对照你手头那个越聊越长的对话，勾选已经出现的现象。</p>
  </div>
  <div class="nb-lab-stage">
    <div class="nb-checks">
      <label class="nb-check"><input type="checkbox" data-nb-risk="2"><span>它开始违反你最早提的要求（比如又蹦英文）</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="2"><span>关键数字它说得和之前不一样了</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="2"><span>你已经往里贴过两三份长文档</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="1"><span>现在聊的话题和开头已经不是一件事</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="1"><span>它的回答越来越泛，车轱辘话变多</span></label>
      <label class="nb-check"><input type="checkbox" data-nb-risk="-2"><span>对话不长，而且从头到尾只聊一件事</span></label>
    </div>
    <div class="nb-risk-meter" data-nb-risk-meter data-level="low" data-nb-medium="2" data-nb-high="4" data-nb-label-low="还能继续" data-nb-label-medium="准备收尾" data-nb-label-high="该开新会话了" data-nb-empty="勾选你观察到的现象。一个都没有？那就放心继续聊。" data-nb-tip-low="桌面还宽裕。保持「重要设定放开头」的习惯就好。" data-nb-tip-medium="找个自然的节点，让它把目前的结论、约定和关键数字总结成一段，你核对补全后，带着这段总结开新会话。" data-nb-tip-high="别硬撑。先让它输出总结，逐条核对细节——尤其是数字，然后开新会话，把总结贴在第一条。旧会话留着当档案查。">
      <span class="nb-risk-label">判断</span>
      <strong class="nb-risk-level" data-nb-risk-level>还能继续</strong>
      <span class="nb-risk-tip" data-nb-risk-tip aria-live="polite">勾选你观察到的现象。一个都没有？那就放心继续聊。</span>
    </div>
  </div>
</div>

## 小结

回到开头那句突然蹦出来的英文。现在你知道发生了什么：

- 它**没有记忆**。所谓连续对话，是每次把全部记录重新给它读一遍；「记得」只是因为记录还在桌上。
- 桌面（上下文窗口）**大小固定**。满了就从最早的开始挤，挤出去等于彻底消失，而且不会提醒你。
- 都在桌上也不平等：**开头和结尾记得牢，中间容易被淹没**；桌子快满时的自动压缩会保大意、丢细节。
- 对策都很朴素：重要的话放开头、适时重复；一事一会话；感觉变笨就人工总结、开新会话。

三篇连起来，新手村的地基就打完了：第一篇讲它为什么会编（没有查证，只有猜词），第二篇讲怎么让它照着念（把资料翻给它看），这一篇讲它为什么会忘（桌面有限，没有记忆）。这三件事凑在一起，几乎能解释你日常遇到的大部分「AI 犯傻」。

> 想再往下走一步？[上下文窗口](/vibe-coding/terms/context-window/)术语页有图解；想看一个真实的编程 Agent 怎么写代码做压缩，[Pi 教程第三章](/pi-agent-tutorials/pi-agent-compaction/)拆了它的源码——那是本站深水区的入口。
