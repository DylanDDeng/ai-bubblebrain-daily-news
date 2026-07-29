---
externalId: "templates-variables"
kind: "article"
title: "模板与变量"
description: "HyperFrames 介绍如何用带类型的合成项目变量，将一次视频构建变成可复用模板，并在本地、托管云端和 Lambda 中批量生成个性化视频。"
date: 2026-07-29
sourceUrl: "https://x.com/HyperFrames_/status/2082197435246600341"
cover: "https://pbs.twimg.com/media/HOVxksYaUAAUjJ9?format=jpg&name=large"
tags: ["HyperFrames", "模板", "变量", "视频自动化"]
featured: true
draft: false
---

[原文：Templates & Variables — HyperFrames](https://x.com/HyperFrames_/status/2082197435246600341)

![图片](https://pbs.twimg.com/media/HOVxksYaUAAUjJ9?format=jpg&name=large)

# 30 天第 23 天：把你的视频变成模板

在前 22 天里，这个系列的每次渲染都只会生成一支视频。换一个标题，就意味着重新编辑；换一个名字，就意味着重新渲染。第 23 天打破了这个上限。变量可以把一个 HyperFrames 合成项目变成模板，而模板可以让一次构建根据数据表中的每一行，生成任意数量的视频。

```text
npx hyperframes render --batch rows.json --output "renders/{name}.mp4"
```

一条命令，一个合成项目，一个装满个性化视频的文件夹。

## 什么是变量

变量是在合成项目根节点上声明的带类型占位槽。声明本身就是模式定义（schema），其他所有内容都从这里读取。

```text
<html data-composition-variables='[
  {"id":"title","type":"string","label":"Title","default":"Hello"},
  {"id":"accent","type":"color","label":"Accent","default":"#66d9ef"}
]'>
```

目前支持七种类型：**string**（可选 placeholder 和 maxLength）、**number**（min、max、step、unit）、**color**、**boolean** 和 **enum**（必须提供 options 列表），另外还有 font 与 image 两种类型，用于表示素材形态的值。每项声明都必须提供一个实用的默认值。仅凭这些默认值，合成项目就能够正常预览和渲染；在有人覆盖变量之前，它仍然是一支普通视频。

## 接入变量值，无须编写脚本

大多数替换操作完全不需要 JavaScript。三种声明式绑定覆盖了常见场景：

- `data-var-text="title"` 会替换元素自身的文本，同时保留其子元素，因此用于动画的 span 不会丢失。
- `data-var-src="heroImage"` 会替换图片的 `src`；创作时写入的 `src` 会继续作为回退值。
- 每个标量变量都会自动作为 `--{id}` CSS 自定义属性应用到合成项目根节点，因此 `color: var(--accent)` 无须样板代码就能响应覆盖值。

```text
<h1 class="clip" data-start="0" data-duration="5" data-var-text="title">Fallback</h1>
<img class="clip" data-start="0" data-duration="5" data-var-src="heroImage" src="fallback.jpg" />
```

如果需求不只是直接替换，例如需要循环、条件判断或派生值，可以在初始化时读取一次变量：

```text
const { title = "Untitled", accent = "#66d9ef" } = __hyperframes.getVariables();
```

子合成项目也会按每个实例采用相同机制。借助 `data-variable-values`，同一个 `card.html` 可以在主文件中出现三次，并分别使用三个不同的标题：

```text
<div
  data-composition-id="card-pro"
  data-composition-src="compositions/card.html"
  data-variable-values='{"title":"Pro","accent":"#ff4d4f"}'
></div>
```

## 在渲染时覆盖变量

变量值以普通 JSON 的形式从 CLI 传入：

```text
# 内联 JSON
npx hyperframes render --variables '{"title":"Q4 Report"}'

# 从文件读取
npx hyperframes render --variables-file vars.json

# CI 模式：未声明的键和错误类型都会成为错误
npx hyperframes render --variables '{"title":"Q4"}' --strict-variables
```

接下来这个参数会从根本上改变工具的用途。批处理模式让渲染器读取一个由多行数据组成的文件，而输出路径可以使用每行数据中的 `{key}` 占位符：

```text
npx hyperframes render --batch rows.json --output "renders/{name}.mp4"
```

每一行数据都会覆盖已声明的默认值，效果与单独通过 `--variables` 传入完全相同。输入十行，就会输出十支视频。

## 在云端批量渲染整个视频集

第 21 天介绍了云端渲染，而模板正是那套基础设施存在的理由。这里有两条路径，但思路相同：模板只上传一次，之后的每次渲染只需传入一组新的变量值。

**HeyGen 托管云端。** 首次渲染会上传项目并输出一个 `asset_id`。之后的每次渲染都会复用它，不必重新压缩，也不必重新上传：

```text
# 上传并渲染一次
hyperframes cloud render ./card-template

# 使用新变量再次渲染，完全跳过上传
hyperframes cloud render --asset-id asst_abc123 --variables '{"name":"Ada"}'
hyperframes cloud render --asset-id asst_abc123 --variables '{"name":"Linus"}'
```

**你自己的 AWS。** 只需部署一次 Lambda 技术栈，再通过 `lambda sites create` 上传一次模板，然后向 `lambda render-batch` 提供一个 JSONL 文件，每位接收者占一行。每一行都是一个拥有自身 `outputKey` 和 `variables` 的对象。默认情况下，它会并发运行 50 个渲染任务：

```text
hyperframes lambda render-batch ./my-template \
  --site-id abc1234deadbeef0 \
  --batch ./recipients.jsonl \
  --width 1920 --height 1080
```

对于本地项目，CLI 会在上传任何内容之前，按照已声明的模式定义校验变量。对于使用 `asset-id` 的渲染，校验会在服务端完成。

## 实践笔记

- **两种 JSON 结构很容易混淆。** 声明是由 `{id, type, label, default}` 对象组成的数组；变量值则是一个以 `id` 为键的对象。把两者混在一起，是最常见的变量使用错误。
- **优先级按合成项目分别计算，并不存在一条全局覆盖链。** 子合成项目先读取自己的默认值，再由宿主元素上的 `data-variable-values` 覆盖。CLI 变量值只覆盖顶层合成项目，绝不会传递到子合成项目。
- **并非所有内容都能成为变量。** 画布尺寸、根节点时长、帧率和编解码器会在编译时一次性解析。变量改变的是内容，不是承载内容的容器。
- **媒体 `src` 不能通过变量替换。** `data-var-src` 对 `\\<img>` 有效；但对于 `\\<video>` 和 `\\<audio>`，渲染器会播放并混合创作时写入的 `src`，所以变量替换后的 `src` 不会进入最终输出。如果要改变由框架管理的媒体，请修改创作时的 `src`，并为每个片段使用一个子合成项目实例。
- **变量传递的是数据，不是文件。** 所有部署目标都遵循同一约定：带类型的值放进变量，媒体素材则使用 URL 引用，由合成项目在渲染时解析。

## 今天的视频是如何制作的

今天的影片本身就是这个功能的演示。项目中只有一个卡片合成项目 `compositions/card.html`，它声明了三个变量：标签、标题和强调色。主文件把这个模板实例化了八次。第一个实例完全没有传入变量，因此你看到的是卡片仅使用其声明的默认值运行。接着，Austin、Seattle、Atlanta 和 Miami 分别通过新实例上的 `data-variable-values` 传入覆盖值；最后的收尾网格则由另外四个并排实例组成。画面中的任何内容都没有被重复设计。四座城市的市场更新，只使用一个模板；每次变化的仅仅是一行 JSON 数据。

## 输出

第 23 天的最终视频：22 秒，四座城市，一个模板。

<video preload="none" tabindex="-1" playsinline="" aria-label="嵌入视频" poster="https://pbs.twimg.com/amplify_video_thumb/2082196246132092928/img/UndjWtJC1tc33Zq0.jpg" style="width: 100%; height: 100%; position: absolute; background-color: black; top: 0%; left: 0%; transform: rotate(0deg) scale(1.005);"><source type="video/mp4"></video>

![](https://pbs.twimg.com/amplify_video_thumb/2082196246132092928/img/UndjWtJC1tc33Zq0.jpg?name=large)

⭐ 如果这个系列对你有帮助，请为 [HyperFrames 仓库加星](https://github.com/heygen-com/hyperframes)。

- 变量文档：[hyperframes.heygen.com/concepts/variables](https://hyperframes.heygen.com/concepts/variables)
- 云端模板：[hyperframes.heygen.com/deploy/cloud](https://hyperframes.heygen.com/deploy/cloud#templates-and-variables)
- Lambda 模板：[hyperframes.heygen.com/deploy/templates-on-lambda](https://hyperframes.heygen.com/deploy/templates-on-lambda)
- 安装 skills：`npx skills add heygen-com/hyperframes`
