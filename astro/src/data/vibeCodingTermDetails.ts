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
