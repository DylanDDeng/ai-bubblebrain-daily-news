---
externalId: "prompting-claude-fable-5-1"
kind: "article"
title: "为 Claude Fable 5.1 编写提示：官方实战指南"
description: "Anthropic 针对 Claude Fable 5.1 的官方提示指南：如何选择 effort、让 Agent 持续汇报并完成整个任务，以及正确处理工具批量调用、对话历史、范围控制、子 Agent 与视觉任务。"
date: 2026-09-02
sourceUrl: "https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1"
tags: ["Claude", "Fable 5.1", "Prompt Engineering", "Agent", "Anthropic"]
featured: true
draft: false
---

[Anthropic 官方文档](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-engineering/prompting-claude-fable-5-1) · [English version](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1)

Claude Fable 5 的现有提示通常无需修改，就能在 Claude Fable 5.1 上继续工作。这份指南真正有价值的地方，不是要求大家重写 Prompt，而是列出一组具体的“行为校准项”：什么时候该调整 `effort`，为什么长任务里用户看不到进度，怎样避免工具调用串行化，以及如何防止 Agent 提前收工或悄悄扩大范围。

如果你正在构建 Coding Agent、研究 Agent 或带工具的长程工作流，这是一份很实用的上线前检查表。

## 1. 先测试所有 effort 级别

从默认的 `high` 开始，再用自己的评测比较 `low`、`medium`、`xhigh` 和 `max`。`effort` 是 Fable 5.1 在能力、延迟和成本之间最重要的控制项，同名级别在不同模型上也不代表相同的思考量，因此从 Fable 5 迁移后应重新测一次。

- `medium` 的效果大致可与 Fable 5 相当，但成本更低；
- `low` 适合与小模型的高 effort 配置一起比较；
- `xhigh` 与 `max` 的能力增益更明显，但长篇输出可能等待更久、消耗更多 token；
- `low` 更可能凭记忆回答，减少搜索或检索工具调用。

重点不是“永远用最高档”，而是用评测找到任务所需的最低可靠档位。

## 2. 明确要求面向用户的进度更新

Fable 5.1 在长工具链中默认写出的进度更新比 Fable 5 少，用户可能数分钟看不到任何内容，最终回复也可能只覆盖最后一步。

先检查客户端是否真的接收并展示了进度：工具调用之间的简短说明会以进度更新 `thinking` 块返回；默认的 `thinking.display: "omitted"` 不会把它们交给用户。需要时可使用测试版请求头 `thinking-display-updates-2026-08-18`，将 `display` 设为 `"updates"` 或 `"summarized"`。

同时移除“把所有发现留到最终回复”一类会压制过程叙述的旧指令。需要更多可见反馈时，可以加入：

```text
Before you start, say in a line what you're about to do; brief updates while you work help the user follow along. Close with a short recap that stands on its own — what you found, what you did, and what's next — so a reader who only sees the last message has the full picture.
```

如果产品会折叠工具输出，也应明确告诉模型：用户看不到命令的完整结果，真正需要用户阅读的内容必须写进回复。

## 3. 批量执行互不依赖的工具调用

当请求明确列出多项信息时，Fable 5.1 通常会并行调用工具；但在 Coding Agent、bash + 编辑器或 Computer Use 循环里，后续步骤只是任务隐含而未被明确说出时，它有时会每轮只发出一次调用。

可在当前请求末尾加入一句提醒：

```text
First privately list what you need next; then request every item that doesn't depend on another's result in this one response.
```

在工具循环中，每次返回结果时都追加一份新的轮次作用域系统消息，并保留之前的消息不动。若使用测试版 `clear_at: "next_user_message"`，需要请求头 `mid-conversation-system-clear-at-2026-08-21`。不要删除或改写历史里的旧提醒，否则会破坏 Prompt Cache，也会使后续思考块失效。

## 4. 保持对话历史仅追加

每个 assistant 轮次都应按 API 返回的原样追加，包括思考块；不要在后续请求中编辑较早的系统提示、工具列表或消息。

对 2026 年 8 月 31 日及之后创建的新账户，Fable 5.1 的思考块只对生成它们的确切对话有效。若重放思考块时，前缀已经变化，请求会返回 `400`；使用测试版 `thinking.block_binding.prefix_mismatch_behavior: "drop_block"` 时则会丢弃受影响的块。

实践上应遵循三条规则：

1. 每轮提醒使用 turn-scoped system message，而不是注入后再删除；
2. 中途修改指令或工具时，使用 mid-conversation system message，而不是重写 `system` 或 `tools`；
3. 优先使用服务端 Compaction 或 Context Editing。若必须在客户端压缩，就用“一条摘要 + 新用户轮次”替换整个历史，不要把旧思考块带过去。

可以用 `prefix_mismatch_behavior: "drop_block"` 运行一次并记录 `input_transformations`，检查自己的 harness 是否暗中修改了历史前缀。

## 5. 降低写作密度

Fable 5.1 的套话和未解释术语更少，但有时句子会更长、段落更密。官方建议直接定义要避免的“矫饰文风”，让模型用字面表达替代为了表现文采而出现的比喻。

简短版通常已经有效：

```text
Please remove all mannered prose.
```

这条指令的目标不是让文字失去风格，而是优先传达准确意思，避免为了修辞让读者额外费力。

## 6. 让格式服务于内容

早期模型容易滥用粗体和列表，因此许多系统提示里保留了反格式化规则；Fable 5.1 的倾向相反，它更少主动使用标题、列表、粗体或引号。

如果内容本身包含多个维度，应允许模型使用能提高可读性的结构；只有当用户明确要求极简格式，或场景属于自然对话、私人交流、情绪沟通时，再坚持纯文本散文。不要用一条全局规则禁掉所有格式。

## 7. 对检索来源使用自己的话，并标明短引文

Fable 5.1 在总结文档时，比 Fable 5 更可能复述来源段落，却没有把它标成引用。有效的修复方式是在系统提示中提供一个完整的正确示例，包含：

- 用户请求；
- 搜索或检索工具输出；
- 以比较和综合为主、而非逐篇复述的回答；
- 一句解释为什么这个回答是正确示范。

示例应要求绝大多数信息使用模型自己的间接引语表达，只保留少量、明确加引号的原文短语。

## 8. 要求完成整个任务

Fable 5.1 可以执行很长的任务，但在复杂异步工作中，偶尔会把“接下来要做什么”写出来后直接结束，或为用户已经授权的步骤再次询问许可。官方建议在系统提示中明确：可逆且属于原始请求的动作直接执行，只有破坏性操作或真正改变范围的决策才停下来问。

```text
You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking 'Want me to…?' or 'Shall I…?' will block the work. For reversible actions that follow from the original request, proceed without asking. Stop only for destructive actions or genuine scope changes the user must decide.
```

同时保留一个重要例外：如果用户只是在描述问题、提出问题或讨论想法，交付物就是分析与判断，不应擅自实施修复。

在结束轮次前，还应检查最后一段是否只是计划、问题、下一步清单或尚未兑现的承诺；如果是，而且不需要新的用户决策，就继续调用工具完成它。

## 9. 把用户请求定义为交付范围

第二条配套原则是：用户请求，或用户已经批准的计划，就是交付范围。不要悄悄缩小、扩大或替换任务。

- 普通歧义由 Agent 像谨慎的同事一样自行判断；
- 不依赖答案的部分先全部完成；
- 一部分受阻时，其他部分仍要做完，并准确说明遗漏项；
- 发现无关的 Bug、性能问题或文档缺口时，把它作为后续建议，而不是顺手塞进当前改动；
- 已经决定要做的步骤应真正执行，而不是只在结尾宣布。

这组规则同时解决两个常见问题：Agent 过早停止，以及 Agent 热心地修改了用户没要求的东西。

## 10. 告诉模型 Compaction 摘要必须保留什么

如果在客户端压缩长对话，应明确列出摘要必须保留的内容：

1. 遇到的困难，以及处理或解决方式；
2. 提出、尝试或放弃的选项与原因；
3. 用户要求、决定、排除或确立的偏好、约束与边界；
4. 当前准确进度；
5. 仍未完成、未解决或承诺要做的事情；
6. 难以重建的名称、数字、日期、原话、链接与引用。

用户提供和确立的内容应尽量接近原话保留，模型自己的解释与推理可以大幅压缩。服务端 Compaction 已经按类似原则工作。

## 11. 把改动和测试限制在任务要求内

面对开放式功能请求，Fable 5.1 有时会修复附近代码、扩展未被要求的行为，或提交比任务需要更多的测试文件。可以明确告诉它：

- 预先存在的问题如果不是完成当前任务所必需，不要顺手修复；
- 歧义按措辞和周边代码最直接支持的解释实现，并在总结中说明假设；
- 临时验证脚本不必加入仓库；
- 只有任务要求，或仓库本来就为这类变更保留测试时，才提交规模相称的测试；
- 范围控制只针对额外内容，用户明确要求的行为仍必须完整交付。

## 12. 在 low effort 下主动触发搜索

`low` effort 下，Fable 5.1 更可能凭记忆回答，较少调用搜索或检索工具。可以只提高受影响轮次的 effort，也可以在系统提示中强调：认识一个名称，不等于知道它当前的状态。

尤其当问题围绕陌生名称，或 AI 模型、开发者工具等几个月就会变化的领域时，应先搜索再回答，并至少一次按用户原样输入名称。对它“有些印象”反而是产生过时权威答案的高风险情况。

## 13. 减少安全防护误报

Fable 5.1 的安全分类器比 Fable 5 刚发布时更少误报，查找源代码漏洞也是允许的。但以下三种情况仍更容易触发 `stop_reason: "refusal"`：

- **编译检查措辞：**与其问“这个程序能否无错误编译”，不如问“这个程序是否存在 Bug”；
- **小众编程语言：**提供它是什么、如何工作的上下文，最好同时提供语言文档；
- **工具输出里的 Base64：**尽量从模型上下文中移除 Base64 编码数据。

## 14. 优先做定向编辑

Fable 5.1 比 Fable 5 更可能为了小改动重写整个文本文件。结果通常正确，但会增加输出 token 和等待时间。可加入：

```text
The number of tokens used to edit files is best minimized, all else being equal. Therefore, when it will not affect the end result, try to surgically edit a file rather than rewrite the entire thing.
```

除非文件很短或大部分内容确实都要变化，否则应优先修改局部。

## 15. 为 xhigh 与 max 的长输出留足空间

在 `xhigh`，尤其是 `max` 下，Fable 5.1 可能先在思考中完整起草长篇交付物，再在正式回复里写一次，既增加等待，也容易撞上 `max_tokens`。

最简单的做法是让长篇请求从 `high` 开始，仅在评测证明确有质量收益时才升到 `xhigh` 或 `max`。若必须使用高 effort：

- `max_tokens` 要同时容纳思考与最终回复；
- 明确告诉模型不要在推理和回复中各写一遍完整交付物；
- 推理空间用于理解需求、检查输入、确定结构和解决困难决策，输出空间用于真正写成品。

## 16. 子 Agent 运行时，主 Agent 继续工作

如果 Coding Agent 支持委派，不要强制主 Agent 启动一个子 Agent 后立即等待。更好的 harness 设计是：

1. 启动子 Agent 的工具立即返回；
2. 子 Agent 完成后，通过后续 `user` 消息把结果交给主 Agent；
3. 另设一个等待工具，让主 Agent 在真正依赖结果时主动调用。

主 Agent 仍可能选择等待，但在能够继续推进其他工作的任务中，这种设计可以缩短平均完成时间，而质量、token 用量和成本基本相近。

## 17. 为视觉任务提供裁剪与缩放工具

Fable 5.1 的视觉能力有所提升，但面对密集图表和复杂图片时，最好让它能够迭代分析、裁剪、放大并再次核对。

理想配置是给 Agent 一个包含原始图片或视频、并预装 PIL、OpenCV 等基础图像处理库的容器。如果容器成本太高，单独提供一个“选区裁剪并放大后返回”的工具，也能带来大部分提升。视觉能力不仅取决于模型本身，也取决于 harness 是否让模型把注意力投到正确的局部。

## 结论：这是一份 Agent 产品检查表

这份官方指南最值得带走的，不是一段万能 System Prompt，而是四个设计原则：

1. **用评测选择 effort，而不是凭直觉追求最高档。**
2. **让长任务对用户可见，并要求 Agent 真正完成已经承诺的步骤。**
3. **把对话历史当作 append-only 日志，避免破坏思考块与 Prompt Cache。**
4. **把范围、测试、并行工具调用和子 Agent 调度写进 harness 的行为契约。**

Prompt 只能校准模型，产品端仍要正确接收进度块、维护历史、安排异步结果并提供合适的工具。这也是这份文档比一般“提示词合集”更有价值的原因：它讨论的是模型与 Agent Runtime 的接口，而不只是如何措辞。
