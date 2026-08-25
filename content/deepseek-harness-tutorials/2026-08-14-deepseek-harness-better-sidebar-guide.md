---
title: "better-sidebar 插件：把 Harness 变成完整开发工作台"
slug: "deepseek-harness-better-sidebar-guide"
description: "安装 dsh-better-sidebar，并实测文件编辑、Git diff、真实终端、Markdown 预览、内嵌浏览器和移动端侧栏。"
date: 2026-08-14T05:00:00Z
weight: 9
tags: ["DeepSeek Harness", "better-sidebar", "插件", "开发工作台", "新手教程"]
author: "BubbleBrain"
sourceUrl: "https://github.com/omdsh-dev/DSH-better-sidebar"
---

> 这不是一篇照着 README 改写的功能清单。我把 `dsh-better-sidebar@0.10.3` 装进一个全新的临时 Web profile，建立了独立 Git 测试仓库，并在真实 DSH Web UI 中完成文件保存、Git diff、终端命令、Markdown 预览、网页沙箱和 390px 移动端测试。

## 它解决什么问题

DeepSeek Harness 的 Web UI 适合和 Agent 对话，但开发任务还会频繁用到文件树、编辑器、终端、Git 和预览。`dsh-better-sidebar` 把这些能力放进同一个页面：桌面端是右侧栏加底部面板，移动端则合并为全宽抽屉。

![安装插件后的 DeepSeek Harness Web 工作区](/media/deepseek-harness-tutorials/better-sidebar/workspace-overview.png)

_本文实测截图。右侧 Explorer 直接显示当前会话工作区，页面中央仍然保留 Harness 对话区。_

它不是另一套独立 IDE，也不会替换 Harness。插件通过 `web` profile 挂载，工作区和会话仍由 DSH 管理；右侧栏只是把开发时常用的操作放到对话旁边。

## 安装前准备

当前 `0.10.3` 版本要求：

- Node.js 20 或更高版本。
- pnpm 10 或更高版本。
- DeepSeek Harness Web profile 已经初始化。

先检查环境：

```bash
node --version
pnpm --version
dsh --version
```

如果从未启动过 Web UI，先运行一次：

```bash
dsh web
```

看到地址后可以先退出。这个步骤会创建 `~/.dsh/profiles/web`，否则安装脚本会提示找不到 profile。

## 安装到 Web profile

仓库提供的一键安装方式是：

```bash
curl -fsSL https://raw.githubusercontent.com/omdsh-dev/DSH-better-sidebar/main/scripts/install.sh | bash
```

`curl | bash` 会直接执行远程脚本。更谨慎的做法是先下载并阅读脚本，或者像本文实测一样使用官方插件 CLI，并固定已经核对过的版本：

```bash
dsh plugin --profile web add dsh-better-sidebar@0.10.3
```

安装完成后检查：

```bash
dsh plugin --profile web list
```

列表中应出现：

```text
dsh-better-sidebar@0.10.3
```

然后重启 Web UI，并在浏览器中硬刷新：

```bash
dsh web
```

```text
macOS: Cmd + Shift + R
Windows / Linux: Ctrl + Shift + R
```

### 本次实测遇到的安装坑

在 macOS 自带的 Bash 3.2 中，我运行仓库当前 `0.10.3` 的 `scripts/install.sh` 时，脚本在打印 workspace 配置结果的位置报了 `WS_YML... unbound variable`。原因是状态文案把中文全角冒号紧跟在 `$WS_YML` 后面；手动执行上面的 `dsh plugin --profile web add` 后，插件正常安装并自动加入 `dsh.profile.bundles`。

安装过程还可能出现很多 peer dependency warning。本文的临时 profile 也出现了 warning，但最终依赖和 bundle 都正确登记，Web UI 可以正常启动。判断是否成功时，以命令退出结果、`dsh plugin ... list` 和页面是否出现侧栏为准。

如果安装提示 `Ignored build scripts`，到 Web profile 中放行 `node-pty` 与 `protobufjs` 的构建脚本：

```bash
cd ~/.dsh/profiles/web
pnpm approve-builds --all
```

## 第一次打开侧栏

进入一个 DSH 会话后，页面右上角会出现侧栏与底部面板开关。打开侧栏，默认的 Explorer 以当前会话的 `cwd` 为根目录，不会浏览到其他工作区。

点击顶部的 `+` 可以新建标签页，当前版本内置：

- Explorer：文件树。
- Source Control：Git 状态、diff 和历史。
- Tasks：子代理与后台任务。
- Terminal：真实 shell。
- Browser：内嵌网页。

标签页可以放在右侧栏，也可以放在底部面板。对第一次使用的人，我建议右侧保留 Explorer 和 Source Control，底部只放 Terminal；对话区不会被切得太窄。

## Explorer 与编辑器实测

我在测试仓库中打开 `src/example.ts`，修改两个状态值，再点击 Save。随后从外部终端读取文件，内容确实已经写回磁盘；这不是只存在浏览器内存里的草稿。

编辑器基于 CodeMirror 6，保存方式有两种：

```text
点击 Save
Cmd/Ctrl + S
```

Explorer 的文件行还有 `@file` 按钮，用来把路径引用到聊天输入框。它和“打开文件”是两个操作：想让 Agent 阅读文件时用 `@file`，想自己查看或编辑时点击文件名。

## Git diff 实测

保存后打开 Source Control，修改过的文件立刻出现在 `UNSTAGED` 列表。点击文件会在下方分栏显示真正的 Git diff。

![Source Control 与 VS Code 风格的 Git diff](/media/deepseek-harness-tutorials/better-sidebar/editor-git-diff.png)

_本文实测截图。上方显示未暂存文件与提交历史，下方 diff 能清楚区分删除和新增内容。_

这一段我实际验证了状态刷新和未暂存 diff。界面也提供 Stage、Commit、放弃修改、还原与捡取等入口，但测试仓库没有远端，因此我没有把 UI 提交误写成“已经验证 push”。当前版本本来就不提供 push、pull 或 fetch；远端操作仍要回到终端。

## 底部真实终端实测

展开底部面板后，插件会创建一个 xterm.js 终端。它不是命令示意图，而是通过 `node-pty` 连接到真实 shell，并且启动目录就是会话工作区。

我在界面中依次运行：

```bash
pwd
git status --short
```

![底部终端与右侧 Git diff 同时工作](/media/deepseek-harness-tutorials/better-sidebar/terminal-panel.png)

_本文实测截图。`pwd` 指向测试 workspace，`git status --short` 与右侧 Source Control 显示同一项修改。_

每个会话最多可以同时保留 3 个 UI 终端。终端 Tab 在同一位置切换时会保活；如果把它拖进另一个分栏，组件会重新挂载，shell 也会重开，因此不要在拖动前留下未保存的交互状态。

## Markdown 与文件预览

点击 `notes.md` 后，插件直接渲染标题、引用和任务列表，还可以在 Preview 与 Edit 之间切换。

![Markdown 文件的内联预览](/media/deepseek-harness-tutorials/better-sidebar/markdown-preview.png)

_本文实测截图。Markdown 预览与另一个 Git diff 分栏可以同时保留。_

本文亲自验证了 Markdown 预览。当前插件还声明支持图片、HTML、PDF、DOCX、XLSX 和 PPTX；这些查看器采用按需加载，所以 Office 文件第一次打开会明显更慢。XLSX 使用社区版解析器，不保留完整单元格样式，不适合把它当成 Excel 的等价替代品。

HTML 预览只渲染已经保存的文件。修改 HTML 后如果预览没有变化，先保存，再点 Refresh。

## 内嵌浏览器与安全边界

Browser 标签页可以打开普通外部网页。本文用 `https://example.com/` 实测成功，页面运行在不透明源的 sandbox iframe 中。

![Browser 标签页以沙箱方式打开外部网页](/media/deepseek-harness-tutorials/better-sidebar/browser-sandbox.png)

_本文实测截图。地址栏下方显示 Sandbox mode；默认不要点击 “Temporarily disable (unsafe)”。_

我还输入了本机地址 `http://127.0.0.1:3090/`，插件的 `/sidebar/api/browser.probe` 返回 `400`，错误为 `local addresses are not probed`。它也拒绝 `javascript:`、`data:` 和 `file:` URL。

这条边界很重要：内嵌浏览器适合查文档和预览可嵌入网页，不是带完整登录态的普通浏览器。第三方 Cookie、登录弹窗、`X-Frame-Options` 或 `frame-ancestors` 都可能让某些站点无法使用。遇到这种情况，点击 Open in browser，交给系统浏览器处理。

## 设置 Side card

进入 Settings → Side card，可以控制新会话是否默认展开、默认宽度、聊天文件是否在侧栏打开，以及每一种 Tab 和 Viewer 是否启用。

![Side card 的标签页与文件查看器设置](/media/deepseek-harness-tutorials/better-sidebar/settings-side-card.png)

_本文实测截图。卡片高亮表示启用；Terminal、Tasks 和 Browser 还有自己的二级设置。_

比较稳妥的起始配置是：

| 设置 | 建议 |
| --- | --- |
| Open by default | 开；如果屏幕较小则关 |
| Default width share | 30% |
| Open chat files in sidebar | 开 |
| Terminal tools for model | 先关，只在明确需要时开 |
| Browser sandbox | 保持开启 |
| Auto-open terminal | 按使用习惯决定 |

## 移动端实测

我把视口切到 `390 × 844`。小于 768px 后，桌面端底部面板消失，其中的 Terminal 标签会并入右侧栏标签条；整个工作台变为全宽抽屉，不再把聊天区挤成一条窄列。

![390px 宽度下的全屏侧栏与合并后的分栏](/media/deepseek-harness-tutorials/better-sidebar/mobile-sidebar.png)

_本文实测截图。Explorer、编辑器、Source Control 和原底部 Terminal 都集中在移动端侧栏中。_

这套响应式策略适合偶尔在手机上查看文件和 diff，但不等于移动端 IDE：窄屏没有独立底部面板，复杂拖拽和长时间编辑仍然更适合桌面端。

## 我实际验证了什么

| 能力 | 本文结果 |
| --- | --- |
| 安装 `0.10.3` 并挂载 Web bundle | 已验证 |
| Explorer 浏览测试仓库 | 已验证 |
| CodeMirror 编辑并写回磁盘 | 已验证 |
| Git status 与未暂存 diff | 已验证 |
| xterm 运行 `pwd`、`git status --short` | 已验证 |
| Markdown 预览 | 已验证 |
| 外部网页沙箱 | 已验证 |
| localhost 拦截 | 已验证 |
| Settings → Side card | 已验证 |
| 390px 移动端合并面板 | 已验证 |
| DOCX / XLSX / PPTX 预览 | 仅依据仓库说明，本篇未逐项测试 |
| 子代理拓扑与后台任务终止 | 仅依据仓库说明，本篇未启动模型任务 |

这个区分能避免把“界面里有按钮”误当成“完整工作流已经验证”。

## 已知限制

- Git 面板没有 push、pull、fetch。
- 文件树没有 watcher，外部改文件后要手动 Refresh。
- 终端跨分栏移动会重开 shell。
- Office 查看器第一次加载较慢，XLSX 不保留完整样式。
- 浏览器沙箱没有普通浏览器的完整登录态，部分网站禁止 iframe。
- HTML 预览只显示已经保存的内容。
- 移动端没有独立底部面板。

## 更新、卸载与回滚

更新到 npm 当前版本：

```bash
dsh plugin --profile web add dsh-better-sidebar
```

固定回本文测试版本：

```bash
dsh plugin --profile web add dsh-better-sidebar@0.10.3
```

卸载：

```bash
dsh plugin --profile web remove dsh-better-sidebar
```

每次更新或卸载后都要重启 `dsh web` 并硬刷新。如果页面出现两个侧栏，检查 `~/.dsh/profiles/web/cordis.patch.yml` 是否还保留旧版手工 `better-sidebar` 挂载；npm bundle 和手工挂载同时存在会重复加载。

插件源码、安装脚本和更新说明请查看 [DSH-better-sidebar 仓库](https://github.com/omdsh-dev/DSH-better-sidebar)。如果你只想先获得最大收益，装好后先用 Explorer、Git diff 和 Terminal 三项，等工作习惯稳定后再逐步打开 Browser、Tasks 与 Office 查看器。
