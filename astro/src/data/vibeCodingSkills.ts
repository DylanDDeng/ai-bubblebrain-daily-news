export interface VibeCodingSkillCategory {
	id: string;
	name: string;
	label: string;
	description: string;
}

/** 各 skill 的中文导读（正文原文见 content/skills/<id>.md）。 */
export interface VibeCodingSkillMeta {
	chineseName: string;
	description: string;
}

/** 配套套件：成员仍是独立 skill，但首页成组展示、详情页互链。 */
export interface VibeCodingSkillFamily {
	id: string;
	title: string;
	/** 第一个为套件入口，其余为配套技能 */
	skillIds: string[];
}

export const vibeCodingSkillFamilies: VibeCodingSkillFamily[] = [
	{
		id: 'grill-with-docs',
		title: 'Grill 设计拷问套件',
		skillIds: ['grill-with-docs', 'grilling', 'domain-modeling'],
	},
];

export const vibeCodingSkillCategories: VibeCodingSkillCategory[] = [
	{
		id: 'ui',
		name: 'UI',
		label: 'UI',
		description: '让 AI 按你项目自己的设计规范审视、审计并改进界面。',
	},
	{
		id: 'engineering',
		name: 'Engineering',
		label: '工程',
		description: '开发工作流里的技能：设计拷问、架构决策、文档沉淀。',
	},
];

export const vibeCodingSkillMeta: Record<string, VibeCodingSkillMeta> = {
	'improve-ui': {
		chineseName: '改进 UI',
		description:
			'对照产品自己的设计证据审计界面，找出可验证的 UI 问题，并为另一个 agent 写出自包含的实施计划；对产品源码严格只读。',
	},
	'ui-skills-root': {
		chineseName: 'UI 技能路由',
		description:
			'UI 工作动手前先用它路由：按主题、技术栈和意图，用 ui-skills CLI 挑出最小可用的一组技能再开工。',
	},
	'improve-animations': {
		chineseName: '改进动画',
		description:
			'以资深动效顾问的视角盘点代码库里的动画与动效，产出分优先级的问题清单和自包含实施计划；只读源码，只写计划不动手。',
	},
	'design-taste-frontend': {
		chineseName: '前端设计品味',
		description:
			'反模板前端技能：读需求、定方向、再落地，针对落地页、作品集和改版，产出不像套模板的界面。',
	},
	'high-end-visual-design': {
		chineseName: '高端视觉设计',
		description:
			'让 AI 像高端设计公司那样做界面：明确规定字体、间距、阴影、卡片结构和动画，封杀一切廉价默认值。',
	},
	'redesign-existing-projects': {
		chineseName: '项目重设计',
		description:
			'审计现有网站和应用，找出千篇一律的 AI 味设计，在不破坏功能的前提下按高端标准逐项升级。',
	},
	'minimalist-ui': {
		chineseName: '极简 UI',
		description:
			'干净的编辑风界面：暖色单色板、排版对比、扁平 bento 网格、灰调粉彩，禁渐变和重阴影。',
	},
	'full-output-enforcement': {
		chineseName: '完整输出强制',
		description:
			'覆盖 LLM 默认截断行为：强制完整代码输出、封禁占位符模式，并优雅处理 token 上限分段。',
	},
	'industrial-brutalist-ui': {
		chineseName: '工业粗野 UI',
		description:
			'原始机械感界面：瑞士版式印刷混合军用终端美学，刚性网格、极端字阶对比、模拟信号做旧效果。',
	},
	'stitch-design-taste': {
		chineseName: 'Stitch 设计系统',
		description:
			'面向 Google Stitch 的语义化设计系统技能：生成强约束、防平庸的 agent 友好 DESIGN.md。',
	},
	'gpt-taste': {
		chineseName: 'GPT 设计品味',
		description:
			'UX/UI 与 GSAP 动效工程师人设：脚本驱动布局真随机化、AIDA 页面结构、宽排版、无缝 bento 网格。',
	},
	brandkit: {
		chineseName: '品牌套件',
		description:
			'高端品牌视觉生成：品牌规范板、logo 系统、视觉识别提案，覆盖从极简到奢华的多种品牌气质。',
	},
	'image-to-code': {
		chineseName: '图生代码',
		description:
			'先当艺术指导生成设计图，深度分析后再实现成尽量还原的真实前端，专为重视觉的网页任务设计。',
	},
	'imagegen-frontend-web': {
		chineseName: '网页视觉方向',
		description:
			'为网站逐节生成高级感、注重转化的设计参考图：一节一图，强制构图多样性，杜绝模板化排版。',
	},
	'imagegen-frontend-mobile': {
		chineseName: '移动端视觉方向',
		description:
			'生成原生质感的高级 App 屏幕概念图与流程：清晰的层级、舒适的可读文字、多屏一致性。',
	},
	'design-taste-frontend-v1': {
		chineseName: '前端设计品味 v1',
		description: '初版 taste-skill 存档，仅当项目依赖其确切行为时使用；当前默认是重写后的 v2。',
	},
	'grill-with-docs': {
		chineseName: '文档拷问',
		description:
			'对计划或设计发起不留情面的连环追问：用代码库、CONTEXT.md 术语表和 ADR 拷打边界情况，并把沉淀的结论回写进文档。',
	},
	grilling: {
		chineseName: '连环拷问',
		description:
			'就一个计划、决策或想法对用户穷追不舍地提问，直到达成共识：把决策树画出来，逼出每个分支的答案。',
	},
	'domain-modeling': {
		chineseName: '领域建模',
		description:
			'主动构建并打磨项目的领域模型：挑战模糊术语、构造边界场景，结论一旦成型立即写进 CONTEXT.md 和 ADR。',
	},
	'agent-browser': {
		chineseName: '浏览器自动化',
		description:
			'给 AI agent 的浏览器自动化 CLI：导航、填表、点击、截图、抓数据、测 Web 应用都能干，支持无头/真实 Chrome/云浏览器与会话保持。',
	},
};
