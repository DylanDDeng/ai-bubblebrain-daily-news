export interface ConceptFlowStep {
	label: string;
	detail: string;
	result: string;
}

export interface ConceptScene {
	title: string;
	description: string;
}

export interface VibeCodingDetailProfile {
	/** hero 提问中术语名之后的部分；缺省时使用通用模板句 */
	question?: string;
	visualTitle: string;
	visualCaption: string;
	analogy: string;
	steps: ConceptFlowStep[];
	scenes: ConceptScene[];
	practice: {
		question: string;
		answer: string;
	};
	warning: string;
}

export const vibeCodingDetailProfiles: Record<string, VibeCodingDetailProfile> = {
	frontend: {
		visualTitle: '从结构到可交互页面',
		visualCaption: '浏览器把内容、样式和行为组合成用户真正操作的界面。',
		analogy:
			'可以把前端想成一家店的门面和服务台：顾客看到什么、点什么、得到什么反馈，都发生在这里。',
		steps: [
			{
				label: 'HTML',
				detail: '组织标题、表单和内容结构',
				result: '页面已经有了内容骨架，但还是浏览器默认的朴素样子。',
			},
			{
				label: 'CSS',
				detail: '定义布局、字体和响应式样式',
				result: '同一份内容获得清晰的层级、间距和视觉反馈。',
			},
			{
				label: 'JavaScript',
				detail: '处理点击、状态和数据请求',
				result: '按钮开始响应操作，页面可以根据用户行为更新。',
			},
			{
				label: 'Browser',
				detail: '组合并呈现可操作的页面',
				result: '浏览器把结构、样式和行为组合成用户真正使用的界面。',
			},
		],
		scenes: [
			{ title: '制作页面', description: '把设计稿实现成真实可访问的界面。' },
			{ title: '处理交互', description: '响应输入、点击、加载、成功和错误状态。' },
			{ title: '适配设备', description: '让同一功能在手机和电脑上都容易使用。' },
		],
		practice: {
			question: '页面提示“保存成功”，但刷新后内容消失了。你会先检查哪里？',
			answer:
				'先确认成功提示是否来自真实的后端响应，再检查刷新页面时有没有正确重新读取已保存的数据。',
		},
		warning: '发送到浏览器的代码可以被查看和修改。密钥、价格与权限判断不能只放在前端。',
	},
	component: {
		question: '到底是什么？为什么工程师总在说「把它拆成组件」？',
		visualTitle: '定义一次，复用出整个界面',
		visualCaption: '同一个按钮组件被放进导航、卡片和表单，一处修改，处处生效。',
		analogy:
			'组件像乐高积木：同一款积木块可以拼进城堡，也可以拼进飞船。块的形状和拼法是固定的，拼在哪里、拼多少次由你决定。',
		steps: [
			{
				label: 'Define',
				detail: '把一段界面封装成组件',
				result: '按钮的样子和行为被写成一份独立定义，从此有了自己的名字。',
			},
			{
				label: 'Props',
				detail: '用属性配置文字与颜色',
				result: '不改定义本身，传入不同属性，同一个组件就能呈现不同内容。',
			},
			{
				label: 'Compose',
				detail: '把组件拼装成页面',
				result: '按钮被放进导航、卡片和表单，页面像积木一样拼了出来。',
			},
			{
				label: 'Reuse',
				detail: '一处修改，处处生效',
				result: '改一次组件定义，页面上每个用到它的地方同时更新。',
			},
		],
		scenes: [
			{ title: '保持一致', description: '全站的按钮和弹窗长得一样，因为它们来自同一份定义。' },
			{ title: '快速搭建', description: '新页面大多是把现成组件重新组合，而不是从零开始写。' },
			{ title: '隔离改动', description: '改导航栏只动它自己的文件，不会波及页面的其他部分。' },
		],
		practice: {
			question: '站点 20 个页面的按钮都要从直角改成圆角。用了组件和没用组件，工作量差在哪里？',
			answer:
				'有按钮组件时，只改这一个组件的样式，20 个页面同时生效；没有组件，就要找出每一处按钮逐个修改，还很容易漏掉几个。',
		},
		warning:
			'拆组件是为了复用和隔离，不是越碎越好。只出现一次、也不会再变的界面，硬拆成一层层组件反而更难读。',
	},
	state: {
		question: '到底是什么？为什么界面能「记得」你刚才做过什么？',
		visualTitle: '界面的样子，由一份数据决定',
		visualCaption: '状态一变，读它的界面就跟着变——界面是状态的镜子。',
		analogy:
			'状态像球场的记分牌：比分记在牌子上，而不是观众的喊声里。每得一分先改记分牌，全场看到的比分自然同时更新。',
		steps: [
			{
				label: 'Initial',
				detail: '给界面一个初始状态',
				result: '页面第一次渲染：菜单收起、计数为零，一切都来自初始值。',
			},
			{
				label: 'Event',
				detail: '用户操作触发事件',
				result: '一次点击本身并不改变界面，它只是发出「该更新了」的信号。',
			},
			{
				label: 'Update',
				detail: '事件更新状态数据',
				result: '数据从 0 变成 1。此刻界面还没动，先变的只是那份数据。',
			},
			{
				label: 'Render',
				detail: '界面按新状态重绘',
				result: '所有读这份状态的地方一起刷新，界面追上了数据。',
			},
		],
		scenes: [
			{ title: '记住操作', description: '菜单展开还是收起、深色还是浅色模式，背后都是一份状态。' },
			{ title: '同步显示', description: '购物车角标、列表和结算价读同一份状态，所以永远一致。' },
			{ title: '排查错乱', description: '界面显示不对时，先看状态数据对不对，再查渲染逻辑。' },
		],
		practice: {
			question: '点了「收藏」，图标变红了；刷新页面又变回了灰色。这说明状态存在哪里？',
			answer:
				'变红说明点击更新了内存里的状态；刷新后丢失，说明它只存在内存里，没有写到后端或本地存储。想让页面「记住」，就要把状态持久化。',
		},
		warning:
			'状态越多，界面越难预测。能从现有状态算出来的值（比如总价）不要再存一份，两份数据迟早会对不上。',
	},
	props: {
		question: '到底是什么？同一个组件，为什么在每个地方长得都不一样？',
		visualTitle: '同一份定义，传入什么就长成什么',
		visualCaption: '组件定义不动，父组件传入不同的属性，就得到不同的按钮。',
		analogy:
			'Props 像咖啡店的点单小票：同一台咖啡机，小票上写大杯、少糖、加冰，做出来的就是那一杯。机器不用改，改的只是单子。',
		steps: [
			{
				label: 'Parent',
				detail: '父组件准备好数据',
				result: '父组件决定要一个什么样的按钮：什么文字、什么样式。',
			},
			{
				label: 'Pass',
				detail: '像参数一样传进组件',
				result: '数据顺着标签写进组件，就像给函数传参数。',
			},
			{
				label: 'Read',
				detail: '子组件读取属性',
				result: '组件拿到 label 和 variant，照着它们渲染自己。',
			},
			{
				label: 'Render',
				detail: '不同属性，不同样子',
				result: '同一份定义，因为传入不同，呈现出完全不同的按钮。',
			},
		],
		scenes: [
			{ title: '配置内容', description: '列表里每张卡片的标题、封面都不同，数据全来自 props。' },
			{ title: '控制形态', description: '同一个弹窗组件，传 confirm 或 alert，按钮组合就不一样。' },
			{ title: '排查显示', description: '组件显示不对时，先看父组件传进来的 props 对不对。' },
		],
		practice: {
			question: '一个头像组件在页面 A 是圆形，页面 B 想要方形。应该复制一份组件改样式吗？',
			answer:
				'不用复制。给组件加一个 shape 属性（默认圆形），页面 B 传入方形即可——定义保持一份，差异交给 props 表达。',
		},
		warning:
			'Props 是自上而下的单行道：子组件只读它，不该偷偷修改它。想改数据，应该通知父组件去改，否则两边就说不清谁是真相了。',
	},
	'responsive-design': {
		question: '到底是什么？为什么同一个网页在手机和电脑上长得不一样？',
		visualTitle: '同一个页面，适应不同屏幕',
		visualCaption: '内容只有一份，布局规则跟着屏幕宽度自动切换。',
		analogy:
			'响应式像倒进不同杯子的水：水还是那些水，杯子是什么形状，它就呈现什么形状。内容不变，变的是容器里的排布。',
		steps: [
			{
				label: 'Content',
				detail: '内容只写一份',
				result: '标题、卡片和按钮只有一份，不为每种设备单独做页面。',
			},
			{
				label: 'Breakpoint',
				detail: '设定宽度分界点',
				result: '约定在哪些宽度切换布局，比如窄于 680px 算手机。',
			},
			{
				label: 'Layout',
				detail: '为不同区间安排布局',
				result: '宽屏三栏并排，窄屏叠成一列，字号和间距同步调整。',
			},
			{
				label: 'Adapt',
				detail: '浏览器自动套用',
				result: '屏幕一变，浏览器立刻套用对应规则，页面自己换形。',
			},
		],
		scenes: [
			{ title: '手机优先', description: '大多数访问来自手机，先做好窄屏体验，再扩展到宽屏。' },
			{ title: '适配平板', description: '中间宽度最容易被忽略，断点让平板也有合理的布局。' },
			{ title: '排查错位', description: '某个宽度下元素挤成一团，多半是断点之间漏了规则。' },
		],
		practice: {
			question: '设计稿只画了电脑版，手机上导航放不下了。是再做一个手机版网站吗？',
			answer:
				'不用。同一份页面加断点：窄屏时导航折叠成菜单按钮、多栏叠成单栏——一份内容，配多套布局规则，这正是响应式的做法。',
		},
		warning:
			'响应式不只是「能塞下」。窄屏要重新考虑信息优先级：什么先看到、什么收起来，而不是把桌面版等比例缩小。',
	},
	dom: {
		question: '到底是什么？JavaScript 是怎么「摸到」页面上那个按钮的？',
		visualTitle: 'HTML 变成一棵可操作的树',
		visualCaption: '浏览器把标签解析成节点树，JavaScript 改的是树，页面跟着树变。',
		analogy:
			'可以把 DOM 想成提线木偶：屏幕上你看到的是木偶，每根线都连着幕后的一个节点。JavaScript 不直接碰木偶，它拉的是线——改哪个节点，对应的那块页面就动。',
		steps: [
			{
				label: 'HTML',
				detail: '写下嵌套的标签',
				result: '标签套着标签，父子关系已经写在结构里。',
			},
			{
				label: 'Parse',
				detail: '浏览器解析成节点树',
				result: '每个标签变成一个节点，嵌套关系变成一棵树。',
			},
			{
				label: 'Access',
				detail: 'JavaScript 找到节点',
				result: '用选择器沿着树找到目标，比如那个按钮、那行标题。',
			},
			{
				label: 'Mutate',
				detail: '改节点，页面跟着变',
				result: '改文字、换样式、增删节点，屏幕立刻同步这棵树的变化。',
			},
		],
		scenes: [
			{ title: '动态更新', description: '收到新消息时，往列表树里插入一个新节点。' },
			{ title: '读取内容', description: '表单提交前，从输入框节点里读出用户填了什么。' },
			{ title: '排查异常', description: '按钮点了没反应？先看它在不在树里、绑没绑事件。' },
		],
		practice: {
			question: '页面上明明看得到那个按钮，代码里却怎么都找不到它。可能出了什么事？',
			answer:
				'常见原因有两个：选择器写错了（类名或层级对不上），或者代码在按钮被加进树之前就跑了——那一刻树里还没有这个节点，自然找不到。',
		},
		warning:
			'频繁大改 DOM 很昂贵：每次修改都可能让浏览器重新计算布局。现代框架帮你批量、最小化地改树，这正是它们存在的理由之一。',
	},
	hydration: {
		question: '到底是什么？页面明明显示出来了，为什么按钮还要再等一下才能点？',
		visualTitle: '静态页面接上交互',
		visualCaption: '服务端先送来能看的 HTML，JavaScript 到位后接管它，页面从「能看」变成「能用」。',
		analogy:
			'水合像样板间通电：家具早就摆好了，看上去和成品一模一样；电工把线接上之后，灯才真的能开、门铃才真的会响。',
		steps: [
			{
				label: 'Server',
				detail: '服务端渲染好 HTML',
				result: '用户很快看到完整页面——但此刻它只是「照片」，点了没反应。',
			},
			{
				label: 'Load',
				detail: '浏览器下载 JavaScript',
				result: '页面照常显示，交互代码在后台赶来的路上。',
			},
			{
				label: 'Attach',
				detail: '把事件接到现有节点',
				result: 'JavaScript 认领页面上已有的元素，绑上点击、输入等事件。',
			},
			{
				label: 'Alive',
				detail: '页面被激活',
				result: '同一个页面，从静态展示变成可交互的应用。',
			},
		],
		scenes: [
			{ title: '首屏加速', description: '服务端直出让用户先看到内容，不用盯着白屏等 JS。' },
			{ title: '排查失灵', description: '页面显示正常但点不动，多半是水合没完成或失败了。' },
			{ title: '按需水合', description: '只给需要交互的组件接线，纯展示的部分保持零 JS。' },
		],
		practice: {
			question: '用户反馈：页面秒开，但头两秒点按钮没反应。这是坏了吗？',
			answer:
				'不一定——这是水合窗口期：HTML 已经显示，JavaScript 还没接管。减小 JS 体积、优先水合关键按钮，可以把这个窗口压短。',
		},
		warning:
			'水合要求 JS 渲染出的结构和服务端 HTML 完全对得上，对不上就会报错或页面闪变。窗口期越长，用户越容易点了没反应——别把水合当免费午餐。',
	},
	event: {
		question: '到底是什么？代码是怎么知道我点了那个按钮的？',
		visualTitle: '一次点击，从信号到反应',
		visualCaption: '浏览器把每个动作广播成事件，监听了它的代码就会被叫起来执行。',
		analogy:
			'事件像门铃：客人按铃是触发，铃声响遍屋子是广播，只有守在门口的人（监听器）会去开门。没装铃，敲破手门里也没人知道。',
		steps: [
			{
				label: 'Trigger',
				detail: '用户点击、输入或滚动',
				result: '动作本身只是一个信号：「按钮被点了一下」。',
			},
			{
				label: 'Listen',
				detail: '代码提前登记要听什么',
				result: '监听器早就守在那里：这个按钮的 click 归我管。',
			},
			{
				label: 'Handle',
				detail: '对应的函数被叫起来',
				result: '浏览器把事件递给处理函数，附带发生了什么的细节。',
			},
			{
				label: 'React',
				detail: '界面或数据发生变化',
				result: '更新状态、发请求、弹提示——反应由你写的代码决定。',
			},
		],
		scenes: [
			{ title: '响应操作', description: '点击、输入、悬停、滚动，界面的每次反馈都始于事件。' },
			{ title: '实时校验', description: '输入框每敲一个字触发一次 input，格式边写边查。' },
			{ title: '排查失灵', description: '按钮点了没反应，先查监听器绑了没有、绑对了没有。' },
		],
		practice: {
			question: '一个按钮点击后要同时更新计数并弹出提示。需要绑两个监听器吗？',
			answer:
				'不用。一次 click 一个监听器就够了，处理函数里既可以更新计数也可以弹提示——事件是信号，收到信号后做几件事由处理函数决定。',
		},
		warning:
			'监听器是登记出来的，不是天生就有的。动态新增的元素不会自动继承监听；忘了解绑的监听器还会攒在内存里拖慢页面。',
	},
	routing: {
		question: '到底是什么？网址一变，页面怎么就知道该显示哪一屏？',
		visualTitle: '网址和页面一一对应',
		visualCaption: '路由是一张对照表：地址栏是哪条路径，就渲染哪个页面。',
		analogy:
			'路由像酒店前台的房号表：/about 对应 203 房，/blog 对应 305 房。客人报房号，前台带去对应的房间；报了不存在的房号，就得到一句「查无此房」——这就是 404。',
		steps: [
			{
				label: 'URL',
				detail: '用户点链接或输入网址',
				result: '地址栏里的路径，就是用户想去的地方。',
			},
			{
				label: 'Match',
				detail: '在路由表里查找规则',
				result: '/blog 命中博客页的规则，路径里的参数也在这里被解析。',
			},
			{
				label: 'Render',
				detail: '渲染对应的页面',
				result: '匹配到就显示那一页；谁都没匹配到，就轮到 404。',
			},
			{
				label: 'Navigate',
				detail: '站内跳转不刷新',
				result: '点站内链接时地址变了、内容换了，整页却不必重新加载。',
			},
		],
		scenes: [
			{
				title: '组织页面',
				description: '首页、列表、详情各占一个路径，项目的文件结构常常就是路由。',
			},
			{ title: '可分享链接', description: '每个内容有自己的网址，用户可以直接收藏或转发。' },
			{ title: '兜底 404', description: '访问不存在的路径时，给用户一个明确的出口，而不是白屏。' },
		],
		practice: {
			question: '用户说「详情页一刷新就 404」，但从首页点进去是好的。大概哪里出了问题？',
			answer:
				'从首页点进去走的是前端跳转，路径在浏览器里被匹配；直接刷新时请求打到了服务器，而服务器上没有这条路径的规则，于是 404。解法是让服务器把这类路径交回给前端路由处理。',
		},
		warning: '路径是接口，也是承诺：改路由等于改掉别人收藏的链接。上线后调整路径，记得留下重定向。',
	},
	ssr: {
		question: '到底是什么？页面是在谁的电脑上「拼」出来的？',
		visualTitle: '同一个页面，两种拼法',
		visualCaption: '客户端渲染先送空壳再慢慢拼；服务端渲染把拼好的页面直接送来。',
		analogy:
			'SSR 像外卖送来的成品菜，到手就能吃；客户端渲染像送来一箱食材加菜谱，得自己下厨才有得吃。菜是同一道，差别在于在哪儿做。',
		steps: [
			{
				label: 'Request',
				detail: '浏览器请求页面',
				result: '用户输入网址，请求发到服务器。',
			},
			{
				label: 'Build',
				detail: '服务器取数据拼 HTML',
				result: '数据查好、模板填好，一份完整的 HTML 出炉。',
			},
			{
				label: 'Deliver',
				detail: '完整页面直接送达',
				result: '不用等 JS，首屏内容立刻可见，搜索引擎也读得懂。',
			},
			{
				label: 'Handoff',
				detail: '交互部分交给水合',
				result: '需要交互的地方由 JavaScript 接管——接力棒交给了水合。',
			},
		],
		scenes: [
			{ title: '内容站点', description: '博客、文档、商品页：以内容为主的页面首选服务端渲染。' },
			{ title: 'SEO 需要', description: '搜索引擎抓到的是拼好的 HTML，收录更可靠。' },
			{ title: '弱网首屏', description: '网络差的设备上，直出的 HTML 比等 JS 拼页面快得多。' },
		],
		practice: {
			question: '同一个页面，CSR 版用户先盯两秒白屏，SSR 版立刻见到内容。省下的工作去哪了？',
			answer:
				'没有消失，是搬家了：拼页面的活从用户的浏览器搬到了服务器。用户少等，代价是服务器每次请求都要干活——所以纯静态内容常再进一步，构建时就提前拼好（SSG）。',
		},
		warning:
			'SSR 不是万能药：每个请求都消耗服务器算力，页面「可见但未水合」时依然点不动。内容型页面收益最大，重交互的应用要权衡。',
	},
	'browser-storage': {
		question: '到底是什么？为什么有的网站关掉重开，还记得我？',
		visualTitle: '存在用户这边的小抽屉',
		visualCaption: '数据写进浏览器的存储里，刷新页面之后依然读得到。',
		analogy:
			'浏览器存储像健身房的储物柜：东西存在你常去的那家店（这台设备的浏览器），下次来还在；但换一家店（另一台设备）柜子就是空的，店家清柜（清缓存）东西也就没了。',
		steps: [
			{
				label: 'Write',
				detail: '把键值对写进浏览器',
				result: '比如 theme = dark，像往抽屉里放一张便签。',
			},
			{
				label: 'Persist',
				detail: '关掉页面数据还在',
				result: '数据躺在这台设备的浏览器里，不随页面关闭而消失。',
			},
			{
				label: 'Read',
				detail: '下次打开先读取',
				result: '页面加载时先看抽屉里有没有旧设置，有就直接用上。',
			},
			{
				label: 'Limit',
				detail: '只属于这台设备',
				result: '换设备、换浏览器或清缓存，抽屉就是空的——它不是云端账号。',
			},
		],
		scenes: [
			{ title: '记住偏好', description: '深色模式、语言选择，下次打开自动生效。' },
			{ title: '保持登录', description: '登录凭证放在浏览器里，关掉重开不用再输密码。' },
			{ title: '暂存草稿', description: '表单写到一半不小心刷新，内容还能找回来。' },
		],
		practice: {
			question: '用户换了台电脑登录，发现深色模式设置没跟过来。这是 bug 吗？',
			answer:
				'不是。偏好存在原来那台设备的浏览器里，不会跟着账号走。想跨设备同步，就得把它写到后端数据库、和账号绑定。',
		},
		warning:
			'浏览器存储在用户手里：能被查看、修改和清空。别往里放密钥和敏感信息，重要数据永远以后端为准。',
	},
	'ui-patterns': {
		question: '是什么？为什么要认识这些界面零件的名字？',
		visualTitle: '从认出它，到说出它',
		visualCaption: '认识界面零件的名字，你就能精确地指挥 AI 改任何一块。',
		analogy:
			'界面图鉴像汽车配件手册：你不用会造车，但知道那个零件叫「后视镜」，才能让修车师傅一听就懂你要修哪里。',
		steps: [
			{
				label: 'See',
				detail: '在页面上认出这一块',
				result: '首屏大图、顶部横条、右下角小弹窗——你天天见到它们。',
			},
			{
				label: 'Name',
				detail: '知道它的通用名字',
				result: '那块叫 Hero，那条叫导航栏，那个小弹窗叫 Toast。',
			},
			{
				label: 'Anatomy',
				detail: '了解它由什么组成',
				result: '每个零件都有自己的构造：标题、按钮、配图各就各位。',
			},
			{
				label: 'Prompt',
				detail: '用名字指挥 AI 修改',
				result: '「把 hero 的副标题缩小一号」——一句话，改得又快又准。',
			},
		],
		scenes: [
			{ title: '提需求', description: '不再说「上面那块」，而是直接叫出它的名字。' },
			{ title: '看懂方案', description: 'AI 说「加一个 toast 提示」时，你知道它长什么样。' },
			{ title: '拆解设计', description: '看到喜欢的网站，能按零件拆出它的做法。' },
		],
		practice: {
			question: '你想让 AI 改「页面顶上那个横着的菜单」。用哪个词能一次说准？',
			answer: '导航栏（Navbar）。用通用名字指代，AI 不用猜你说的是哪一块，改动也不会误伤别的区域。',
		},
		warning:
			'名字是用来沟通的，不是用来炫的。同一个零件在不同框架里可能叫法不同，说清位置和作用永远是保底方案。',
	},
	api: {
		question: '到底是什么？大家天天说「调 API」，到底在调什么？',
		visualTitle: '一纸约定，两边照办',
		visualCaption: '调用方按约定发请求，提供方按约定回数据——谁也不用知道对方内部怎么实现。',
		analogy:
			'API 像餐厅的菜单：你不进后厨，也不用知道菜怎么做——照着菜单点、按约定付钱，后厨就按约定上菜。菜单上没有的，你点不了。',
		steps: [
			{
				label: 'Contract',
				detail: '约定路径、参数和返回格式',
				result: '双方说好：GET /weather?city=…，返回 temp 和 sky 两个字段。',
			},
			{
				label: 'Call',
				detail: '调用方按约定发请求',
				result: '前端发出 GET /weather?city=上海——完全照菜单点单。',
			},
			{
				label: 'Serve',
				detail: '提供方处理并返回',
				result: '服务把结果按约定的格式打包成 JSON 送回来。',
			},
			{
				label: 'Use',
				detail: '拿到数据渲染界面',
				result: '前端把 25°C 显示到页面上——全程没碰过对方的内部实现。',
			},
		],
		scenes: [
			{ title: '前后端分工', description: '前端管界面、后端管数据，中间全靠 API 说话。' },
			{ title: '借用外部能力', description: '天气、支付、AI 模型——都是在调别人家的 API。' },
			{ title: '排查对不上', description: '前端说传了、后端说没收到？先对照约定查字段名和路径。' },
		],
		practice: {
			question: 'AI 帮你接入了天气 API，页面却一直显示不出温度。你会先检查什么？',
			answer:
				'打开开发者工具看这次请求：路径和参数对不对、返回的是 200 还是报错、返回 JSON 里的字段名和代码里取的是否一致——API 出问题，九成是两边没按同一份约定办事。',
		},
		warning:
			'API 是承诺：改字段名、改路径就是毁约，所有调用方一起坏。要改就发新版本（/v2），旧版先留着。',
	},
	endpoint: {
		question: '到底是什么？它和 API 是一回事吗？',
		visualTitle: '一本菜单，一道道菜',
		visualCaption: '一个 API 由许多 endpoint 组成——地址加方法，唯一定位其中一个。',
		analogy:
			'如果 API 是整本菜单，Endpoint 就是菜单上的一道菜：/orders 是「订单」这道菜，GET 是看一份、POST 是来一份——地址加动作，唯一确定你点的是什么。',
		steps: [
			{
				label: 'Path',
				detail: '一条具体的地址',
				result: '/orders 管订单、/users 管用户——按资源划分地盘。',
			},
			{
				label: 'Method',
				detail: '配上一个动作',
				result: '同一个 /orders：GET 是查、POST 是建——方法不同，就是不同的 endpoint。',
			},
			{
				label: 'Params',
				detail: '路径里带上参数',
				result: '/orders/42 指的就是第 42 号订单——地址本身就能点名。',
			},
			{
				label: 'Handle',
				detail: '各自对接处理逻辑',
				result: '每个 endpoint 背后是一段专属的处理代码，各管各的。',
			},
		],
		scenes: [
			{
				title: '拆解需求',
				description:
					'「加个收藏功能」，翻译过来就是新增 POST /favorites 和 DELETE /favorites/:id。',
			},
			{ title: '看懂报错', description: '404 常常是 endpoint 地址写错了，不一定是数据不存在。' },
			{ title: '对照文档', description: 'API 文档就是 endpoint 清单：地址、方法、参数、返回。' },
		],
		practice: {
			question: 'GET /orders 和 POST /orders，是同一个 endpoint 吗？',
			answer:
				'不是。地址相同但方法不同，就是两个 endpoint：GET /orders 查订单列表，POST /orders 创建新订单——背后对接的是两段不同的处理代码。',
		},
		warning:
			'Endpoint 的命名就是它的说明书：用资源名词（/orders），别用动词（/getOrderList）。风格统一，AI 和队友都能猜对下一个地址长什么样。',
	},
	runtime: {
		question: '到底是什么？为什么同一份代码换个地方就跑不起来？',
		visualTitle: '同一份代码，不同的水土',
		visualCaption: '代码本身只是文本；跑在哪个运行时里，决定了它能调用哪些能力。',
		analogy:
			'运行时像代码的水土：同一份 JavaScript，种在浏览器里能用 DOM 和 window，种在 Node.js 里能读文件、连数据库——水土不同，长得出的能力不同；水土不服，就地报错。',
		steps: [
			{
				label: 'Code',
				detail: '写下一份 JavaScript',
				result: '此刻它只是文本，什么也做不了。',
			},
			{
				label: 'Runtime',
				detail: '选一个执行环境',
				result: '浏览器、Node.js、Workers——每家提供的能力清单不一样。',
			},
			{
				label: 'APIs',
				detail: '取用环境提供的能力',
				result: '浏览器给你 DOM 和 fetch，Node 给你文件系统和网络底层。',
			},
			{
				label: 'Run',
				detail: '代码真正跑起来',
				result: '同一份逻辑，在不同水土里各有各的边界。',
			},
		],
		scenes: [
			{ title: '选部署形态', description: '传统服务器跑 Node，边缘节点跑 Workers——按需选水土。' },
			{
				title: '看懂报错',
				description: '「window is not defined」= 在服务端跑了浏览器专属的代码。',
			},
			{ title: '对齐版本', description: '本地 Node 22、线上 Node 18，同一份代码可能两种表现。' },
		],
		practice: {
			question: '代码在你电脑上跑得好好的，部署上线就报「fs is not defined」。怎么回事？',
			answer:
				'代码用了 Node.js 的文件能力（fs），但线上是边缘运行时，那里没有文件系统——不是代码坏了，是水土换了。让 AI 改用目标运行时支持的方案即可。',
		},
		warning:
			'写代码前先问一句「这段跑在哪」。运行时决定能力边界，跨界调用是「本地好好的，一上线就崩」最常见的原因。',
	},
	middleware: {
		question: '到底是什么？请求在见到业务逻辑之前，都过了谁的手？',
		visualTitle: '一条公用的通道',
		visualCaption: '每个请求都先穿过同一串中间件，再抵达各自的处理逻辑。',
		analogy:
			'中间件像机场的安检通道：不管你飞哪儿，都先过同样几道关——查身份、称行李、留记录。目的地各不相同，通道却是公用的：一次搭好，所有航班共享。',
		steps: [
			{
				label: 'Enter',
				detail: '请求进入通道',
				result: '不管去哪个 endpoint，都从同一个入口进来。',
			},
			{
				label: 'Auth',
				detail: '鉴权中间件查身份',
				result: '没带有效凭证的，在这一关就被送回去了。',
			},
			{
				label: 'Log',
				detail: '日志中间件记一笔',
				result: '谁、什么时候、请求了什么——顺手留档。',
			},
			{
				label: 'Handler',
				detail: '抵达业务逻辑',
				result: '穿过整条通道的请求，才见得到真正的处理代码。',
			},
		],
		scenes: [
			{ title: '统一鉴权', description: '登录校验写一次，所有要保护的 endpoint 共享。' },
			{ title: '统一记录', description: '日志和耗时统计在通道里顺手完成，业务代码保持干净。' },
			{ title: '统一限流', description: '同一个来源请求太猛？在通道口就拦下，别打进业务。' },
		],
		practice: {
			question: '十个 endpoint 都需要登录才能访问。把校验代码复制十份，还是有更好的办法？',
			answer:
				'写一个鉴权中间件，挂在这十个 endpoint 前面。校验逻辑只有一份，改一次全体生效——和组件「一处修改、处处生效」是同一个道理。',
		},
		warning:
			'中间件的顺序就是流水线的顺序：日志放在鉴权前还是后，记下来的东西完全不同。加中间件时，想清楚它站在队伍的第几位。',
	},
	authentication: {
		question: '到底是什么？系统怎么知道「你就是你」？',
		visualTitle: '从「你说你是」到「系统确认」',
		visualCaption: '核验通过后发一张有期限的凭证，之后的每次请求都靠它自证身份。',
		analogy:
			'身份验证像小区门禁：第一次来要登记（注册），之后刷卡进门（登录拿凭证），卡丢了挂失补办（重置密码）。门禁认卡不认脸——凭证在谁手里，谁就是「你」。',
		steps: [
			{
				label: 'Claim',
				detail: '你说你是谁',
				result: '输入邮箱和密码——此刻系统还不能信你。',
			},
			{
				label: 'Verify',
				detail: '系统核对凭据',
				result: '密码比对、验证码、第三方确认——总得过一道关。',
			},
			{
				label: 'Token',
				detail: '发放一张凭证',
				result: '核验通过，系统发一张有期限的「门禁卡」。',
			},
			{
				label: 'Visit',
				detail: '之后带着凭证访问',
				result: '每次请求带上它，不用回回都输密码。',
			},
		],
		scenes: [
			{ title: '保护接口', description: '没带有效凭证的请求，在中间件那关就被拦下。' },
			{ title: '保持登录', description: '凭证放在浏览器存储里，关掉重开还认得你。' },
			{
				title: '第三方登录',
				description: '「用 Google 登录」= 请 Google 替你核验，回来照样发凭证。',
			},
		],
		practice: {
			question: '用户反馈「登着登着突然被踢出去了」。最可能的原因是什么？',
			answer:
				'凭证过期了。门禁卡都有有效期，到期就得重新核验——想少打扰用户，可以在快到期时静默续期（刷新凭证）。',
		},
		warning:
			'「你是谁」（验证）和「你能干什么」（授权）是两件事：登录了不等于什么都能改。别把「已登录」当成「有权限」。',
	},
	'environment-variable': {
		question: '到底是什么？为什么密钥不能直接写进代码里？',
		visualTitle: '代码之外的口袋',
		visualCaption: '代码里只写变量名，真实的值在每个环境里各自保管。',
		analogy:
			'环境变量像酒店房间的保险箱：贵重物品（密钥）不塞进行李箱（代码）拖着走，而是放进每个房间自带的保险箱——行李箱谁都可能翻到，保险箱只有住这间房的人能开。',
		steps: [
			{
				label: 'Name',
				detail: '代码里只写名字',
				result: 'process.env.API_KEY——代码只知道有这么个名字。',
			},
			{
				label: 'Store',
				detail: '值存在环境里',
				result: '本地写在 .env 文件，线上配在平台的设置面板。',
			},
			{
				label: 'Inject',
				detail: '启动时注入真实值',
				result: '代码跑起来的那一刻，名字被换成当前环境里的值。',
			},
			{
				label: 'Switch',
				detail: '换环境即换值',
				result: '本地连测试库、线上连正式库——代码一行不用改。',
			},
		],
		scenes: [
			{ title: '保管密钥', description: 'API Key、数据库密码——绝不进代码仓库。' },
			{ title: '区分环境', description: '同一份代码，本地、测试、线上各配各的值。' },
			{ title: '排查配置', description: '线上行为怪异？先查环境变量是不是漏配或配错了。' },
		],
		practice: {
			question: 'AI 生成的代码里直接写着 apiKey = "sk-abc…"，还被推上了 GitHub。现在怎么办？',
			answer:
				'立刻去服务商后台吊销这把密钥、换新的——只从代码里删掉没用，推上去过就当已泄露。然后把新密钥放进环境变量，代码里只留 process.env.API_KEY。',
		},
		warning:
			'前端代码里的「环境变量」构建后会打进产物、人人可见——真正的秘密只能放在服务端。名字带 PUBLIC 前缀的，才是设计给前端用的。',
	},
	backend: {
		visualTitle: '一次请求如何被处理',
		visualCaption: '后端接收请求、执行规则、访问数据，再把可信结果返回给前端。',
		analogy: '后端像餐厅的后厨：前台负责接单，后厨根据规则处理、取用原料并交付结果。',
		steps: [
			{
				label: 'Request',
				detail: '接收前端提交的参数和身份',
				result: '服务器收到一份请求，但其中的数据暂时还不能被信任。',
			},
			{
				label: 'Validate',
				detail: '检查格式、权限与业务规则',
				result: '格式、身份和权限通过检查，不安全的请求会在这里被拦下。',
			},
			{
				label: 'Process',
				detail: '执行逻辑并读取或写入数据',
				result: '业务规则开始执行，需要的数据被读取或更新。',
			},
			{
				label: 'Response',
				detail: '返回结果、状态码或错误原因',
				result: '前端收到一个明确、可判断成功或失败的结果。',
			},
		],
		scenes: [
			{ title: '保存数据', description: '创建账号、发布文章或更新项目设置。' },
			{ title: '保护权限', description: '确认用户身份以及是否允许执行当前操作。' },
			{ title: '整合服务', description: '调用支付、邮件、模型或第三方 API。' },
		],
		practice: {
			question: '前端传来 role=admin，后端能直接相信这个身份吗？',
			answer: '不能。身份与权限必须在服务端根据可信的登录状态和数据重新验证，不能只相信前端参数。',
		},
		warning: '不要相信前端传来的价格、角色或完成状态；关键规则必须在服务端重新验证。',
	},
	'vibe-coding': {
		question: '到底是什么？不亲手写代码也能做出软件，这事靠谱吗？',
		visualTitle: '用话推进，用结果校准',
		visualCaption: '你描述想要什么，AI 负责改代码；每次运行的结果，都是你下一句话的依据。',
		analogy:
			'氛围编程像坐在副驾驶指路：方向盘在 AI 手上，但去哪、走哪条路、开错了要不要掉头，都由你一句句说。车开得快，指路的人得清醒。',
		steps: [
			{
				label: 'Say',
				detail: '用自然语言说出意图',
				result: '「卡片加个阴影，悬停时浮起来」——需求用人话说出口，不用先翻 API 文档。',
			},
			{
				label: 'Generate',
				detail: 'AI 生成或修改代码',
				result: '几秒后代码改好了。你可以看看 diff，也可以先跑起来再说。',
			},
			{
				label: 'Run',
				detail: '运行起来看真实效果',
				result: '刷新页面：阴影有了，悬停也动了——但浮得有点夸张。',
			},
			{
				label: 'Feedback',
				detail: '用结果说出下一句',
				result: '「浮起的幅度小一半」——运行结果变成新的输入，循环继续，越说越准。',
			},
		],
		scenes: [
			{ title: '快速起步', description: '一句话生成页面骨架，先跑起来，再一轮轮调成想要的样子。' },
			{
				title: '边看边调',
				description: '对着真实页面说「这里再大一点」，比对着代码猜参数快得多。',
			},
			{ title: '不熟的领域', description: '写不来正则或配置文件？描述清楚意图，让 AI 给第一版。' },
		],
		practice: {
			question: 'AI 生成的功能一次就跑通了，代码你完全没看。直接进入下一个需求吗？',
			answer:
				'至少扫一眼关键部分：数据存在哪、有没有写死的密钥、边界情况怎么处理。氛围编程省的是打字，不是判断——看不懂的代码越积越多，出问题时没人知道从哪查起。',
		},
		warning:
			'「能跑」不等于「能上线」。氛围编程适合快速探索和验证想法；安全、性能、数据这些看不见的部分，仍然需要有人真正理解。',
	},
	prompt: {
		question: '到底是什么？同样是打字提需求，为什么别人一次就中，我却来回返工？',
		visualTitle: '同一个愿望，两种说法，两种结果',
		visualCaption: '目标、约束和验收说得越清楚，AI 需要猜的就越少，产出就越贴近你想要的。',
		analogy:
			'提示词像给装修师傅的委托单：只说「弄好看点」，师傅只能按他的理解来；写清楚刷哪面墙、用什么色、怎样算完工，交付才会像你想的那样。',
		steps: [
			{
				label: 'Goal',
				detail: '说清楚要做成什么样',
				result: '「弄一下深色模式」变成「给设置页加一个深色模式开关」，任务有了明确的完成形态。',
			},
			{
				label: 'Context',
				detail: '交代项目背景和现状',
				result: 'AI 知道项目用什么技术、已有哪些约定，不再凭空发明一套新的。',
			},
			{
				label: 'Constraint',
				detail: '划出边界和不能动的部分',
				result: '「只改设置页，别动全局样式」——跑偏的空间被提前收窄。',
			},
			{
				label: 'Accept',
				detail: '定义怎样才算完成',
				result: '「刷新后保持选择」成了验收标准，结果可以被检查，而不是「感觉还行」。',
			},
		],
		scenes: [
			{
				title: '布置新任务',
				description: '开工前把目标、范围和验收写进第一条提示词，少走返工的弯路。',
			},
			{
				title: '纠正跑偏',
				description: '结果不对时，补上缺失的上下文或约束，而不是把原话重复一遍再试。',
			},
			{
				title: '沉淀成模板',
				description: '把反复用到的说明整理成提示词模板或技能，团队里每个人都能复用。',
			},
		],
		practice: {
			question:
				'「帮我优化一下这个页面」和「首页手机端首屏要 3 秒内可见，先把图片压到 200KB 以内」，哪一条更可能一次成功？',
			answer:
				'后者。它有明确目标（首屏速度）、范围（首页手机端）和验收标准（200KB 以内），AI 不用猜「优化」指什么；前者连要优化性能还是外观都没说清，只能靠 AI 碰运气。',
		},
		warning:
			'提示词不是咒语，堆「请务必」「一定要」不会提升质量。真正起作用的是信息量：目标、上下文、约束、验收标准，缺哪个补哪个。',
	},
	'context-window': {
		question: '到底是什么？聊久了 AI 为什么会「忘了」前面说好的事？',
		visualTitle: '窗口装满之后，最早的先让位',
		visualCaption:
			'模型一次能处理的信息有上限；超出后，早期内容会被压缩或移出——它不是忘性大，是桌面就这么大。',
		analogy:
			'上下文窗口像开会用的白板：讨论时想到什么写什么，写满之后再添新内容，就得擦掉最早的。靠谱的做法是擦掉之前把关键结论抄到别处，而不是指望白板永远够用。',
		steps: [
			{
				label: 'Fill',
				detail: '对话和文件不断进入窗口',
				result: '每句话、每份代码、每条工具输出都占据容量；而窗口外的内容，模型等于看不见。',
			},
			{
				label: 'Full',
				detail: '容量逼近上限',
				result: '窗口快满了：新内容还要进来，旧内容不可能全部留下。',
			},
			{
				label: 'Compress',
				detail: '早期内容被压缩或移出',
				result: '开头定过的约定变成一句概要，甚至彻底出窗——模型真的「看不见」了。',
			},
			{
				label: 'Anchor',
				detail: '关键信息固定在窗外',
				result: '写进文档、注释或任务清单的内容可以随时重新读入，不怕窗口翻页。',
			},
		],
		scenes: [
			{
				title: '长对话变糊',
				description: '聊到第 50 轮，AI 突然违反开头定的规矩——那条规矩已经出窗了。',
			},
			{
				title: '大仓库塞不下',
				description: '整个项目塞不进窗口，所以工具靠检索相关片段，而不是全量投喂。',
			},
			{
				title: '及时开新对话',
				description: '一个任务收尾就另起对话，比在旧窗口里继续堆更省心。',
			},
		],
		practice: {
			question: '聊了一下午的对话里，AI 开始重复犯已经纠正过的错。为什么？怎么办？',
			answer:
				'当初的纠正已经被挤出窗口，模型看不到了。把重要约定写进项目文档这类会被重新读入的地方，或者开个新对话、把关键结论带过去。',
		},
		warning: '重要约定别只留在聊天记录里——窗口一翻页它就没了。写进文件的，才是可靠的记忆。',
	},
	agent: {
		question: '到底是什么？同样是 AI，它和只会聊天的机器人差在哪？',
		visualTitle: 'Agent = Model + Harness',
		visualCaption:
			'模型负责想清楚下一步，运行框架负责真正执行并把结果递回——一轮轮循环，直到任务完成。',
		analogy:
			'Agent 像一位驻场工程师：脑子里想方案的是 Model，手上的终端和工具箱是 Harness。只出主意不动手的叫顾问，能想、能做、做完还自查的，才叫 Agent。',
		steps: [
			{
				label: 'Goal',
				detail: '接下一个可检查的任务',
				result: '目标和验收都摆在明面上：把失败的测试修好，npm test 全绿才算完。',
			},
			{
				label: 'Model',
				detail: '模型决定下一步做什么',
				result: '大脑开始工作：结合上下文，模型给出一个具体动作——先跑一遍测试看看。',
			},
			{
				label: 'Harness',
				detail: '框架执行动作，结果递回',
				result: '手脚开始工作：运行框架真正调用工具，把命令输出原样递回给模型。',
			},
			{
				label: 'Loop',
				detail: '带着结果循环，直到验证通过',
				result: '不符合就再想一轮、再做一轮；完成的证据是真实的工具输出，不是模型的感觉。',
			},
		],
		scenes: [
			{ title: '修改代码', description: '定位文件、编辑实现并运行测试，直到全部通过。' },
			{
				title: '操作真实系统',
				description: '通过终端、浏览器或 MCP 完成跨应用任务，而不只是给出步骤。',
			},
			{
				title: '长任务自治',
				description: '一个目标拆成几十步工具调用，中途自己纠错，不必每步都问你。',
			},
		],
		practice: {
			question: 'Agent 说“测试已经通过”，但没有真正运行测试，这算完成了吗？',
			answer: '不算。结论必须有真实工具输出作为证据；应实际运行测试，并检查退出状态和关键结果。',
		},
		warning: '模型生成的计划和结论不等于真实结果。涉及文件、数据或发布时仍要验证工具输出。',
	},
	harness: {
		question: '到底是什么？同一个模型，为什么装进不同工具里，能力差那么多？',
		visualTitle: '模型的能力，由运行框架兑现',
		visualCaption:
			'模型只会输出文字；把文字变成真实的读文件、跑命令、验证结果的，是围着它的运行框架。',
		analogy:
			'Harness 像赛车的整车：引擎（模型）再强，也要靠底盘、变速箱和方向盘才能上路。同一台引擎装进不同的车，跑出完全不同的成绩。',
		steps: [
			{
				label: 'Assemble',
				detail: '组装上下文交给模型',
				result: '系统提示、对话、文件内容被拼成一份输入——模型能看到什么，由框架决定。',
			},
			{
				label: 'Decide',
				detail: '模型输出下一步动作',
				result: '模型说「删掉 build 目录」——此刻这只是一段文字，还什么都没发生。',
			},
			{
				label: 'Execute',
				detail: '框架校验权限并真正执行',
				result: '框架判断这个动作允不允许、要不要先问你，然后才真的去执行。',
			},
			{
				label: 'Return',
				detail: '结果回填，进入下一轮',
				result: '工具输出被装回上下文，模型带着新信息继续——整个循环由框架驱动。',
			},
		],
		scenes: [
			{
				title: '同模型不同产品',
				description: '终端工具、网页聊天、IDE 插件可能用同一个模型，差别几乎全在框架。',
			},
			{
				title: '权限和安全',
				description: '哪些命令能直接跑、哪些要先问你，是框架在把关，不是模型自觉。',
			},
			{
				title: '挑选工具',
				description: '比较 AI 编码工具时，除了比模型，更要比工具集、上下文管理和执行循环。',
			},
		],
		practice: {
			question: '同一个模型，在 A 工具里能自己跑测试改代码，在 B 里只能贴代码给建议。差别在哪？',
			answer:
				'差在框架：A 给了模型终端和文件工具，并驱动着执行循环；B 只做一问一答。模型没变，变的是围绕它的手脚和流程。',
		},
		warning:
			'框架决定权限边界。给 Agent 接上工具前先想清楚：它能碰什么、不能碰什么、出错时怎么停——这些模型自己不会替你把关。',
	},
	mcp: {
		question: '到底是什么？为什么各家服务都在出自己的 MCP？',
		visualTitle: '一个接口，接入所有工具',
		visualCaption:
			'没有统一协议，每个 AI 应用对每个服务都要单独写接入；有了 MCP，双方只需对齐这一个标准。',
		analogy:
			'MCP 像 USB-C：以前每台设备一种充电口，线越积越多；接口统一后，设备和配件各自只管兼容这一个口，就能随意组合。',
		steps: [
			{
				label: 'Expose',
				detail: '服务把能力包成 MCP 服务器',
				result: '数据库、日历、搜索……各自声明「我能做什么、怎么调用」。',
			},
			{
				label: 'Connect',
				detail: 'AI 应用按协议连接',
				result: '不用为每个服务写专属代码——认识协议，就认识所有服务器。',
			},
			{
				label: 'Discover',
				detail: '模型看到统一的工具清单',
				result: '接上的能力以同一种格式出现在模型面前，随取随用。',
			},
			{
				label: 'Call',
				detail: '按标准调用并拿到结果',
				result: '查日历和查数据库走同一套流程；生态里的新工具，接上就能用。',
			},
		],
		scenes: [
			{
				title: '接内部系统',
				description: '把公司的工单、文档、数据库包成 MCP 服务器，各种 AI 工具都能用。',
			},
			{
				title: '一次接入到处用',
				description: '同一个 MCP 服务器，终端、桌面端和其他兼容应用都认识。',
			},
			{
				title: '先找现成的',
				description: '需要某个能力时先找找有没有现成的 MCP 服务器，别急着写胶水代码。',
			},
		],
		practice: {
			question: '想让 AI 助手能查公司内部的工单系统。没有 MCP 和有 MCP，接入方式差在哪？',
			answer:
				'没有协议时，要为这个助手写一套专属插件，换个 AI 应用还得重写一套；有 MCP，把工单系统包成一个 MCP 服务器，所有兼容应用都能直接连——写一次，到处用。',
		},
		warning:
			'MCP 服务器拿到的权限，模型就可能用到。接入第三方服务器前先看清它能读什么、写什么，别把生产数据的写权限随手交出去。',
	},
	skill: {
		question: '到底是什么？和每次把要求重新说一遍，差在哪？',
		visualTitle: '把一套做法打包，随叫随到',
		visualCaption:
			'把某类任务的方法、约束和脚本封装成技能；Agent 遇到这类任务时加载它，按同一套流程稳定完成。',
		analogy:
			'Skill 像餐厅的菜谱卡：老师傅的火候、配比和摆盘写成卡片，任何厨师照着做，出品都是那道菜。不写卡片，全靠现场口传，味道就看运气。',
		steps: [
			{
				label: 'Capture',
				detail: '把有效做法写下来',
				result: '周报的格式、发版的步骤、评审的检查单——从口头经验变成文字。',
			},
			{
				label: 'Package',
				detail: '连同脚本素材打包成技能',
				result: '方法、约束、模板和脚本放进一个技能包，有了名字和触发条件。',
			},
			{
				label: 'Invoke',
				detail: '遇到匹配的任务时加载',
				result: '你说「写周报」，Agent 自动加载技能，按里面的流程办事。',
			},
			{
				label: 'Reuse',
				detail: '每次执行都是同一水准',
				result: '这周和上个月的产出一个标准；技能改进一次，之后每次都受益。',
			},
		],
		scenes: [
			{
				title: '固定流程',
				description: '周报、发版、数据导出这类重复任务，写成技能后一句话触发。',
			},
			{
				title: '团队对齐',
				description: '把最佳实践放进共享技能，新人第一次干活就是老手水准。',
			},
			{ title: '沉淀改进', description: '这次踩的坑补进技能里，下次自动绕开。' },
		],
		practice: {
			question: '每次让 AI 写周报都要重新描述格式和口吻，偶尔还漏。这种任务适合怎么处理？',
			answer:
				'写成技能：格式、口吻、数据来源和模板都放进去，以后一句「写周报」就够了。判断标准很简单——同样的说明你已经重复第三遍了，就该沉淀成技能。',
		},
		warning:
			'技能不是写完就完事。流程变了要跟着更新，否则 Agent 会拿着过期的流程认真执行——错得整整齐齐。',
	},
	'ai-agent': {
		question: ' 编码工具到底在做什么？大模型、聊天机器人、Agent，说的是一回事吗？',
		visualTitle: 'AI 工具如何完成一个任务',
		visualCaption: '目标进入模型后，AI 会结合上下文调用工具，并用结果继续推理和验证。',
		analogy:
			'AI 编码工具更像一位能使用工具的协作者：不仅回答问题，还会查看现场、执行操作并检查结果。',
		steps: [
			{
				label: 'Goal',
				detail: '理解目标、限制与验收标准',
				result: '模糊的愿望被整理成一个可以完成、可以检查的任务。',
			},
			{
				label: 'Context',
				detail: '读取代码、文档和已有对话',
				result: 'AI 知道自己正在什么项目里工作，也知道哪些约束不能破坏。',
			},
			{
				label: 'Tool',
				detail: '调用终端、浏览器或外部服务',
				result: '模型不只给建议，而是通过真实工具改变外部世界。',
			},
			{
				label: 'Verify',
				detail: '检查结果并决定是否继续迭代',
				result: '工具输出成为完成证据；不符合要求时继续修正。',
			},
		],
		scenes: [
			{ title: '修改代码', description: '定位文件、编辑实现并运行测试。' },
			{ title: '整理知识', description: '读取多份资料后生成结构化内容。' },
			{ title: '操作工具', description: '通过浏览器、MCP 或脚本完成跨应用任务。' },
		],
		practice: {
			question: '同一个问题，为什么 AI 有时答得很准，有时一本正经地胡说？',
			answer:
				'差别常在它能看到什么：上下文里有真实代码和文档时，回答有依据；什么都没给时，它只能凭训练记忆补全，就容易编。先想「它看到了什么」，再判断答案可不可信。',
		},
		warning: 'AI 的输出是概率生成的，不是权威答案。越是没给上下文、越是冷门的问题，越要自己验证。',
	},
	'data-storage': {
		visualTitle: '数据如何安全地保存和取回',
		visualCaption: '结构先定义数据形状，存储层负责持久化，查询再把需要的内容返回给应用。',
		analogy: '数据系统像有目录规则的档案室：先规定每份资料怎么编号，再负责存放、查找和更新。',
		steps: [
			{
				label: 'Shape',
				detail: '定义字段、类型和数据关系',
				result: '每条数据有了固定形状，系统知道什么可以被存进去。',
			},
			{
				label: 'Write',
				detail: '校验后把数据持久保存',
				result: '通过校验的内容被写入存储，不会随页面刷新消失。',
			},
			{
				label: 'Query',
				detail: '按条件定位需要的数据',
				result: '系统只找出当前任务需要的记录，而不是搬回全部数据。',
			},
			{
				label: 'Return',
				detail: '把结果交给业务逻辑和界面',
				result: '查询结果回到应用，最终变成用户能够看到或操作的内容。',
			},
		],
		scenes: [
			{ title: '保存业务数据', description: '管理用户、内容、订单或项目记录。' },
			{ title: '语义检索', description: '用向量表示查找意思相近的内容。' },
			{ title: '提升速度', description: '缓存高频结果，减少重复计算和请求。' },
		],
		practice: {
			question: '可以直接修改生产数据库结构，不做迁移吗？',
			answer: '不应该。结构变化需要可追踪的迁移，同时准备数据备份、兼容方案和必要时的回退路径。',
		},
		warning: '修改结构前要考虑已有数据和回退方式。不要在没有备份或迁移计划时直接改生产数据。',
	},
	'engineering-workflow': {
		visualTitle: '一次代码改动如何安全进入主线',
		visualCaption: '把修改拆成可检查的差异，通过验证后保存为清晰、可回退的版本。',
		analogy: '工程协作像共同编辑一份重要文档：每个人在自己的副本上修改，留下说明，审核后再合并。',
		steps: [
			{
				label: 'Edit',
				detail: '在独立范围内完成一组相关修改',
				result: '想法变成了代码变化，但还没有被证明安全。',
			},
			{
				label: 'Diff',
				detail: '检查实际增加、删除和改变的内容',
				result: '修改范围变得透明，无关变化和意外删除会暴露出来。',
			},
			{
				label: 'Test',
				detail: '确认功能与已有行为没有被破坏',
				result: '真实运行结果证明新功能可用，原有行为也没有回归。',
			},
			{
				label: 'Commit',
				detail: '保存为有说明、可以回退的版本',
				result: '这一组修改成为清晰的历史节点，需要时可以安全回退。',
			},
		],
		scenes: [
			{ title: '多人协作', description: '通过分支和合并请求隔离并审查修改。' },
			{ title: '使用 AI 改代码', description: '用 Diff 确认 Agent 没有修改范围外的内容。' },
			{ title: '定位回归', description: '从提交历史找到问题引入的时间和原因。' },
		],
		practice: {
			question: 'AI 一次修改了很多文件，你第一步应该检查什么？',
			answer: '先看 Diff 和修改范围，确认每个变化都与当前任务有关，再运行与这些改动对应的验证。',
		},
		warning: '不要把无关改动堆进同一次提交。范围越清晰，审查、排错和回退就越可靠。',
	},
	'deployment-runtime': {
		visualTitle: '代码如何变成线上服务',
		visualCaption: '源代码经过测试和构建成为发布产物，再部署到实际运行环境并持续观察。',
		analogy: '部署像把厨房里的配方变成稳定营业的门店：不仅要做出来，还要能持续供应、发现故障。',
		steps: [
			{
				label: 'Source',
				detail: '准备代码、配置和依赖',
				result: '发布系统拿到一个明确版本，以及它运行所需的配置。',
			},
			{
				label: 'Build',
				detail: '测试并生成可发布的产物',
				result: '源代码被转换成目标环境真正可以运行的产物。',
			},
			{
				label: 'Deploy',
				detail: '把版本送到云端运行环境',
				result: '新版本进入线上环境，开始接收真实用户请求。',
			},
			{
				label: 'Observe',
				detail: '通过日志和指标确认服务正常',
				result: '真实 URL、关键流程和运行日志共同证明发布成功。',
			},
		],
		scenes: [
			{ title: '发布网站', description: '把本地页面部署到可访问的正式域名。' },
			{ title: '自动化上线', description: '在代码合并后自动测试、构建和部署。' },
			{ title: '处理故障', description: '用日志、指标和版本信息定位线上问题。' },
		],
		practice: {
			question: '构建成功，就能说明线上服务一定正常吗？',
			answer: '不能。还需要访问真实线上地址，检查关键流程，并查看运行日志里有没有错误。',
		},
		warning: '构建成功不代表线上一定正常。发布后仍要确认真实 URL、关键路径和错误日志。',
	},
};
