---
externalId: "we-rewrote-our-agent-durable-object-pi-agents-sdk-code-mode"
kind: "article"
title: "我们用 Pi、Agents SDK 和 Code Mode 重写了智能体，使其完全运行在 Durable Object 中"
description: "Miguel 讲述 camelAI 如何用 Durable Objects、SQLite、R2、Pi、Code Mode、动态 Workers 和按需 Linux 容器取代常驻虚拟机。"
date: 2026-07-28
sourceUrl: "https://x.com/Vercantez/status/2082138839888589200"
cover: "https://pbs.twimg.com/media/HOU-LQ3aMAEVDxm?format=jpg&name=large"
tags: ["Durable Objects", "Pi", "Agents SDK", "Code Mode", "camelAI"]
featured: true
draft: false
---

[原文：We rewrote our agent to run entirely in a Durable Object with Pi, Agents SDK and Code Mode — Miguel / @Vercantez](https://x.com/Vercantez/status/2082138839888589200)

![图片](https://pbs.twimg.com/media/HOU-LQ3aMAEVDxm?format=jpg&name=large)

我们最近完成了 camelAI 智能体脱离虚拟机的迁移。现在，智能体运行在 [Cloudflare Durable Object](https://developers.cloudflare.com/durable-objects/) 内部，文件系统位于 SQLite 和 R2 中，并且它编写的是 JavaScript，而不是 bash。大多数团队会让编程智能体运行在完整的 Linux 虚拟机或容器沙箱中，我们以前也是如此。

我们想摆脱虚拟机，是因为为每个用户提供一台挂载磁盘、持续运行的机器，扩展成本实在太高。难点在于，编程智能体默认自己身处 Linux 环境。它们在训练中已经习惯于调用 bash，而我们最初上线时使用的智能体运行框架（harness）又要求一台完整虚拟机，因此要走到今天这一步，我们先后经历了三次重新设计。代价是，智能体现在只能执行那些我们已经为其构建了明确方法的操作。这听上去像是一种限制，但事实证明，它对产品反而是件好事。

我是 Miguel，camelAI 的 CTO。我们的代码库最近已经开源，因此本文提到的所有内容都有实际代码可供查看，仓库位于 [github.com/qaml-ai/camelAI](https://github.com/qaml-ai/camelAI)。下面我会随着讲述逐一链接到相关文件。这是整个演进过程。

## 第零步：虚拟机时代

我们最初基于 Claude Code harness 上线，而它必须在完整的虚拟机中运行。我们尝试过多家虚拟机提供商，但没有一家能同时满足我们的持久化和性能要求，最后只好[自己构建了一套容器服务](https://camelai.com/blog/we-tried-every-container-service-then-built-our-own)。那篇文章现在仍然可以访问，不过我们已经不再运行其中的任何基础设施。

这套容器服务确实能用，但非常沉重。为每位用户持续运行一台虚拟机成本很高，把每位用户的文件保存在高速挂载磁盘上同样昂贵。扩展这套系统，就意味着扩展由真实机器和真实磁盘组成的基础设施；按照我们希望达到的用户规模，成本将高得难以承受。因此，我们没有继续钻研如何把虚拟机编排做得更巧妙，而是开始围绕“彻底不需要虚拟机”来设计系统。

## 第一步：把智能体移出虚拟机

Claude Code harness 与它所在的虚拟机密不可分，因此第一步是构建我们自己的 harness。我们基于 Mario Zechner 的开源编程智能体 [pi](https://github.com/badlogic/pi-mono) 来实现它。pi 是一套分层的库：最高层假设自己运行在常规操作系统上，但较低层只提供智能体循环、状态管理等智能体基础能力，并不关心实际运行位置。我们没有修改 pi 的任何代码，而是直接导入这些底层库，在其上构建了[自己的 harness](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/chat-thread-do.ts)，让它运行在 Cloudflare Durable Object 内部，而不是 Linux 环境中。

Durable Object 是一个小型、有状态的计算实例，会在 Cloudflare 边缘网络中靠近创建它的用户的位置启动。每个聊天线程都有自己的 Durable Object；仅仅这一变化，就比让所有流量都经过集中式虚拟机主机显著降低了延迟。

在这个阶段，我们仍然保留了虚拟机，只是智能体本身不再住在虚拟机里。需要运行命令时，它会远程调用虚拟机。Anthropic 在介绍其托管智能体时也描述过同样的拆分方式：把“大脑”与“双手”分开。这为我们带来了一些很好的特性：

- 智能体可以在虚拟机唤醒之前就开始响应，因为它无须等待机器启动。
- 智能体继续工作时，虚拟机可以重新休眠；如果当前轮次不需要执行任何命令，它甚至完全不必唤醒。
- 一个“大脑”可以控制多双“手”。单个智能体可以同时操作多台虚拟机。

我们把这些“双手”称为项目（projects）。每个项目都有一台用于执行命令的虚拟机，以及一个通过 [Cloudflare Artifacts](https://developers.cloudflare.com/artifacts/) 以编程方式创建的 Git 仓库。Artifacts 是一种兼容 Git 的存储服务，可以由 Worker 随时按需创建。智能体并不知道自己实际上运行在虚拟机外部；它仍然可以使用 bash，工作方式与其他编程智能体一样。

问题是，这套方案只解决了延迟，其他问题一个也没有解决。每位用户仍然对应一台虚拟机，因此原有设计中的成本与扩展问题依旧存在。

## 第二步：移除虚拟机

下一版保留了同样的项目结构，但移除了项目背后的虚拟机。现在，每个项目都由一个[位于 Durable Object 内部的文件系统](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/workspace-filesystem-do.ts)提供支持，并使用 [R2](https://developers.cloudflare.com/r2/) 存放较大的文件。

这并不是我们的原创。Cloudflare 的 Agents 团队构建了 [Shell](https://www.npmjs.com/package/@cloudflare/shell)，这是面向 Workers 的实验性文件系统与执行运行时，我们大量复用了其中的代码。其机制很简单：Durable Object 的存储是一个容量上限为 10 GB 的 SQLite 数据库，而且每一行都有大小限制。小文件直接保存在 SQLite 行中；超过约 1.5 MB 的文件会写入 R2，而 SQLite 行只保存一个指针。对智能体来说，它看上去就像普通文件系统；但在底层，它其实是数据库和对象存储。因此，持久化的对象只是存储数据，而不再是我们必须持续维持运行的基础设施。

版本历史仍然通过 Artifacts 管理，因此无须自行托管 Git 服务器，每个项目也能保留完整的 Git 历史。

## 第三步：移除 bash

移除 bash 当时感觉是个非常激进的决定。编程智能体在训练中已经习惯调用 bash，而 bash 本身正是大家一开始需要把智能体放进虚拟机的原因。除了成本之外，它还带来了另一个问题：拥有 bash 和网络访问权限的智能体，必须取得凭据才能完成有用的工作；而我们尝试过的带鉴权代理 URL 方案，正变得越来越取巧，也越来越难以严格约束。

所以我们移除了 bash。智能体改为编写 JavaScript，并通过 [Code Mode](https://blog.cloudflare.com/code-mode/) 和 Cloudflare 的[动态 Worker 加载器](https://blog.cloudflare.com/dynamic-workers)执行。每次执行都会在一个全新的 V8 隔离实例中运行，它能在毫秒内启动，只使用几 MB 内存。沙箱预先加载了用户的数据连接，以及[平台全部能力所对应的方法](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/code-mode-tools.ts)。凭据永远不会进入沙箱。智能体调用连接提供的方法，身份验证则在我们这一侧完成。

当你真正观察智能体用 bash 做什么时，会发现失去它的代价比想象中小。绝大多数操作都是文件处理，而智能体已经有原生工具可以完成这些事情。我们为它提供了读取、写入和编辑工具，以及自己实现的 [grep 和 glob](https://github.com/qaml-ai/camelAI/blob/main/workers/main/src/pi-container-tools.ts)。这已经覆盖了 80/20 法则中的大多数需求。剩余部分是针对具体任务的具体命令，于是我们把它们变成了明确的方法：

- 以前通过代理执行的 `wrangler deploy`，变成了一个由我们完全控制的 `deploy_project` 方法。因为现在能够准确知道部署何时发生，我们可以在部署时挂接后续流程，自动打开实时预览。过去，我们只能嗅探经过代理的 wrangler 流量，猜测究竟是哪一个线程部署了内容。
- 构建用户应用和运行 Python notebook 分别成为独立的方法，两者都由短生命周期容器提供支持。

我们为这两项工作保留了容器，因为它们确实需要 Linux。用户应用使用 Vite、Tailwind 和 React Router 构建，添加依赖还需要运行 `bun install`。我们曾考虑直接在 Worker 内构建应用——毕竟被构建的应用本身也是 Worker——但这条路径目前支持并不好，而且 Workers 只有 128 MB 内存上限和一小部分 CPU 算力。构建会非常缓慢，很多项目也会直接超过内存限制。因此，现在每次构建都会通过 [Cloudflare Sandbox SDK](https://github.com/cloudflare/sandbox-sdk)启动一个容器，把项目复制进去，运行任务，返回结果，然后关闭容器。Notebook 运行采用相同的方式。我们仍然会使用完整的 Linux，但仅限于那些真正需要它的几秒钟工作。

必须坦诚承认，这种设计的缺点是，我们必须预先判断智能体需要哪些能力。有了 bash，它可以自行摸索解决问题；而现在，如果缺少某项能力，就必须由我们来补充。但在实践中，这种压力对产品是有益的，因为它迫使我们认真思考用户到底在做什么，并为相应任务构建一等支持路径，而不是任由智能体临场发挥。

此外还有一个意料之外的好处。Bash 是开放式的，低成本模型在开放式环境中往往表现不佳。把能力收敛为一组规模更小、边界明确的方法后，这些模型的表现显著改善。这一点很重要，因为让 camelAI 保持低运行成本，正是这套架构存在的意义。

## 最终形成的架构

现在的技术栈是：Durable Objects 承载智能体及其文件系统，R2 存储大文件，Artifacts 保存 Git 历史，pi 作为 harness，Code Mode 与动态 Workers 负责执行。它可以像其他 Cloudflare 应用一样部署，也不再有任何外部容器服务需要管理。

Dynamic Workers 按执行次数计费，而不是按运行时长的秒数计费。在我们评估过的服务中，数千次执行的成本，大约只相当于几分钟容器运行时间。由于所有内容都运行在靠近用户的边缘节点，延迟很低；系统扩展也从我们的问题变成了 Cloudflare 的问题。

用户仍然可以构建全栈应用，并把它们部署到可公开访问的 URL；智能体也仍然能够读取、写入、搜索和部署。从用户视角来看，一切都没有变化。

## 简而言之

我们最初把 Claude Code harness 运行在一套自建虚拟机服务上，但它成本高昂，而且难以扩展。首先，我们把智能体本身移入 Cloudflare Durable Object，让它远程控制虚拟机；这解决了延迟，却没有解决成本。接着，我们完全移除了虚拟机，参考 Cloudflare Shell 项目，把文件系统存储在 Durable Object 的 SQLite 和 R2 中，并通过 Cloudflare Artifacts 保留 Git 历史。最后，我们移除了 bash，通过 Code Mode 和动态 Workers 为智能体提供 JavaScript 沙箱，并为部署、构建和 notebook 提供明确的方法。最终结果是：成本降低了数个数量级，延迟更低，运维更简单，小型模型也更容易驾驭这套系统。所有代码都已在 [github.com/qaml-ai/camelAI](https://github.com/qaml-ai/camelAI) 开源。
