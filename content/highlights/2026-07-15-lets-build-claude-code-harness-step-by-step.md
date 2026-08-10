---
externalId: "lets-build-claude-code-harness-step-by-step"
kind: "article"
title: "一步步构建 Claude Code 的 Harness"
description: "从核心循环开始，逐层用 CrewAI 重建 Claude Code 风格的智能体 Harness：工具、规划、子代理、沙箱、人工审批、记忆与检查点。"
date: 2026-07-15
sourceUrl: "https://x.com/akshay_pachaar/status/2077455755066868098"
cover: "https://pbs.twimg.com/media/HNSTghtacAAQogV?format=jpg&name=large"
tags: ["Claude Code", "Agent Harness", "CrewAI", "子代理", "沙箱"]
featured: true
draft: false
---

[原文：Let's build Claude Code's harness (step-by-step) — Akshay Pachaar / @akshay_pachaar](https://x.com/akshay_pachaar/status/2077455755066868098)

![Claude Code Harness 全景](https://pbs.twimg.com/media/HNSTghtacAAQogV?format=jpg&name=large)

本文将一步步介绍构建编程智能体 Harness 所需的一切：智能体循环、规划、子代理、沙箱、记忆和检查点。

如果你尝试过构建自己的编程智能体，大概很熟悉这个过程：把模型接上文件工具和 Shell，让它面对一个真实代码库，然后它通常在十几次工具调用之内就开始失控。

它会读错文件，在任务进行到一半时忘掉目标，还会用已经不再需要的输出塞满上下文。

同样的任务交给 Claude Code，却能干净利落地完成。最容易得出的结论是 Anthropic 只是拥有更好的模型，但这个结论忽略了真正发生工作的地方。

真正的差异是 **Harness**。Harness 是包裹在模型外面的普通代码：它负责规划、工具执行、记忆和安全，而模型只负责决定下一步做什么。

如果把一个拥有完整 Harness 的智能体画出来，大概是这样：

<video controls playsinline preload="metadata" poster="https://pbs.twimg.com/tweet_video_thumb/HNL--RXbYAA1My-.jpg" src="https://video.twimg.com/tweet_video/HNL--RXbYAA1My-.mp4"></video>

这张图看起来很复杂，但可以拆成四组：

- **记忆（Memory）**向模型提供当前工作上下文，以及它在多次会话中学到的事实。
- **技能（Skills）**规定智能体应该如何运作，也就是它遵循的流程、约束和启发式方法。
- **协议（Protocols）**把智能体连接到用户、工具和其他智能体。
- **Harness 核心**把所有部分连接起来，包括子代理编排、沙箱、评估器、审批循环、可观测性和上下文压缩。

Anthropic 把这种分工描述成“大脑和双手”。模型是挑选每个动作的大脑，Harness 则是执行动作、保证任务不偏离轨道的双手。

所以，你的智能体与 Claude Code 之间的差距不只是模型，更是模型周围的整套机器。

Claude Code 是当前生产环境中能力最强的 Harness 之一，但它其实由图中少数几层构成。为了弄清楚如果自己动手需要构建多少东西，我用开源智能体编排框架 CrewAI 重建了它。

结果比我预想的更多部分都能映射到框架的内置功能；而无法直接映射的部分，正是真正需要工程投入的地方。

接下来我们逐层构建它：从核心循环开始，再叠加规划、子代理、沙箱和记忆。每一步都会标明框架的职责在哪里结束、你的工作又从哪里开始。

# Claude Code 的 Harness 如何工作

Claude Code 的中心是一个朴素的智能体循环。你发送一条消息，模型决定下一步做什么：要么直接回答，要么请求调用工具。如果它请求工具，工具就会运行，结果再回到对话里，模型继续做下一次决定。

这个过程会不断重复，直到模型返回一个不再包含工具调用的最终答案。

在这个循环中，模型读取文件、编辑代码、运行 Shell 命令并执行测试。这些并不是互相独立的模式，而只是同一个循环中的不同工具调用。

不过，单凭循环还不足以构成可靠的编程智能体。Claude Code 在循环外加入了规划、文件工具、子代理、记忆，以及权限和沙箱系统。这些层并不取代循环，而是让它变得足够安全、可靠，可以用于真实工作。

![Claude Code Harness 架构](https://pbs.twimg.com/media/HNMLQW5bUAAz989?format=jpg&name=large)

这就是我们要重建的架构：先实现核心循环，再逐层叠加其他能力，并把每一层映射到负责它的 CrewAI 功能。

# 核心智能体循环

循环会反复执行同一组步骤，直到任务完成：

1. 请求模型执行任务。
2. 模型直接回答，或请求一个或多个工具。
3. 如果模型请求了工具，就运行工具并把结果返回给模型。
4. 使用更新后的对话重复上述过程。
5. 当模型的响应不再请求任何工具时，任务完成。

![核心智能体循环](https://pbs.twimg.com/media/HNMM_tdagAEOR7w?format=jpg&name=large)

```python
while True:
    reply = model(messages, tools)
    calls = [b for b in reply if b.type == "tool_use"]
    if not calls:            # 纯文本，没有工具调用：任务已经完成
        return reply.text
    messages += [reply, run_all(calls)]
```

每次工具调用都会完成一个步骤，为模型提供新信息，并成为下一次决策的输入。一个简单问题可能只需一轮，而修复复杂 Bug 或重构大型代码库，可能需要几十轮，模型才能获得足够信息并给出最终答案。

只要创建一个智能体，CrewAI 就会自动提供这套执行循环。你无须自己实现 `while` 循环，只需定义智能体并给它分配任务。

# 构建第一个智能体

先创建一个简单的 Bug Fixer 智能体。

```python
from crewai import LLM, Agent, Crew, Task

bug_fixer = Agent(
    role="Bug Fixer",
    goal="Find and describe the fix for the reported bug in the codebase.",
    backstory="You read directories and files to build an accurate picture of the code.",
    llm="claude-sonnet-4-6",
)

task = Task(
    description="Find the fix for {objective}.",
    expected_output="A short description of the fix and which file it belongs in.",
)

result = Crew(agents=[bug_fixer], tasks=[task]).kickoff(
    inputs={"objective": "the overdraft bug in account.py"}
)
```

这里需要理解三个概念：

- **Agent** 通过角色、目标、LLM 和工具，定义由谁完成工作。
- **Task** 描述具体任务。
- **Crew** 把智能体和任务组织起来。调用 `kickoff()` 会运行前面介绍的同一套执行循环，无论底层模型来自 Anthropic、OpenAI、Google 还是其他提供商。

# 给智能体工具

工具让一个原本只能生成文本的模型真正能够操作代码库：读取和写入文件、运行 Shell 命令、调用外部 API。

CrewAI 自带文件系统工具：

- **FileReadTool** 读取文件。
- **DirectoryReadTool** 列出目录。
- **FileWriterTool** 写入文件。

```python
from crewai_tools import DirectoryReadTool, FileReadTool, FileWriterTool

read_file = FileReadTool()
write_file = FileWriterTool()
list_dir = DirectoryReadTool()

filesystem_tools = [read_file, write_file, list_dir]
```

这些工具也可以充当外部记忆。智能体不必把很长的搜索结果一直保留在模型上下文中，而是可以把结果写入文件，只保留文件名，需要时再读回来。

这样能缩小上下文窗口中的负担，让模型更专注；Anthropic 把这种方法称为上下文工程（context engineering）。

![把工具用作外部记忆](https://pbs.twimg.com/media/HNMPWOVbgAAqBEl?format=jpg&name=large)

内置工具只能覆盖常见工作流。对于更具体的需求，可以使用 `@tool` 装饰器，把 Python 函数暴露成工具。

函数的文档字符串就是使用说明，它会告诉模型这个工具做什么、什么时候该使用，以及需要什么输入。

```python
from crewai.tools import tool
import subprocess

@tool("run_tests")
def run_tests(path: str = "tests/") -> str:
    """Run the pytest suite at the given path and return the result."""
    result = subprocess.run(
        ["pytest", path, "-q"], capture_output=True, text=True, timeout=120
    )
    output = result.stdout + result.stderr
    return output[-4000:] if len(output) > 4000 else output
```

# 为长时间任务做规划

任务变复杂后，单纯的执行循环会逐渐忘记最初目标。经历足够多的工具调用、文件读取和中间结果后，上下文会被填满，任务目标也会被后来产生的信息淹没。

这种缓慢退化通常被称为上下文腐化（context rot）。

规划直接解决这个问题。智能体在开始工作前先制定分步计划，并在整个执行过程中把计划保留在上下文中。

计划本身并不完成工作。它是一张让模型始终连接到原始目标的路线图，作用与 Claude Code 的待办事项列表相同。

![规划让智能体始终锚定目标](https://pbs.twimg.com/media/HNMP83cbMAAoIqL?format=jpg&name=large)

CrewAI 在 Crew 层通过 `planning=True` 添加规划。它会在执行前生成计划，并在任务推进时持续提供这份计划。

```python
from crewai import Crew, LLM

crew = Crew(
    agents=self.agents,
    tasks=self.tasks,
    planning=True,
    planning_llm=LLM(model="gpt-4o-mini"),
)
```

> 注意：CrewAI 默认使用 gpt-4o-mini 进行规划，也可以为这一步换成任意其他 LLM。

单个智能体也可以通过 `reasoning=True` 对自己的工作进行推理：

```python
from crewai import Agent

bug_fixer = Agent(
    role="Bug Fixer",
    goal="Find and describe the fix for the reported bug in the codebase.",
    backstory="You read directories and files to build an accurate picture of the code.",
    tools=[FileReadTool()],
    reasoning=True,
    max_reasoning_attempts=3  # 可选：设置推理尝试次数上限
)
```

规划和推理解决的是不同问题。规划为整个任务建立高层路线图，而推理让单个智能体在行动前有时间想清楚自己的方法。

开启推理后，智能体会：

1. 反思任务并起草执行计划。
2. 评估计划是否已经可以执行。
3. 必要时继续完善，直到满意或达到 `max_reasoning_attempts`。
4. 在正式执行前，把最终推理计划注入任务。

![智能体推理流程](https://pbs.twimg.com/media/HNMRlqPbQAA8292?format=jpg&name=large)

两者结合，可以让智能体在长时间任务中保持锚定，并减少偏离原始目标的情况。

# 使用子代理委派任务

规划能让智能体保持专注，却不会减少模型必须掌握的信息量。在大型代码库中，即使计划完善，一个任务仍可能超过单个上下文窗口。

寻找一个 Bug 可能需要读取几十个文件，而主智能体并不需要把所有内容都留在自己的记忆中。

子代理通过委派来解决这个问题。主智能体把一项明确任务交给辅助智能体，辅助智能体在自己的独立上下文里工作，最后只返回简短摘要。主智能体看到结论，而不是所有中间步骤。

![把工作委派给子代理](https://pbs.twimg.com/media/HNMRqe0bIAAhw91?format=jpg&name=large)

CrewAI 通过分层工作流支持这种模式：经理智能体把任务委派给专业智能体，再汇总它们的结果。

前面的设置中，所有重活都由一个 Bug Fixer 完成。现在把工作拆给一名经理和三名专家：

- **Codebase Explorer** 探索代码并绘制仓库结构。
- **Software Engineer** 实现所需改动。
- **Test Runner** 在沙箱中运行测试并报告通过或失败。
- **Engineering Lead** 负责监督这三名专家。

![经理与专业智能体](https://pbs.twimg.com/media/HNMSVOOaMAA_7U-?format=jpg&name=large)

```python
from crewai import Crew, Agent, Task, Process

explorer = Agent(
    role="Codebase Explorer",
    goal="Map the repository and surface the files relevant to the task.",
    backstory="You read directories and files to build a picture of the code.",
    tools=[read_file, list_dir],
    llm=llm,
)  # 另外两名专业智能体采用相同方式定义

manager = Agent(
    role="Engineering Lead",
    goal="Break the request into steps and delegate each to the right specialist.",
    backstory="You decide who does what, review tests, finish once change is done.",
    llm=llm,
    allow_delegation=True,
)

crew = Crew(
    agents=[explorer, coder, tester],
    tasks=[task],
    manager_agent=manager,
    process=Process.hierarchical,
)
```

需要注意，`allow_delegation` 默认关闭，因此必须在经理智能体上显式开启。

# 沙箱：保护智能体执行

拥有 Shell 权限的智能体可能执行破坏性命令，仅仅告诉模型“不要这么做”并不构成安全措施。

真正的保护来自两层：

1. 一套对敏感操作要求批准的**权限系统**。
2. 一个隔离执行环境的**沙箱**，让经过批准的命令也无法接触宿主机。

Anthropic 采用的也是同一套思路。把代码执行移入沙箱，既能减少用户频繁批准操作的次数，也能继续保护宿主系统。

![权限与沙箱](https://pbs.twimg.com/media/HNMSjrvbEAENJn3?format=jpg&name=large)

# CrewAI 中的沙箱

让代码在沙箱而非宿主机中执行，就实现了第二层保护。这里使用 E2B：它为每次会话启动一台全新的虚拟机，并在会话结束后销毁。

Shell 命令与 Python 都完全运行在这个隔离环境中。

![E2B 沙箱执行](https://pbs.twimg.com/media/HNMSztJaIAExDf3?format=jpg&name=large)

```python
from crewai_tools import E2BExecTool, E2BPythonTool
sandbox_tools = [E2BExecTool(), E2BPythonTool()]  # 运行测试 / 运行代码
```

# 人在回路中的审批

在 Task 上设置 `human_input=True`，会让 Crew 在生成答案后暂停。你可以审阅输出，然后批准，或要求它再迭代一次。

执行到该任务时，CrewAI 会通过标准输入等待你的反馈。

```python
from crewai import Task

task = Task(
    description=(
        "In the working directory ./workspace, {objective}. "
        "Explore the code first, make the change, then run the tests and report."
    ),
    expected_output="A summary of the files changed and the final test output.",
    human_input=True,
)
```

如果 Crew 运行在 Web 应用或聊天界面背后，而不是终端中，CrewAI 基于 Webhook 的人在回路系统可以处理同样的审阅步骤。

# 记忆与检查点

默认情况下，一次运行结束后，智能体会忘记所有事情。第二天回来继续修复同一个项目中的另一个 Bug，它仍然会从零开始。

有两种机制可以让智能体跨运行保留信息，而且两者承担不同职责：

- **检查点（Checkpointing）**在运行过程中保存智能体状态，使它在中断后能够恢复，或从同一个节点沿另一条路径继续。
- **持久记忆（Persistent memory）**在不同对话之间保存事实，包括“完成前始终格式化最终代码”之类的项目偏好。

![记忆与检查点](https://pbs.twimg.com/media/HNMTaRJbEAAci7X?format=jpg&name=large)

## CrewAI 中的记忆

CrewAI 提供统一的 Memory 接口，而不是分别提供短期、长期、实体和外部记忆。保存时，它会用 LLM 识别重要细节、组织信息，并让这些信息可以在以后检索。

在 Crew 上设置 `memory=True`，就能获得跨运行记忆。每个任务结束后，CrewAI 会从输出中提取有用事实并保存；未来运行时，它会检索相关记忆并加入任务提示。

![CrewAI 统一记忆](https://pbs.twimg.com/media/HNMTw28a0AAOB4K?format=jpg&name=large)

```python
from crewai import Crew

crew = Crew(
    agents=[explorer, coder, tester],
    tasks=[task],
    memory=True,
)
```

除非为某个智能体单独指定记忆，否则同一个 Crew 中的所有智能体共享 Crew 的记忆。

## CrewAI 中的检查点

检查点是智能体进度的快照，包含配置、任务状态、记忆、中间结果、输入和执行历史。

默认情况下，每当一个任务完成时，CrewAI 都会创建检查点，使工作流在中断后可以从该位置恢复。

检查点可以存放在两种内置存储中：

- **JsonProvider** 把每个检查点保存成单独的 JSON 文件，便于人工读取和检查。
- **SqliteProvider** 把全部检查点存进一个 SQLite 数据库，更适合频繁保存和规模较大的工作负载。

![检查点存储提供器](https://pbs.twimg.com/media/HNMUERcbAAAxOdL?format=jpg&name=large)

```python
from crewai import Crew

crew = Crew(
    agents=[explorer, coder, tester],
    tasks=[task],
    checkpoint=True,
)
```

Crew、Flow 和 Agent 都接受 `checkpoint` 参数；除非子级显式设置自己的值，否则会继承父级配置。

# 把所有部分组合起来

下面是在一项任务中使用完整 Harness 的示例：执行循环、工具、规划、子代理、沙箱和记忆协同工作。

```python
from crewai import Agent, Crew, LLM, Process, Task
from crewai.tools import tool
from crewai_tools import (DirectoryReadTool, FileReadTool, FileWriterTool,
E2BExecTool, E2BPythonTool)

llm = LLM(model="anthropic/claude-sonnet-4.6")

list_dir = DirectoryReadTool(directory="./workspace")
filesystem_tools = [FileReadTool(), FileWriterTool(), list_dir]
sandbox_tools = [exec_tool, E2BPythonTool()]

@tool("run_tests")
def run_tests(path: str = "tests/") -> str:
    """Sync ./workspace into the sandbox, then run pytest there."""
    return E2BExecTool().run(command=sync_and_test_command(path))

explorer = Agent(role="Codebase Explorer", goal="Map repo, surface relevant files.",
    tools=[read_file, list_dir], llm=llm)
coder = Agent(role="Software Engineer", goal="Implement requested change.",
    tools=filesystem_tools, reasoning=True, llm=llm)
tester = Agent(role="Test Runner", goal="Run tests in sandbox, report pass/fail.",
    tools=sandbox_tools + [read_file] + [run_tests], llm=llm)
manager = Agent(role="Engineering Lead", goal="Delegate steps, finish once tests pass.",
    allow_delegation=True, llm=llm)

task = Task(
    description="In ./workspace, {objective}. Explore, edit, test, report.",
    expected_output="Summary of changes and test output.", human_input=True,
)
crew = Crew(
    agents=[explorer, coder, tester], tasks=[task],
    manager_agent=manager, process=Process.hierarchical,
    planning=True, memory=True, checkpoint=True,
)
result = crew.kickoff(inputs={"objective": "fix failing tests in account.py"})
```

当成功与否可以自动检查时，智能体 Harness 最容易被评估。测试套件为智能体提供了明确目标，因此它可以不断规划、编辑、测试和重复，直到全部通过。

作者在一个小型代码库上进行了测试：其中有一个包含两个真实 Bug 的 `BankAccount` 类和五项测试，起初三项失败、两项通过。规则是只能修改实现，不能修改测试。

这与 Anthropic 内部评估编程智能体的方式相似。一个已公开的例子是，让 Claude 面对一大套失败测试，重新构建 [claude.ai](https://claude.ai/) 界面的克隆版本。

在这里，这套 Harness 把项目从三项失败、两项通过，推进到五项全部通过；“只能修改实现”的规则也封死了编辑或删除失败测试这条捷径。

![Harness 评估结果](https://pbs.twimg.com/media/HNMVeICbgAA0qaB?format=jpg&name=large)

# 哪些仍然是你的工作

系统中有一些部分不是框架能替你构建的：

- **提示词。** 每个智能体的行为来自它的角色、目标和背景设定。把这些内容设计好需要测试和迭代，没有任何配置开关可以替代这项工作。
- **执行环境。** 无论选择 E2B 还是自建虚拟机，沙箱都必须由你完成设置和接入。
- **工具选择。** 每个智能体拿到哪些工具、哪些智能体应当拥有什么权限，是框架不会替你做出的设计决策。

Harness 本身也有成本。规划、子代理和循环都会增加 API 调用，因此复杂的智能体配置可能比一次模型调用就能解决的任务更加昂贵。

还有一个需要牢记的长期限制：随着模型能力提高，部分脚手架会变得不再必要，因为今天被构建进 Harness 的某些功能，只是在绕过当下模型的局限，而不是永久需求。

Anthropic 最初会重置上下文，避免 Claude Sonnet 4.5 过早结束任务；到能力更强的 Claude Opus 4.5 时，这种做法已经不再需要。

![模型进步会改变 Harness 脚手架](https://pbs.twimg.com/media/HNMVomkbcAAGua3?format=jpg&name=large)

# 总结

核心发现就是这些：编程智能体的能力主要存在于 Harness 中，而智能体编排框架能交给你的 Harness 能力，比你预想的更多。

循环、规划、委派、沙箱和记忆都可以通过配置获得；提示词、执行环境和工具选择则仍然是你的责任。

如果你想在自己的代码库中运行这套方案，CrewAI 文档覆盖了本文使用的全部功能，而且框架完全开源。

[查看 CrewAI 文档 →](https://docs.crewai.com/)

[查看完整代码 →](https://github.com/patchy631/ai-engineering-hub/tree/main/build-code-harness)

感谢阅读！

Cheers! :)
