export interface VibeCodingTerm {
	id: string;
	name: string;
	chineseName: string;
	description: string;
}

export interface VibeCodingTermCategory {
	id: string;
	name: string;
	label: string;
	description: string;
	terms: VibeCodingTerm[];
}

export const vibeCodingTermCategories: VibeCodingTermCategory[] = [
	{
		id: 'frontend',
		name: 'Frontend',
		label: '前端',
		description: '用户直接看到并操作的界面，以及浏览器中的交互逻辑。',
		terms: [
			{
				id: 'component',
				name: 'Component',
				chineseName: '组件',
				description: '可独立复用的界面单元，例如按钮、导航栏或文章卡片。',
			},
			{
				id: 'dom',
				name: 'DOM',
				chineseName: '文档对象模型',
				description: '浏览器把 HTML 页面表示成的树状结构，JavaScript 可以读取和修改它。',
			},
			{
				id: 'state',
				name: 'State',
				chineseName: '状态',
				description: '决定界面当前如何显示的数据，例如菜单是否展开或用户是否登录。',
			},
			{
				id: 'props',
				name: 'Props',
				chineseName: '组件属性',
				description: '父组件传给子组件的数据，用来配置组件的内容和行为。',
			},
			{
				id: 'responsive-design',
				name: 'Responsive Design',
				chineseName: '响应式设计',
				description: '让同一页面根据屏幕宽度自动适配桌面、平板和手机。',
			},
			{
				id: 'hydration',
				name: 'Hydration',
				chineseName: '水合',
				description: '在浏览器中为服务端生成的静态 HTML 接上 JavaScript 交互能力。',
			},
			{
				id: 'event',
				name: 'Event',
				chineseName: '事件',
				description: '用户操作或浏览器变化发出的信号，代码监听它来做出反应。',
			},
			{
				id: 'routing',
				name: 'Routing',
				chineseName: '路由',
				description: '把网址和页面对应起来的规则，决定访问某个地址时看到什么。',
			},
			{
				id: 'ssr',
				name: 'SSR',
				chineseName: '服务端渲染',
				description: '在服务器上先把页面拼装成 HTML 再发给浏览器，第一眼就能看到内容。',
			},
			{
				id: 'browser-storage',
				name: 'Browser Storage',
				chineseName: '浏览器存储',
				description: '把少量数据存在用户浏览器里，刷新或下次再来时还能读到。',
			},
		],
	},
	{
		id: 'backend',
		name: 'Backend',
		label: '后端',
		description: '处理业务逻辑、权限和数据请求的服务器端能力。',
		terms: [
			{
				id: 'api',
				name: 'API',
				chineseName: '应用程序接口',
				description: '让前端、后端或第三方服务按照约定交换数据和调用能力的接口。',
			},
			{
				id: 'endpoint',
				name: 'Endpoint',
				chineseName: '接口端点',
				description: 'API 中处理某一类请求的具体地址，例如 /api/search。',
			},
			{
				id: 'runtime',
				name: 'Runtime',
				chineseName: '运行时',
				description: '代码实际执行时依赖的环境，例如 Node.js、浏览器或 Cloudflare Workers。',
			},
			{
				id: 'middleware',
				name: 'Middleware',
				chineseName: '中间件',
				description: '在请求到达核心逻辑前后执行的通用处理，例如鉴权、日志或限流。',
			},
			{
				id: 'authentication',
				name: 'Authentication',
				chineseName: '身份验证',
				description: '确认访问者是谁的过程，常见方式包括密码、验证码和第三方登录。',
			},
			{
				id: 'environment-variable',
				name: 'Environment Variable',
				chineseName: '环境变量',
				description: '在代码之外保存运行配置和密钥，避免把敏感信息直接写进仓库。',
			},
		],
	},
	{
		id: 'ai-agent',
		name: 'AI & Agent',
		label: 'AI 与 Agent',
		description: '理解 AI 编码工具如何接收上下文、调用工具并完成任务。',
		terms: [
			{
				id: 'vibe-coding',
				name: 'Vibe Coding',
				chineseName: '氛围编程',
				description:
					'通过自然语言描述意图，让 AI 生成和修改代码，再根据运行结果持续反馈的开发方式。',
			},
			{
				id: 'prompt',
				name: 'Prompt',
				chineseName: '提示词',
				description: '交给 AI 的任务说明。清晰的提示词通常包含目标、上下文、约束和验收标准。',
			},
			{
				id: 'context',
				name: 'Context',
				chineseName: '上下文',
				description: '模型当前能看到的代码、文档、对话与工具结果，决定回答是否贴合项目实际。',
			},
			{
				id: 'context-window',
				name: 'Context Window',
				chineseName: '上下文窗口',
				description: '模型一次能够处理的信息容量。超出窗口后，较早的细节可能被压缩或移出。',
			},
			{
				id: 'agent',
				name: 'Agent',
				chineseName: '智能体',
				description: '能够围绕目标读取文件、调用工具、修改代码并验证结果的 AI 执行单元。',
			},
			{
				id: 'harness',
				name: 'Harness',
				chineseName: '智能体运行框架',
				description: '连接模型、工具、权限、状态和执行循环的框架，决定 Agent 如何真正完成工作。',
			},
			{
				id: 'mcp',
				name: 'MCP',
				chineseName: '模型上下文协议',
				description: '让 AI 应用以统一方式连接外部工具和数据源的开放协议。',
			},
			{
				id: 'skill',
				name: 'Skill',
				chineseName: '技能',
				description: '封装特定任务的方法、约束、脚本和素材，让 Agent 稳定复用一套工作流程。',
			},
		],
	},
	{
		id: 'data-storage',
		name: 'Data & Storage',
		label: '数据与存储',
		description: '保存、组织和读取应用数据时常见的基础概念。',
		terms: [
			{
				id: 'database',
				name: 'Database',
				chineseName: '数据库',
				description: '按结构持久保存应用数据，并支持查询、更新和删除。',
			},
			{
				id: 'schema',
				name: 'Schema',
				chineseName: '数据结构',
				description: '定义数据包含哪些字段、字段类型以及它们之间的关系。',
			},
			{
				id: 'migration',
				name: 'Migration',
				chineseName: '数据库迁移',
				description: '以可追踪的方式修改数据库结构，并让不同环境保持一致。',
			},
			{
				id: 'cache',
				name: 'Cache',
				chineseName: '缓存',
				description: '暂存经常使用的数据，减少重复计算或远程请求，提升响应速度。',
			},
			{
				id: 'vector-database',
				name: 'Vector Database',
				chineseName: '向量数据库',
				description: '保存向量表示并进行相似度检索，常用于语义搜索和知识库问答。',
			},
		],
	},
	{
		id: 'engineering-workflow',
		name: 'Engineering Workflow',
		label: '工程与协作',
		description: '管理代码变化、团队协作和安全回退的常用方法。',
		terms: [
			{
				id: 'git',
				name: 'Git',
				chineseName: '版本控制系统',
				description: '记录代码的每次变化，让开发者可以比较、协作和回退。',
			},
			{
				id: 'diff',
				name: 'Diff',
				chineseName: '代码差异',
				description: '代码修改前后的差异，是检查 AI 实际改了什么的最直接依据。',
			},
			{
				id: 'commit',
				name: 'Commit',
				chineseName: '提交',
				description: '把一组相关代码变化保存为带说明的版本节点。',
			},
			{
				id: 'branch',
				name: 'Branch',
				chineseName: '分支',
				description: '与主线隔离的开发路径，适合独立完成和验证一项修改。',
			},
			{
				id: 'pull-request',
				name: 'Pull Request',
				chineseName: '合并请求',
				description: '请求团队审查一组代码修改，并在确认后合并到目标分支。',
			},
			{
				id: 'checkpoint',
				name: 'Checkpoint',
				chineseName: '检查点',
				description: '可回退的阶段性状态，通常通过 Git 提交或工具快照保存。',
			},
		],
	},
	{
		id: 'deployment-runtime',
		name: 'Deployment & Runtime',
		label: '部署与运行',
		description: '把本地代码变成线上服务，并持续观察运行状态。',
		terms: [
			{
				id: 'build',
				name: 'Build',
				chineseName: '构建',
				description: '把源代码转换、打包成可以在目标环境运行或发布的产物。',
			},
			{
				id: 'ci-cd',
				name: 'CI/CD',
				chineseName: '持续集成与持续部署',
				description: '自动执行测试、构建和发布，减少手动操作带来的错误。',
			},
			{
				id: 'serverless',
				name: 'Serverless',
				chineseName: '无服务器架构',
				description: '由云平台管理服务器和扩缩容，开发者主要关注函数与业务逻辑。',
			},
			{
				id: 'edge-runtime',
				name: 'Edge Runtime',
				chineseName: '边缘运行时',
				description: '让代码在靠近用户的边缘节点运行，以降低网络延迟。',
			},
			{
				id: 'observability',
				name: 'Observability',
				chineseName: '可观测性',
				description: '通过日志、指标和追踪了解线上系统是否正常以及问题发生在哪里。',
			},
		],
	},
	{
		id: 'ui-patterns',
		name: 'UI Patterns',
		label: '界面图鉴',
		description: '屏幕上每一块的通用名字——认得它，才能让 AI 精确地改它。',
		terms: [
			{
				id: 'hero',
				name: 'Hero',
				chineseName: 'Hero 区',
				description: '首屏最上方那块用大标题和行动按钮定调的区域，整个页面的开场白。',
			},
			{
				id: 'navbar',
				name: 'Navbar',
				chineseName: '导航栏',
				description: '固定在页面顶部的横条，放站点标志和主要入口，负责「你在哪、能去哪」。',
			},
			{
				id: 'footer',
				name: 'Footer',
				chineseName: '页脚',
				description: '页面底部的收尾区，放次要链接、版权和联系方式，是页面的「片尾字幕」。',
			},
			{
				id: 'card',
				name: 'Card',
				chineseName: '卡片',
				description: '把一条内容装进带边界的小方块，成组排列，方便扫视和点击。',
			},
		],
	},
];

export interface VibeCodingConcept extends VibeCodingTerm {
	categoryId: string;
	categoryLabel: string;
	isCategory: boolean;
}

export function getVibeCodingConcepts(): VibeCodingConcept[] {
	return vibeCodingTermCategories.flatMap((category) => [
		{
			id: category.id,
			name: category.name,
			chineseName: category.label,
			description: category.description,
			categoryId: category.id,
			categoryLabel: category.label,
			isCategory: true,
		},
		...category.terms.map((term) => ({
			...term,
			categoryId: category.id,
			categoryLabel: category.label,
			isCategory: false,
		})),
	]);
}
