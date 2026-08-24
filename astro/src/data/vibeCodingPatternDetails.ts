export interface PatternPart {
	name: string;
	en: string;
	note: string;
}

export interface PatternVariant {
	title: string;
	description: string;
	sketch: string;
}

export interface PatternSpotRegion {
	id: string;
	name: string;
	en: string;
	correct: boolean;
	note: string;
}

export interface PatternQuizOption {
	key: string;
	text: string;
	correct: boolean;
	feedback: string;
}

export interface VibeCodingPatternProfile {
	/** hero 提问中术语名之后的部分 */
	question: string;
	/** 实战认块：在示例页面里点出这一块 */
	spot?: {
		title: string;
		intro: string;
		regions: PatternSpotRegion[];
	};
	/** 选择题 */
	quiz?: {
		question: string;
		options: PatternQuizOption[];
	};
	/** 01 解剖区的引言（名字来历等） */
	anatomyIntro: string;
	parts: PatternPart[];
	variants: PatternVariant[];
	usage: {
		fit: string[];
		unfit: string[];
	};
	prompts: string[];
	promptTip: string;
	warning: string;
}

export const vibeCodingPatternProfiles: Record<string, VibeCodingPatternProfile> = {
	hero: {
		question: '到底是什么？为什么首页最上面那一大块叫「英雄」？',
		spot: {
			title: '这个页面里，哪一块是 Hero？',
			intro: '下面是一个虚构产品的首页，每一块都能点。点点看，你能一眼认出 Hero 吗？',
			regions: [
				{
					id: 'navbar',
					name: '导航栏',
					en: 'Navbar',
					correct: false,
					note: '不是它。导航栏管「去哪儿」，不负责说清价值——它在 Hero 的上面。',
				},
				{
					id: 'hero',
					name: 'Hero',
					en: '',
					correct: true,
					note: '就是它！大标题、副标题、主按钮加配图，三秒钟说清这个产品是干嘛的。',
				},
				{
					id: 'logos',
					name: '客户标志条',
					en: 'Logo Strip',
					correct: false,
					note: '不是它。这排灰灰的 logo 是紧跟在 Hero 后面的信任背书区。',
				},
				{
					id: 'features',
					name: '功能卡片区',
					en: 'Features',
					correct: false,
					note: '不是它。功能明细是后续区块的活，Hero 只负责开场那一句。',
				},
			],
		},
		quiz: {
			question:
				'访客第一次打开产品官网，需要马上知道「这是什么、对我有什么用、下一步做什么」。哪种首屏组织最有效？',
			options: [
				{
					key: 'A',
					text: '明确的标题和副标题讲清价值，突出一个主要行动，配上必要的产品画面',
					correct: true,
					feedback: '对。Hero 的任务就是这三件事：说清价值、给一个动作、给一点证据。',
				},
				{
					key: 'B',
					text: '放一句抽象口号和大幅装饰图，具体内容留到页面底部慢慢讲',
					correct: false,
					feedback: '悬。访客平均只给你几秒钟，开场看不懂，就直接走了。',
				},
				{
					key: 'C',
					text: '把全部功能、三档定价和常见问题都塞进第一屏',
					correct: false,
					feedback: '太挤了。什么都想强调等于什么都没强调，这些内容属于后续区块。',
				},
			],
		},
		anatomyIntro:
			'名字借自海报设计里的 hero image——整版最抢眼的主视觉。落到网页上，它就是首屏顶部那块负责「三秒钟说清你是谁」的区域，通常由这几部分组成：',
		parts: [
			{
				name: '眉标',
				en: 'Eyebrow',
				note: '主标题上方的一行小字，先给个定位，比如「全新 2.0」。',
			},
			{
				name: '主标题',
				en: 'Headline',
				note: '一句话说清你是谁、给什么，整个页面最大的字。',
			},
			{
				name: '副标题',
				en: 'Subheadline',
				note: '补一两行细节，字号小一档、颜色淡一档。',
			},
			{
				name: '行动按钮',
				en: 'CTA',
				note: '最希望访客点的那个按钮，主按钮通常只有一个。',
			},
			{
				name: '配图',
				en: 'Visual',
				note: '产品截图或插画，撑起另一半画面。',
			},
		],
		variants: [
			{
				title: '居中式',
				description: '文案居中、按钮在下，适合信息单一的落地页。',
				sketch: 'center',
			},
			{
				title: '左文右图',
				description: '文案和产品截图各占一半，最常见的形态。',
				sketch: 'split',
			},
			{
				title: '全屏背景',
				description: '大图当背景、文字压在上面，氛围感强，注意文字对比度。',
				sketch: 'full',
			},
		],
		usage: {
			fit: [
				'产品或活动落地页的第一屏',
				'需要一句话说清价值主张的时候',
				'想引导访客做一个明确动作（注册、下载、试用）',
			],
			unfit: [
				'后台工具和仪表盘——用户要的是直接干活',
				'内容列表页——读者要的是列表本身',
				'一屏想塞三个以上卖点的时候',
			],
		},
		prompts: [
			'把 hero 的主标题改成「三天上线你的知识库」，副标题缩小一号',
			'hero 改成左文右图的布局，右边放一张产品截图',
			'hero 的主按钮换成品牌橙色，再加一个「查看文档」的次要按钮',
			'手机上 hero 太高了，压缩一下上下留白',
		],
		promptTip: '用名字指代区域，AI 才知道你说的是哪一块，也不会误伤页面的其他部分。',
		warning: 'Hero 不是仓库：一屏只讲一件事、只放一个主按钮。什么都想强调，等于什么都没强调。',
	},
	navbar: {
		question: '到底是什么？页面顶上那一条到底该放什么、不该放什么？',
		spot: {
			title: '这个页面里，哪一块是导航栏？',
			intro: '下面这个页面的每一块都能点。注意：放链接的地方可不止一处。',
			regions: [
				{
					id: 'navbar',
					name: '导航栏',
					en: 'Navbar',
					correct: true,
					note: '就是它！常驻顶部、全站一致，负责「你在哪、能去哪」。',
				},
				{
					id: 'hero',
					name: 'Hero 区',
					en: 'Hero',
					correct: false,
					note: '不是它。Hero 是开场白，负责说清价值，不负责带路。',
				},
				{
					id: 'tabs',
					name: '标签页',
					en: 'Tabs',
					correct: false,
					note: '不是它。标签页只在当前内容区里切换视图，管不到全站。',
				},
				{
					id: 'footer',
					name: '页脚',
					en: 'Footer',
					correct: false,
					note: '不是它。页脚也放链接，但它在底部做收尾和兜底。',
				},
			],
		},
		quiz: {
			question: '站点有 12 个页面入口，导航栏放不下了。怎么办最合理？',
			options: [
				{
					key: 'A',
					text: '保留三五个最重要的入口，其余归类收进下拉或「更多」菜单',
					correct: true,
					feedback: '对。导航栏是精选入口，不是站点地图——收纳和分组是它的基本功。',
				},
				{
					key: 'B',
					text: '把字号改小一点，12 个都排上去',
					correct: false,
					feedback: '不行。挤下了也没人看得清，窄屏上更是直接爆掉。',
				},
				{
					key: 'C',
					text: '干脆去掉导航栏，让用户用搜索',
					correct: false,
					feedback: '太狠了。搜索是补充，常用入口还是要一抬头就能点到。',
				},
			],
		},
		anatomyIntro:
			'它几乎出现在每个页面的同一个位置。这份稳定感正是它的价值：无论你在哪一页，抬头就能找到路。它通常由这几部分组成：',
		parts: [
			{ name: '站点标志', en: 'Logo', note: '站点的名字或图标，习惯上点它回首页。' },
			{ name: '导航链接', en: 'Links', note: '三五个主要入口，再多就该收进菜单。' },
			{ name: '行动按钮', en: 'Action', note: '最想让用户做的事，比如登录或「开始使用」。' },
			{ name: '汉堡菜单', en: 'Hamburger', note: '窄屏时链接收进这三条杠里，点开再展开。' },
		],
		variants: [
			{
				title: '标准式',
				description: 'Logo 在左、链接随后、按钮收尾，最通用。',
				sketch: 'nav-standard',
			},
			{ title: '居中式', description: '链接居中排布，品牌感强，内容站常用。', sketch: 'nav-center' },
			{ title: '汉堡式', description: '窄屏形态：只留 Logo 和菜单按钮。', sketch: 'nav-burger' },
		],
		usage: {
			fit: ['几乎所有多页面的站点', '用户需要随时跳转主要板块', '需要常驻的登录、注册入口'],
			unfit: [
				'单屏落地页——一个锚点菜单就够了',
				'沉浸式阅读或全屏工具——顶条会一直抢注意力',
				'入口超过七个还不收纳的时候',
			],
		},
		prompts: [
			'导航栏加一个「定价」入口，放在「文档」后面',
			'导航栏滚动时固定在页面顶部，加一点淡淡的阴影',
			'手机上导航栏收成汉堡菜单',
			'导航栏右侧的登录按钮换成头像加下拉菜单',
		],
		promptTip: '说清「加在哪个入口旁边」，AI 就不会打乱你原本的顺序。',
		warning:
			'导航栏是全站的承诺：每一页都长一样、都在老地方。单独给某一页改导航，用户会以为自己跳到了别的网站。',
	},
	footer: {
		question: '到底是什么？为什么每个网站的最底下都长得差不多？',
		spot: {
			title: '这个页面里，哪一块是页脚？',
			intro: '一路滚到底。注意有一块长得很像收尾，但其实还在正文里。',
			regions: [
				{
					id: 'navbar',
					name: '导航栏',
					en: 'Navbar',
					correct: false,
					note: '不是它。顶部那条是导航栏——位置是它俩最直观的区别。',
				},
				{
					id: 'hero',
					name: 'Hero 区',
					en: 'Hero',
					correct: false,
					note: '不是它。这是开场白，页脚是片尾字幕，一头一尾。',
				},
				{
					id: 'cta',
					name: '行动区块',
					en: 'CTA Section',
					correct: false,
					note: '不是它。这块「最后再劝你一次」的横条还属于正文，页脚在它下面。',
				},
				{
					id: 'footer',
					name: '页脚',
					en: 'Footer',
					correct: true,
					note: '就是它！品牌、链接分组加法务行——页面的片尾字幕。',
				},
			],
		},
		quiz: {
			question: '用户想找「退款政策」，翻遍正文没找到。按习惯它最应该在哪里？',
			options: [
				{
					key: 'A',
					text: '页脚的链接分组里',
					correct: true,
					feedback: '对。用户找不到东西时会本能地滚到底——页脚就是全站的兜底目录。',
				},
				{
					key: 'B',
					text: '放进首屏 Hero，越显眼越好',
					correct: false,
					feedback: '不合适。Hero 只讲最重要的一件事，退款政策是查阅型信息。',
				},
				{
					key: 'C',
					text: '写在某篇博客文章里',
					correct: false,
					feedback: '等于藏起来了。查阅型信息要放在用户能预期到的位置。',
				},
			],
		},
		anatomyIntro:
			'它是页面的片尾字幕：不抢戏，但该有的都在。用户滚到底还没找到想要的东西时，页脚是最后的兜底。它通常由这几部分组成：',
		parts: [
			{ name: '品牌区', en: 'Brand', note: 'Logo 和一句话简介，最后再自我介绍一次。' },
			{ name: '链接分组', en: 'Link Groups', note: '按主题分成几列：产品、资源、关于。' },
			{ name: '社交图标', en: 'Social', note: '通往社交账号的一排小图标。' },
			{ name: '法务行', en: 'Legal', note: '版权、备案号、条款和隐私政策，通常在最底一行。' },
		],
		variants: [
			{ title: '多列式', description: '品牌加三四列链接，内容站标配。', sketch: 'ft-columns' },
			{ title: '极简式', description: '一行搞定：版权加几个链接，小站够用。', sketch: 'ft-minimal' },
			{ title: '行动式', description: '收尾前再放一次行动召唤，落地页常用。', sketch: 'ft-cta' },
		],
		usage: {
			fit: [
				'几乎每个页面——它是默认配置',
				'收纳导航栏放不下的次要入口',
				'法务信息、备案号这类必须展示的内容',
			],
			unfit: [
				'全屏工具界面（编辑器、画板）',
				'无限滚动的信息流——用户永远到不了底',
				'把它当杂物抽屉，什么都往里塞的时候',
			],
		},
		prompts: [
			'页脚加一列「资源」，放博客和帮助中心的链接',
			'页脚最底下加上备案号和隐私政策',
			'页脚改成深色背景，和正文区分开',
			'页脚的社交图标只留 GitHub 和 X',
		],
		promptTip: '页脚通常全站共用一份，改一次处处生效——这正是组件的用法。',
		warning: '页脚是兜底，不是仓库。用户滚到底是来找东西的：分好组，比堆满四十个链接有用得多。',
	},
	card: {
		question: '到底是什么？为什么现在的网页到处都是一块一块的小方框？',
		spot: {
			title: '这个页面里，哪一块是卡片？',
			intro: '注意下面有两种列内容的方式，长得像，但不是一回事。',
			regions: [
				{
					id: 'navbar',
					name: '导航栏',
					en: 'Navbar',
					correct: false,
					note: '不是它。这是顶部导航，跟内容展示没关系。',
				},
				{
					id: 'hero',
					name: 'Hero 区',
					en: 'Hero',
					correct: false,
					note: '不是它。Hero 是整页的开场白，不是内容单元。',
				},
				{
					id: 'cards',
					name: '卡片',
					en: 'Card',
					correct: true,
					note: '就是它！每条内容一个独立容器：有边界、有封面、整块可点。',
				},
				{
					id: 'list',
					name: '列表行',
					en: 'List Row',
					correct: false,
					note: '不是它。列表行只用分割线隔开，没有独立容器——这正是它和卡片的本质区别。',
				},
			],
		},
		quiz: {
			question: '30 篇文章要展示成一页。卡片和列表，怎么选？',
			options: [
				{
					key: 'A',
					text: '有封面、想让人随便逛逛就用卡片；密度优先、想让人快速查找就用列表',
					correct: true,
					feedback: '对。卡片适合「逛」，列表适合「查」——按用户的目的选，不按好不好看选。',
				},
				{
					key: 'B',
					text: '永远用卡片，看起来更现代',
					correct: false,
					feedback: '卡片的代价是密度：一屏放不了几条。为了好看牺牲效率，用户不会领情。',
				},
				{
					key: 'C',
					text: '永远用列表，信息密度最高',
					correct: false,
					feedback: '有封面图的内容排成纯列表会很干，「逛」的场景需要视觉入口。',
				},
			],
		},
		anatomyIntro:
			'卡片借的是实体卡片的隐喻：信息装进一个有边界的容器，看得出哪里开始、哪里结束，整张都能点。它通常由这几部分组成：',
		parts: [
			{ name: '封面', en: 'Cover', note: '图片或图标，第一眼的识别物。' },
			{ name: '标题', en: 'Title', note: '这条内容叫什么，一行说完。' },
			{ name: '摘要', en: 'Description', note: '一两行补充，勾起点进去的兴趣。' },
			{ name: '元信息', en: 'Meta', note: '日期、标签、作者这类小字。' },
		],
		variants: [
			{ title: '图文卡', description: '上图下文，博客和商品网格的标配。', sketch: 'card-media' },
			{ title: '横排卡', description: '图左文右，列表里的紧凑形态。', sketch: 'card-row' },
			{ title: '纯文字卡', description: '没有图，靠边界和留白立住体面。', sketch: 'card-text' },
		],
		usage: {
			fit: ['内容各自独立、可以单独点开时', '有封面图这类视觉元素时', '数量不定、需要自动换行的网格'],
			unfit: [
				'需要逐行对比数据——用表格',
				'高密度信息查找——用列表',
				'内容之间有严格顺序或层级的时候',
			],
		},
		prompts: [
			'把文章列表改成三列卡片，带封面图',
			'卡片 hover 时轻微上浮，加一点阴影',
			'卡片的元信息只留日期，去掉作者',
			'手机上卡片改成单列排布',
		],
		promptTip: '整张卡片都应该能点，别只让标题可点——这是最常见的体验坑之一。',
		warning: '卡片的代价是密度：一屏放不下几条。当用户要的是快速扫一大堆条目时，朴素的列表反而更好用。',
	},
};
