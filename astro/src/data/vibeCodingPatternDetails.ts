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
			{
				title: '居中式',
				description: '链接居中排布，品牌感强，内容站常用。',
				sketch: 'nav-center',
			},
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
			{
				title: '极简式',
				description: '一行搞定：版权加几个链接，小站够用。',
				sketch: 'ft-minimal',
			},
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
			fit: [
				'内容各自独立、可以单独点开时',
				'有封面图这类视觉元素时',
				'数量不定、需要自动换行的网格',
			],
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
		warning:
			'卡片的代价是密度：一屏放不下几条。当用户要的是快速扫一大堆条目时，朴素的列表反而更好用。',
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
			fit: [
				'危险或不可逆操作前的确认',
				'必须先完成的小任务（登录、选择）',
				'不想让用户跳走的快捷表单',
			],
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
			unfit: ['需要用户做决定——用弹窗', '重要报错——别让它三秒就消失', '大量消息连环弹的时候'],
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
		warning:
			'表单是流失的重灾区：每多一个字段就劝退一批人。加字段前先问一句——这项现在真的必须要吗？',
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
		warning:
			'标签页会藏内容：用户不点，第二个标签就永远没被看见。放进去的内容，默认只有一半人会看到。',
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
			fit: [
				'模糊调节：音量、亮度、透明度',
				'边拖边看效果、立即生效的场景',
				'范围筛选：两个手柄框一段',
			],
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
			{
				name: '状态色',
				en: 'State',
				note: '开是品牌色、关是灰色——位置差异也要保留，照顾色弱用户。',
			},
		],
		variants: [
			{ title: '基础式', description: '一个开关管一件事。', sketch: 'tg-basic' },
			{ title: '带说明', description: '旁边一行小字说明当前状态。', sketch: 'tg-label' },
			{ title: '开关组', description: '一列开关组成设置面板。', sketch: 'tg-group' },
		],
		usage: {
			fit: ['设置项的开与关：通知、深色模式', '拨动后立即生效的场景', '状态一目了然的二元选择'],
			unfit: [
				'需要随表单提交——用复选框',
				'有中间态或多个选项——用单选、下拉',
				'「开」的含义说不清的时候',
			],
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
			{
				title: '底部抽屉',
				description: '手机上从底部滑出，也叫 Bottom Sheet。',
				sketch: 'dw-bottom',
			},
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
			unfit: [
				'超过几秒的等待——给进度和原因',
				'结构不确定的内容——骨架会和结果对不上',
				'瞬间完成的操作——闪一下更难受',
			],
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
			unfit: [
				'还在加载中——那是骨架屏的活',
				'出错但可重试——错误态要带重试按钮',
				'拿空状态藏功能入口的时候',
			],
		},
		prompts: [
			'项目列表为空时显示空状态，带「创建第一个项目」按钮',
			'搜索无结果时提示换个关键词，附清空筛选的链接',
			'空状态的插画用简单的灰色图标',
			'请求失败的空状态加一个重试按钮',
		],
		promptTip: '把「为什么空」和「下一步做什么」都告诉 AI，它才不会只给你一行「暂无数据」。',
		warning:
			'最偷懒的空状态是一行「暂无数据」——用户不知道是坏了、没权限还是真没有。空，是引导的机会。',
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
					feedback:
						'对。反过来，要定位回访的内容（搜索结果、订单）适合分页——「第 3 页」是记得住的位置。',
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
			unfit: [
				'杀时间的信息流——无限滚动更顺',
				'内容一页放得下——别分',
				'手机长列表——「加载更多」更稳',
			],
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
			fit: [
				'文档站、后台管理这类深层级界面',
				'导航项超过顶栏容量时',
				'需要常驻目录、频繁切换的场景',
			],
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
					feedback:
						'对。位置（在哪个 section 下面）和形式（几列什么内容）都点到了——AI 几乎不会跑偏。',
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
			unfit: [
				'零散的一两句话——并进相邻区块',
				'后台工具界面——那里是面板不是段落',
				'为了凑长度硬加的时候',
			],
		},
		prompts: [
			'在 hero 下面加一个「功能」section，三列卡片',
			'这个 section 改成左文右图',
			'给每个 section 加锚点，导航栏可以跳转',
			'section 之间的留白统一成 96px',
		],
		promptTip: '用它做定位词：「哪个 section 的什么位置」——AI 改页面几乎不会跑偏。',
		warning:
			'Section 越多页面越长，但用户的耐心不会跟着变长。每加一段先问：删了它，页面会缺什么吗？',
	},
	table: {
		question: '到底是什么？和一堆卡片摆在一起有什么区别？',
		spot: {
			title: '这个页面里，哪一块是数据表？',
			intro: '三块都在列东西，但只有一块是「行对行、列对列」地摆。',
			regions: [
				{
					id: 'cards',
					name: '卡片墙',
					en: 'Card Grid',
					correct: false,
					note: '不是它。一张张独立的小方块，各说各的，没法沿着一列往下比。',
				},
				{
					id: 'table',
					name: '数据表',
					en: 'Table',
					correct: true,
					note: '就是它！表头定列、每行一条记录，金额对着金额、状态对着状态，一眼能比。',
				},
				{
					id: 'list',
					name: '列表',
					en: 'List',
					correct: false,
					note: '不是它。一行一条没错，但每行只有一段话，没有可对齐的列。',
				},
			],
		},
		quiz: {
			question: '五十个订单，用户要按金额排序、按状态筛选。用什么摆最合适？',
			options: [
				{
					key: 'A',
					text: '数据表——列对齐了才好比',
					correct: true,
					feedback: '对。排序和筛选都是在「同一列」上做文章，只有表格把同类数据摆在了同一列。',
				},
				{
					key: 'B',
					text: '卡片墙——每单一张，看着好看',
					correct: false,
					feedback: '好看是好看，但五十张卡片没法沿着一列比金额，排序也失去了视觉意义。',
				},
				{
					key: 'C',
					text: '长列表——一行一条往下滚',
					correct: false,
					feedback: '列表只有一段文字一行，金额藏在句子里，没法对齐比较，更别说筛选。',
				},
			],
		},
		anatomyIntro:
			'表格是最古老的界面零件——账本就是它的祖先。它的本事只有一个：把同类数据按行和列对齐，让眼睛沿着一列扫下去就能比较。拆开看：',
		parts: [
			{ name: '表头', en: 'Header', note: '第一行，给每一列起名字，点它通常能排序。' },
			{ name: '数据行', en: 'Row', note: '一行就是一条记录：一个订单、一个用户。' },
			{ name: '单元格', en: 'Cell', note: '行列交叉的小格子，数字靠右、文字靠左。' },
			{ name: '行操作', en: 'Row Actions', note: '行尾的「···」或按钮，对这一条做点什么。' },
			{ name: '工具条', en: 'Toolbar', note: '表格上方的搜索、筛选、导出，管整张表。' },
		],
		variants: [
			{ title: '基础型', description: '横线分隔，行数少的时候最清爽。', sketch: 'tb-plain' },
			{ title: '斑马纹', description: '隔行浅灰，行多列宽时眼睛不串行。', sketch: 'tb-striped' },
			{ title: '带选择列', description: '最左一列复选框，批量操作的前提。', sketch: 'tb-select' },
		],
		usage: {
			fit: [
				'同类记录成批比较、排序、筛选',
				'后台管理页的订单、用户、日志',
				'数字多、要对齐小数点的数据',
			],
			unfit: [
				'每条内容差异很大、有图有长文——用卡片',
				'手机屏幕上超过四列',
				'只有三五条、不需要比较的信息',
			],
		},
		prompts: [
			'订单列表改成数据表，列是订单号、客户、金额、状态',
			'表头点一下按金额排序，再点一下反过来',
			'表格每行右边加「查看」和「删除」两个操作',
			'手机上表格改成横向可滚动，别挤成一团',
		],
		promptTip: '把列名一个个说出来，AI 就不会自己发明字段；顺手说清要不要排序和筛选。',
		warning:
			'表格不是万能容器。每行长得都不一样的内容硬塞进表格，用户会看得头晕——列越多越要问自己一句「真的需要比较吗」。',
	},
	accordion: {
		question: '到底是什么？和标签页有什么不一样？',
		spot: {
			title: '这个页面里，哪一块是折叠面板？',
			intro: '三块都在「分段」，但只有一块是上下叠着、点标题才展开的。',
			regions: [
				{
					id: 'tabs',
					name: '标签页',
					en: 'Tabs',
					correct: false,
					note: '不是它。标签横着排一行，一次只能看一个视图——它是「切换」，不是「展开」。',
				},
				{
					id: 'accordion',
					name: '折叠面板',
					en: 'Accordion',
					correct: true,
					note: '就是它！标题一条条竖着叠，点哪条哪条展开，像手风琴的风箱一样拉开合上。',
				},
				{
					id: 'list',
					name: '链接列表',
					en: 'Link List',
					correct: false,
					note: '不是它。点一条会跳走，页面上什么都不展开。',
				},
			],
		},
		quiz: {
			question: '页面上要放十二条常见问题，每条答案两三句话。怎么摆？',
			options: [
				{
					key: 'A',
					text: '折叠面板——先看问题，想看再点开',
					correct: true,
					feedback: '对。十二个问题一眼扫完，用户只展开自己关心的那条，页面也不会拉得老长。',
				},
				{
					key: 'B',
					text: '标签页——一个问题一个标签',
					correct: false,
					feedback:
						'十二个标签一行根本排不下，而且标签页适合平级视图，不适合「问题 → 答案」这种结构。',
				},
				{
					key: 'C',
					text: '全部展开——省得用户多点一下',
					correct: false,
					feedback: '十二条问答全铺开，用户找自己那条得滚三屏。折叠的意义就是让目录先出来。',
				},
			],
		},
		anatomyIntro:
			'名字来自手风琴：风箱一格一格，拉开哪格哪格出声。它把长内容折成一排标题，用户按标题「点播」——不点，就只占一行。拆开看：',
		parts: [
			{ name: '标题行', en: 'Header', note: '可点的那一条，写清里面是什么，整行都能点。' },
			{ name: '展开图标', en: 'Chevron', note: '右侧的小箭头或加号，转个方向告诉你开没开。' },
			{ name: '内容区', en: 'Panel', note: '展开后露出来的正文，收起时完全不占地方。' },
			{ name: '分隔线', en: 'Divider', note: '条与条之间的细线，让一排标题看起来是一组。' },
		],
		variants: [
			{ title: '单开型', description: '打开一条，别的自动收起，页面始终短。', sketch: 'ac-single' },
			{ title: '多开型', description: '可以同时展开好几条，方便对照着看。', sketch: 'ac-multi' },
			{
				title: '贴合型',
				description: '去掉边框只留分隔线，嵌在文章里不突兀。',
				sketch: 'ac-flush',
			},
		],
		usage: {
			fit: ['FAQ、条款这类「问 → 答」的长内容', '设置页里不常用的高级选项', '手机上节省纵向空间'],
			unfit: [
				'用户需要同时对照两段内容——用平铺',
				'只有一两段，折起来反而多一步',
				'重要信息——折起来等于藏起来',
			],
		},
		prompts: [
			'FAQ 改成折叠面板，默认全部收起',
			'一次只能展开一条，点开新的就把旧的收起',
			'折叠面板标题右侧加一个会旋转的小箭头',
			'把「高级设置」折进一个折叠面板里，默认收起',
		],
		promptTip: '说清「单开还是多开」和「默认开哪条」——这两件事 AI 最爱替你拍板。',
		warning: '折叠是在藏东西。用户得先猜里面有什么才会点开——标题写不清，里面的内容就等于不存在。',
	},
	button: {
		question: '到底是什么？一个按钮还能分出主次？',
		spot: {
			title: '这个页面里，哪一个是按钮？',
			intro: '三个都能引起注意，但只有一个是「按下去会发生一件事」。',
			regions: [
				{
					id: 'link',
					name: '文字链接',
					en: 'Link',
					correct: false,
					note: '不是它。带下划线的蓝字是链接——点它是「去别处」，不是「做件事」。',
				},
				{
					id: 'tag',
					name: '标签',
					en: 'Tag',
					correct: false,
					note: '不是它。小圆角的「新」是标签，只负责贴个标记，按下去什么都不会发生。',
				},
				{
					id: 'button',
					name: '按钮',
					en: 'Button',
					correct: true,
					note: '就是它！一个动词加一块实心的形状，按下去就触发一个动作。',
				},
			],
		},
		quiz: {
			question: '表单底部有「提交」和「取消」两个按钮，怎么摆最合适？',
			options: [
				{
					key: 'A',
					text: '提交做实心主按钮，取消做文字按钮',
					correct: true,
					feedback: '对。一个页面只留一个最重的按钮，用户一眼知道「主要的那一步」在哪。',
				},
				{
					key: 'B',
					text: '两个都实心，看起来对称',
					correct: false,
					feedback: '两个一样重等于没有重点，用户得先读字才知道按哪个——按钮的层级就白设计了。',
				},
				{
					key: 'C',
					text: '取消做成红色实心，醒目一点',
					correct: false,
					feedback: '红色实心是留给「危险动作」的（删除、清空）。取消不危险，抢眼反而误导。',
				},
			],
		},
		anatomyIntro:
			'按钮是界面上最老的零件——它把「做件事」压缩成一个可以按的形状。看似简单，但主次、状态、图标，每一样都在替用户省判断。拆开看：',
		parts: [
			{
				name: '标签文字',
				en: 'Label',
				note: '一个动词：保存、发送、删除。别写「确定」，说清做什么。',
			},
			{ name: '图标', en: 'Icon', note: '可选，帮文字加一个直觉线索，不该单独扛意思。' },
			{
				name: '容器',
				en: 'Container',
				note: '颜色、圆角、重量决定它是主是次——实心最重，文字最轻。',
			},
			{ name: '状态', en: 'States', note: '悬停、按下、禁用、加载中——同一个按钮的四副面孔。' },
		],
		variants: [
			{ title: '主按钮', description: '实心、最重，一屏只留一个。', sketch: 'bt-primary' },
			{
				title: '次按钮',
				description: '描边或幽灵，和主按钮站一起不抢戏。',
				sketch: 'bt-secondary',
			},
			{
				title: '图标按钮',
				description: '只有图标不带字，适合工具条里的常用动作。',
				sketch: 'bt-icon',
			},
		],
		usage: {
			fit: [
				'触发一个动作：保存、提交、删除',
				'一个页面一个主按钮，定出主次',
				'需要禁用、加载中这些状态的操作',
			],
			unfit: ['跳转到另一个页面——那是链接', '一排七八个全做成实心', '只是想让一段文字看着醒目'],
		},
		prompts: [
			'提交做成主按钮，取消改成文字按钮',
			'按钮点击后显示加载中并禁用，防止重复提交',
			'删除按钮用红色描边，别用实心',
			'所有按钮统一 8px 圆角和 40px 高度',
		],
		promptTip: '把「主 / 次 / 危险」说出来，比说颜色好用——AI 会按层级配色，而不是随手涂一个。',
		warning: '一屏里的实心按钮只能有一个。全都最重，等于没有重点，用户不知道先按哪个。',
	},
	checkbox: {
		question: '到底是什么？方框和圆点为什么不能混用？',
		spot: {
			title: '这个页面里，哪一组是复选框？',
			intro: '三组都在让你「选」，但只有一组是方的、能同时勾好几个。',
			regions: [
				{
					id: 'checkbox',
					name: '复选框',
					en: 'Checkbox',
					correct: true,
					note: '就是它！方框、能勾好几个——邮件、短信、推送想要哪个勾哪个。',
				},
				{
					id: 'radio',
					name: '单选框',
					en: 'Radio',
					correct: false,
					note: '不是它。圆点是单选：浅色、深色、跟随系统，只能三选一。形状就是在提醒你。',
				},
				{
					id: 'toggle',
					name: '开关',
					en: 'Toggle',
					correct: false,
					note: '不是它。开关是「拨一下立刻生效」，不用点保存；复选框勾了之后通常还要提交。',
				},
			],
		},
		quiz: {
			question: '「选择配送方式：快递 / 自提 / 同城闪送」，用哪种控件？',
			options: [
				{
					key: 'A',
					text: '单选圆点——三个里只能挑一个',
					correct: true,
					feedback: '对。一个订单只能有一种配送方式，圆点的形状就在告诉用户「只能选一个」。',
				},
				{
					key: 'B',
					text: '复选框——万一用户想两个都要',
					correct: false,
					feedback: '方框暗示可以多勾，用户真勾了两个，系统就得处理一个不该存在的组合。',
				},
				{
					key: 'C',
					text: '三个开关——每个都能开关',
					correct: false,
					feedback: '三个开关互不相干，用户能全开也能全关，「必须选一个」这条规则就没人守了。',
				},
			],
		},
		anatomyIntro:
			'它们是一对：方框叫复选框，能勾好几个；圆点叫单选框，一组里只能亮一个。形状本身就是说明书——用户还没读字，就已经知道能选几个了。拆开看：',
		parts: [
			{ name: '选框', en: 'Box', note: '方的能多选、圆的只能单选，形状就是规则。' },
			{ name: '标签', en: 'Label', note: '旁边那行字，点它也能选中，别只让用户点小方块。' },
			{ name: '选中态', en: 'Checked', note: '方框里打勾、圆点里填实，一眼看出哪个选了。' },
			{
				name: '分组标题',
				en: 'Group Label',
				note: '这一组在问什么——「兴趣」「配送方式」——单选尤其需要。',
			},
		],
		variants: [
			{ title: '竖排', description: '一行一个，选项多、标签长时最好读。', sketch: 'ck-stack' },
			{ title: '横排', description: '几个短选项并排一行，省纵向空间。', sketch: 'ck-inline' },
			{ title: '卡片式', description: '整块区域都能点，适合带说明的重要选项。', sketch: 'ck-card' },
		],
		usage: {
			fit: [
				'多选题用方框，单选题用圆点',
				'同意条款这类只有一项的勾选',
				'选项少于七个、要一眼看全的时候',
			],
			unfit: [
				'选项超过七八个——改用下拉选择',
				'一拨即生效的设置——那是开关',
				'只有一个选项却用单选圆点（选了就取消不掉）',
			],
		},
		prompts: [
			'「兴趣标签」改成复选框，可以多选',
			'配送方式用单选，默认选中快递',
			'同意条款的复选框没勾之前，提交按钮保持禁用',
			'复选框做成点整行都能选中的，不只是点小方块',
		],
		promptTip: '先说「多选还是单选」，再说默认值——AI 拿到这两句，就不会把圆点画成方框。',
		warning:
			'形状是承诺：方框告诉用户「可以多勾」，圆点告诉用户「只能选一个」。形状用错了，用户按形状的预期去操作，就一定会出错。',
	},
	spinner: {
		question: '到底是什么？转圈的那个小图标，为什么不直接显示进度？',
		spot: {
			title: '这个页面里，哪一个是 Spinner？',
			intro: '四块都在「等」或「提示」，只有一个在转圈、什么也不承诺。',
			regions: [
				{
					id: 'badge',
					name: '徽标',
					en: 'Badge',
					correct: false,
					note: '不是它。铃铛角上的数字是徽标——常驻计数，和等待无关。',
				},
				{
					id: 'skeleton',
					name: '骨架屏',
					en: 'Skeleton',
					correct: false,
					note: '不是它。骨架屏先按内容的形状画出灰块，是「内容马上来」的占位。',
				},
				{
					id: 'empty',
					name: '空状态',
					en: 'Empty State',
					correct: false,
					note: '不是它。空状态是加载完了但确实没内容——等待已经结束。',
				},
				{
					id: 'spinner',
					name: '加载指示',
					en: 'Spinner',
					correct: true,
					note: '就是它！一个转个不停的圈，只说「还在忙」，不说还要多久。',
				},
			],
		},
		quiz: {
			question: '用户要上传一个 2GB 的视频，大概要一分钟。等待期间用什么提示？',
			options: [
				{
					key: 'A',
					text: 'Spinner——转着圈就行',
					correct: false,
					feedback:
						'一分钟盯着转圈，用户会怀疑卡死了然后刷新。超过几秒的等待，spinner 就不够用了。',
				},
				{
					key: 'B',
					text: '进度条——显示上传到了百分之几',
					correct: true,
					feedback: '对。总量已知、时间够长，就该告诉用户「还剩多少」，进度条正是干这个的。',
				},
				{
					key: 'C',
					text: '骨架屏——先画出视频播放器的轮廓',
					correct: false,
					feedback: '骨架屏是给「即将显示的内容」占位，上传是把东西送出去，形状占位帮不上忙。',
				},
			],
		},
		anatomyIntro:
			'名字来自 spin——转个不停。它是最省事的等待提示：不知道要多久、也不承诺多久，只说一句「我还活着，别刷新」。零件很少：',
		parts: [
			{ name: '转圈图形', en: 'Ring', note: '一个缺口的圆环在转，缺口是运动感的来源。' },
			{ name: '说明文字', en: 'Label', note: '可选的「加载中…」，告诉用户在等什么。' },
			{ name: '所在位置', en: 'Host', note: '它长在哪：按钮里、区域中央，还是盖住整页。' },
		],
		variants: [
			{
				title: '按钮内',
				description: '点下去后按钮变「提交中」，同时禁用。',
				sketch: 'spn-inline',
			},
			{
				title: '区域中央',
				description: '只有这一块在转，页面其他部分照常用。',
				sketch: 'spn-block',
			},
			{ title: '整页遮罩', description: '半透明盖住全页，什么都不能点。', sketch: 'spn-page' },
		],
		usage: {
			fit: ['几秒钟内就能结束的等待', '点提交之后的「正在处理」', '不知道总量、也没法算进度的请求'],
			unfit: [
				'超过十秒的等待——用进度条',
				'首屏内容加载——用骨架屏',
				'每个小组件各转各的圈，满屏转圈',
			],
		},
		prompts: [
			'点提交后按钮里显示一个 spinner，同时禁用按钮',
			'列表加载时在区域中央放一个 spinner，别整页遮罩',
			'请求超过 8 秒还没回来，就把 spinner 换成一句提示',
			'全站用同一个 spinner 组件，别每处画一个',
		],
		promptTip: '说清放在哪、什么时候出现、什么时候消失——spinner 最常见的 bug 是转个不停。',
		warning:
			'Spinner 只能撑几秒。超过十秒还在转，用户会以为卡死了——要么换成进度条，要么给一句「大约需要一分钟」。还有：请求失败后一定要把它收掉，转圈加报错是最让人抓狂的组合。',
	},
	'progress-bar': {
		question: '到底是什么？和转圈圈的 Spinner 到底差在哪？',
		spot: {
			title: '这个页面里，哪一个是进度条？',
			intro: '三条横的东西，只有一条在告诉你「完成了几成」。',
			regions: [
				{
					id: 'spinner',
					name: '加载指示',
					en: 'Spinner',
					correct: false,
					note: '不是它。转圈只说「还在忙」，从不说还剩多少。',
				},
				{
					id: 'progress',
					name: '进度条',
					en: 'Progress Bar',
					correct: true,
					note: '就是它！轨道加填充，62% 是真实进度，用户能估出还要等多久。',
				},
				{
					id: 'slider',
					name: '滑块',
					en: 'Slider',
					correct: false,
					note: '不是它。滑块长得像，但那个圆点是给你拖的——它是输入，不是反馈。',
				},
			],
		},
		quiz: {
			question: '导出一份 PDF 报告大约要 30 秒。等待期间怎么提示最合适？',
			options: [
				{
					key: 'A',
					text: 'Spinner——转着圈等就好',
					correct: false,
					feedback: '30 秒对着转圈太长了，用户会怀疑卡死。超过十秒的等待，请告诉他还剩多少。',
				},
				{
					key: 'B',
					text: '进度条——显示「正在生成 第 3 / 8 页」',
					correct: true,
					feedback: '对。总量已知（8 页），就该把几成画出来，用户看得到在往前走。',
				},
				{
					key: 'C',
					text: 'Toast——弹一句「正在导出」',
					correct: false,
					feedback: 'Toast 几秒就消失，之后的 25 秒用户面对的是一片沉默。',
				},
			],
		},
		anatomyIntro:
			'一条从空到满的横条。它比 Spinner 多说了一件关键的事：还剩多少。名字直白，形状也直白——轨道、填充、数字，再配一句说明：',
		parts: [
			{ name: '轨道', en: 'Track', note: '浅色的底，代表全部工作量。' },
			{ name: '填充', en: 'Fill', note: '深色的那段，代表已经完成的部分。' },
			{ name: '数值', en: 'Value', note: '62% 或 3 / 5，把比例说成数字。' },
			{ name: '说明', en: 'Label', note: '一句「正在上传 report.pdf」，告诉用户在等什么。' },
		],
		variants: [
			{ title: '带百分比', description: '进度真实可算，直接给数字。', sketch: 'pb-percent' },
			{ title: '不定长', description: '算不出进度时，一小段来回跑。', sketch: 'pb-indeterminate' },
			{ title: '分段式', description: '五步任务走完三步，一格一格亮。', sketch: 'pb-steps' },
		],
		usage: {
			fit: ['上传、下载这种知道总量的任务', '多步骤任务的整体进度', '超过十秒的等待'],
			unfit: [
				'一两秒的等待——Spinner 就够了',
				'完全算不出进度——用不定长模式或 Spinner',
				'拿它当装饰，进度是编出来的',
			],
		},
		prompts: [
			'上传文件时显示进度条和百分比，完成后变成绿色对勾',
			'进度条用不定长模式，因为接口不返回进度',
			'把三个步骤的完成情况画成分段进度条',
			'进度条别倒退，失败时变红并停在原地',
		],
		promptTip:
			'说清进度从哪来（真实数据还是估算）和走到 100% 之后怎么办——AI 经常做出走到 99% 就卡住的假进度。',
		warning:
			'进度条一定要诚实。用假数据匀速走到 90% 然后干等，比 Spinner 更让人恼火——用户会盯着它数秒。没有真实进度就用不定长模式，别编。',
	},
	stepper: {
		question: '到底是什么？和标签页、面包屑长得都有点像，怎么分？',
		spot: {
			title: '这个页面里，哪一个是步骤条？',
			intro: '四条横着排的东西，只有一条在说「你走到第几步了」。',
			regions: [
				{
					id: 'tabs',
					name: '标签页',
					en: 'Tabs',
					correct: false,
					note: '不是它。标签页是几个平级视图，想先看哪个都行，没有先后。',
				},
				{
					id: 'breadcrumb',
					name: '面包屑',
					en: 'Breadcrumb',
					correct: false,
					note: '不是它。面包屑说的是「你在站点的第几层」，是位置，不是流程。',
				},
				{
					id: 'stepper',
					name: '步骤条',
					en: 'Stepper',
					correct: true,
					note: '就是它！三个节点串成一线，前面打了勾、中间点亮、后面还灰着——这就是流程的进度。',
				},
				{
					id: 'progress',
					name: '进度条',
					en: 'Progress Bar',
					correct: false,
					note: '不是它。进度条是一段连续的量（62%），步骤条是几个离散的站。',
				},
			],
		},
		quiz: {
			question: '注册流程是「填资料 → 验证邮箱 → 设置密码」，必须按顺序来。顶部导航用什么？',
			options: [
				{
					key: 'A',
					text: 'Tabs——三个标签，点哪个看哪个',
					correct: false,
					feedback: '标签页可以乱序跳，用户会直接跳过验证邮箱。有先后依赖的流程不能用它。',
				},
				{
					key: 'B',
					text: 'Stepper——三步排开，走到哪亮到哪',
					correct: true,
					feedback: '对。步骤条既显示进度，又通过「未到达的步骤不能点」把顺序锁住了。',
				},
				{
					key: 'C',
					text: 'Breadcrumb——首页 / 注册 / 验证邮箱',
					correct: false,
					feedback: '面包屑表示层级位置，不表示流程进度——它不会告诉用户还剩几步。',
				},
			],
		},
		anatomyIntro:
			'名字来自 step——一步一步来。它把一条长流程切成几段，每段一个节点，告诉你走到哪、还剩几步、能不能回头。组成：',
		parts: [
			{ name: '节点', en: 'Node', note: '一个圆圈，里面是序号或对勾。' },
			{ name: '连线', en: 'Connector', note: '节点之间的那条线，走过的部分会变色。' },
			{ name: '标签', en: 'Label', note: '每一步叫什么：填资料、验证邮箱。' },
			{ name: '状态', en: 'State', note: '已完成、进行中、未到达——三种样子一眼分得清。' },
		],
		variants: [
			{ title: '横向', description: '桌面端最常见，节点一字排开。', sketch: 'stp-horizontal' },
			{ title: '竖向', description: '每步下面可以放说明和表单。', sketch: 'stp-vertical' },
			{ title: '点状', description: '手机 onboarding 常用，只剩几个小点。', sketch: 'stp-dots' },
		],
		usage: {
			fit: [
				'三步以上的线性流程：注册、下单、配置向导',
				'步骤之间有先后依赖',
				'用户需要知道「还要多久才填完」',
			],
			unfit: [
				'只有两步——直接放两个按钮',
				'步骤可以任意顺序——那是标签页',
				'表示网站的层级位置——那是面包屑',
			],
		},
		prompts: [
			'把注册表单拆成三步的 stepper，顶部显示当前第几步',
			'已完成的步骤显示对勾，可以点回去修改',
			'未到达的步骤不能点，灰掉',
			'手机上把 stepper 改成小圆点，只显示当前步骤名',
		],
		promptTip: '说清能不能回头、能不能跳步——这两条规则决定了它是向导还是标签页。',
		warning:
			'步骤条是承诺：写了「共 3 步」就别在第 3 步之后突然冒出第 4 步。还有，步数超过 5 个就该合并了——没人想看到「第 2 步，共 9 步」。',
	},
	'infinite-scroll': {
		question: '到底是什么？滚到底自动加载，和翻页比到底谁更好？',
		spot: {
			title: '这三个列表里，哪一个是无限滚动？',
			intro: '三个列表都到底了，只有一个不用你动手就会继续长。',
			regions: [
				{
					id: 'pagination',
					name: '分页',
					en: 'Pagination',
					correct: false,
					note: '不是它。底部一排页码，要看下一页得自己点——每一页都有名字，能回得去。',
				},
				{
					id: 'loadmore',
					name: '加载更多',
					en: 'Load More',
					correct: false,
					note: '不是它。一个按钮，点一下才多一批——它是无限滚动的「手动挡」。',
				},
				{
					id: 'infinite',
					name: '无限滚动',
					en: 'Infinite Scroll',
					correct: true,
					note: '就是它！底部只有一个转圈，快滚到时下一批就自己接上来，没有「下一页」这回事。',
				},
			],
		},
		quiz: {
			question: '电商站的搜索结果有 2000 件商品，用户会反复比较、也会把结果发给朋友。列表怎么翻？',
			options: [
				{
					key: 'A',
					text: '无限滚动——刷起来最顺手',
					correct: false,
					feedback:
						'顺手，但用户找不回「刚才第 37 件」，也没法把「第 3 页」发给朋友，页脚更是永远够不着。',
				},
				{
					key: 'B',
					text: '分页——每页 40 件，带页码',
					correct: true,
					feedback: '对。要比较、要回看、要分享链接的场景，页码给了每一屏一个固定地址。',
				},
				{
					key: 'C',
					text: '一次全部加载，反正只有 2000 件',
					correct: false,
					feedback: '2000 张商品图一次塞进页面，手机会卡到怀疑人生。',
				},
			],
		},
		anatomyIntro:
			'没有「下一页」按钮，页面自己在你快滚到底时偷偷把下一批接上。看起来什么都没有，其实藏了几个机关：',
		parts: [
			{ name: '内容列表', en: 'List', note: '已经加载的条目，越刷越长。' },
			{ name: '触发线', en: 'Sentinel', note: '一条看不见的哨兵线，滚到它就去请求下一批。' },
			{ name: '加载指示', en: 'Loader', note: '底部转一下圈，告诉你新的一批在路上。' },
			{ name: '结束提示', en: 'End', note: '真到底时说一声「没有更多了」，别让人一直等。' },
		],
		variants: [
			{ title: '信息流', description: '全自动，快到底就接上一批。', sketch: 'inf-feed' },
			{
				title: '半自动',
				description: '滚到底出一个「加载更多」，点了才继续。',
				sketch: 'inf-loadmore',
			},
			{ title: '到底了', description: '显示结束语，顺手给个回到顶部。', sketch: 'inf-end' },
		],
		usage: {
			fit: [
				'信息流、瀑布流这种「随便刷」的场景',
				'内容没有固定终点，比如时间线',
				'手机端不想让人去点小页码',
			],
			unfit: [
				'用户要找「第几条」或分享某一页——用分页',
				'页面底部有页脚和重要链接',
				'列表会长到几千条，浏览器吃不消',
			],
		},
		prompts: [
			'列表改成无限滚动，离底部 200px 时自动加载下一批',
			'加载到第 5 批后改成「加载更多」按钮，别一直自动',
			'没有更多内容时显示「到底了」，并给一个回到顶部',
			'从详情页返回时记住滚动位置和已加载的内容',
		],
		promptTip: '说清触发距离、每批多少条、到底了怎么办——这三项 AI 默认都会随便定。',
		warning:
			'无限滚动会吞掉页脚——用户永远够不到底部的链接。另一个大坑是「回不到原位」：点进详情再返回，列表从头加载，刚才刷到的那条找不着了。这两点没解决，别上它。',
	},
	'dropdown-menu': {
		question: '到底是什么？它和下拉选择（Select）不是一回事吗？',
		spot: {
			title: '这个页面里，哪一个是 Dropdown Menu？',
			intro: '三个都能「点开选一个」，但只有一个选完就会替你做事。',
			regions: [
				{
					id: 'select',
					name: '下拉选择',
					en: 'Select',
					correct: false,
					note: '不是它。它选的是一个「值」，选完留在那儿等你提交，什么都不会替你做。',
				},
				{
					id: 'tabs',
					name: '标签页',
					en: 'Tabs',
					correct: false,
					note: '不是它。标签页的选项一直摆在外面，不需要点开；切换的是视图，不是执行动作。',
				},
				{
					id: 'menu',
					name: '下拉菜单',
					en: 'Dropdown Menu',
					correct: true,
					note: '就是它！点「···」摊开一列动作，点「复制」立刻复制、点「删除」立刻删除，然后自己收起。',
				},
			],
		},
		quiz: {
			question: '表格每一行右侧要放「编辑、复制、删除」三个动作，怎么摆最合适？',
			options: [
				{
					key: 'A',
					text: '收进一个「···」下拉菜单里',
					correct: true,
					feedback: '对。一行里三个动作太吵，收进菜单，主界面干净，动作也一个不少。',
				},
				{
					key: 'B',
					text: '用一个 Select 让用户选一个动作',
					correct: false,
					feedback: 'Select 是选值用的，选了「删除」到底删不删？语义拧巴，用户也不敢点。',
				},
				{
					key: 'C',
					text: '三个按钮全部摆出来',
					correct: false,
					feedback: '每一行都摆三个按钮，整张表都在喊「点我」。只有一个高频动作时才值得露在外面。',
				},
			],
		},
		anatomyIntro:
			'它是「一个按钮 + 一列动作」：平时只露出触发器，点开才把选项摊出来，选完立刻执行并收起。跟 Select 最大的区别——Select 选的是「值」，留在表单里等提交；菜单选的是「做什么」，点了就干。组成：',
		parts: [
			{ name: '触发器', en: 'Trigger', note: '一个按钮或「···」图标，点它才打开菜单。' },
			{ name: '菜单面板', en: 'Panel', note: '浮在触发器下方的一小块，带阴影，点外面就关。' },
			{ name: '菜单项', en: 'Item', note: '每一行是一个动作，动词开头：编辑、复制、导出。' },
			{
				name: '分隔与危险项',
				en: 'Divider',
				note: '删除这类不可逆的动作放最后，一条线隔开、标成红色。',
			},
		],
		variants: [
			{
				title: '图标触发',
				description: '「···」或齿轮，最省地方，表格行末常见。',
				sketch: 'dd-icon',
			},
			{ title: '按钮触发', description: '「新建 ▾」——主动作旁边挂几个近亲。', sketch: 'dd-button' },
			{
				title: '右键菜单',
				description: '在光标位置弹出，桌面软件的老习惯。',
				sketch: 'dd-context',
			},
		],
		usage: {
			fit: [
				'一行数据后面的「更多操作」',
				'把次要动作收起来，给主界面减负',
				'同一目标的多种做法（导出为 PDF / CSV）',
			],
			unfit: [
				'让用户填一个值——那是 Select',
				'只有一个动作——直接放按钮',
				'高频动作藏进菜单，每次多点一下',
			],
		},
		prompts: [
			'表格每一行末尾加一个「···」按钮，点开是编辑、复制、删除的下拉菜单',
			'下拉菜单里的「删除」放最后，用分隔线隔开并标成红色',
			'菜单选完自动关闭，点击外部或按 Esc 也关闭',
			'这个下拉菜单在移动端改成从底部弹出的面板',
		],
		promptTip: '先说清是「动作菜单」还是「取值下拉」，AI 才不会拿一个 <select> 交差。',
		warning: '菜单是用来藏东西的——藏得越深，越没人用。高频动作别塞进「···」，露在外面才有人点。',
	},
	tooltip: {
		question: '到底是什么？它和 Popover、Toast 都是「冒出来的小框」，怎么分？',
		spot: {
			title: '这个页面里，哪一个是 Tooltip？',
			intro: '三个小框都在说话，但只有一个是「鼠标停上去才冒出来」的。',
			regions: [
				{
					id: 'popover',
					name: '弹出层',
					en: 'Popover',
					correct: false,
					note: '不是它。它要点一下才打开，里面还放了按钮——能操作的不是 tooltip，是 popover。',
				},
				{
					id: 'tooltip',
					name: '气泡提示',
					en: 'Tooltip',
					correct: true,
					note: '就是它！鼠标停在「?」上就冒一句解释，移开就没，只说明、不操作。',
				},
				{
					id: 'toast',
					name: '轻提示',
					en: 'Toast',
					correct: false,
					note: '不是它。Toast 是系统主动弹给你的反馈，几秒后自己消失，跟鼠标在哪儿没关系。',
				},
			],
		},
		quiz: {
			question: '工具栏上一个只有图标、没有文字的按钮，怎么让人知道它是干嘛的？',
			options: [
				{
					key: 'A',
					text: 'Tooltip——悬停时显示「复制链接」',
					correct: true,
					feedback: '对。停一下就知道是什么，不占版面，也不打断操作。',
				},
				{
					key: 'B',
					text: 'Toast——点下去之后弹一句说明',
					correct: false,
					feedback: '点完才知道它是干嘛的，已经晚了——万一是「删除」呢？',
				},
				{
					key: 'C',
					text: 'Modal——点开一个弹窗解释用法',
					correct: false,
					feedback: '为一个按钮的名字拦住整页，太重了。弹窗留给需要做决定的事。',
				},
			],
		},
		anatomyIntro:
			'名字就是「小工具的提示」：鼠标停上去冒一句、移开就没，永远不占版面。它只解释、不承载操作——里面要放按钮的，那叫 Popover。组成：',
		parts: [
			{
				name: '触发目标',
				en: 'Target',
				note: '被悬停或键盘聚焦的那个东西：图标、缩略文字、问号。',
			},
			{ name: '气泡', en: 'Bubble', note: '深色小框，一两句话，不换行最好。' },
			{ name: '小箭头', en: 'Arrow', note: '指向目标，说明「我在解释的是它」。' },
			{ name: '出现延迟', en: 'Delay', note: '停留两三百毫秒才出现，鼠标扫过时不会一路乱闪。' },
		],
		variants: [
			{ title: '上方', description: '默认位置，箭头朝下指着目标。', sketch: 'tt-top' },
			{ title: '侧边', description: '目标贴着屏幕上沿时，改从右边冒出来。', sketch: 'tt-side' },
			{ title: '带快捷键', description: '文字旁附一个 ⌘C，顺手教一招。', sketch: 'tt-rich' },
		],
		usage: {
			fit: ['图标按钮的名字', '被截断文字的完整版', '字段旁边的一句解释'],
			unfit: [
				'移动端——手指没有「悬停」',
				'必须看到的信息——藏在悬停里等于没写',
				'里面要放按钮、链接——那是 Popover',
			],
		},
		prompts: [
			'给工具栏所有图标按钮加 tooltip，悬停 300 毫秒后显示名字',
			'tooltip 默认出现在按钮上方，贴近屏幕边缘时自动翻到下方',
			'这个「?」图标的 tooltip 改成一句话说明扣费规则',
			'表格里被截断的单元格，悬停时用 tooltip 显示完整内容',
		],
		promptTip: '说清触发方式和位置，再补一句「键盘聚焦也要能显示」，无障碍就不会漏。',
		warning:
			'手机上没有鼠标，也就没有「悬停」——tooltip 里的信息在移动端会直接消失。关键信息别只靠它。',
	},
	'command-palette': {
		question: '到底是什么？它和页面上普通的搜索框有什么不一样？',
		spot: {
			title: '这个页面里，哪一个是 Command Palette？',
			intro: '三个都能「打字然后选一个」，但只有一个能直接替你做事。',
			regions: [
				{
					id: 'search',
					name: '搜索框',
					en: 'Search',
					correct: false,
					note: '不是它。普通搜索框只找内容，找到了还得自己点进去；它也不会跳出来盖住页面。',
				},
				{
					id: 'select',
					name: '下拉选择',
					en: 'Select',
					correct: false,
					note: '不是它。Select 只在预设的几个值里挑一个，没有输入框，更不会执行动作。',
				},
				{
					id: 'palette',
					name: '命令面板',
					en: 'Command Palette',
					correct: true,
					note: '就是它！按 ⌘K 浮出来，打两个字，页面和动作混在一列里，回车直接到位。',
				},
			],
		},
		quiz: {
			question: '你想让熟手在三秒内跳到任何一页、执行任何动作，用什么？',
			options: [
				{
					key: 'A',
					text: 'Command Palette——⌘K 打字回车',
					correct: true,
					feedback: '对。键盘不离手，页面和动作全在一列里，这就是它存在的意义。',
				},
				{
					key: 'B',
					text: '把所有入口都摆进导航栏',
					correct: false,
					feedback: '入口越多导航越挤，最后谁也找不到谁。导航栏只该放最主要的几个。',
				},
				{
					key: 'C',
					text: '在页面上放一个搜索框',
					correct: false,
					feedback: '普通搜索只找内容，不能「切换深色模式」「新建文档」——它执行不了动作。',
				},
			],
		},
		anatomyIntro:
			'它从代码编辑器来：按一下快捷键，弹出一个输入框，打几个字，页面、设置、动作全在一列里等你回车。你正在看的这个站，按 ⌘K 就能试到。跟普通搜索框的区别——它不只找内容，还能直接「做事」。组成：',
		parts: [
			{ name: '快捷键', en: 'Shortcut', note: '⌘K 或 Ctrl+K 唤起，键盘不用离开。' },
			{ name: '输入框', en: 'Input', note: '打开就自动聚焦，边打边筛。' },
			{ name: '结果列表', en: 'Results', note: '页面、动作、最近访问混排，每项带图标说明类型。' },
			{ name: '高亮项', en: 'Active', note: '上下键移动、回车执行，鼠标只是备选。' },
			{
				name: '按键提示',
				en: 'Hints',
				note: '底部一行「↑↓ 选择 · ↵ 打开 · esc 关闭」，新手也能上手。',
			},
		],
		variants: [
			{
				title: '搜索型',
				description: '只列页面和内容，本质是浮起来的站内搜索。',
				sketch: 'cp-search',
			},
			{
				title: '动作型',
				description: '每项都是动词，输入「>」进入命令模式。',
				sketch: 'cp-action',
			},
			{
				title: '分组型',
				description: '最近访问、页面、动作分段列出，一眼分清。',
				sketch: 'cp-group',
			},
		],
		usage: {
			fit: ['页面多、动作多的工具型产品', '给熟手一条键盘快车道', '把散落各处的入口收成一个'],
			unfit: [
				'内容站的主搜索——普通搜索框更直观',
				'新手的唯一入口——没人知道要按 ⌘K',
				'只有三五个页面的小站',
			],
		},
		prompts: [
			'加一个 ⌘K 命令面板，能搜索所有页面并跳转',
			'命令面板里除了页面，也列出「新建文档」「切换深色模式」这类动作',
			'结果列表支持上下键选择、回车打开、Esc 关闭',
			'导航栏右侧放一个「搜索 ⌘K」按钮，点它也能打开命令面板',
		],
		promptTip:
			'把「能搜什么」列清楚——页面？动作？最近访问？——再要求键盘操作完整，AI 就不会只给你一个会跳转的搜索框。',
		warning:
			'⌘K 是隐藏入口，新用户根本不知道它存在。页面上一定要留一个看得见的按钮或提示，否则再好用也是白做。',
	},
	alert: {
		question: '到底是什么？它和 Toast 都是「提示」，凭什么它不会消失？',
		spot: {
			title: '这个页面里，哪一条是 Alert？',
			intro: '三个都在提醒你，但只有一个既不拦路、也不会自己走。',
			regions: [
				{
					id: 'alert',
					name: '警告横幅',
					en: 'Alert',
					correct: true,
					note: '就是它！钉在页面顶上，说清「邮箱没验证」，给个出口，你不处理它就一直在。',
				},
				{
					id: 'modal',
					name: '弹窗',
					en: 'Modal',
					correct: false,
					note: '不是它。弹窗把整页拦住要你先表态——分量重得多，只留给非做不可的决定。',
				},
				{
					id: 'toast',
					name: '轻提示',
					en: 'Toast',
					correct: false,
					note: '不是它。角落弹一下、几秒就消失的是 Toast，适合「保存成功」这种看过即忘的事。',
				},
			],
		},
		quiz: {
			question: '用户的付款方式下周就过期了，怎么提醒最合适？',
			options: [
				{
					key: 'A',
					text: 'Alert——页面顶部挂一条，处理完才消失',
					correct: true,
					feedback: '对。这件事会持续存在，提示也该持续存在；给个「去更新」的出口，处理了就撤。',
				},
				{
					key: 'B',
					text: 'Toast——登录时弹一下',
					correct: false,
					feedback: '三秒就没了，错过就错过。等真的扣款失败，用户才发现你「提醒过」。',
				},
				{
					key: 'C',
					text: 'Modal——每次打开都拦住，直到更新',
					correct: false,
					feedback: '事情还没到非做不可，天天拦路只会招烦，还会让人养成无脑点关闭的习惯。',
				},
			],
		},
		anatomyIntro:
			'它是「钉在页面上的提示条」：说一件需要你注意的事，不拦路，也不会自己溜走——要么你处理了，要么你关掉。比 Toast 重，比 Modal 轻。组成：',
		parts: [
			{ name: '状态图标', en: 'Icon', note: '蓝色告知、琥珀提醒、红色出错，颜色先定性。' },
			{ name: '标题与正文', en: 'Message', note: '一句话说清发生了什么、有什么影响。' },
			{ name: '操作', en: 'Action', note: '「去验证」「了解更多」——给一条能处理掉它的路。' },
			{ name: '关闭', en: 'Dismiss', note: '可选的 ×。能关的才给，关键报错不该能关。' },
		],
		variants: [
			{ title: '告知型', description: '蓝色调：新功能上线、维护通知。', sketch: 'al-info' },
			{ title: '提醒型', description: '琥珀色调：试用剩三天、邮箱未验证。', sketch: 'al-warning' },
			{
				title: '报错型',
				description: '红色调：提交失败、支付被拒，通常不能关。',
				sketch: 'al-error',
			},
		],
		usage: {
			fit: [
				'会持续存在的状态（未验证、试用到期）',
				'表单提交后的整体报错',
				'影响整页的系统通知（维护中）',
			],
			unfit: [
				'一次性操作反馈——用 Toast',
				'必须马上决定的事——用 Modal',
				'页面顶上同时挂三条——没人会读',
			],
		},
		prompts: [
			'表单顶部加一条红色 Alert，列出提交失败的原因',
			'试用期剩 3 天时，在页面顶部显示一条琥珀色横幅，带「立即升级」按钮',
			'Alert 右侧加关闭按钮，关掉后本次会话不再显示',
			'这条 Alert 改成告知型：蓝色图标，不带关闭',
		],
		promptTip:
			'说清它属于哪个范围（整页还是某个表单）和会不会消失，这两点决定了 AI 该用 Alert 还是 Toast。',
		warning:
			'常驻横幅最怕「常驻」：一条挂了三个月的提示，用户早当它是墙纸。要么给出口让人处理掉，要么到时间就撤。',
	},
};
