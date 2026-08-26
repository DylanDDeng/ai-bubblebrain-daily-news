---
title: "Pi 的会话存储"
slug: "pi-agent-session-storage"
description: "循环在生产消息，压缩在改写消息——它们最终都落进哪？从源码看 Pi 的会话文件：一行一条记录，parentId 把一列行长成一棵树。"
date: 2026-08-25
lastmod: 2026-08-25
draft: false
weight: 3
sourceUrl: "https://github.com/earendil-works/pi"
tags: ["Pi Agent", "Session", "JSONL", "会话存储"]
---

> 本系列基于 `earendil-works/pi` 仓库的 `dcd4619` 版本编写。Pi 更新很快，具体命令变化时请优先核对[官方文档](https://pi.dev/docs/latest)。

## 一切都落在一个文件里

前两章看到的东西——循环里一轮轮堆出来的消息、压缩生成的摘要——最终都要有个去处。Pi 的答案朴素到可以一句话说完：**每个会话就是一个 JSONL 文件，每发生一件事，就往文件末尾追加一行 JSON**。

文件的位置也完全可预测（来自官方 `session-format.md`）：

```
~/.pi/agent/sessions/--<路径>--/<时间戳>_<uuid>.jsonl
```

其中 `<路径>` 就是你的工作目录，把 `/` 换成了 `-`。也就是说：没有数据库、没有私有格式，`ls` 能列出你的全部会话，`cat` 能直接读。

## 一行一条记录，四个字段起步

每行是一个带 `type` 的 JSON 对象。所有记录共享同一个基座（`packages/coding-agent/src/core/session-manager.ts`）：

```ts
export interface SessionEntryBase {
	type: string;
	id: string;
	parentId: string | null;
	timestamp: string;
}
```

在这个基座上派生出各种 `type`：`message` 只是最常见的一种，**换模型（`model_change`）、调思考强度（`thinking_level_change`）、打标签（`label`）、上一章讲的压缩（`compaction`）和分支摘要（`branch_summary`），统统都是一行记录**。这个设计的好处是：会话里发生过的任何事都有一行可查的痕迹，回放一个会话就是从头把文件读一遍。

## parentId 把一列行长成一棵树

真正的巧思在第三个字段上。每一行都用 `parentId` 指着它的上一行——正常聊天时，这就是一条链；但没有任何规则要求新的一行必须指向"最后一行"：

![会话文件每追加一行，树上长一个节点；当新的一行把 parentId 指回中间某条记录，同一个文件里就长出了分支](/media/pi-agent-tutorials/pi-session-jsonl.svg)

想从对话中间的某个点重来一次？往文件里追加一行，`parentId` 指回那个点就行——**同一个文件里就长出了分支，不需要复制任何东西**（官方文档的说法是 *in-place branching without creating new files*）。你此刻看到的"对话"，其实是从最新的叶子沿着 `parentId` 一路回溯到根的那条路径。

这就是下一批章节里 `/tree`、分支和恢复的全部底层：所谓切换分支，只是换了一片叶子重新回溯。

## 崩溃也不会写坏文件

存储层还有个值得一看的细节。日常写入是纯追加，本身就很难出错——进程崩溃最多丢掉正在写的最后一行。而当需要整体重写文件时（比如把老版本会话迁移到新格式），Pi 用的是"先写临时文件、再原子改名"（`packages/agent/src/harness/session/jsonl/storage.ts`）：

```ts
async function publishFileAtomically(
	fs: JsonlSessionRepoFileSystem,
	destinationPath: string,
	populate: (tempPath: string) => Promise<void>,
): Promise<void> {
	const tempPath = `${destinationPath}.tmp`;
	try {
		await populate(tempPath);
		fileResult(await fs.renameFile(tempPath, destinationPath), `Failed to publish staged file ${destinationPath}`);
	} catch (error) {
		await fs.remove(tempPath, { force: true });
		throw error;
	}
}
```

源码注释把意图讲得很清楚：目标文件在改名提交之前一个字节都不会被碰——中途崩溃，最坏结果只是留下一个会被忽略的 `.tmp` 文件，你的会话永远完好。

## 实践上你需要知道的

- **会话文件是你的**：纯文本 JSONL，`cat`、`jq`、写个脚本分析都行；备份一个会话 = 拷贝一个文件；
- 想删会话，直接删 `.jsonl` 文件，或在 `/resume` 列表里按 `Ctrl+D`（Pi 会优先走系统回收站）；
- 老会话不作废：格式从 v1（线性）演进到 v2（树）再到 v3，加载时自动迁移；
- 别手改文件里的 `id`/`parentId`——树的完整性全靠它们，改坏一行可能让整条分支找不到路。

树上存着全部历史，但每轮发给模型的并不是全部。下一篇看最后一块拼图：Pi 怎么把系统提示词、消息和工具结果现场组装成一份输入。
