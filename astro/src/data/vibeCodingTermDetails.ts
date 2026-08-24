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
		warning: '拆组件是为了复用和隔离，不是越碎越好。只出现一次、也不会再变的界面，硬拆成一层层组件反而更难读。',
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
		warning: '状态越多，界面越难预测。能从现有状态算出来的值（比如总价）不要再存一份，两份数据迟早会对不上。',
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
	'ai-agent': {
		visualTitle: 'Agent 如何完成一个任务',
		visualCaption: '目标进入模型后，Agent 会结合上下文调用工具，并用结果继续推理和验证。',
		analogy: 'Agent 更像一位能使用工具的协作者：不仅回答问题，还会查看现场、执行操作并检查结果。',
		steps: [
			{
				label: 'Goal',
				detail: '理解目标、限制与验收标准',
				result: '模糊的愿望被整理成一个可以完成、可以检查的任务。',
			},
			{
				label: 'Context',
				detail: '读取代码、文档和已有对话',
				result: 'Agent 知道自己正在什么项目里工作，也知道哪些约束不能破坏。',
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
			question: 'Agent 说“测试已经通过”，但没有真正运行测试，这算完成了吗？',
			answer: '不算。结论必须有真实工具输出作为证据；应实际运行测试，并检查退出状态和关键结果。',
		},
		warning: '模型生成的计划和结论不等于真实结果。涉及文件、数据或发布时仍要验证工具输出。',
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
