---
externalId: "the-making-of-cursors-icons"
kind: "article"
title: "Cursor 图标是怎样做出来的"
description: "Marek Minor 复盘一年时间里如何手工设计、校准、迁移并交付 Cursor 的 600 多枚图标，以及怎样把一致性变成可持续的设计基础设施。"
date: 2026-08-19
sourceUrl: "https://www.minoradventures.co/blog/the-making-of-cursors-icons"
cover: "/media/highlights/the-making-of-cursors-icons/final-main.png"
tags: ["Cursor", "图标设计", "设计系统", "Figma", "产品设计"]
featured: true
draft: false
---

[原文：The Making of Cursor's Icons](https://www.minoradventures.co/blog/the-making-of-cursors-icons)

*作者：Marek Minor｜原文发布于 2026 年 7 月 28 日*

为全世界最受欢迎的编程智能体绘制、测试并发布一套完整图标系统，花了一整年。

今年早些时候，Cursor 悄然上线了全新的图标。我是这套图标的设计者，所以想分享它们是怎样诞生的：一方面让大家看到，一件看似微小的东西背后需要投入多少心思；另一方面也希望刚入门的设计师能够了解，这类工作在现实中究竟怎样完成。

整个项目持续了大约一年，覆盖 600 多枚图标、两种尺寸和两种风格。所有探索稿和每一枚最终图标的变体，都是逐一手工绘制的。

![Cursor 完整图标集](/media/highlights/the-making-of-cursors-icons/final-main.png)

![Cursor 图标的填充版本](/media/highlights/the-making-of-cursors-icons/final-filled.png)

![Cursor 界面中的新图标](/media/highlights/the-making-of-cursors-icons/final-ui.png)

![Composer 界面中的图标](/media/highlights/the-making-of-cursors-icons/final-compose.png)

![上下文菜单中的图标](/media/highlights/the-making-of-cursors-icons/final-menu.png)

![用图标组成的视觉字谜](/media/highlights/the-making-of-cursors-icons/final-rebus.png)

*Cursor 的新图标系统。*

## 告别旧图标集

去年，Cursor 开始逐渐走出它最初依托的 VS Code 生态，图标也随之发生变化。旧图标集继承自 [**Codicons**](https://github.com/microsoft/vscode-codicons)，也就是 VS Code 使用的开源图标；除此之外，还有一些多年间陆续添加、风格略有差异的自定义图标。

Codicons 是为另一个时代、另一款产品绘制的，后来整个集合也逐渐发生漂移。我清点时得到了 468 枚，文档写的是 498 枚，还有一些码位根本没有对应内容。对于一个继承而来的图标集，这并不罕见：只要没有人持续负责，系统就会慢慢漂移。

![Codicons 图标集概览](/media/highlights/the-making-of-cursors-icons/codicons-a.png)

![Codicons 图标细节](/media/highlights/the-making-of-cursors-icons/codicons-b.png)

![Codicons 在界面中的使用](/media/highlights/the-making-of-cursors-icons/codicons-c.png)

*建立在 VS Code 生态之上，也意味着继承它的图标集 [Codicons](https://github.com/microsoft/vscode-codicons)。*

更大的问题是**概念覆盖范围**。Cursor 持续引入的一些概念，在任何通用图标库里都不存在；还有一些虽然能找到，但从来没有在同一套图标中完整出现：AI Agent、并行与串行执行、单线程与并行线程、不同级别的思考强度、成本与算力、Bugbot，以及许多其他概念。

通用图标集可以勉强延伸一段时间，但产品发展到某个阶段，就必须拥有自己的视觉词汇。

所以实际任务可以归纳成三点：

- 把全部图标重新绘制成一个统一系统；
- 覆盖 Cursor 独有的产品概念；
- 以图标字体交付，并且替换旧字体时不能破坏任何已有引用。

最后一点对整个项目的影响，比听起来更大，后面还会详细讲到。

## 两种尺寸，两种风格

### 两种尺寸

新图标提供两种尺寸，各自使用独立网格：

- **16px** 是主要尺寸，通常以 16px 显示，但可以缩小到 12px，仍然保持可读性。描边宽度为 1.25px。
- **24px** 是稍大的版本，描边略粗，为 1.5px；只要额外空间允许，就会加入更多细节。

<video controls playsinline preload="metadata"><source src="/media/highlights/the-making-of-cursors-icons/sizes_smaller.mp4" type="video/mp4"></video>

*两种尺寸：24px 版本拥有更丰富的细节和更粗的描边。*

之所以需要两种尺寸，是因为一枚图标可以被缩放的范围终究有限。16px 图标绘制在 16px 网格上，使用 1.25px 描边，大约从 12px 到 20px 都能保持良好效果。

超过这个范围以后，所有元素都会一起被放大：显示到 32px 时，1.25px 描边会变成 2.5px，比设计师在该尺寸下正常选择的线条粗得多。而且小图标已经针对小尺寸进行了简化，放大后多出来的空间只会空着，无法承载本可以加入的细节。

所以从 22px 开始，系统会改用 24px 版本。它绘制在自己的网格上，使用 1.5px 描边，并在空间允许时增加细节。这和字体设计中的光学字号很相似：Text 与 Display 使用不同的字形版本，而不是把同一张图简单放大或缩小。

### 找到 1.25px

找到 1.25px 这个描边宽度花了不少时间。1px 放在文字旁边显得太细，很难准确解释原因，只是感觉支撑不住自己；1.5px 又显得过重。

使用 1.25px 时，16px 图标放在 Cursor 的定制字体 Cursor Gothic 旁边，看起来刚刚好。遇到这类决定，只能相信眼睛。最终记录下来的数字，不过是视觉判断已经完成之后留下的结果。

![1px 太细，1.5px 太粗，1.25px 刚刚好](/media/highlights/the-making-of-cursors-icons/stroke-width.png)

*1px 太细，1.5px 太粗，1.25px 刚刚好。*

1.25px 描边也意味着图标不会对齐像素网格，这与常见建议相反。为什么？因为这些图标会以 12px、14px、16px 甚至 20px 显示，并不存在唯一可以对齐的网格；在现代显示器上，1.25px 描边依然足够清晰。

如果坚持对齐，就必须为每一种实际显示尺寸单独设计。因此我把它们当成符号来处理，更接近小型 Logo 或字体里的字符，而不是固定尺寸的位图。

### 两种风格

图标包含两种风格：

- **Outline** 图标由描边构成；
- **Filled** 图标由实心形状构成，内部细节直接从填充形状中挖空。

并不是每枚图标都有填充版本，只有产品真正需要的那些才有。这对于如此规模的图标集非常正常。

<video controls playsinline preload="metadata"><source src="/media/highlights/the-making-of-cursors-icons/styles_smaller.mp4" type="video/mp4"></video>

*Outline 与 Filled 两种图标风格。*

### 光学形状

两种尺寸背后都有一套光学形状系统：**方形（Square）**、**圆形（Circle）**、**横向（Horizontal）**与**纵向（Vertical）**。

每一种形状都经过尺寸校准，让基于不同形状构建的图标看起来同样大。例如，一个圆必须比方形实际画得稍大，视觉上才会拥有相同体量。

大多数图标都能归入这四类，但并非全部。对角线形状尤其容易在每一种框架里显得别扭。这时我会选择最接近的一种，通常是圆形，再凭视觉调整。

![两种尺寸对应的四类光学形状](/media/highlights/the-making-of-cursors-icons/optical-shapes.png)

*两种尺寸使用的光学形状。*

<video controls playsinline preload="metadata"><source src="/media/highlights/the-making-of-cursors-icons/optical-shapes-icons_smaller.mp4" type="video/mp4"></video>

*按光学形状分组的部分图标。*

## 构造方法

这套图标更接近技术制图，而不是有机图形——它们像带有友好收尾的示意图。

整套系统采用一致的构造方法：先从水平线、垂直线或 45° 斜线开始；概念需要时再允许其他角度；最后逐渐把转角变圆，直到形状与表达的概念一致。

例如，一朵云并不是用几个圆拼出来的，而是从直线段开始，再把连接处变圆。火焰图标也用同样方式构造：倾斜线段加圆角。整套系统极少使用自由曲线，或者直接截取圆形曲线。

<video controls playsinline preload="metadata"><source src="/media/highlights/the-making-of-cursors-icons/construction_smaller.mp4" type="video/mp4"></video>

*这些图标更接近技术制图，是带有友好收尾的示意图。*

正是这套构造逻辑，让 600 多枚图标看起来像出自同一只手。它也非常适合编程工具：精确、工程化，同时通过圆角与圆形端点避免变得冰冷。

![所有描边都采用圆形端点](/media/highlights/the-making-of-cursors-icons/stroke-caps.png)

*所有描边都使用圆形端点。*

### 技术感

视觉风格的目标是技术化、克制，而不是装饰性。

有些图标可以采用开放形状，例如表现元素重叠，或者单纯作为风格选择；但在这种情况下，我们会强烈倾向于闭合形状，让图标保持简单和技术感。这也能提高它们在极小尺寸下的可读性。

![开放形状与闭合形状的对比](/media/highlights/the-making-of-cursors-icons/technical-look-closed-shapes.png)

*优先选择右侧的闭合形状，而不是左侧的开放形状，让图标更简单、更技术化。*

同样，当斜杠穿过一枚图标时，不会添加假装某个物体位于后方的阴影，只会在形状中做一个干净的切口。

![斜杠图标不使用假阴影](/media/highlights/the-making-of-cursors-icons/technical-look-slashes.png)

*右侧的斜杠直接切开图标，不使用左侧那样的假阴影。*

### 尽可能延长线条

受到等宽字体开发者美学的启发——字符和竖笔会延伸以填满横向空间——Cursor 图标也会尽可能延长线条，形成独特视觉特征。

这并不是适用于每枚图标、每个细节的硬规则，更像是一种反复出现的倾向。

<video controls playsinline preload="metadata"><source src="/media/highlights/the-making-of-cursors-icons/extended-line-details_smaller.mp4" type="video/mp4"></video>

*原本可以更短的灰色线条被延伸为黑色版本，借鉴等宽字体美学。*

### 高的东西就让它保持高

图标不会被强行塞进正方形。铅笔应该高而窄，钞票应该宽，它们本来是什么比例，就应该呈现什么比例。

把所有物体都挤进同样大小的方框，正是图标产生“玩具感”的原因：形状被充气，只为填满根本不需要的空间。在编程工具里，物体应该看起来像它自己，而不是玩具。在 Cursor 图标系统中，如果一个东西本来很高，就让它保持高。

![保留物体的自然比例](/media/highlights/the-making-of-cursors-icons/natural-proportions.png)

*保留自然比例，避免玩具感，让图标更实用。*

### 跟随指针方向

Cursor 的指针从左下指向右上，所以任何可以朝向两边的图标也遵循同一方向：斜向箭头、飞行物体，以及一个元素位于另一个元素上方的组合，小元素都会放在右上。

斜杠则从左上指向右下，因为斜杠用于取消某个方向，理应与主方向相反。

没有人会在屏幕上主动读出这条规则。但如果缺少这类规则，整套图标很快就不再像来自同一个地方。

<video controls playsinline preload="metadata"><source src="/media/highlights/the-making-of-cursors-icons/diagonal_smaller.mp4" type="video/mp4"></video>

*可以朝向两边的图标跟随 Cursor 指针，斜杠则朝向相反方向。*

### 恰到好处的圆润

形状的圆角经过校准，落在过于尖锐和过于柔软之间。它们应该既精确，又容易接近。

<video controls playsinline preload="metadata"><source src="/media/highlights/the-making-of-cursors-icons/roundness_smaller.mp4" type="video/mp4"></video>

*不会太几何，也不会太像泡泡，圆润得刚刚好。*

### 保持一致

文件夹、文件、烧瓶、旗帜、眼睛、箭头、缺口和徽章等重复元素，每一次出现时都使用同样画法。

如果一个文件夹出现在十枚不同图标里，它始终是同一个文件夹。整套系统持续追踪和管理超过 155 种元素、物体或视觉属性。

<video controls playsinline preload="metadata"><source src="/media/highlights/the-making-of-cursors-icons/consistency_smaller.mp4" type="video/mp4"></video>

*重复元素每次出现时都保持一致。*

### 要么锋利，要么放弃

早期我还试图挑战整套系统的圆润感。我再次从字体设计中获得灵感，尝试让大曲线保持圆润，但把描边端点和小细节改得尖锐。

从正常观看距离几乎看不出区别；放大以后，则能看到一种安静的刚柔混合。我很喜欢它，但它没有解决任何真实问题，所以最终还是保留了传统的圆角版本。

![大曲线保持圆润，小细节改用尖锐处理的探索稿](/media/highlights/the-making-of-cursors-icons/sharp-exploration.png)

*受字体设计启发：大曲线保持圆润，描边端点和小细节变得尖锐。*

## 光学校正

这是图标系统经常跳过的部分，却是我最喜欢的部分。

Logo 设计师总会做这些校正，字体设计师更是凭本能完成它们；但在图标系统中却很少见。因为面对数百枚精细的小图标，需要投入大量工作，而最终效果又很难被人明确指出。

一个很合理的问题是：在 16px 下真的看得见吗？把两个版本并排放置，差异几乎难以描述。但界面会被放大，24px 版本也会出现在更大的尺寸上；而且这些处理会在人尚未明确察觉之前发挥作用，就像字体在 10pt 下的油墨陷阱。

坦白说，其中一部分只是职业标准。这是机器内部：没有人会打开它，但里面仍然应该保持整洁。

### 光学缺口

当两条或更多线条相交时，形状堆叠会让交点看起来比实际更黑，转角因此产生堵塞和视觉堆积。

所以我会在交点切出一个很小的缺口，就像正文字体会把字母 A 的紧密转角打开一样。在 16px 这种小尺寸下，这个细节几乎看不见；但仔细观察时，你会明白它为什么感觉刚刚好。

*光学缺口会打开描边交汇处过于紧密的角落。*

### 描边变细

与光学缺口类似，当太多线条汇聚在同一位置时，其中一些线会变细，避免局部视觉重量过大。

*描边变细可以降低多条线汇聚处的视觉重量。*

### 让所有圆点各就各位

结束一条线的圆点、代表“更多”的圆点，以及单独悬浮的圆点，需要使用略微不同的尺寸才能显得正确。整套系统会追踪每一种情况。

<video controls playsinline preload="metadata"><source src="/media/highlights/the-making-of-cursors-icons/dots_smaller.mp4" type="video/mp4"></video>

*每一种单独圆点都需要适合自身情境的尺寸。*

### 留意间隙

有些图标的重叠形状之间需要留出间隙，例如文件夹上叠加一个加号，或者两个方形重叠。

我把这些间隙称为 Cuts。规则是：在 16px 网格上，间隙绝不能小于 3 个网格单位。小于等于 2.5 时，形状会开始接触、重叠并融合成一团模糊轮廓；3px 以上才能给小图标留下需要的呼吸空间。

![重叠形状之间的安全间隙](/media/highlights/the-making-of-cursors-icons/cuts.png)

*元素之间保留最小安全空间，防止它们在小尺寸下模糊成一团。*

### 追求绝对完美

做这些决定时，我比较过的一些版本只相差 0.25px。图标最终以 16px、甚至 12px 显示，这点差异理论上不应该重要，但不同版本就是给人不同感受。

我不断调整最细微的细节，一个版本接着一个版本，直到其中一个终于感觉*刚刚好*。

![为了找到正确版本，对一枚汉堡菜单图标进行了 156 次探索](/media/highlights/the-making-of-cursors-icons/perfection.png)

*为了找到最合适的版本，一枚汉堡菜单图标经历了 156 次探索。*

## 一致性是一种基础设施

看到这里，你大概已经明白，用这种方式绘制每一枚图标需要很多时间。再乘上几百枚，绘制本身其实只占工作的一半；另一半是让整个集合保持一致，而这部分依赖的是基础设施，不是记忆力。

我始终维护三个核心 Figma 文件：

![三个核心 Figma 文件](/media/highlights/the-making-of-cursors-icons/files.png)

### 1. Explorations

这是一个私密的探索空间，每枚图标或每个概念都会在这里经历几十次、甚至上百次尝试。

远看非常混乱，但内部其实有明确组织：每个概念拥有自己的区域，以及一整排对应尝试。

![用于完成全部图标探索的 Figma Explorations 文件](/media/highlights/the-making-of-cursors-icons/files-explorations.png)

*所有探索都发生在 Figma Explorations 文件中。*

### 2. Overviews

这是整套图标的查询表，所有重复模式都被排列在一起接受审查。它用来回答以下问题：

- **光学形状：** 哪些图标遵循哪一种光学形状？
- **Cuts 与间隙：** 小形状切入大形状时，每一处间隙在视觉上是否一致？
- **修饰符：** 小型加号、减号和 X 徽章是否每次都使用同样的尺寸和位置？
- **Hinting：** 当细节被简化成一条线时，简化方式是否一致？
- **实心风格：** 填充图标不止一种处理方法，每一种方法自身是否保持一致？
- **圆点与缺口：** 小圆点是否同样大，缺口是否拥有同样深度？
- **透视与对角线：** 3D 图标和斜向图标是否共享同一个角度？
- **物体：** 一枚图标里的文件夹，是否和另外九枚图标中的文件夹完全一致？

![用于追踪一致性的 Figma Overviews 文件](/media/highlights/the-making-of-cursors-icons/files-overviews.png)

*Figma Overviews 文件会追踪图标系统中每一项视觉与语义特征。*

最后一个问题永远没有结束的时候。系统需要追踪动物、箭头、块状箭头、环形箭头、盒子、建筑、图表、示意图、尖括号、设备、表情、旗帜、手、人物、笑脸、多元素图标、排版图标、多线条图标、Git 图标、布局图标、媒体播放图标、开放状态、指针、带斜杠图标、工具、波浪、声音、球体、钞票、铃铛、书籍、括号、大脑、Bug、日历、云、聊天气泡、评论气泡、控制台、控制器、勾选、芯片、时钟、指南针、转角、立方体、圆柱、数据库、显示器、圆点、水滴、信封、眼睛、文件、文件夹、烧瓶、网格、井号、耳机、沙漏、Issue、锁、放大镜、面具、便签、加号、减号、X、星号、播放、暂停、停止、录制、回放、省略号、感叹号、问号、窗口、标签页、PDF、铅笔、方块、闪光、星星、图片、盾牌、印章、服务器、扬声器、目标、线程、塔、雨伞、VR 头显、钱包、数字，以及 A 到 Z 的字母。

每一个元素，无论出现在哪里，都必须像它自己。

一旦某种模式发生漂移，差异就会变得可见。所有这些细节叠加在一起，才能让整套图标感觉是一个统一系统，而不是把许多零件拼在一起。

### 3. Icons

这是存放全部最终图标的核心 Figma 文件。每枚图标都是一个组件，带有两个属性：Filled（true 或 false）与 Size（16px 或 24px）。

![包含全部最终组件的 Figma Icons 文件](/media/highlights/the-making-of-cursors-icons/files-icons.png)

*包含全部组件的 Figma Icons 文件。*

### 离开桌面

一致性工作的另一部分发生在桌面之外。我会把 Overviews 原型镜像到手机上，因为手机会以绝对尺寸显示图标，没有缩放。

你必须在绘制文件以外的地方观察这套图标，并且使用一台 16px 真正就是 16px 的设备。

## 底层替换

前面提到，新图标必须替换旧图标，而且不能破坏任何已有引用。下面解释这到底意味着什么。

图标最终以两个字体家族发布，分别叫 `Cursor Icons 16` 和 `Cursor Icons 24`。在图标字体里，每个字形都位于一个 Unicode 码位上，例如字母 A 对应 `U+0041`。

旧字体包含 645 枚图标和 645 个码位，产品各处都在引用这些位置。如果新字体继续沿用相同分配，替换就可以自动发生：加载新字体以后，`arrow-up` 仍然位于它一直所在的位置。

所以这成为一条规则：每一枚旧图标都必须在原码位上重新映射到替代图标；没有替代方案的图标则要被明确标记为退役，而不是意外丢失。

管理 645 枚图标之间的映射需要专门工具，所以我构建了一个迁移仪表盘。每枚旧图标都会处于四种状态之一：待处理（To Be Processed）、已处理（Processed）、已移除（Removed），或者已经与替代图标绑定（Coupled）。

仪表盘会警告缺失的 SVG 和重复码位，并用网格展示整套图标：已绑定图标显示绿色，已移除图标显示红色，点击一次即可查看前后对比。

<video controls playsinline preload="metadata"><source src="/media/highlights/the-making-of-cursors-icons/migration_smaller.mp4" type="video/mp4"></video>

*用于追踪旧图标集迁移到新图标集的仪表盘。*

## 交付不止是交接文件

交付不是把一堆文件扔过围栏。它是一个完整包：Figma 源文件、图标字体、导出的 SVG，以及一个团队日常查找和使用图标的配套网站。

![团队使用图标系统的配套网站](/media/highlights/the-making-of-cursors-icons/companion.png)

*团队日常使用图标系统的配套网站。*

### 悬停、点击、复制

主页以网格展示全部图标，提供常见的尺寸、风格和搜索控件。更实用的部分是悬停：不需要点击，就能看到放大后的图标、对应码位，以及快速操作——复制 SVG、下载图标，或者复制符号。

多数时候，这已经足够。

点击以后会打开详情视图。你可以放大或缩小图标，检查它在不同尺寸下的表现，并查看标签。最新字体文件也从同一个地方下载，所以网站始终提供图标集的当前状态。

![图标详情页侧栏](/media/highlights/the-making-of-cursors-icons/companion-sidebar.png)

*把鼠标悬停在网格图标上，会出现带有快捷操作的提示层；点击则打开详情侧栏。*

### 找到你叫不出名字的图标

搜索不仅匹配名称，也会匹配标签。这一点对于寻找已知图标没有那么重要，却能解决更困难的情况：当有人面对一个新概念，需要知道图标集是否已经覆盖它。

搜索“search”时，即使 `magnifying-glass` 的名称里没有这个单词，也应该出现在结果中。整套系统拥有 1,274 个标签，大多数问题都不再需要滚动浏览数百枚图标。

![通过标签搜索图标](/media/highlights/the-making-of-cursors-icons/companion-search.png)

*当人们需要寻找能够表达新概念的图标时，搜索尤其有用。*

### “Bugbot 应该用哪枚图标？”

Concepts 页面用一张表把每个 Cursor 概念固定到唯一图标上。

它的意义是让每一个“X 应该用哪枚图标？”始终只有一个答案，而且随着产品成长仍然只有一个答案。缺少这张表，一套系统会逐渐为同一个概念发展出两枚图标；到那时，它就不再是一个系统。

![Cursor 概念与图标的对应表](/media/highlights/the-making-of-cursors-icons/companion-concepts.png)

*Concepts 页面：把每个 Cursor 概念固定到唯一图标。*

### 文件类型

另一个独立页面会把文件格式映射到对应图标，并附上示例文件名、扩展名列表和配色。

文件类型图标本身就是一个足够庞大的独立项目，因此本文不再展开。

![文件类型与对应图标](/media/highlights/the-making-of-cursors-icons/companion-file-types.png)

*File Types 页面将文件格式映射到对应图标。*

### 文档

网站还承载了设计文档：包括整套系统背后的设计理念，也就是本文已经介绍的内容；以及新增图标的指南。这正好引出最后一部分。

## 发布它

一套无法继续生长的系统会逐渐衰败，所以最后一项交付，是让系统在绘制工作完成以后继续存活的流水线。

![图标发布流水线](/media/highlights/the-making-of-cursors-icons/ship-it.png)

一枚图标会通过以下步骤发布：

- **在主 Figma 文件中设计图标，**至少完成一种组合：16 或 24、Outline 或 Filled，通常从 16 Outline 开始；
- **把全部内容扁平化为单一路径，**因为字体编译器无法处理布尔运算，也无法处理尚未轮廓化的描边；
- **发布 Figma Library 文件，**让所有使用者获得最新更新；
- **导出 SVG，**可以逐一导出，也可以从 Overviews 文件中的专用导出画板批量导出，再把文件放入仓库的正确目录；
- **运行 `ship it`。**

这一条命令替代了很长一串工作。

它会注册所有新增 SVG 并分配码位；把每枚图标编译成四套字体，对应尺寸与风格的每一种组合，并生成产品需要的全部格式；把样式表合并成一份；重写每个字体文件内部的元数据，确保字体家族名称正确，因为字体编译器总会按照自己的方式命名；重新生成配套网站所使用的数据，让网站中的每枚图标、码位和标签都与字体里的真实内容一致；重新构建网站；检查文档是否还在引用三周前的图标数量；最后提交并推送。

手工完成这些事情需要一个下午，而且总会漏掉其中一步。输入 `ship it` 只需要一秒。

导出的 SVG、图标字体、图标数据和两个网站都位于同一个仓库中，所以一枚新图标可以从 Figma 一步抵达生产环境。

整个系统不依赖我记住任何事情：规则已经写下来，流程已经自动化，而且交接后的状态足够完整，让下一枚图标的加入成为日常操作。

## 出自同一只手

我始终坚持的标准是：这些图标不应该抢走你的注意力。它们不能过分友好、装饰性太强，也不应该努力展示自己有多聪明。它们应该实用，却不能丑陋或无聊；像一组完成工作以后主动退到背景中的小型示意图。

你不应该注意到它们，但在意识之下，你应该始终知道——不，应该*感觉到*——它们属于 Cursor。

字体正是这样发挥作用。没有人阅读一段文字时会思考它使用的字体，设计师除外；但把同一段文字换成错误的字体，所有人都能感到不对。

图标系统以同样方式获得这种“不可见”：依靠一套构造逻辑、一种描边语言、四类光学形状，以及数千次无人会明确指出的小调整——当然，设计师除外。

这种图标系统的大部分工作，其实都是做决定：两个几乎相同的版本究竟哪一个正确？某个交点需要留出多少空气？

这些问题无法从一条足够精确、可以机械执行的规则中得到答案。Cursor 是一家 AI 公司，人工智能影响着他们构建的一切。但面对这些图标、面对数百个细微决定，他们仍然雇佣了一个人，用手逐一画出每一枚。

Marek Minor<br>
创始人兼设计师<br>
Minor Adventures
