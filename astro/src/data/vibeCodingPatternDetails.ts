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
	modal: {
		question: '到底是什么？它和角落里弹出来的小提示是一回事吗？',
		spot: {
			title: '这个页面里，哪一个是弹窗？',
			intro: '这页有点热闹——三种浮层同时出现了。哪个才是弹窗？',
			regions: [
				{
					id: 'modal',
					name: '弹窗',
					en: 'Modal',
					correct: true,
					note: '就是它！压暗背景、拦在页面中央，不表态就不放行。',
				},
				{
					id: 'toast',
					name: '轻提示',
					en: 'Toast',
					correct: false,
					note: '不是它。角落里自己出现、自己消失、不拦你路的是 Toast。',
				},
				{
					id: 'drawer',
					name: '抽屉',
					en: 'Drawer',
					correct: false,
					note: '不是它。从屏幕边缘滑出来的面板是抽屉，常放菜单或详情。',
				},
			],
		},
		quiz: {
			question: '用户点了「删除项目」。用哪种方式确认最合适？',
			options: [
				{
					key: 'A',
					text: '弹窗：拦下页面，问清楚才放行',
					correct: true,
					feedback: '对。危险且不可逆的操作，值得打断一次——这正是弹窗存在的理由。',
				},
				{
					key: 'B',
					text: 'Toast：删完之后再告诉他一声',
					correct: false,
					feedback: 'Toast 不拦路——等用户看到提示，数据已经没了。不可逆操作不能事后通知。',
				},
				{
					key: 'C',
					text: '不确认，直接删，做个撤销功能',
					correct: false,
					feedback: '撤销是高级做法，但覆盖不了批量删除、网络失败这些场景。重要数据先问清楚最稳。',
				},
			],
		},
		anatomyIntro:
			'它的本领是「打断」：背景压暗、页面暂停，所有注意力被收进这个框里，直到你做出选择。它通常由这几部分组成：',
		parts: [
			{ name: '遮罩', en: 'Overlay', note: '压暗的背景层，宣告「页面先等一等」。' },
			{ name: '标题', en: 'Title', note: '一句话说清要你决定什么。' },
			{ name: '内容区', en: 'Body', note: '做决定所需的说明，或一个小表单。' },
			{ name: '操作按钮', en: 'Actions', note: '确认加取消，主次要分明。' },
			{ name: '关闭按钮', en: 'Close', note: '右上角的 ×，给用户随时反悔的出口。' },
		],
		variants: [
			{ title: '确认框', description: '一句话加两个按钮，处理危险操作。', sketch: 'md-confirm' },
			{ title: '表单弹窗', description: '装个小表单，不用跳页就能填。', sketch: 'md-form' },
			{ title: '全屏弹窗', description: '手机上常见：干脆占满整个屏幕。', sketch: 'md-full' },
		],
		usage: {
			fit: ['危险或不可逆操作前的确认', '必须先完成的小任务（登录、选择）', '不想让用户跳走的快捷表单'],
			unfit: [
				'「成功」「已保存」这类通知——用 Toast',
				'大段内容浏览——直接开新页面',
				'弹窗里再弹弹窗的时候',
			],
		},
		prompts: [
			'删除按钮点击后加一个确认弹窗，主按钮用红色',
			'把登录表单改成弹窗，不要跳页',
			'弹窗要能点遮罩关闭，也能按 Esc 关闭',
			'手机上这个弹窗改成全屏样式',
		],
		promptTip: '说清触发时机（点了什么才弹），AI 才不会把它做成一进页面就弹。',
		warning:
			'弹窗是在向用户借注意力，借多了会赖账：一进站就弹、弹完还弹，用户只会练出无脑点关闭的肌肉记忆。',
	},
	toast: {
		question: '到底是什么？为什么叫「吐司」？',
		spot: {
			title: '这个页面里，哪一个是 Toast？',
			intro: '三个都在「提示」你，但只有一个会自己消失。',
			regions: [
				{
					id: 'toast',
					name: '轻提示',
					en: 'Toast',
					correct: true,
					note: '就是它！角落弹出、几秒后自己消失，不需要你做任何事。',
				},
				{
					id: 'modal',
					name: '弹窗',
					en: 'Modal',
					correct: false,
					note: '不是它。拦住整页要你表态的是弹窗，分量重得多。',
				},
				{
					id: 'badge',
					name: '徽标',
					en: 'Badge',
					correct: false,
					note: '不是它。图标角上的红点数字是徽标——常驻计数，不会自己消失。',
				},
			],
		},
		quiz: {
			question: '「保存成功」用什么方式告诉用户最合适？',
			options: [
				{
					key: 'A',
					text: 'Toast——不打断，看到了就行',
					correct: true,
					feedback: '对。成功不需要用户做任何决定，给个轻轻的确定感就够了。',
				},
				{
					key: 'B',
					text: '弹窗——重要的事就该拦下来',
					correct: false,
					feedback: '保存成功不需要决定，拦路是浪费注意力，还要多点一次关闭。',
				},
				{
					key: 'C',
					text: '不提示——保存成功本来就是应该的',
					correct: false,
					feedback: '静默会让用户心里打鼓「到底存上没有」。轻反馈是必要的确定感。',
				},
			],
		},
		anatomyIntro:
			'名字来自吐司机：面包「啪」地弹出来，过一会儿就该拿走了。它是最轻的反馈方式——不拦路、不要求回应、自己消失。组成也最简单：',
		parts: [
			{ name: '状态图标', en: 'Icon', note: '绿勾、红叉或感叹号，一眼定性。' },
			{ name: '消息文字', en: 'Message', note: '一句话说清刚才发生了什么。' },
			{ name: '操作链接', en: 'Action', note: '可选的「撤销」或「查看」，给个快捷出口。' },
			{ name: '倒计时', en: 'Timer', note: '有的会显示还剩几秒消失。' },
		],
		variants: [
			{ title: '成功型', description: '绿色调：已保存、已复制。', sketch: 'ts-success' },
			{ title: '报错型', description: '红色调，停留得比成功型久一点。', sketch: 'ts-error' },
			{ title: '带操作', description: '附一个「撤销」，给颗后悔药。', sketch: 'ts-action' },
		],
		usage: {
			fit: ['操作成功的确认（已保存、已复制）', '不需要回应的状态通知', '附带「撤销」的轻量后悔药'],
			unfit: [
				'需要用户做决定——用弹窗',
				'重要报错——别让它三秒就消失',
				'大量消息连环弹的时候',
			],
		},
		prompts: [
			'保存成功后弹一个 Toast，两秒后自动消失',
			'Toast 挪到右下角，别挡住导航',
			'删除后的 Toast 加一个「撤销」按钮',
			'报错的 Toast 用红色图标，停留五秒',
		],
		promptTip: '顺手说清位置和消失时间，这两样最影响体验，也最容易被 AI 随机发挥。',
		warning:
			'Toast 会自己消失——所以永远别用它传达「必须被看到」的信息。错过一条成功提示没事，错过一条扣费警告就是事故。',
	},
	form: {
		question: '到底是什么？为什么填表单的地方总是最容易流失用户？',
		spot: {
			title: '这个页面里，哪一块是表单？',
			intro: '有输入框不一定是表单——看它收几样东西、交给谁。',
			regions: [
				{
					id: 'form',
					name: '表单',
					en: 'Form',
					correct: true,
					note: '就是它！多个带标签的输入项加一个提交按钮，一次交付。',
				},
				{
					id: 'search',
					name: '搜索框',
					en: 'Search',
					correct: false,
					note: '不是它。单个输入框加放大镜是搜索框——表单的近亲，但只收一个词。',
				},
				{
					id: 'cta',
					name: '行动区块',
					en: 'CTA',
					correct: false,
					note: '不是它。只有按钮没有输入项，这是行动召唤，不收集信息。',
				},
			],
		},
		quiz: {
			question: '注册表单有 9 个字段，一半用户填到中途就放弃了。最有效的改进是？',
			options: [
				{
					key: 'A',
					text: '砍掉非必要字段，剩下的拆成两三步',
					correct: true,
					feedback: '对。每个字段都是流失点——先做减法，减不动了再分步。',
				},
				{
					key: 'B',
					text: '把提交按钮做得更大更醒目',
					correct: false,
					feedback: '用户不是找不到按钮，是不想填这么多。按钮再大也救不了九个字段。',
				},
				{
					key: 'C',
					text: '加一段鼓励文案让用户坚持',
					correct: false,
					feedback: '文案劝不动嫌麻烦的人。减少麻烦本身才是解法。',
				},
			],
		},
		anatomyIntro:
			'它是网页里唯一「用户向系统交东西」的零件：每项输入配着名字和提示，最后由提交按钮一次交付。它通常由这几部分组成：',
		parts: [
			{ name: '标签', en: 'Label', note: '这一格要填什么，写在输入框上方或左侧。' },
			{ name: '输入框', en: 'Input', note: '真正接收内容的地方：文本、密码、下拉都算。' },
			{ name: '校验提示', en: 'Hint', note: '格式要求和填错时的红字，就近出现。' },
			{ name: '提交按钮', en: 'Submit', note: '一次交付所有内容，通常只有一个。' },
		],
		variants: [
			{ title: '单列式', description: '从上到下一列填完，最不容易漏。', sketch: 'fm-single' },
			{ title: '分步式', description: '长表单拆成几步，每步只问一点。', sketch: 'fm-steps' },
			{ title: '行内式', description: '一行搞定：输入框加按钮，订阅框常用。', sketch: 'fm-inline' },
		],
		usage: {
			fit: ['注册、登录、下单这类收集信息的场景', '设置页——每一项都是微型表单', '组合条件的筛选器'],
			unfit: [
				'只收一个词——一个搜索框就够了',
				'能自动获取的信息，别再开口问用户',
				'想把问卷调查塞进注册流程的时候',
			],
		},
		prompts: [
			'注册表单只留邮箱和密码，其他信息注册后再补',
			'邮箱输入框加格式校验，错了在输入框下方红字提示',
			'提交时按钮变灰并显示加载中，防止重复提交',
			'表单报错别用弹窗，就在对应输入框下面提示',
		],
		promptTip: '校验规则说得越具体（什么格式、什么时机提示），AI 做出来的表单越省心。',
		warning: '表单是流失的重灾区：每多一个字段就劝退一批人。加字段前先问一句——这项现在真的必须要吗？',
	},
	tabs: {
		question: '到底是什么？它和顶部的导航栏有什么区别？',
		spot: {
			title: '这个页面里，哪一块是标签页？',
			intro: '三个都在帮你「定位」，但只有一个能切换视图。',
			regions: [
				{
					id: 'tabs',
					name: '标签页',
					en: 'Tabs',
					correct: true,
					note: '就是它！同一块区域里的平级视图，点一下换一个，当前项高亮。',
				},
				{
					id: 'navbar',
					name: '导航栏',
					en: 'Navbar',
					correct: false,
					note: '不是它。顶部那条管的是全站跳转，换的是整个页面。',
				},
				{
					id: 'breadcrumb',
					name: '面包屑',
					en: 'Breadcrumb',
					correct: false,
					note: '不是它。这行带分隔符的路径是面包屑——标记你在第几层，不切换视图。',
				},
			],
		},
		quiz: {
			question: '产品页要放「功能介绍、用户评价、价格」三块内容在同一个位置。用标签页合适吗？',
			options: [
				{
					key: 'A',
					text: '合适——平级内容共享空间，正是标签页的用途',
					correct: true,
					feedback: '对。三块内容平级、用户各取所需，标签页让每个人直达想看的那块。',
				},
				{
					key: 'B',
					text: '不如全部纵向铺开，滚动就能看',
					correct: false,
					feedback: '铺开也是常见做法，但每块内容都很长时页面会失控——空间紧张时标签页更聚焦。',
				},
				{
					key: 'C',
					text: '做三个弹窗轮流弹出来',
					correct: false,
					feedback: '弹窗是打断工具，不是浏览工具。让用户连关三个弹窗是行为艺术。',
				},
			],
		},
		anatomyIntro:
			'它解决的是「地方小、内容多」：几组平级内容共享同一块屏幕，标签负责切换，当前那个高亮。它通常由这几部分组成：',
		parts: [
			{ name: '标签列', en: 'Tab List', note: '横排的几个选项，最好不超过五个。' },
			{ name: '当前标签', en: 'Active Tab', note: '下划线或底色高亮，标记你在哪个视图。' },
			{ name: '内容面板', en: 'Panel', note: '标签对应的内容区，一次只显示一个。' },
		],
		variants: [
			{ title: '下划线式', description: '激活标签下一条横线，最常见。', sketch: 'tb-underline' },
			{ title: '胶囊式', description: '激活项一块底色，像分组开关。', sketch: 'tb-pill' },
			{ title: '竖排式', description: '标签竖在左侧，设置页常用。', sketch: 'tb-vertical' },
		],
		usage: {
			fit: ['平级内容共享同一块空间', '设置页的分组', '详情页的多维度信息（介绍、评价、参数）'],
			unfit: [
				'内容有先后顺序——用分步向导',
				'用户需要同时对比两块内容时',
				'标签超过五个——考虑下拉或侧边栏',
			],
		},
		prompts: [
			'把介绍、评价、参数做成标签页，默认显示介绍',
			'标签页换成胶囊样式，激活项用品牌橙色',
			'标签状态同步到网址，刷新后还停在原来的标签',
			'手机上标签放不下就允许横向滑动',
		],
		promptTip: '记得说默认选中哪个标签——这是最容易被 AI 猜错的细节。',
		warning: '标签页会藏内容：用户不点，第二个标签就永远没被看见。放进去的内容，默认只有一半人会看到。',
	},
	slider: {
		question: '到底是什么？什么时候该用它、什么时候千万别用？',
		spot: {
			title: '这个设置面板里，哪一个是滑块？',
			intro: '三个长条控件，长得像亲兄弟，脾气完全不同。',
			regions: [
				{
					id: 'slider',
					name: '滑块',
					en: 'Slider',
					correct: true,
					note: '就是它！轨道加手柄，拖到哪儿值就是多少。',
				},
				{
					id: 'progress',
					name: '进度条',
					en: 'Progress',
					correct: false,
					note: '不是它。长得几乎一样但不能拖——进度条是只读的，它汇报，不接受指挥。',
				},
				{
					id: 'toggle',
					name: '开关',
					en: 'Toggle',
					correct: false,
					note: '不是它。非开即关、没有中间值的是开关。',
				},
			],
		},
		quiz: {
			question: '让用户填「预算上限（精确到元）」，用什么控件？',
			options: [
				{
					key: 'A',
					text: '数字输入框——精确数值就该敲键盘',
					correct: true,
					feedback: '对。滑块管「大概」，键盘管「精确」——这是选控件的第一直觉。',
				},
				{
					key: 'B',
					text: '滑块——拖起来更有交互感',
					correct: false,
					feedback: '在手机上把滑块精确拖到 8250 元是酷刑。交互感救不了精度。',
				},
				{
					key: 'C',
					text: '下拉框列出所有可选金额',
					correct: false,
					feedback: '几千个选项的下拉是灾难。枚举不了的值就让用户直接输入。',
				},
			],
		},
		anatomyIntro:
			'它把一段数值范围画成一条轨道，值不是「输入」出来的，是「拖」出来的——这决定了它擅长模糊调节、不擅长精确输入。组成如下：',
		parts: [
			{ name: '轨道', en: 'Track', note: '整段可选范围画成的横线。' },
			{ name: '手柄', en: 'Thumb', note: '拖动的圆点，位置即数值。' },
			{ name: '已选段', en: 'Fill', note: '轨道上着色的部分，显示当前进到哪。' },
			{ name: '数值显示', en: 'Value', note: '实时显示当前值，拖的时候最需要它。' },
		],
		variants: [
			{ title: '单值', description: '一个手柄取一个值，比如音量。', sketch: 'sl-single' },
			{ title: '区间', description: '两个手柄框一段范围，比如价格区间。', sketch: 'sl-range' },
			{ title: '带刻度', description: '轨道有档位，拖起来一格一格跳。', sketch: 'sl-steps' },
		],
		usage: {
			fit: ['模糊调节：音量、亮度、透明度', '边拖边看效果、立即生效的场景', '范围筛选：两个手柄框一段'],
			unfit: [
				'需要精确数值——用输入框',
				'范围极大（0 到 100 万）——每像素就跳几千',
				'只有开和关两档——用开关',
			],
		},
		prompts: [
			'价格筛选加一个区间滑块，两端实时显示当前值',
			'滑块拖动时右侧预览实时更新',
			'滑块加档位，每格 10，一共 10 档',
			'手机上这个滑块太难拖，加大手柄的可点区域',
		],
		promptTip: '一定说清范围、步长和默认值——这三样 AI 猜不准。',
		warning:
			'你在「响应式设计」的实验室里拖过的那根就是它——好用的前提是「大概就行」。要精确，请让用户打字。',
	},
	input: {
		question: '到底是什么？一个小小的文本框有什么好讲的？',
		spot: {
			title: '这个设置面板里，哪一个是输入框？',
			intro: '三个控件都在收集你的意思，但只有一个让你自由发挥。',
			regions: [
				{
					id: 'input',
					name: '输入框',
					en: 'Input',
					correct: true,
					note: '就是它！带标签的文本框，敲什么收什么。',
				},
				{
					id: 'select',
					name: '下拉选择',
					en: 'Select',
					correct: false,
					note: '不是它。看着像输入框，但带小箭头、点开是列表——只能选，不能打。',
				},
				{
					id: 'toggle',
					name: '开关',
					en: 'Toggle',
					correct: false,
					note: '不是它。非开即关的是开关，不接收文字。',
				},
			],
		},
		quiz: {
			question: '占位提示（placeholder）里写着「请输入邮箱」，上方的标签就可以省了吗？',
			options: [
				{
					key: 'A',
					text: '不行——一旦开始输入，占位字就消失了',
					correct: true,
					feedback: '对。填到一半忘了这格是什么，只能删掉重看——标签要常驻。',
				},
				{
					key: 'B',
					text: '可以省，界面更简洁',
					correct: false,
					feedback: '简洁的代价是用户靠记忆填表。所有靠记忆的设计，最后都会变成用户的错。',
				},
				{
					key: 'C',
					text: '标签和占位提示本来就是一回事',
					correct: false,
					feedback: '标签说「这格是什么」，占位说「可以这样填」——一个是名字，一个是示例。',
				},
			],
		},
		anatomyIntro:
			'它是用户和系统之间最基本的对话窗口：你敲什么，它收什么。细节全在状态上——聚焦、报错、禁用，每个状态都在跟用户说话。组成：',
		parts: [
			{ name: '标签', en: 'Label', note: '说明这格要填什么，永远别省。' },
			{ name: '输入区', en: 'Field', note: '接收内容的框体本身。' },
			{ name: '占位提示', en: 'Placeholder', note: '框里的灰色示例，聚焦后消失——代替不了标签。' },
			{ name: '状态样式', en: 'States', note: '聚焦高亮、报错红框、禁用置灰。' },
		],
		variants: [
			{ title: '标准式', description: '标签在上、框在下，最稳的排法。', sketch: 'in-basic' },
			{ title: '带图标', description: '框里带个图标提示用途，搜索框常用。', sketch: 'in-icon' },
			{ title: '报错态', description: '红框加下方红字，指出哪里不对。', sketch: 'in-error' },
		],
		usage: {
			fit: ['自由文本：姓名、邮箱、密码', '数字、日期等有格式的值', '搜索关键词'],
			unfit: ['选项有限且已知——用下拉或单选', '非开即关——用开关', '大段长文——用多行文本域'],
		},
		prompts: [
			'邮箱输入框：标签、占位示例，失焦时校验格式',
			'密码框加一个显示/隐藏的小眼睛',
			'输入框聚焦时边框变品牌色',
			'报错时红框加下方红字提示，别用弹窗',
		],
		promptTip: '把每个状态（默认、聚焦、报错、禁用）都说清楚——AI 默认只做默认态。',
		warning: '占位提示不能代替标签：字一敲它就没了。让用户靠记忆填表，错都会算在用户头上。',
	},
	select: {
		question: '到底是什么？它和输入框长得像，差在哪？',
		spot: {
			title: '这个设置面板里，哪一个是下拉选择？',
			intro: '三个控件都在收集你的意思，注意谁带着小箭头。',
			regions: [
				{
					id: 'input',
					name: '输入框',
					en: 'Input',
					correct: false,
					note: '不是它。能自由敲字的是输入框。',
				},
				{
					id: 'select',
					name: '下拉选择',
					en: 'Select',
					correct: true,
					note: '就是它！带小箭头的框，点开一个列表挑一项。',
				},
				{
					id: 'toggle',
					name: '开关',
					en: 'Toggle',
					correct: false,
					note: '不是它。开关只有两档，连列表都不需要。',
				},
			],
		},
		quiz: {
			question: '让用户选国家（约 200 个选项），用哪种？',
			options: [
				{
					key: 'A',
					text: '可搜索的下拉——又能选，又能敲字过滤',
					correct: true,
					feedback: '对。选项一多，搜索就是刚需——滚 200 行找「中国」是折磨。',
				},
				{
					key: 'B',
					text: '普通下拉，让用户慢慢滚',
					correct: false,
					feedback: '200 个选项的滚动列表是耐心测试，不是交互设计。',
				},
				{
					key: 'C',
					text: '自由输入框，让用户自己打',
					correct: false,
					feedback: '拼写会五花八门（中国/China/CN），后端没法对齐。可枚举的值就该用选的。',
				},
			],
		},
		anatomyIntro:
			'它把「能选什么」提前圈定：点开一个列表，从里面挑一个。用户不能自由发挥——这既是限制，也是保护。组成：',
		parts: [
			{ name: '触发器', en: 'Trigger', note: '平时显示当前选中项的框。' },
			{ name: '箭头', en: 'Caret', note: '小三角，暗示「可以点开」——它是和输入框最直观的区别。' },
			{ name: '选项列表', en: 'Options', note: '展开后的候选项。' },
			{ name: '选中态', en: 'Selected', note: '列表里高亮的当前项。' },
		],
		variants: [
			{ title: '基础下拉', description: '点开列表选一项，最常见。', sketch: 'se-basic' },
			{ title: '可搜索', description: '列表顶部带搜索框，选项多时救命。', sketch: 'se-search' },
			{ title: '多选', description: '选中的项变成小标签留在框里。', sketch: 'se-multi' },
		],
		usage: {
			fit: ['选项有限且互斥：分类、排序、国家', '选项多到不适合平铺时', '表单里节省空间'],
			unfit: ['只有两三个选项——平铺出来更快', '需要自由输入——用输入框', '选项之间需要对比细节时'],
		},
		prompts: [
			'分类筛选做成下拉，默认「全部」',
			'国家选择器加搜索过滤',
			'下拉选中后立即生效，不用再点确认',
			'手机上下拉改成底部弹出的选择面板',
		],
		promptTip: '把选项列表和默认值直接给 AI，别让它自己编选项。',
		warning: '下拉会藏选项：点开之前谁也不知道里面有什么。三个以内的选项别藏，平铺出来一眼选完。',
	},
	toggle: {
		question: '到底是什么？它和复选框是一回事吗？',
		spot: {
			title: '这个设置面板里，哪一个是开关？',
			intro: '三个控件都在收集你的意思，只有一个拨了立即生效。',
			regions: [
				{
					id: 'input',
					name: '输入框',
					en: 'Input',
					correct: false,
					note: '不是它。能敲字的是输入框。',
				},
				{
					id: 'select',
					name: '下拉选择',
					en: 'Select',
					correct: false,
					note: '不是它。点开有列表的是下拉。',
				},
				{
					id: 'toggle',
					name: '开关',
					en: 'Toggle',
					correct: true,
					note: '就是它！胶囊轨道加圆钮，非开即关，拨一下立即生效。',
				},
			],
		},
		quiz: {
			question: '「同意服务条款」该用开关还是复选框？',
			options: [
				{
					key: 'A',
					text: '复选框——它是表单的一部分，随提交一起生效',
					correct: true,
					feedback: '对。开关的承诺是「拨动立即生效」，而同意条款要跟提交动作绑在一起。',
				},
				{
					key: 'B',
					text: '开关——拨起来手感更好',
					correct: false,
					feedback: '手感不是标准。开关意味着立即生效，条款同意显然不是。',
				},
				{
					key: 'C',
					text: '都行，看设计心情',
					correct: false,
					feedback: '两者语义不同：立即生效用开关，随表单提交用复选框——这是有共识的。',
				},
			],
		},
		anatomyIntro:
			'它是电灯开关的直译：非开即关，拨一下立即生效——不需要「保存」按钮，这是它和复选框最大的区别。组成：',
		parts: [
			{ name: '轨道', en: 'Track', note: '胶囊形的底座，颜色表示开或关。' },
			{ name: '圆钮', en: 'Knob', note: '滑动的圆点，位置即状态。' },
			{ name: '状态色', en: 'State', note: '开是品牌色、关是灰色——位置差异也要保留，照顾色弱用户。' },
		],
		variants: [
			{ title: '基础式', description: '一个开关管一件事。', sketch: 'tg-basic' },
			{ title: '带说明', description: '旁边一行小字说明当前状态。', sketch: 'tg-label' },
			{ title: '开关组', description: '一列开关组成设置面板。', sketch: 'tg-group' },
		],
		usage: {
			fit: ['设置项的开与关：通知、深色模式', '拨动后立即生效的场景', '状态一目了然的二元选择'],
			unfit: ['需要随表单提交——用复选框', '有中间态或多个选项——用单选、下拉', '「开」的含义说不清的时候'],
		},
		prompts: [
			'通知设置加一个开关，拨动立即保存',
			'开关打开时用品牌橙色',
			'深色模式开关放在导航栏右侧',
			'开关旁边加一行小字，显示当前是开是关',
		],
		promptTip: '说清「拨动后立即生效还是随表单提交」——这决定了用开关还是复选框。',
		warning: '开关承诺「立即生效」。拨了还要点保存的开关是在撒谎——那种场合请用复选框。',
	},
	drawer: {
		question: '到底是什么？从旁边滑出来的面板和弹窗有什么区别？',
		spot: {
			title: '这个页面里，哪一个是抽屉？',
			intro: '还是这三个浮层。这回找那个靠边站的。',
			regions: [
				{
					id: 'drawer',
					name: '抽屉',
					en: 'Drawer',
					correct: true,
					note: '就是它！从屏幕边缘滑出一整条，放的是「一块内容」而不是「一个问题」。',
				},
				{
					id: 'modal',
					name: '弹窗',
					en: 'Modal',
					correct: false,
					note: '不是它。居中拦路、要你表态的是弹窗。',
				},
				{
					id: 'toast',
					name: '轻提示',
					en: 'Toast',
					correct: false,
					note: '不是它。角落里自己消失的小条是 Toast。',
				},
			],
		},
		quiz: {
			question: '手机上导航链接放不下了，点汉堡按钮后应该展开什么？',
			options: [
				{
					key: 'A',
					text: '抽屉——从边缘滑出一列菜单',
					correct: true,
					feedback: '对。菜单是拿来浏览的，抽屉给它一整条空间，滑回去也自然。',
				},
				{
					key: 'B',
					text: '弹窗——居中显示菜单',
					correct: false,
					feedback: '弹窗是拿来做决定的。浏览菜单用居中拦路，小题大做。',
				},
				{
					key: 'C',
					text: '直接跳到一个菜单页面',
					correct: false,
					feedback: '能用，但多了一次整页跳转——抽屉在当前页就能来回，更轻。',
				},
			],
		},
		anatomyIntro:
			'它平时藏在屏幕边缘，需要时滑出一整条面板——手机上的汉堡菜单点开后就是它。和弹窗一样有遮罩，但它靠边站，装的是内容不是问题。组成：',
		parts: [
			{ name: '面板', en: 'Panel', note: '从边缘滑出的那一条，宽度固定。' },
			{ name: '遮罩', en: 'Scrim', note: '压暗剩余页面，点它可以关闭。' },
			{ name: '关闭控件', en: 'Close', note: '× 按钮，或往回滑的手势。' },
			{ name: '内容区', en: 'Content', note: '菜单、筛选器或详情——内容越长越适合它。' },
		],
		variants: [
			{ title: '右侧抽屉', description: '桌面端常用：筛选器、详情预览。', sketch: 'dw-right' },
			{ title: '左侧抽屉', description: '手机导航菜单的标准位。', sketch: 'dw-left' },
			{ title: '底部抽屉', description: '手机上从底部滑出，也叫 Bottom Sheet。', sketch: 'dw-bottom' },
		],
		usage: {
			fit: ['手机上的导航菜单', '筛选器面板（电商列表页）', '不离开当前页的详情预览'],
			unfit: ['要用户立即决定——用弹窗', '内容极短——一个气泡就够', '桌面端的主导航——直接用侧边栏'],
		},
		prompts: [
			'汉堡菜单点开后从左侧滑出抽屉',
			'筛选面板做成右侧抽屉，带遮罩',
			'抽屉支持点遮罩关闭和滑动关闭',
			'手机上把详情改成底部抽屉预览',
		],
		promptTip: '说清从哪边滑出、占多宽——这两样 AI 最容易自由发挥。',
		warning: '抽屉是藏东西的：藏得住菜单，也藏得住用户永远找不到的功能。高频操作别往抽屉里塞。',
	},
	skeleton: {
		question: '到底是什么？为什么加载的时候会先看到一堆灰条？',
		spot: {
			title: '这个页面里，哪一块是骨架屏？',
			intro: '四个都和「状态」有关：加载中、加载完但没东西、有新东西。',
			regions: [
				{
					id: 'skeleton',
					name: '骨架屏',
					en: 'Skeleton',
					correct: true,
					note: '就是它！灰块按真实内容的形状排布——内容来了正好补进去。',
				},
				{
					id: 'spinner',
					name: '加载指示器',
					en: 'Spinner',
					correct: false,
					note: '不是它。转圈只说「在加载」，不说内容长什么样——骨架屏是它的升级版。',
				},
				{
					id: 'empty',
					name: '空状态',
					en: 'Empty State',
					correct: false,
					note: '不是它。这是加载完了、但确实什么都没有时的引导。',
				},
				{
					id: 'badge',
					name: '徽标',
					en: 'Badge',
					correct: false,
					note: '不是它。图标角上的红点是徽标，宣告「有新东西」。',
				},
			],
		},
		quiz: {
			question: '列表要加载两秒左右。用骨架屏还是转圈圈？',
			options: [
				{
					key: 'A',
					text: '骨架屏——提前画出内容的形状',
					correct: true,
					feedback: '对。用户提前知道会来什么，感知上更快，内容到位也不跳动。',
				},
				{
					key: 'B',
					text: '转圈圈——实现最简单',
					correct: false,
					feedback: '能用，但转圈是「无信息等待」——不知道来什么、还要等多久。',
				},
				{
					key: 'C',
					text: '什么都不显示，加载完直接出现',
					correct: false,
					feedback: '两秒的空白会让用户怀疑页面挂了，然后开始狂点。',
				},
			],
		},
		anatomyIntro:
			'它不是装饰，是承诺：告诉用户「内容马上来，长这个形状」。你在本站到处看到的灰条小模型，画的就是它。组成：',
		parts: [
			{ name: '占位块', en: 'Placeholder', note: '按真实内容的形状摆放的灰块。' },
			{ name: '微光', en: 'Shimmer', note: '扫过的高光动画，暗示「还活着，在加载」。' },
			{ name: '一致布局', en: 'Layout', note: '和加载完成后的布局一致，内容到位不跳动。' },
		],
		variants: [
			{ title: '卡片骨架', description: '封面加两行字的形状，列表页标配。', sketch: 'sk-card' },
			{ title: '列表骨架', description: '一行行灰条，等文字列表。', sketch: 'sk-list' },
			{ title: '头像骨架', description: '圆形加短条，等用户信息。', sketch: 'sk-avatar' },
		],
		usage: {
			fit: ['首屏内容的加载等待', '结构稳定的列表和卡片流', '一到三秒量级的等待'],
			unfit: ['超过几秒的等待——给进度和原因', '结构不确定的内容——骨架会和结果对不上', '瞬间完成的操作——闪一下更难受'],
		},
		prompts: [
			'文章列表加载时显示三条卡片骨架',
			'骨架屏加从左到右的微光动画',
			'骨架的形状和真实卡片保持一致',
			'加载超过五秒就把骨架换成重试提示',
		],
		promptTip: '强调骨架要「按真实内容的形状」画——不然 AI 会随手放几根条应付。',
		warning: '骨架屏是止痛药不是解药：它改善等待的感受，不缩短等待本身。慢的根源还得去查请求。',
	},
	'empty-state': {
		question: '到底是什么？列表空空如也的时候该给用户看什么？',
		spot: {
			title: '这个页面里，哪一块是空状态？',
			intro: '注意分辨：还没加载完，和加载完了但没有，是两回事。',
			regions: [
				{
					id: 'skeleton',
					name: '骨架屏',
					en: 'Skeleton',
					correct: false,
					note: '不是它。灰块占位说明内容在路上——那是加载中。',
				},
				{
					id: 'spinner',
					name: '加载指示器',
					en: 'Spinner',
					correct: false,
					note: '不是它。转圈也是「在加载」。',
				},
				{
					id: 'empty',
					name: '空状态',
					en: 'Empty State',
					correct: true,
					note: '就是它！加载完了、确实没有内容——图标、一句解释加一个行动按钮。',
				},
				{
					id: 'badge',
					name: '徽标',
					en: 'Badge',
					correct: false,
					note: '不是它。红点数字是徽标。',
				},
			],
		},
		quiz: {
			question: '用户第一次进「项目」页，还没有任何项目。页面该显示什么？',
			options: [
				{
					key: 'A',
					text: '空状态：说明这里放什么，配一个「创建第一个项目」按钮',
					correct: true,
					feedback: '对。第一次的空白是最好的引导时机——告诉用户这里会有什么、现在能做什么。',
				},
				{
					key: 'B',
					text: '什么都不显示，空白最干净',
					correct: false,
					feedback: '用户分不清是坏了、没权限，还是真的没有。空白不是干净，是失联。',
				},
				{
					key: 'C',
					text: '直接自动弹出创建弹窗',
					correct: false,
					feedback: '太急了。用户还没看清这是哪儿，就被要求干活——引导可以主动，但别抢。',
				},
			],
		},
		anatomyIntro:
			'它出现在「这里本该有内容」的地方：第一次使用、搜索无果、或者出了错。好的空状态不只说「没有」，还告诉你接下来能做什么。组成：',
		parts: [
			{ name: '图标或插画', en: 'Visual', note: '柔和的视觉占位，别太抢戏。' },
			{ name: '标题', en: 'Title', note: '一句话说清为什么是空的。' },
			{ name: '说明', en: 'Description', note: '补充原因，或给点引导。' },
			{ name: '行动按钮', en: 'Action', note: '下一步：创建、清空筛选、重试。' },
		],
		variants: [
			{ title: '首次使用', description: '欢迎语加创建按钮，最常见。', sketch: 'es-first' },
			{ title: '搜索无果', description: '提示换关键词，给清空筛选的出口。', sketch: 'es-search' },
			{ title: '出错型', description: '说明出错了，主按钮是重试。', sketch: 'es-error' },
		],
		usage: {
			fit: ['首次使用的引导', '搜索或筛选无结果时', '数据被清空后的兜底'],
			unfit: ['还在加载中——那是骨架屏的活', '出错但可重试——错误态要带重试按钮', '拿空状态藏功能入口的时候'],
		},
		prompts: [
			'项目列表为空时显示空状态，带「创建第一个项目」按钮',
			'搜索无结果时提示换个关键词，附清空筛选的链接',
			'空状态的插画用简单的灰色图标',
			'请求失败的空状态加一个重试按钮',
		],
		promptTip: '把「为什么空」和「下一步做什么」都告诉 AI，它才不会只给你一行「暂无数据」。',
		warning: '最偷懒的空状态是一行「暂无数据」——用户不知道是坏了、没权限还是真没有。空，是引导的机会。',
	},
	badge: {
		question: '到底是什么？图标角上的小红点凭什么让人忍不住去点？',
		spot: {
			title: '这个页面里，哪一个是徽标？',
			intro: '四个都和「状态」有关，找那个最小、最红的。',
			regions: [
				{
					id: 'skeleton',
					name: '骨架屏',
					en: 'Skeleton',
					correct: false,
					note: '不是它。灰块占位是骨架屏，内容在路上。',
				},
				{
					id: 'spinner',
					name: '加载指示器',
					en: 'Spinner',
					correct: false,
					note: '不是它。转圈的是 Spinner。',
				},
				{
					id: 'empty',
					name: '空状态',
					en: 'Empty State',
					correct: false,
					note: '不是它。这是「加载完但没有内容」时的引导。',
				},
				{
					id: 'badge',
					name: '徽标',
					en: 'Badge',
					correct: true,
					note: '就是它！挂在铃铛角上的小红点数字，宣告「有新东西」。',
				},
			],
		},
		quiz: {
			question: '未读消息 328 条，徽标怎么显示最合理？',
			options: [
				{
					key: 'A',
					text: '显示 99+，封顶处理',
					correct: true,
					feedback: '对。三位数之后数字失去意义，还会挤爆布局——99+ 是行业共识。',
				},
				{
					key: 'B',
					text: '如实显示 328',
					correct: false,
					feedback: '精确到个位的未读数没人在乎，圆形徽标也装不下四位数。',
				},
				{
					key: 'C',
					text: '只显示一个红点，不带数字',
					correct: false,
					feedback: '「有没有」和「有多少」是两种信息。消息这种量很大的场景，数量还是有用的。',
				},
			],
		},
		anatomyIntro:
			'它是挂在别的元素身上的小信号：一个数字或一个点，宣告「这里有新东西」。它自己不能独立存在——总得挂在什么上面。组成：',
		parts: [
			{ name: '宿主', en: 'Anchor', note: '徽标挂靠的对象：铃铛、头像、菜单项。' },
			{ name: '计数', en: 'Count', note: '数字说明有几条；只提示有无时用圆点。' },
			{ name: '颜色语义', en: 'Color', note: '红色催办、灰色中性、绿色在线——颜色即语气。' },
		],
		variants: [
			{ title: '数字型', description: '未读几条一目了然，99+ 封顶。', sketch: 'bd-count' },
			{ title: '圆点型', description: '只说「有新的」，不说有几条。', sketch: 'bd-dot' },
			{ title: '文字型', description: 'New、Beta 这类状态小标签。', sketch: 'bd-text' },
		],
		usage: {
			fit: ['未读计数：消息、通知', '新功能的 New 标记', '状态标记：在线、测试版'],
			unfit: ['到处都是红点——通胀之后等于没有', '重要变更——徽标太轻，用横幅', '当装饰贴纸用的时候'],
		},
		prompts: [
			'铃铛图标加未读徽标，超过 99 显示 99+',
			'侧边栏「更新日志」加一个 New 徽标',
			'消息已读后徽标清零并消失',
			'徽标改成不带数字的小红点',
		],
		promptTip: '说清什么时候出现、什么时候消失——徽标的生命周期比样式重要。',
		warning: '红点会通胀：每个都想被点，结果是用户学会无视全部。省着用，让红点保住信用。',
	},
	breadcrumb: {
		question: '到底是什么？页面顶上那行带斜杠的小字有什么用？',
		spot: {
			title: '这个文档站里，哪一块是面包屑？',
			intro: '四个都在帮你找路，分工完全不同。',
			regions: [
				{
					id: 'navbar',
					name: '导航栏',
					en: 'Navbar',
					correct: false,
					note: '不是它。顶部那条管全站大板块，是导航栏。',
				},
				{
					id: 'sidebar',
					name: '侧边栏',
					en: 'Sidebar',
					correct: false,
					note: '不是它。左侧竖排的目录是侧边栏，管板块内部的层级。',
				},
				{
					id: 'breadcrumb',
					name: '面包屑',
					en: 'Breadcrumb',
					correct: true,
					note: '就是它！一行层级路径，标记你在第几层，每层可点回去。',
				},
				{
					id: 'pagination',
					name: '分页',
					en: 'Pagination',
					correct: false,
					note: '不是它。底部的页码是分页，翻的是同层内容，不改变层级。',
				},
			],
		},
		quiz: {
			question: '什么样的站点最需要面包屑？',
			options: [
				{
					key: 'A',
					text: '层级深的：商城、文档站',
					correct: true,
					feedback: '对。用户常从搜索直接空降到第四层——面包屑让他知道自己在哪、怎么上去。',
				},
				{
					key: 'B',
					text: '所有网站都必须有',
					correct: false,
					feedback: '一两层的小站加面包屑只是仪式感，「首页 / 关于」帮不上任何忙。',
				},
				{
					key: 'C',
					text: '单屏落地页',
					correct: false,
					feedback: '落地页只有一层，没有「层级位置」可标。',
				},
			],
		},
		anatomyIntro:
			'名字来自《糖果屋》：一路撒面包屑，随时找得到回去的路。它显示你在站点层级里的位置，每一层都能点回去。组成：',
		parts: [
			{ name: '层级链接', en: 'Trail', note: '从首页到当前的每一层，都可以点。' },
			{ name: '分隔符', en: 'Separator', note: '斜杠或小箭头，把层级隔开。' },
			{ name: '当前页', en: 'Current', note: '最后一项是你所在的页面，通常不可点、颜色更深。' },
		],
		variants: [
			{ title: '斜杠分隔', description: '首页 / 分类 / 当前，最经典。', sketch: 'bc-slash' },
			{ title: '箭头分隔', description: '用 › 分隔，方向感更强。', sketch: 'bc-arrow' },
			{ title: '折叠中间层', description: '层级太深时中段收成 …。', sketch: 'bc-fold' },
		],
		usage: {
			fit: ['层级三层以上的站点', '用户常从搜索、分享空降深层页', '需要快速跳回上层时'],
			unfit: ['只有一两层的小站', '流程式向导——用步骤条', '首页本身——它没有上层'],
		},
		prompts: [
			'详情页加面包屑：首页 / 分类 / 当前文章',
			'面包屑分隔符换成小箭头',
			'层级太深时中间折叠成省略号',
			'面包屑最后一项不可点，颜色加深',
		],
		promptTip: '面包屑反映层级、不反映历史——让 AI 按站点结构生成，别按浏览记录。',
		warning: '面包屑显示的是「你在哪」，不是「你来时的路」——它不是浏览器的后退按钮。',
	},
	pagination: {
		question: '到底是什么？内容太多的时候怎么分着看？',
		spot: {
			title: '这个文档站里，哪一块是分页？',
			intro: '四个都在帮你找路，分工完全不同。',
			regions: [
				{
					id: 'navbar',
					name: '导航栏',
					en: 'Navbar',
					correct: false,
					note: '不是它。顶部那条管全站大板块，是导航栏。',
				},
				{
					id: 'sidebar',
					name: '侧边栏',
					en: 'Sidebar',
					correct: false,
					note: '不是它。左侧竖排的目录是侧边栏，管板块内部的层级。',
				},
				{
					id: 'breadcrumb',
					name: '面包屑',
					en: 'Breadcrumb',
					correct: false,
					note: '不是它。那行带分隔符的路径是面包屑，标记你在第几层。',
				},
				{
					id: 'pagination',
					name: '分页',
					en: 'Pagination',
					correct: true,
					note: '就是它！底部的页码，翻的是同一层的内容。',
				},
			],
		},
		quiz: {
			question: '信息流（动态、瀑布流图片）适合分页还是无限滚动？',
			options: [
				{
					key: 'A',
					text: '无限滚动——「逛」的场景不需要位置感',
					correct: true,
					feedback: '对。反过来，要定位回访的内容（搜索结果、订单）适合分页——「第 3 页」是记得住的位置。',
				},
				{
					key: 'B',
					text: '分页——什么内容都应该分页',
					correct: false,
					feedback: '逛信息流时每翻一页都要点一下，节奏全断。工具选场景，不选立场。',
				},
				{
					key: 'C',
					text: '一次全部加载完',
					correct: false,
					feedback: '几千条一起加载，页面和流量都会爆。总得分批，问题只是怎么分。',
				},
			],
		},
		anatomyIntro:
			'它把一长串内容切成一页一页，底部给你页码和前后翻页。它和无限滚动，是同一个问题的两种答案。组成：',
		parts: [
			{ name: '页码', en: 'Pages', note: '可以直接跳转的数字。' },
			{ name: '当前页', en: 'Current', note: '高亮的那个数字，标记你在第几页。' },
			{ name: '前后翻页', en: 'Prev / Next', note: '上一页、下一页的箭头，第一页时上一页要禁用。' },
			{ name: '省略号', en: 'Ellipsis', note: '页数太多时折叠中段。' },
		],
		variants: [
			{ title: '页码型', description: '数字加省略号，可以跳页。', sketch: 'pg-numbers' },
			{ title: '前后型', description: '只有上一页/下一页，简单场景够用。', sketch: 'pg-prevnext' },
			{ title: '加载更多', description: '一个按钮往下续，手机友好。', sketch: 'pg-more' },
		],
		usage: {
			fit: ['要定位回访：搜索结果、订单、表格', '数据量大且用户要跳页', '需要知道总量的场景'],
			unfit: ['杀时间的信息流——无限滚动更顺', '内容一页放得下——别分', '手机长列表——「加载更多」更稳'],
		},
		prompts: [
			'文章列表分页，每页 12 条，底部页码',
			'页数多时中间折叠成省略号',
			'手机上分页换成「加载更多」按钮',
			'当前页高亮，第一页时禁用上一页',
		],
		promptTip: '每页几条、总量从哪来说清楚——分页组件本身 AI 很熟。',
		warning: '分页的位置能被收藏和转发，无限滚动不能。选之前先想：用户需要「回到刚才那里」吗？',
	},
	sidebar: {
		question: '到底是什么？它和顶部导航栏怎么分工？',
		spot: {
			title: '这个文档站里，哪一块是侧边栏？',
			intro: '四个都在帮你找路，分工完全不同。',
			regions: [
				{
					id: 'navbar',
					name: '导航栏',
					en: 'Navbar',
					correct: false,
					note: '不是它。顶部那条管全站大板块，是导航栏。',
				},
				{
					id: 'sidebar',
					name: '侧边栏',
					en: 'Sidebar',
					correct: true,
					note: '就是它！左侧竖排的目录，把板块内部的层级常驻在屏幕上。',
				},
				{
					id: 'breadcrumb',
					name: '面包屑',
					en: 'Breadcrumb',
					correct: false,
					note: '不是它。那行带分隔符的路径是面包屑，标记你在第几层。',
				},
				{
					id: 'pagination',
					name: '分页',
					en: 'Pagination',
					correct: false,
					note: '不是它。底部的页码是分页，翻的是同层内容，不改变层级。',
				},
			],
		},
		quiz: {
			question: '一个博客站（十几篇文章、两个分类）需要侧边栏吗？',
			options: [
				{
					key: 'A',
					text: '不需要——顶部导航加列表页足够了',
					correct: true,
					feedback: '对。侧边栏是为深层级准备的，层级浅时它只是白占一列宽度。',
				},
				{
					key: 'B',
					text: '需要，有侧边栏看起来更专业',
					correct: false,
					feedback: '专业感来自内容组织，不来自多一根栏。空荡的侧边栏反而暴露内容少。',
				},
				{
					key: 'C',
					text: '把每篇文章都列进侧边栏',
					correct: false,
					feedback: '十几篇还行，四十篇之后就是灾难——那是列表页该干的活。',
				},
			],
		},
		anatomyIntro:
			'它是竖着的导航：占住左侧一列，把更深的目录常驻在屏幕上。顶部导航管大板块，侧边栏管板块内部的层级。组成：',
		parts: [
			{ name: '分组标题', en: 'Group', note: '把导航项按主题分组的小标题。' },
			{ name: '导航项', en: 'Items', note: '可点击的目录条目，常带图标。' },
			{ name: '当前项', en: 'Active', note: '高亮标记你正在看哪一篇。' },
			{ name: '折叠开关', en: 'Collapse', note: '需要空间时把整栏收成一列图标。' },
		],
		variants: [
			{ title: '平铺式', description: '一列到底，条目不多时够用。', sketch: 'sb-flat' },
			{ title: '分组式', description: '按主题分组，文档站标配。', sketch: 'sb-group' },
			{ title: '图标折叠', description: '收起后只剩图标，桌面工具常用。', sketch: 'sb-icon' },
		],
		usage: {
			fit: ['文档站、后台管理这类深层级界面', '导航项超过顶栏容量时', '需要常驻目录、频繁切换的场景'],
			unfit: ['内容站、落地页——顶栏足够', '手机上——收进抽屉', '层级很浅的小站'],
		},
		prompts: [
			'文档页加左侧边栏，按章节分组，当前页高亮',
			'侧边栏窄屏时收进抽屉',
			'侧边栏可折叠成只显示图标',
			'侧边栏固定不随内容滚动',
		],
		promptTip: '把目录结构（分组和层级）直接给 AI——结构清楚了，样式是顺手的事。',
		warning: '侧边栏吃掉一列宽度，而内容才是主角。目录一屏放得下时，先想想要不要这一栏。',
	},
	section: {
		question: '到底是什么？为什么 AI 总说「再加一个 section」？',
		spot: {
			title: '这个页面里，哪一块是一个 Section？',
			intro: '提示：答案不止一个是对的——但有一块最典型。',
			regions: [
				{
					id: 'navbar',
					name: '导航栏',
					en: 'Navbar',
					correct: false,
					note: '不是它。导航栏是常驻框架，不算页面的「段落」。',
				},
				{
					id: 'hero',
					name: 'Hero 区',
					en: 'Hero',
					correct: false,
					note: '严格说它也是一个 section——只是重要到有了自己的名字。这里找一个更「无名」的。',
				},
				{
					id: 'features',
					name: '功能区块',
					en: 'Features Section',
					correct: true,
					note: '就是它！一个通栏、讲一件事（功能），上下用留白隔开——最典型的 section。',
				},
				{
					id: 'footer',
					name: '页脚',
					en: 'Footer',
					correct: false,
					note: '不是它。页脚是框架的收尾，有自己的名字和职责。',
				},
			],
		},
		quiz: {
			question: '你想在首页加一块「用户评价」。跟 AI 怎么说最清楚？',
			options: [
				{
					key: 'A',
					text: '「在功能区块下面加一个用户评价 section，三列卡片」',
					correct: true,
					feedback: '对。位置（在哪个 section 下面）和形式（几列什么内容）都点到了——AI 几乎不会跑偏。',
				},
				{
					key: 'B',
					text: '「加一些用户评价」',
					correct: false,
					feedback: 'AI 得猜放哪、长什么样。猜错了你还得返工，不如一次说清。',
				},
				{
					key: 'C',
					text: '「页面做丰富一点」',
					correct: false,
					feedback: '这句话的可能解释有一万种。模糊的需求只能换来碰运气的结果。',
				},
			],
		},
		anatomyIntro:
			'它是页面的段落：一个通栏讲一件事，一个接一个往下摞，摞出整个页面。看懂它，你就看懂了任何落地页的骨架。组成：',
		parts: [
			{ name: '眉标或编号', en: 'Eyebrow', note: '小字标出这段的主题，比如「02 · 功能」。' },
			{ name: '标题', en: 'Heading', note: '这一段要说的那件事。' },
			{ name: '内容区', en: 'Body', note: '文字、卡片、图片的组合。' },
			{ name: '段间留白', en: 'Spacing', note: '区块之间的大留白——比分割线高级的分隔方式。' },
		],
		variants: [
			{ title: '单栏式', description: '标题加内容居中排布，信息单一时用。', sketch: 'sc-single' },
			{ title: '左右分栏', description: '标题在左、内容在右，本站正在用。', sketch: 'sc-split' },
			{ title: '交替式', description: '图文左右交替，长页面不单调。', sketch: 'sc-zigzag' },
		],
		usage: {
			fit: ['落地页的每个主题段落', '长页面的内容分组', '需要锚点跳转的板块'],
			unfit: ['零散的一两句话——并进相邻区块', '后台工具界面——那里是面板不是段落', '为了凑长度硬加的时候'],
		},
		prompts: [
			'在 hero 下面加一个「功能」section，三列卡片',
			'这个 section 改成左文右图',
			'给每个 section 加锚点，导航栏可以跳转',
			'section 之间的留白统一成 96px',
		],
		promptTip: '用它做定位词：「哪个 section 的什么位置」——AI 改页面几乎不会跑偏。',
		warning: 'Section 越多页面越长，但用户的耐心不会跟着变长。每加一段先问：删了它，页面会缺什么吗？',
	},
};
