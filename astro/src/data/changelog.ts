export type ChangelogCategory = 'feature' | 'content' | 'polish';

export interface ChangelogItem {
	date: string;
	title: string;
	tag: string;
	type: ChangelogCategory;
	summary: string;
	highlights?: string[];
	links?: Array<{
		label: string;
		href: string;
	}>;
}

export const changelog: ChangelogItem[] = [
	{
		date: '2026-09-04',
		tag: '搜索与阅读体验',
		type: 'feature',
		title: '全站知识搜索与文章阅读体验升级',
		summary:
			'知识搜索现已覆盖教程、精选阅读、术语、Skills、Design 与关于页；文章页同步升级图片呈现、阅读尺度和内容统计，并收录 Vercel 的 design.md 设计评测实践。',
		highlights: [
			'知识搜索扩展至 213 条全站内容，保留更新日志在索引之外',
			'文章正文采用更舒适的阅读宽度，图片与正文对齐并支持响应式加载和大图查看',
			'首页内容数字改为根据实际可阅读页面实时统计',
			'精选阅读新增 Vercel《Agent 如何用 design.md 构建符合品牌的页面》中英双语全文',
		],
		links: [
			{ label: '体验知识搜索', href: '/search/' },
			{
				label: '阅读 Vercel design.md 实践',
				href: '/highlights/2026-08-31-how-our-agents-build-on-brand-pages-with-design-md/',
			},
		],
	},
	{
		date: '2026-09-02',
		tag: '精选阅读',
		type: 'content',
		title: '收录 Anthropic 官方指南《为 Claude Fable 5.1 编写提示》',
		summary:
			'Anthropic 针对 Claude Fable 5.1 的官方实战提示指南：详解 Effort 参数调优、长任务持续汇报机制，以及工具批量调用、对话历史与视觉任务处理。',
		highlights: [
			'系统梳理 Fable 5.1 模型特性与思考预算（Thinking Effort）配置方法',
			'解析 Agent 长任务中避免过早退出的提示词约束模式',
			'收录完整中英双语对照版本与实战代码样例',
		],
		links: [
			{
				label: '阅读实战指南',
				href: '/highlights/2026-09-02-prompting-claude-fable-5-1/',
			},
		],
	},
	{
		date: '2026-08-31',
		tag: '交互与教程',
		type: 'polish',
		title: '侧边栏手风琴导航升级 & 新手村《AI 为什么会遗忘》',
		summary:
			'左侧主导航新增手风琴互斥折叠效果，大幅优化移动端浏览体验；新手村上线图解新篇《AI 为什么会遗忘》。',
		highlights: [
			'侧边栏多级菜单支持原生互斥展开，精简页面滚动距离',
			'新手村新增《AI 为什么会遗忘》，图解上下文窗口、注意力机制与 KV Cache 限制',
			'配套上线直觉互动实验，直观体验上下文截断的影响',
		],
		links: [
			{
				label: '阅读《AI 为什么会遗忘》',
				href: '/newbie-tutorials/why-ai-forgets/',
			},
		],
	},
	{
		date: '2026-08-30',
		tag: '新栏目上线',
		type: 'content',
		title: '「新手村」栏目正式上线',
		summary:
			'专为零技术背景读者打造，用直觉比喻、动图与交互小实验讲透大模型的核心工作原理。',
		highlights: [
			'首发上线《AI 为什么会胡说八道》《什么是知识库》等核心图解教程',
			'内置动态交互小实验，直观体验大模型概率采样与幻觉成因',
			'主站导航与知识库首页正式接入「新手村」独立专区',
		],
		links: [
			{
				label: '前往「新手村」体验',
				href: '/newbie-tutorials/',
			},
		],
	},
	{
		date: '2026-08-29',
		tag: '关于页与术语',
		type: 'polish',
		title: '关于页上线微信交流渠道 & Token 术语图解完善',
		summary:
			'关于页正式上线微信「BubbleBrain小助手」二维码与读者交流渠道；Vibe Coding 术语专区完善 Token 换算与交互实验。',
		highlights: [
			'关于页（中/英）新增微信小助手二维码与交流渠道',
			'修正 Token 术语的中英字符换算逻辑并补齐定制动态图解',
		],
		links: [
			{ label: '查看关于页', href: '/about/' },
			{ label: '查看 Token 术语', href: '/vibe-coding/terms/token/' },
		],
	},
	{
		date: '2026-08-28',
		tag: '系统升级',
		type: 'polish',
		title: '接入 Umami 隐私友好访问统计',
		summary:
			'全站接入轻量、合规且不追踪个人隐私的 Umami 访问统计系统，完成 Cloudflare Pages 严格的 CSP 安全放行。',
		highlights: [
			'替代繁重且国内访问受限的传统分析工具，脚本体积仅 2KB 且无 Cookie',
			'严格配置 Content-Security-Policy，确保生产环境静态交付安全',
		],
	},
	{
		date: '2026-08-27',
		tag: '重大更新',
		type: 'feature',
		title: 'Vibe Coding「Design 专区」与「Skills 技能库」双上线',
		summary:
			'重磅推出 Vibe Coding 旗下两大专区：23+ 家知名科技品牌 DESIGN.md 规范库与 20+ 个生产级 Agent Skills 库。',
		highlights: [
			'上线 Design 专区：系统拆解 Stripe、Vercel、Apple、Linear 等知名品牌的视觉规范与设计哲学',
			'上线 Skills 专区：收录 agent-browser 等 20 个开箱即用的 AI Agent 技能',
			'提供一键复制的 Prompt 指令，帮助 AI 编码工具输出顶级工程代码',
		],
		links: [
			{ label: '浏览 Design 专区', href: '/vibe-coding/design/' },
			{ label: '探索 Skills 技能库', href: '/vibe-coding/skills/' },
		],
	},
	{
		date: '2026-08-24',
		tag: '视觉改版',
		type: 'feature',
		title: '知识库首页全新改版 V2',
		summary:
			'首页采用全新的动效视觉与 RicoUI 设计系统，上线知识库全局分类、术语交互式 Demo 与互动猫咪视线追踪。',
		highlights: [
			'引入动效 Editorial 风格排版，更加清爽聚焦',
			'集成 Canvas 视线追踪交互与文章数据统计看板',
			'上线全局知识分类索引与精选内容智能排序',
		],
		links: [{ label: '回到首页体验', href: '/' }],
	},
];
