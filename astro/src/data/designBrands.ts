export interface DesignBrandColor {
	name: string;
	hex: string;
	role: string;
}

export interface DesignBrandTypeRow {
	sample: string;
	spec: string;
	style: string;
}

export interface DesignBrandPlate {
	bg: string;
	strip?: string;
	headline: string;
	headlineStyle: string;
	spec: string;
	specColor: string;
}

export interface DesignBrand {
	id: string;
	name: string;
	category: string;
	tagline: string;
	nameStyle: string;
	heroTitle: string;
	lede: string;
	philosophy: string[];
	colors: DesignBrandColor[];
	typePanelStyle?: string;
	typeScale: DesignBrandTypeRow[];
	dos: string[];
	donts: string[];
	plate: DesignBrandPlate;
	sourceFile: string;
}

export const designBrands: DesignBrand[] = [
	{
		id: 'stripe',
		name: 'Stripe',
		category: '金融',
		tagline: '渐变薄雾 + 300 细体标题的金融精密感',
		nameStyle: 'font-weight:300;letter-spacing:-0.04em;color:#0d253d',
		heroTitle: 'Stripe：金融基础设施的「精密优雅」',
		lede: '一条渐变薄雾横在每个营销页顶部，大标题细到 300 字重还要配负字距，凡是钱的数字一律等宽对齐——Stripe 用几个固执的细节，把「精密」写进了每一个像素。',
		philosophy: [
			'渐变薄雾是品牌锚点：奶油、橙、薰衣草、靛蓝、宝石红横向铺满页面上三分之一，没有它的首屏「不像 Stripe」。',
			'一屏只有一颗靛蓝药丸：#533afd 是唯一的实心按钮色，稀缺本身就是强调。',
			'正文从不用纯黑：全站文字是深海军蓝 #0d253d，金融的冷静写在字色里。',
			'金额必开 tnum 等宽数字——这是金融数据的「安静信号」，断了它品牌就漏气。',
		],
		colors: [
			{ name: 'primary', hex: '#533afd', role: '招牌靛蓝 · 一屏一颗的 CTA' },
			{ name: 'primary-deep', hex: '#4434d4', role: '渐变中停 · 深一档的靛蓝' },
			{ name: 'primary-press', hex: '#2e2b8c', role: '按压态' },
			{ name: 'brand-dark-900', hex: '#1c1e54', role: '深海军 · 定价卡与仪表盘' },
			{ name: 'ink', hex: '#0d253d', role: '全站正文 · 从不用纯黑' },
			{ name: 'ink-secondary', hex: '#273951', role: '次级文字' },
			{ name: 'ink-mute', hex: '#64748d', role: '辅助说明与表格标签' },
			{ name: 'ruby', hex: '#ea2261', role: '渐变与图表点缀 · 从不做按钮' },
			{ name: 'magenta', hex: '#f96bee', role: '渐变里的亮粉' },
			{ name: 'canvas', hex: '#ffffff', role: '页面画布' },
			{ name: 'canvas-soft', hex: '#f6f9fc', role: '冷调功能区底色' },
			{ name: 'canvas-cream', hex: '#f5e9d4', role: '暖色间奏带' },
			{ name: 'hairline', hex: '#e3e8ee', role: '卡片与表格发丝线' },
		],
		typeScale: [
			{
				sample: 'Payments at scale',
				spec: 'display-xxl · 56px / 300 / -1.4px · Sohne',
				style:
					'font-weight:300;font-size:clamp(30px,4.5vw,46px);letter-spacing:-0.032em;color:#0d253d;line-height:1.05',
			},
			{
				sample: 'Built for developers',
				spec: 'display-md · 32px / 300 / -0.64px',
				style: 'font-weight:300;font-size:26px;letter-spacing:-0.02em;color:#0d253d',
			},
			{
				sample: 'Body text stays quiet and legible on white canvas.',
				spec: 'body · 16px / 400',
				style: 'font-size:15px;color:#273951',
			},
			{
				sample: '$1,284,502.00 · 2026-08-26',
				spec: 'caption · 13px · tnum 等宽数字（钱必须对齐）',
				style:
					'font-size:13px;color:#64748d;font-variant-numeric:tabular-nums;letter-spacing:-0.02em',
			},
		],
		dos: [
			'每个营销首屏都铺渐变薄雾',
			'大标题保持 300 字重加负字距',
			'金额一律开 tnum 等宽数字',
			'每段功能说明都配真实产品 UI 截图',
		],
		donts: [
			'标题加粗到 400——优雅感立刻塌掉',
			'把靛蓝用作正文颜色',
			'在既定渐变色之外新增强调色',
			'用圆角矩形替换药丸按钮',
		],
		plate: {
			bg: '#ffffff',
			strip:
				'linear-gradient(100deg, #f5e9d4, #ffb199 22%, #cabffd 47%, #533afd 72%, #ea2261 100%)',
			headline: 'Financial infrastructure to grow your revenue',
			headlineStyle:
				'font-weight:300;font-size:clamp(26px,3.6vw,40px);letter-spacing:-0.04em;color:#0d253d;line-height:1.12',
			spec: 'Sohne 300 · tracking -1.4px · $1,284,502.00 tnum',
			specColor: '#64748d',
		},
		sourceFile: 'stripe',
	},
	{
		id: 'linear',
		name: 'Linear',
		category: '开发工具',
		tagline: '近乎纯黑的画布上，只留一点薰衣草蓝',
		nameStyle: 'font-weight:600;letter-spacing:-0.035em;color:#0f1011',
		heroTitle: 'Linear：把黑做到最深的工具美学',
		lede: '#010102——比纯黑多一丝蓝调的画布，是这批品牌里最深的底色。层次不靠阴影，靠四级表面阶梯和发丝线撑起；全站唯一的彩色是薰衣草蓝 #5e6ad2，只出现在品牌标、焦点环和主按钮上。产品截图才是页面的主角，营销页只是它的暗色画框。',
		philosophy: [
			'画布 #010102 刻意不用纯黑，那一丝蓝调是一个设计决定，不是误差。',
			'层次全靠四级表面阶梯（canvas → surface-4）加发丝线，不用阴影，也不许跳级。',
			'全站唯一彩色 #5e6ad2，只给品牌标、焦点环、主 CTA——连语义绿都极少露面。',
			'产品截图是每一节的主角，营销 chrome 退到最少，当好画框。',
		],
		colors: [
			{ name: 'canvas', hex: '#010102', role: '最深的画布 · 含一丝蓝调' },
			{ name: 'surface-1', hex: '#0f1011', role: '表面阶梯 一级 · 卡片底' },
			{ name: 'surface-2', hex: '#141516', role: '表面阶梯 二级' },
			{ name: 'surface-3', hex: '#18191a', role: '表面阶梯 三级' },
			{ name: 'surface-4', hex: '#191a1b', role: '表面阶梯 四级' },
			{ name: 'hairline', hex: '#23252a', role: '发丝线边框' },
			{ name: 'hairline-strong', hex: '#34343a', role: '强发丝线' },
			{ name: 'primary', hex: '#5e6ad2', role: '唯一的彩色 · 品牌标 / 焦点环 / 主 CTA' },
			{ name: 'primary-hover', hex: '#828fff', role: 'hover 态的亮薰衣草' },
			{ name: 'ink', hex: '#f7f8f8', role: '亮灰正文与标题' },
			{ name: 'ink-muted', hex: '#d0d6e0', role: '次级文字' },
			{ name: 'ink-subtle', hex: '#8a8f98', role: '弱文字' },
			{ name: 'semantic-success', hex: '#27a644', role: '唯一的语义绿 · 状态 pill' },
		],
		typePanelStyle: 'background:#010102;border-color:#23252a',
		typeScale: [
			{
				sample: 'Plan and build products',
				spec: 'display · 80px 时字距 -3.0px · 600 字重',
				style:
					'font-weight:600;font-size:clamp(28px,4vw,42px);letter-spacing:-0.035em;color:#f7f8f8;line-height:1.05',
			},
			{
				sample: 'Purpose-built for modern product development.',
				spec: 'body · 400 · 字距 -0.05px',
				style: 'font-size:15px;color:#8a8f98',
			},
			{
				sample: 'LIN-204 · Fix drag latency on board view',
				spec: 'mono · 产品截图里的代码与工单',
				style: "font-family:ui-monospace,'SF Mono',monospace;font-size:13px;color:#d0d6e0",
			},
		],
		dos: [
			'用四级表面阶梯做层次，不要跳级',
			'薰衣草蓝只给品牌标、焦点环、主按钮',
			'display 用 600 字重配激进负字距',
			'让产品截图当每一节的主角',
		],
		donts: [
			'不出浅色营销页',
			'不把薰衣草蓝铺成背景或卡片填充',
			'不引入第二种彩色强调',
			'不给 CTA 做药丸——Linear 是 8px 方角',
		],
		plate: {
			bg: '#010102',
			headline: 'Plan and build products',
			headlineStyle:
				'color:#f7f8f8;font-size:clamp(24px,3.4vw,38px);font-weight:600;letter-spacing:-0.035em;line-height:1.05',
			spec: 'Linear Sans 600 · tracking -3px @80px · 四级表面阶梯',
			specColor: '#8a8f98',
		},
		sourceFile: 'linear',
	},
	{
		id: 'notion',
		name: 'Notion',
		category: 'SaaS',
		tagline: '海军蓝画布上的紫色按钮与便利贴粉彩',
		nameStyle: 'font-weight:700;letter-spacing:-0.02em;color:#191918',
		heroTitle: 'Notion：把工作台画成便利贴墙',
		lede: '深海军蓝的 hero 上散着彩色便利贴圆点，正中一颗招牌紫按钮，真实的工作区截图带着深阴影从色带里探出来。往下翻，桃色、玫瑰、薄荷的粉彩卡片轮番登场——像是产品里数据库属性的颜色，蔓延到了官网。',
		philosophy: [
			'紫色 #5645d4 是贯穿一切表面的 CTA 信号，也是品牌的第一识别色。',
			'按钮是 8px 矩形而不是药丸——在药丸泛滥的年代，方正本身成了性格。',
			'粉彩卡片色板（桃 / 玫瑰 / 薄荷 / 薰衣草 / 天空 / 黄）直接呼应产品内数据库属性的颜色。',
			'hero 居中排版加真实产品 UI 卡片，区别于 B2B 官网常见的左对齐套路。',
		],
		colors: [
			{ name: 'primary', hex: '#5645d4', role: '招牌紫 · 全站 CTA' },
			{ name: 'primary-pressed', hex: '#4534b3', role: '按压态' },
			{ name: 'brand-navy', hex: '#0a1530', role: 'hero 色带' },
			{ name: 'brand-navy-mid', hex: '#1a2a52', role: '色带中层' },
			{ name: 'link-blue', hex: '#0075de', role: '链接蓝 · 与紫分工' },
			{ name: 'brand-orange', hex: '#dd5b00', role: '便利贴橙' },
			{ name: 'brand-pink', hex: '#ff64c8', role: '便利贴粉' },
			{ name: 'brand-purple', hex: '#7b3ff2', role: '便利贴紫' },
			{ name: 'brand-teal', hex: '#2a9d99', role: '便利贴青' },
			{ name: 'brand-yellow', hex: '#f5d75e', role: '高亮黄' },
			{ name: 'card-tint-peach', hex: '#ffe8d4', role: '粉彩功能卡 · 桃' },
			{ name: 'card-tint-rose', hex: '#fde0ec', role: '粉彩功能卡 · 玫瑰' },
			{ name: 'card-tint-mint', hex: '#d9f3e1', role: '粉彩功能卡 · 薄荷' },
		],
		typeScale: [
			{
				sample: 'Meet the night shift.',
				spec: 'display · Notion-Sans（Inter 系）· 居中 hero',
				style:
					'font-weight:700;font-size:clamp(26px,4vw,40px);letter-spacing:-0.02em;color:#191918',
			},
			{
				sample: 'One workspace, every team.',
				spec: 'subtitle · 400',
				style: 'font-size:16px;color:#73726e',
			},
			{
				sample: 'Get Notion free',
				spec: 'button · 8px 矩形 · 不是药丸',
				style:
					'display:inline-block;background:#5645d4;color:#fff;border-radius:8px;padding:8px 16px;font-size:13.5px;font-weight:600',
			},
		],
		dos: [
			'紫色作为全站统一的 CTA 颜色',
			'海军蓝 hero 配便利贴圆点装饰',
			'粉彩卡片色大方地用',
			'按钮统一 8px 矩形',
		],
		donts: [
			'不用紫色写正文或铺大面积背景',
			'不做药丸按钮——Notion 的几何是方正的',
			'链接蓝和品牌紫不混用，各司其职',
			'不给纯文档卡片加重阴影',
		],
		plate: {
			bg: '#0a1530',
			headline: 'Meet the night shift.',
			headlineStyle:
				'color:#ffffff;font-size:clamp(24px,3.4vw,38px);font-weight:700;letter-spacing:-0.02em;line-height:1.1',
			spec: 'Notion-Sans · 8px 矩形按钮 · 便利贴粉彩',
			specColor: '#9aa4c0',
		},
		sourceFile: 'notion',
	},
	{
		id: 'vercel',
		name: 'Vercel',
		category: '基础设施',
		tagline: '黑白灰的极简，加一道只在高处出现的彩虹',
		nameStyle: 'font-weight:600;letter-spacing:-0.045em;color:#171717',
		heroTitle: 'Vercel：黑就是品牌色',
		lede: '近白画布、近黑文字、200 级灰阶——Vercel 把「无彩」做成了系统。唯一的颜色是青、蓝、品红、琥珀的网格渐变，只允许在 hero 尺度出现，从不缩成小图标。标题句首大写配激进负字距，等宽字体是这个平台的技术嗓音。',
		philosophy: [
			'黑色 #171717 本身就是主 CTA——转化目标不需要彩色。',
			'网格渐变是唯一的装饰系统，且只在 hero 尺度存在，缩小即失效。',
			'阴影由多层小偏移叠成，从不用一记重投影——比 Material 安静得多。',
			'技术眉题一律等宽字体（Geist Mono），正文绝不用等宽——各说各的语言。',
		],
		colors: [
			{ name: 'primary', hex: '#171717', role: '黑即品牌 · 主 CTA' },
			{ name: 'on-primary', hex: '#ffffff', role: '黑面上的文字' },
			{ name: 'ink', hex: '#171717', role: '标题黑' },
			{ name: 'body', hex: '#4d4d4d', role: '段落文字' },
			{ name: 'mute', hex: '#888888', role: '弱文字' },
			{ name: 'hairline', hex: '#ebebeb', role: '发丝分隔线' },
			{ name: 'hairline-strong', hex: '#a1a1a1', role: '强发丝线 / 禁用态' },
			{ name: 'canvas', hex: '#ffffff', role: '卡片白' },
			{ name: 'canvas-soft', hex: '#fafafa', role: '页面底色' },
			{ name: 'canvas-soft-2', hex: '#f5f5f5', role: '内嵌区底色' },
			{ name: 'link', hex: '#0070f3', role: '链接蓝' },
			{ name: 'error', hex: '#ee0000', role: '错误红' },
			{ name: 'warning', hex: '#f5a623', role: '警告琥珀' },
		],
		typeScale: [
			{
				sample: 'Develop. Preview. Ship.',
				spec: 'display · Geist 600 · 48px 时字距 -2.4px · 句首大写',
				style:
					'font-weight:600;font-size:clamp(28px,4vw,42px);letter-spacing:-0.045em;color:#171717;line-height:1.05',
			},
			{
				sample: 'The platform for frontend developers.',
				spec: 'body · 400',
				style: 'font-size:15px;color:#4d4d4d',
			},
			{
				sample: 'DEPLOYS — vercel.json',
				spec: 'caption-mono · Geist Mono · 技术眉题专用',
				style:
					"font-family:ui-monospace,'SF Mono',monospace;font-size:12px;color:#888;letter-spacing:0.04em",
			},
		],
		dos: [
			'黑药丸做营销 CTA、6px 方角做应用内按钮，两种尺度并存',
			'标题 600 字重、句首大写、负字距',
			'渐变只在 hero 尺度当氛围',
			'用叠加式浅阴影，不用重投影',
		],
		donts: [
			'不引入第六种强调色',
			'标题不全大写——句首大写是不可谈判的',
			'不给卡片一记重投影',
			'display 字重不上 700，上限是 600',
		],
		plate: {
			bg: '#000000',
			strip: 'linear-gradient(90deg, #00dfd8, #007cf0 35%, #ff0080 70%, #f9cb28 100%)',
			headline: '▲ Develop. Preview. Ship.',
			headlineStyle:
				'color:#ffffff;font-size:clamp(24px,3.4vw,38px);font-weight:600;letter-spacing:-0.045em;line-height:1.05',
			spec: 'Geist 600 · 句首大写 · mono 眉题',
			specColor: '#a1a1a1',
		},
		sourceFile: 'vercel',
	},
	{
		id: 'nike',
		name: 'Nike',
		category: '消费品牌',
		tagline: '摄影说话，界面闭嘴',
		nameStyle: 'font-weight:900;text-transform:uppercase;letter-spacing:-0.02em;color:#111111',
		heroTitle: 'Nike：把界面降到零的运动编辑学',
		lede: '96px 的 Futura 大写标题直接烙在满幅摄影上，其余一切——导航、筛选、按钮、卡片——全部退成黑白灰与药丸几何。没有渐变、没有阴影、没有情绪色，色彩全部留给照片；界面上唯一的彩色，是促销价那一抹红。',
		philosophy: [
			'摄影承担全部情绪表达，界面只做机械克制——最大的编辑张力配最少的 chrome。',
			'按钮、搜索框、筛选 chip 全是药丸，产品卡却零圆角零阴影：照片本身就是卡片。',
			'黑白灰占约 95% 的界面表面积，sale 红只出现在价格行，从不做背景或徽章。',
			'8px 间距系统加 48px 章节节奏，页面像印刷目录一样码起来，不像 SaaS 落地页。',
		],
		colors: [
			{ name: 'ink', hex: '#111111', role: '唯一的黑 · CTA 主色' },
			{ name: 'charcoal', hex: '#39393b', role: '炭灰文字' },
			{ name: 'ash', hex: '#4b4b4d', role: '次级文字' },
			{ name: 'mute', hex: '#707072', role: '弱文字' },
			{ name: 'stone', hex: '#9e9ea0', role: '占位与失效灰' },
			{ name: 'canvas', hex: '#ffffff', role: '页面画布' },
			{ name: 'soft-cloud', hex: '#f5f5f5', role: '产品摄影的「影棚」底色' },
			{ name: 'hairline', hex: '#cacacb', role: '发丝线' },
			{ name: 'hairline-soft', hex: '#e5e5e5', role: '弱发丝线' },
			{ name: 'sale', hex: '#d30005', role: '只给促销价的红' },
			{ name: 'success', hex: '#007d48', role: '库存 / 成功绿' },
			{ name: 'info', hex: '#1151ff', role: '信息蓝' },
			{ name: 'accent-pink', hex: '#ed1aa0', role: '品类点缀粉 · 从不进主界面' },
		],
		typeScale: [
			{
				sample: 'JUST DO IT.',
				spec: 'display-campaign · Nike Futura ND · 96px / 行高 0.9 / 全大写',
				style:
					'font-weight:900;font-size:clamp(30px,5vw,48px);text-transform:uppercase;letter-spacing:-0.02em;line-height:0.95;color:#111',
			},
			{
				sample: 'Trail Running Collection',
				spec: 'heading-xl · Helvetica Now · 32px / 500',
				style: 'font-weight:500;font-size:22px;color:#111',
			},
			{
				sample: '¥1,299 ¥899',
				spec: 'price · sale 红只出现在这里',
				style: 'font-size:14px;color:#d30005;font-weight:600',
			},
		],
		dos: [
			'96px Futura 只给 campaign 主视觉',
			'每屏只有一颗黑药丸主 CTA',
			'产品照全部站在 soft-cloud 底色上',
			'CTA 一律药丸形',
		],
		donts: [
			'不给卡片加阴影和圆角——照片即卡片',
			'sale 红不做背景、不做徽章',
			'不引入第三种按钮形状',
			'同一排不放两个同级 campaign 标题',
		],
		plate: {
			bg: '#f5f5f5',
			headline: 'Just do it.',
			headlineStyle:
				'font-weight:900;font-size:clamp(26px,3.8vw,42px);text-transform:uppercase;letter-spacing:-0.02em;line-height:0.95;color:#111111',
			spec: 'Futura ND 96px · 行高 0.9 · 全大写',
			specColor: '#707072',
		},
		sourceFile: 'nike',
	},
	{
		id: 'claude',
		name: 'Claude',
		category: 'AI',
		tagline: '奶油纸底 + 赤陶珊瑚的书房气质',
		nameStyle:
			"font-family:Georgia,'Songti SC',serif;font-weight:400;letter-spacing:-0.01em;color:#29261b",
		heroTitle: 'Claude：AI 品类里最暖的一张纸',
		lede: '当所有 AI 品牌都在用冷灰和科技蓝时，Claude 选了一张暖调奶油纸 #faf9f5。衬线体 Copernicus 只用 400 字重排大标题，珊瑚色 #cc785c 在单个按钮上稀缺、在整幅 callout 卡上慷慨。奶油与深色产品卡交替铺排，是整个页面的呼吸节奏。',
		philosophy: [
			'奶油画布是品牌差异化本身——用纯白就成了「随便哪个 AI 工具」。',
			'衬线 display 恒 400 字重，加粗到 700 就「浮夸」了，文气全靠克制。',
			'珊瑚色在单个元素上稀缺、在整幅 callout 卡上慷慨——密度本身是设计语言。',
			'奶油带与深色产品 mockup 带交替出现，从不连续两段同一模式。',
		],
		colors: [
			{ name: 'canvas', hex: '#faf9f5', role: '暖奶油画布 · 品牌定义色' },
			{ name: 'surface-soft', hex: '#f5f0e8', role: '浅奶油面' },
			{ name: 'surface-card', hex: '#efe9de', role: '奶油功能卡' },
			{ name: 'surface-dark', hex: '#181715', role: '深色产品面' },
			{ name: 'surface-dark-elevated', hex: '#252320', role: '深面上的抬升层' },
			{ name: 'primary', hex: '#cc785c', role: '珊瑚 CTA · 稀用在按钮、慷慨在整卡' },
			{ name: 'primary-active', hex: '#a9583e', role: '珊瑚按压态' },
			{ name: 'ink', hex: '#141413', role: '暖黑标题' },
			{ name: 'body', hex: '#3d3d3a', role: '正文' },
			{ name: 'body-strong', hex: '#252523', role: '强调正文' },
			{ name: 'muted', hex: '#6c6a64', role: '弱文字' },
			{ name: 'hairline', hex: '#e6dfd8', role: '发丝线' },
			{ name: 'on-dark', hex: '#faf9f5', role: '深面上的文字' },
		],
		typeScale: [
			{
				sample: 'Helpful, honest, harmless',
				spec: 'display · Copernicus 衬线 · 恒 400 字重 · 负字距',
				style:
					"font-family:Georgia,'Songti SC',serif;font-weight:400;font-size:clamp(26px,4vw,38px);letter-spacing:-0.02em;color:#141413",
			},
			{
				sample: 'Warm paper, serif voice, one terracotta accent.',
				spec: 'body · StyreneB / Inter',
				style: 'font-size:15px;color:#3d3d3a',
			},
			{
				sample: 'claude -p "explain this codebase"',
				spec: 'code · 深色产品面上的等宽',
				style:
					"font-family:ui-monospace,'SF Mono',monospace;font-size:13px;color:#faf9f5;background:#181715;padding:8px 12px;border-radius:8px;display:inline-block",
			},
		],
		dos: [
			'每一页都锚在奶油画布上',
			'display 一律 Copernicus 衬线 400 字重',
			'珊瑚只给主 CTA 和整幅 callout 卡',
			'奶油带与深色带交替铺排',
		],
		donts: [
			'不用冷灰或纯白当画布——奶油就是品牌',
			'衬线标题不加粗到 700',
			'不用冷蓝、青色当品牌强调',
			'珊瑚不到处点缀',
		],
		plate: {
			bg: '#faf9f5',
			headline: 'Helpful, honest, harmless',
			headlineStyle:
				"font-family:Georgia,'Songti SC',serif;font-size:clamp(24px,3.4vw,38px);color:#141413;font-weight:400;letter-spacing:-0.02em;line-height:1.15",
			spec: 'Copernicus 400 · 暖奶油画布 · 一点珊瑚',
			specColor: '#8a857a',
		},
		sourceFile: 'claude',
	},
	{
		id: 'apple',
		name: 'Apple',
		category: '消费科技',
		tagline: '产品摄影前，界面近乎隐形',
		nameStyle: 'font-weight:600;letter-spacing:-0.03em;color:#1d1d1f',
		heroTitle: 'Apple：让墙消失的产品美术馆',
		lede: '每一屏是一块满幅「产品瓦片」，白与近黑交替，色彩的切换本身就是分隔线。没有边框、没有渐变、标题不带投影——全站唯一的强调色是一点安静的行动蓝，唯一的投影只给落在台面上的产品渲染图。',
		philosophy: [
			'摄影第一：UI 退后到近乎隐形，没有任何东西与产品竞争。',
			'白 / 羊皮纸与近黑瓦片满幅交替，颜色切换本身就是分隔线——不需要别的分割元素。',
			'唯一强调色 #0066cc 承担所有可点击信号，系统里不存在第二个品牌色。',
			'全系统只有一记投影，只给需要「落在台面上」的产品图——卡片、按钮、文字一概没有。',
		],
		colors: [
			{ name: 'primary', hex: '#0066cc', role: '行动蓝 · 唯一的交互色' },
			{ name: 'primary-on-dark', hex: '#2997ff', role: '深色瓦片上的链接蓝' },
			{ name: 'ink', hex: '#1d1d1f', role: '近黑正文 · 从不用纯黑' },
			{ name: 'ink-muted-48', hex: '#7a7a7a', role: '弱文字与脚注' },
			{ name: 'canvas', hex: '#ffffff', role: '页面画布' },
			{ name: 'canvas-parchment', hex: '#f5f5f7', role: '羊皮纸底 · 浅色瓦片' },
			{ name: 'surface-pearl', hex: '#fafafc', role: '珍珠面' },
			{ name: 'surface-tile-1', hex: '#272729', role: '深色产品瓦片' },
			{ name: 'surface-black', hex: '#000000', role: '全局导航 · 唯一的纯黑' },
			{ name: 'divider-soft', hex: '#f0f0f0', role: '软分隔' },
			{ name: 'hairline', hex: '#e0e0e0', role: '发丝线' },
			{ name: 'surface-chip-translucent', hex: '#d2d2d7', role: '半透明配置 chip' },
			{ name: 'on-dark', hex: '#ffffff', role: '深瓦片上的文字' },
		],
		typeScale: [
			{
				sample: 'Titanium. So strong. So light. So Pro.',
				spec: 'hero-display · SF Pro Display 600 · 负字距「Apple tight」',
				style:
					'font-weight:600;font-size:clamp(26px,3.6vw,40px);letter-spacing:-0.015em;color:#1d1d1f;line-height:1.08',
			},
			{
				sample: 'Body copy reads at seventeen pixels, not sixteen.',
				spec: 'body · 17px / 400 / 1.47 · 多出的一像素定义阅读节奏',
				style: 'font-size:17px;color:#1d1d1f;line-height:1.47',
			},
			{
				sample: 'Available starting 9.19',
				spec: 'footnote · 12px · 弱化灰',
				style: 'font-size:12px;color:#7a7a7a',
			},
		],
		dos: [
			'行动蓝给且只给可交互元素',
			'标题用负字距的「Apple tight」节奏',
			'正文 17px，不是 16px',
			'亮暗瓦片交替，颜色切换即分隔线',
		],
		donts: [
			'不引入第二个强调色',
			'卡片、按钮、文字一律不加投影',
			'不用渐变当装饰背景——氛围来自摄影',
			'正文不用 500 字重——阶梯是 300/400/600/700',
		],
		plate: {
			bg: '#000000',
			headline: 'Titanium. So strong. So light. So Pro.',
			headlineStyle:
				'color:#f5f5f7;font-weight:600;font-size:clamp(24px,3.4vw,38px);letter-spacing:-0.015em;line-height:1.1',
			spec: 'SF Pro Display 600 · 深色瓦片 · 一点行动蓝',
			specColor: '#86868b',
		},
		sourceFile: 'apple',
	},
	{
		id: 'figma',
		name: 'Figma',
		category: '设计工具',
		tagline: '黑白骨架之间，一整屏一整屏的粉彩色块',
		nameStyle: 'font-weight:700;letter-spacing:-0.03em;color:#000000',
		heroTitle: 'Figma：把巨型便利贴钉在白墙上',
		lede: '系统的骨架是编辑器般的黑白：黑按钮、白画布、mono 眉题。而叙事全靠一屏一屏的粉彩色块——青柠、薰衣草、奶油、薄荷轮番占满整个视口，像设计师往白墙上钉巨型便利贴。黑白让色块显得郑重，色块让黑白像纸而不像企业软件。',
		philosophy: [
			'单色骨架：黑与白承担所有 CTA、正文与页脚，黑就是主按钮。',
			'粉彩色块整屏出现，是叙事的节奏器——两个色块之间必须回到白画布。',
			'变量字重 320 / 330 / 340 / 480 / 540：一个声音在伸缩，而不是一个多字重家族。',
			'mono 只做眉题和分类标签，永远大写、永远正字距——它是分类工具，不是阅读字体。',
		],
		colors: [
			{ name: 'primary', hex: '#000000', role: '黑即主 CTA' },
			{ name: 'canvas', hex: '#ffffff', role: '白画布 · 色块之间的间隔' },
			{ name: 'block-lime', hex: '#dceeb1', role: '色块 · 青柠' },
			{ name: 'block-lilac', hex: '#c5b0f4', role: '色块 · 薰衣草' },
			{ name: 'block-cream', hex: '#f4ecd6', role: '色块 · 奶油' },
			{ name: 'block-mint', hex: '#c8e6cd', role: '色块 · 薄荷' },
			{ name: 'block-pink', hex: '#efd4d4', role: '色块 · 粉' },
			{ name: 'block-coral', hex: '#f3c9b6', role: '色块 · 珊瑚' },
			{ name: 'block-navy', hex: '#1f1d3d', role: '色块 · 深海军' },
			{ name: 'accent-magenta', hex: '#ff3d8b', role: '洋红点缀' },
			{ name: 'surface-soft', hex: '#f7f7f5', role: '软底' },
			{ name: 'hairline', hex: '#e6e6e6', role: '发丝线' },
			{ name: 'semantic-success', hex: '#1ea64a', role: '语义绿' },
		],
		typeScale: [
			{
				sample: 'Think bigger. Build faster.',
				spec: 'display-xl · figmaSans · 86px 时字距 -1.72px',
				style:
					'font-weight:700;font-size:clamp(26px,3.6vw,40px);letter-spacing:-0.04em;color:#000000;line-height:1.05',
			},
			{
				sample: 'Body hovers at weight 320–340 of the same variable family.',
				spec: 'body · figmaSans 330 · 层次靠字重不靠灰度',
				style: 'font-size:15px;color:#333333',
			},
			{
				sample: 'DESIGN SYSTEMS',
				spec: 'figmaMono · 眉题 · 永远大写、正字距',
				style:
					"font-family:ui-monospace,'SF Mono',monospace;font-size:12px;letter-spacing:0.14em;color:#000000",
			},
		],
		dos: [
			'一段叙事只选一个色块，占满内容宽度',
			'两个色块之间回到白画布',
			'CTA 全药丸、图标按钮全正圆',
			'mono 只做眉题，永远大写',
		],
		donts: [
			'不引入 block 家族之外的新色',
			'色块不加投影——颜色本身就是深度装置',
			'不出现中灰正文——层次靠字重不靠透明度',
			'不做方角按钮——方角读起来是另一个品牌',
		],
		plate: {
			bg: '#dceeb1',
			headline: 'Think bigger. Build faster.',
			headlineStyle:
				'color:#000000;font-weight:700;font-size:clamp(24px,3.4vw,38px);letter-spacing:-0.04em;line-height:1.05',
			spec: 'figmaSans 变量字重 · 青柠色块 · 药丸 CTA',
			specColor: '#5a6b2f',
		},
		sourceFile: 'figma',
	},
	{
		id: 'spotify',
		name: 'Spotify',
		category: '娱乐',
		tagline: '近黑的剧场里，只有一点绿是功能',
		nameStyle: 'font-weight:700;letter-spacing:-0.03em;color:#121212',
		heroTitle: 'Spotify：把 UI 调成剧场灯光',
		lede: '#121212 到 #1f1f1f 的炭黑包住整个界面——UI 退进阴影，让专辑封面成为唯一的色彩来源。品牌绿 #1ed760 从不装饰，只给播放键、激活态和主 CTA；按钮全是药丸和正圆，标签全大写加宽字距，像一台高级音响设备的手感。',
		philosophy: [
			'「内容优先的黑暗」：UI 隐入阴影，专辑封面供色，界面本身刻意无彩。',
			'绿色只做功能——播放、激活、主 CTA，从不当装饰、从不铺背景。',
			'药丸与正圆的几何：按钮 500px 圆角、播放键 50%，为触摸而生。',
			'深底上的阴影必须重（0.3–0.5 透明度）——轻阴影在黑底上等于不存在。',
		],
		colors: [
			{ name: 'brand-green', hex: '#1ed760', role: '品牌绿 · 只做功能' },
			{ name: 'green-border', hex: '#1db954', role: '绿的边框变体' },
			{ name: 'near-black', hex: '#121212', role: '最深的底' },
			{ name: 'dark-surface', hex: '#181818', role: '卡片与容器面' },
			{ name: 'mid-dark', hex: '#1f1f1f', role: '按钮底' },
			{ name: 'dark-card', hex: '#252525', role: '抬升卡面' },
			{ name: 'text-base', hex: '#ffffff', role: '主文字' },
			{ name: 'silver', hex: '#b3b3b3', role: '次级文字 / 分隔线' },
			{ name: 'border-gray', hex: '#4d4d4d', role: '深底按钮边框' },
			{ name: 'light-border', hex: '#7c7c7c', role: '描边按钮与弱链接' },
			{ name: 'negative', hex: '#f3727f', role: '错误红' },
			{ name: 'warning', hex: '#ffa42b', role: '警告橙' },
			{ name: 'announcement', hex: '#539df5', role: '通知蓝' },
		],
		typePanelStyle: 'background:#121212;border-color:#4d4d4d',
		typeScale: [
			{
				sample: 'Music for everyone.',
				spec: 'SpotifyMixUI（CircularSp）700 · 紧凑',
				style:
					'font-weight:700;font-size:clamp(24px,3.4vw,38px);letter-spacing:-0.02em;color:#ffffff;line-height:1.1',
			},
			{
				sample: 'Compact and functional — the whole system lives in 10–24px.',
				spec: 'body · 400 · 这是一台 app，不是杂志',
				style: 'font-size:14px;color:#b3b3b3',
			},
			{
				sample: 'GET SPOTIFY FREE',
				spec: 'button · 大写 · 字距 1.4–2px',
				style: 'font-size:13px;font-weight:700;letter-spacing:0.14em;color:#ffffff',
			},
		],
		dos: [
			'近黑底靠色阶变化做深度',
			'绿只给播放键、激活态和主 CTA',
			'按钮全药丸、播放键正圆',
			'按钮标签大写加宽字距',
		],
		donts: [
			'不把绿当装饰或背景——它只做功能',
			'主表面不用浅色——黑暗沉浸是核心',
			'不用细弱阴影——深底上要重才看得见',
			'不加第二个品牌色——绿 + 无彩灰就是全部',
		],
		plate: {
			bg: '#121212',
			headline: 'Music for everyone.',
			headlineStyle:
				'color:#ffffff;font-weight:700;font-size:clamp(24px,3.4vw,38px);letter-spacing:-0.02em;line-height:1.1',
			spec: 'CircularSp 700 · 近黑剧场 · 一点功能绿',
			specColor: '#b3b3b3',
		},
		sourceFile: 'spotify',
	},
	{
		id: 'airbnb',
		name: 'Airbnb',
		category: '旅行',
		tagline: '九成白与墨，一两个 Rausch 珊瑚时刻',
		nameStyle: 'font-weight:700;letter-spacing:-0.025em;color:#ff385c',
		heroTitle: 'Airbnb：一颗珊瑚色的搜索珠',
		lede: '页面九成是白与墨，视觉重量全交给房源摄影；品牌色 Rausch #ff385c 稀用到极致——主 CTA、搜索珠、收藏的心、以及 logo 本身。全局搜索是一颗分段的白药丸，尽头一粒圆形珊瑚搜索珠，是整个系统最亮的时刻。',
		philosophy: [
			'单一强调色 Rausch：主 CTA、搜索珠、收藏心、wordmark——其余九成画面是白加墨。',
			'摄影承担视觉重量，字重刻意克制：display 500–700，body 400。',
			'照片即卡片：圆角裁切加轮播加浮动徽标，不加任何装饰框。',
			'全站只有一档阴影，只给悬浮的卡片和下拉——克制到系统级。',
		],
		colors: [
			{ name: 'primary', hex: '#ff385c', role: 'Rausch · 主 CTA / 搜索珠 / 收藏心' },
			{ name: 'primary-active', hex: '#e00b41', role: '按压态' },
			{ name: 'luxe', hex: '#460479', role: 'Luxe 高端线的紫' },
			{ name: 'plus', hex: '#92174d', role: 'Plus 产品线的酒红' },
			{ name: 'ink', hex: '#222222', role: '标题墨' },
			{ name: 'body', hex: '#3f3f3f', role: '正文' },
			{ name: 'muted', hex: '#6a6a6a', role: '弱文字' },
			{ name: 'canvas', hex: '#ffffff', role: '画布' },
			{ name: 'surface-soft', hex: '#f7f7f7', role: '软底' },
			{ name: 'hairline', hex: '#dddddd', role: '发丝线' },
			{ name: 'hairline-soft', hex: '#ebebeb', role: '弱发丝线' },
			{ name: 'legal-link', hex: '#428bff', role: '法务链接蓝' },
			{ name: 'star-rating', hex: '#222222', role: '星级 · 用墨不用金' },
		],
		typeScale: [
			{
				sample: 'Belong anywhere.',
				spec: 'Airbnb Cereal VF · display 500–700 · 克制字重',
				style:
					'font-weight:600;font-size:clamp(24px,3.4vw,38px);letter-spacing:-0.02em;color:#222222;line-height:1.1',
			},
			{
				sample: 'Photography carries the weight; type stays modest.',
				spec: 'body · Cereal 400',
				style: 'font-size:15px;color:#3f3f3f',
			},
			{
				sample: 'Guest favorite · ★ 4.98',
				spec: 'meta · 星级用墨色，不用金色',
				style: 'font-size:13px;color:#222222;font-weight:600',
			},
		],
		dos: [
			'Rausch 只给主 CTA、搜索珠、收藏心',
			'摄影扛视觉重量，字重保持克制',
			'搜索栏 = 分段白药丸 + 圆形珊瑚珠',
			'阴影只有一档，给悬浮卡和下拉',
		],
		donts: [
			'不把 Rausch 铺成背景——稀缺才是信号',
			'照片卡不加装饰边框',
			'不加第二档阴影',
			'星级不用金色——用墨色',
		],
		plate: {
			bg: '#ffffff',
			headline: 'Belong anywhere.',
			headlineStyle:
				'color:#ff385c;font-weight:700;font-size:clamp(24px,3.4vw,38px);letter-spacing:-0.02em;line-height:1.1',
			spec: 'Cereal VF · 白画布 · 一颗 Rausch 搜索珠',
			specColor: '#6a6a6a',
		},
		sourceFile: 'airbnb',
	},
	{
		id: 'ibm',
		name: 'IBM',
		category: '企业科技',
		tagline: '方角、细体 Plex、一种蓝——Carbon 本身',
		nameStyle: 'font-weight:300;letter-spacing:-0.01em;color:#161616',
		heroTitle: 'IBM：把设计系统当成品牌本身',
		lede: 'IBM 的官网就是 Carbon 设计系统：按钮方角 0px、输入框只有下边线、42–76px 的大标题用 300 细体 Plex Sans。唯一的彩色是 IBM 蓝 #0f62fe，层次全靠 1px 发丝线和表面深浅，不用一记投影；正文 0.16px 的正字距，是百年工程公司的精度癖。',
		philosophy: [
			'营销页 = Carbon：方角按钮、下边线输入框、0 圆角，设计系统就是身份本身。',
			'细体 display：Plex Sans 300 排 42–76px 大标题——加粗就泯然众人。',
			'唯一彩色 IBM 蓝承担所有链接与 CTA，语义色（绿 / 黄 / 红）各司其职。',
			'层次靠发丝线和表面切换，从不用投影；页脚反转成炭黑，是全页唯一深面。',
		],
		colors: [
			{ name: 'primary', hex: '#0f62fe', role: 'IBM 蓝 · 唯一的彩色' },
			{ name: 'blue-hover', hex: '#0050e6', role: 'hover 态' },
			{ name: 'blue-60', hex: '#0043ce', role: '深一档的蓝' },
			{ name: 'blue-80', hex: '#002d9c', role: '更深的蓝' },
			{ name: 'ink', hex: '#161616', role: '炭黑文字' },
			{ name: 'ink-muted', hex: '#525252', role: '次级文字' },
			{ name: 'ink-subtle', hex: '#8c8c8c', role: '弱文字' },
			{ name: 'canvas', hex: '#ffffff', role: '画布' },
			{ name: 'surface-1', hex: '#f4f4f4', role: '浅灰面' },
			{ name: 'surface-2', hex: '#e0e0e0', role: '二级面 / 发丝线' },
			{ name: 'inverse-canvas', hex: '#161616', role: '页脚炭黑 · 唯一深面' },
			{ name: 'semantic-success', hex: '#24a148', role: '语义绿' },
			{ name: 'semantic-error', hex: '#da1e28', role: '语义红' },
		],
		typeScale: [
			{
				sample: "Let's create something that changes everything",
				spec: 'display · IBM Plex Sans 300 · 细体是签名',
				style:
					'font-weight:300;font-size:clamp(26px,3.6vw,40px);letter-spacing:-0.01em;color:#161616;line-height:1.15',
			},
			{
				sample: 'Body copy carries 0.16px letter-spacing — a Carbon precision detail.',
				spec: 'body · Plex Sans 400 · +0.16px 正字距',
				style: 'font-size:15px;color:#525252;letter-spacing:0.16px',
			},
			{
				sample: 'Start building →',
				spec: 'button · 方角 0px · 蓝底白字',
				style:
					'display:inline-block;background:#0f62fe;color:#ffffff;padding:10px 18px;font-size:13.5px',
			},
		],
		dos: [
			'一切容器 0px 方角——平直方正就是品牌',
			'display 用 Plex 300 细体，别加粗',
			'IBM 蓝只给 CTA、链接、焦点下划线',
			'眉题句首大写——Carbon 拒绝全大写加宽',
		],
		donts: [
			'按钮卡片输入框不加圆角——4px 都会破功',
			'大标题不加粗——700 就泯然众人',
			'不引入第二个品牌色',
			'不用药丸按钮——药丸读起来是另一个品牌',
		],
		plate: {
			bg: '#f4f4f4',
			headline: "Let's create",
			headlineStyle:
				'color:#161616;font-weight:300;font-size:clamp(26px,3.8vw,42px);letter-spacing:-0.01em;line-height:1.1',
			spec: 'IBM Plex Sans 300 · Carbon · 方角 0px',
			specColor: '#525252',
		},
		sourceFile: 'ibm',
	},
	{
		id: 'theverge',
		name: 'The Verge',
		category: '媒体',
		tagline: '深夜画布上的荧光薄荷与紫外线',
		nameStyle: 'font-weight:800;letter-spacing:-0.02em;color:#131313',
		heroTitle: 'The Verge：把警示胶带贴进新闻页',
		lede: '#131313 的近黑画布没有浅色模式，Manuka 大标题能排到 107px——主流科技媒体里最响的一次排印。荧光薄荷 #3cffd0 和紫外线 #5200ff 像警示胶带一样只贴在最重要的元素上；一切容器都是圆角，深度全靠 1px 描边和饱和色块，全站零投影。',
		philosophy: [
			'深色画布是产品本身——首页没有浅色模式。',
			'荧光薄荷 + 紫外线是「危险色」：只贴在最重要的元素上，从不当背景冲淡。',
			'Manuka 只做 60px 以上的 display——出现在更小的字号就是 bug。',
			'深度靠 1px 描边和饱和色块 story tile，全站没有一记投影、没有一处渐变。',
		],
		colors: [
			{ name: 'jelly-mint', hex: '#3cffd0', role: '招牌荧光薄荷 · 警示级强调' },
			{ name: 'ultraviolet', hex: '#5200ff', role: '紫外线 · 次级危险色' },
			{ name: 'console-mint', hex: '#309875', role: '深薄荷 · 卡片描边' },
			{ name: 'purple-rule', hex: '#3d00bf', role: 'StoryStream 竖线' },
			{ name: 'link-hover', hex: '#3860be', role: '全站链接 hover 蓝 · 唯一的蓝时刻' },
			{ name: 'focus-cyan', hex: '#1eaedb', role: '焦点环专用' },
			{ name: 'canvas-black', hex: '#131313', role: '画布 · 印刷负片般的近黑' },
			{ name: 'surface-slate', hex: '#2d2d2d', role: '次级卡底' },
			{ name: 'image-frame', hex: '#313131', role: '图片描边' },
			{ name: 'hazard-white', hex: '#ffffff', role: '白色 story tile · 聚光灯' },
			{ name: 'text-secondary', hex: '#949494', role: '时间戳与署名灰' },
			{ name: 'text-muted', hex: '#e9e9e9', role: '暗按钮文字' },
			{ name: 'inverted-text', hex: '#131313', role: '亮 tile 上的黑' },
		],
		typePanelStyle: 'background:#131313;border-color:#313131',
		typeScale: [
			{
				sample: 'Tech, science, art.',
				spec: 'Manuka display · 最大 107px · 只做 60px+',
				style:
					'font-weight:800;font-size:clamp(26px,3.8vw,42px);text-transform:uppercase;letter-spacing:-0.01em;color:#ffffff;line-height:0.95',
			},
			{
				sample: 'PolySans carries the body on the dark canvas.',
				spec: 'body · PolySans',
				style: 'font-size:14px;color:#e9e9e9',
			},
			{
				sample: 'FEB 26 · 14:02 EST',
				spec: 'PolySans Mono · 永远大写 · 字距 1.5–1.9px',
				style:
					"font-family:ui-monospace,'SF Mono',monospace;font-size:12px;letter-spacing:0.16em;color:#3cffd0",
			},
		],
		dos: [
			'画布永远 #131313——没有浅色模式',
			'薄荷和紫外线只做警示级强调',
			'一切都圆角：卡片 20px、按钮 30–40px',
			'mono 标签永远大写加宽字距',
		],
		donts: [
			'不用浅色背景——深色画布就是产品',
			'不用投影——描边和色块就是深度',
			'不用方角——圆角是全站几何',
			'不出现渐变——系统只有实色块',
		],
		plate: {
			bg: '#131313',
			headline: 'Tech, science, art.',
			headlineStyle:
				'color:#ffffff;font-weight:800;font-size:clamp(26px,3.8vw,42px);text-transform:uppercase;letter-spacing:-0.01em;line-height:0.95',
			spec: 'Manuka · 近黑画布 · 荧光薄荷警示色',
			specColor: '#3cffd0',
		},
		sourceFile: 'theverge',
	},
	{
		id: 'cursor',
		name: 'Cursor',
		category: '开发工具',
		tagline: '奶油画布上的一滴橙：AI 编辑器的杂志感',
		nameStyle: 'font-weight:400;letter-spacing:-0.02em;color:#26251e',
		heroTitle: 'Cursor：把 IDE 做成一本安静的杂志',
		lede: '画布不是纯白而是暖奶油色 #f7f7f4，文字是暖黑 #26251e——Cursor 从一开始就拒绝了「开发者工具＝冷灰蓝」的默认设定。橙色 #f54e00 全站只出现在一处 CTA 上；标题永远 400 字重不加粗，像杂志正文一样说话。',
		philosophy: [
			'奶油色画布是身份：#f7f7f4 的暖白加上 #26251e 暖黑文字，让编辑器看起来像纸而非机器。',
			'单一 CTA 色：Cursor 橙 #f54e00 稀缺地只给主行动按钮，橙色的出现本身就是「该点这里了」。',
			'杂志感排版：display 字重钉死在 400，从不加粗——用字距和字号做层级，不做音量。',
			'发丝线-only 的深度系统：没有投影，1px 描边承担一切分隔，8px 小圆角是开发者方言而非 SaaS 圆润感。',
		],
		colors: [
			{ name: 'primary', hex: '#f54e00', role: 'Cursor 橙 · 全站唯一的 CTA 色' },
			{ name: 'primary-active', hex: '#d04200', role: '按压态深橙' },
			{ name: 'canvas', hex: '#f7f7f4', role: '暖奶油画布 · 从不用纯白' },
			{ name: 'ink', hex: '#26251e', role: '暖黑主文字 · 从不用纯黑' },
			{ name: 'body', hex: '#5a5852', role: '正文灰棕' },
			{ name: 'muted', hex: '#807d72', role: '辅助说明' },
			{ name: 'muted-soft', hex: '#a09c92', role: '弱化标注' },
			{ name: 'hairline', hex: '#e6e5e0', role: '主要描边线 · 无投影系统的骨架' },
			{ name: 'hairline-soft', hex: '#efeee8', role: '次级描边线' },
		],
		typeScale: [
			{
				sample: 'The AI Code Editor',
				spec: 'display-lg · 36px / 400 / -0.72px · CursorGothic',
				style:
					'font-weight:400;font-size:clamp(26px,3.6vw,34px);letter-spacing:-0.02em;color:#26251e;line-height:1.2',
			},
			{
				sample: 'Body text sits warm on cream, never cold.',
				spec: 'body · 15px / 400 · 暖灰棕',
				style: 'font-size:15px;color:#5a5852',
			},
			{
				sample: 'agent · editing · reviewing · done',
				spec: 'micro · AI 时间线的五个粉彩色阶',
				style: 'font-size:12px;color:#807d72;letter-spacing:0.04em',
			},
		],
		dos: [
			'全站保持奶油底 + 暖黑字的纸质感',
			'标题钉死 400 字重，靠字距做层级',
			'橙色只给主 CTA，一屏一颗',
			'深度只用 1px 发丝线表达',
		],
		donts: [
			'不要换成纯白背景——暖奶油才是品牌',
			'标题加粗到 600+ 就成了通用 SaaS 脸',
			'不要给按钮换药丸形——8px 小圆角是开发者方言',
			'不要加投影——描边就是全部深度',
		],
		plate: {
			bg: '#f7f7f4',
			headline: 'The AI Code Editor',
			headlineStyle:
				'color:#26251e;font-weight:400;font-size:clamp(28px,4vw,44px);letter-spacing:-0.025em;line-height:1.15',
			spec: 'CursorGothic 400 · 暖奶油画布 · 一颗橙 CTA · hairline only',
			specColor: '#807d72',
		},
		sourceFile: 'cursor',
	},
	{
		id: 'raycast',
		name: 'Raycast',
		category: 'SaaS',
		tagline: '近黑阶梯上的白色药丸：键盘党的效率剧场',
		nameStyle: 'font-weight:600;letter-spacing:-0.02em;color:#0d0d0d',
		heroTitle: 'Raycast：深色阶梯与一颗白色药丸',
		lede: '#07080a 到抬升面的四级暗色阶梯里，几乎一切都是单色的；唯一的「彩色 CTA」是一颗纯白药丸。分类强调色（黄红绿蓝）只为扩展商店的品类服务，按 app 各自的品牌染色——这是把「效率」做成剧场的克制方案。',
		philosophy: [
			'单一暗色模式：canvas #07080a → surface #0d0d0d → 更高抬升面，用明度阶梯代替色彩分区。',
			'白药丸即 CTA：#ffffff 实心按钮是全站唯一的主行动语言，其余全是单色暗面。',
			'Inter + ss03：站级启用 OpenType 替代字形，连小写 g 都在替品牌说话。',
			'发丝线承担一切卡片边缘：没有投影，商店里的彩色是各个 App 自己的品牌色。',
		],
		typePanelStyle: 'background:#0d0d0d;border-color:#242728',
		colors: [
			{ name: 'primary', hex: '#ffffff', role: '白色药丸 · 全站唯一主 CTA' },
			{ name: 'on-primary', hex: '#000000', role: '白底上的黑字' },
			{ name: 'canvas', hex: '#07080a', role: '最深画布' },
			{ name: 'surface', hex: '#0d0d0d', role: '一级抬升面' },
			{ name: 'ink', hex: '#f4f4f6', role: '主文字' },
			{ name: 'body', hex: '#cdcdcd', role: '正文' },
			{ name: 'mute', hex: '#9c9c9d', role: '辅助说明' },
			{ name: 'stone', hex: '#434345', role: '弱化文字 / 图标' },
			{ name: 'hairline', hex: '#242728', role: '全部卡片描边' },
			{ name: 'accent-yellow', hex: '#ffc533', role: 'Hacker News 等品类色' },
			{ name: 'accent-red', hex: '#ff6161', role: 'Slack/Apple 等品类色' },
			{ name: 'accent-green', hex: '#59d499', role: '生产力品类色' },
			{ name: 'accent-blue', hex: '#57c1ff', role: '开发工具品类色' },
		],
		typeScale: [
			{
				sample: 'A shortcut to everything',
				spec: 'display-xl · 64px / 600 / 0 · Inter ss03',
				style:
					'font-weight:600;font-size:clamp(30px,4.6vw,48px);letter-spacing:-0.01em;color:#f4f4f6;line-height:1.08',
			},
			{
				sample: 'Extensions put your tools one keystroke away.',
				spec: 'body · 15px / 400 · cdcdcd',
				style: 'font-size:15px;color:#cdcdcd',
			},
			{
				sample: '⌘ ⇧ P  ·  one keystroke',
				spec: 'mono 标注 · stone 弱化',
				style: 'font-size:13px;color:#6a6b6c;letter-spacing:0.03em',
			},
		],
		dos: [
			'主 CTA 只用纯白药丸',
			'层级用暗色明度阶梯，不用彩色分区',
			'卡边一律 1px 发丝线 #242728',
			'站级开启 Inter 的 ss03 替代字形',
		],
		donts: [
			'不要引入浅色模式——这个品牌只有夜晚',
			'不要给白药丸之外再发明第二实心按钮色',
			'不要加投影——描边和抬升就够了',
			'品类强调色不要用在界面装饰上，它们属于扩展商店',
		],
		plate: {
			bg: '#07080a',
			headline: 'Your shortcut to everything',
			headlineStyle:
				'color:#f4f4f6;font-weight:600;font-size:clamp(28px,3.9vw,44px);letter-spacing:-0.015em;line-height:1.1',
			spec: 'Inter 600 · 白药丸 CTA · 四级暗色阶梯 · 零投影',
			specColor: '#9c9c9d',
		},
		sourceFile: 'raycast',
	},
	{
		id: 'supabase',
		name: 'Supabase',
		category: '基础设施',
		tagline: '一片翡翠绿点亮单色世界：开源后端的工程师美学',
		nameStyle: 'font-weight:500;letter-spacing:-0.03em;color:#171717',
		heroTitle: 'Supabase：绿色只在功能处发光',
		lede: '整个品牌是一场单色演出，翡翠绿 #3ecf8e 是唯一被允许出现的彩色事件——而它只属于产品：数据库、认证、边缘函数的真实 UI 截图才是页面的主角。自定义人文主义无衬线体以 500 字重配负字距压阵，按钮永远是方正的 6/8px，拒绝药丸。',
		philosophy: [
			'唯一的彩色事件：祖母绿 #3ecf8e 只做品牌强调，其余全是灰阶层次。',
			'产品截图即装饰：仪表盘、SQL 编辑器、日志流拼成页面主角，从不用摄影和插画。',
			'人文学排版：自定义无衬线 display 500 字重，-1.92px 到 -0.42px 的负字距拉开层级。',
			'夜航代码块：代码片段躺在 #1c1c1c 的深夜底色里，行内等宽字体——开发者 DNA 写在每个片段里。',
		],
		colors: [
			{ name: 'brand', hex: '#3ecf8e', role: '招牌翡翠绿 · 唯一的彩色事件' },
			{ name: 'brand-dark', hex: '#24b47e', role: '按压态深绿' },
			{ name: 'brand-light', hex: '#4ade80', role: '浅绿变体' },
			{ name: 'ink', hex: '#171717', role: '主文字 / 绿底上的字' },
			{ name: 'ink-mute', hex: '#707070', role: '辅助说明' },
			{ name: 'ink-faint', hex: '#b2b2b2', role: '弱化标注' },
			{ name: 'night', hex: '#1c1c1c', role: '代码块深夜底色' },
			{ name: 'on-dark', hex: '#ffffff', role: '深底文字' },
			{ name: 'canvas', hex: '#ffffff', role: '营销区白色画布' },
		],
		typeScale: [
			{
				sample: 'Build in a weekend',
				spec: 'display-xl · 48px / 500 / -1.44px · Circular',
				style:
					'font-weight:500;font-size:clamp(28px,4vw,40px);letter-spacing:-0.03em;color:#171717;line-height:1.1',
			},
			{
				sample: 'Scale to millions of users.',
				spec: 'body · 15px / 400 · 212121',
				style: 'font-size:15px;color:#212121',
			},
			{
				sample: 'const { data } = await supabase.from(...)',
				spec: 'code · 夜航底色内联等宽',
				style:
					'font-family:ui-monospace,monospace;font-size:13px;color:#3ecf8e;background:#1c1c1c;padding:2px 6px;border-radius:4px',
			},
		],
		dos: [
			'绿色只用于品牌强调与激活态',
			'每段能力介绍都配真实产品 UI 截图',
			'display 保持 500 字重加负字距',
			'代码示例一律进深夜底色块',
		],
		donts: [
			'不要给按钮做成药丸——6/8px 方正感是工程味',
			'不要引入第二个品牌色相',
			'不要用摄影或插画当装饰',
			'不要把绿色大面积铺背景',
		],
		plate: {
			bg: '#ffffff',
			headline: 'Build in a weekend, scale to millions',
			headlineStyle:
				'color:#171717;font-weight:500;font-size:clamp(26px,3.7vw,42px);letter-spacing:-0.03em;line-height:1.1',
			spec: 'Circular 500 · -1.44px · 翡翠绿单点 · night 代码块',
			specColor: '#707070',
		},
		sourceFile: 'supabase',
	},
	{
		id: 'framer',
		name: 'Framer',
		category: '设计工具',
		tagline: '黑幕上的海报标题：85px 与 -4.25px 的动效宣言',
		nameStyle: 'font-weight:500;letter-spacing:-0.05em;color:#090909',
		heroTitle: 'Framer：把营销页做成动效海报',
		lede: '整站一块纯黑画布 #090909 打到底，没有任何浅色间奏；GT Walsheim 以 85px 配 -4.25px 的极端负字距砸出海报纸的节奏。白药丸是唯一 CTA 形态，紫、洋红、橙、珊瑚的渐变聚光灯卡片在黑网格里自己发光。',
		philosophy: [
			'全黑画布：hero、定价、FAQ、footer 共享 #090909，夜幕本身就是页面结构。',
			'海报级字距：display 层 -5.5px 到 -3.1px 的负字距，字号越大越用力。',
			'白药丸专制：主 CTA 只有纯白胶囊一种形态，次级行动降为炭黑胶囊。',
			'自发光的渐变卡：紫罗兰、洋红、橙、珊瑚的大尺寸 spotlight 卡片像舞台灯一样嵌在黑网格中。',
		],
		typePanelStyle: 'background:#121212;border-color:#262626',
		colors: [
			{ name: 'canvas', hex: '#090909', role: '全站纯黑画布' },
			{ name: 'primary', hex: '#ffffff', role: '白药丸 · 唯一主 CTA' },
			{ name: 'on-primary', hex: '#000000', role: '白底黑字' },
			{ name: 'ink', hex: '#ffffff', role: '主文字' },
			{ name: 'ink-muted', hex: '#999999', role: '次级文字' },
			{ name: 'hairline', hex: '#262626', role: '黑幕上的卡片描边' },
			{ name: 'accent-blue', hex: '#0099ff', role: '品牌蓝点缀' },
			{ name: 'gradient-violet', hex: '#6a4cf5', role: '聚光灯卡渐变起' },
			{ name: 'gradient-magenta', hex: '#d44df0', role: '聚光灯卡洋红' },
			{ name: 'gradient-orange', hex: '#ff7a3d', role: '聚光灯卡橙' },
			{ name: 'gradient-coral', hex: '#ff5577', role: '聚光灯卡珊瑚收尾' },
		],
		typeScale: [
			{
				sample: 'Start designing for free',
				spec: 'display-xl · 85px / 500 / -4.25px · GT Walsheim',
				style:
					'font-weight:500;font-size:clamp(32px,5.6vw,58px);letter-spacing:-0.05em;color:#ffffff;line-height:0.98',
			},
			{
				sample: 'Ship sites that move like motion.',
				spec: 'body · Inter Variable · cv01/ss03 特性',
				style: 'font-size:15px;color:#999999',
			},
			{
				sample: 'Free → Mini → Basic',
				spec: 'pill · 炭黑次级胶囊',
				style:
					'font-size:13px;color:#ffffff;background:#1a1a1a;border:1px solid #262626;padding:4px 12px;border-radius:999px;display:inline-block',
			},
		],
		dos: [
			'display 用到极限负字距，越大越紧',
			'渐变 spotlight 卡作为独立展示瓦片使用',
			'主 CTA 统一纯白胶囊',
			'正文字开 Inter 的 cv/ss OpenType 特性',
		],
		donts: [
			'不要在黑幕上加入浅色区块',
			'不要弱化负字距——海报感立刻塌掉',
			'渐变只属于聚光灯卡，不要铺满背景',
			'不要给 CTA 换形状',
		],
		plate: {
			bg: '#090909',
			headline: 'Ship sites that move',
			headlineStyle:
				'color:#ffffff;font-weight:500;font-size:clamp(30px,4.4vw,50px);letter-spacing:-0.045em;line-height:1.0',
			spec: 'GT Walsheim 500 · 85px / -4.25px · 黑幕白药丸 · 渐变 spotlight',
			specColor: '#999999',
		},
		sourceFile: 'framer',
	},
	{
		id: 'nvidia',
		name: 'NVIDIA',
		category: 'AI',
		tagline: '一角荧光绿的绝对秩序：2px 圆角的工业硬朗',
		nameStyle: 'font-weight:700;letter-spacing:-0.01em;color:#76b900',
		heroTitle: 'NVIDIA：一颗绿方块统治所有角落',
		lede: '荧光绿 #76b900 承包了全部 CTA、激活态与装饰动机，其余只剩黑白灰的两极切换：hero/footer 黑章与白底正文章交替出现。全站没有一个药丸按钮，交互件圆角统一 2px，资源卡的右上角总摆着一枚小小的绿色方块徽记。',
		philosophy: [
			'单色独裁：荧光绿是唯一的品牌声部，出现即是官方发言。',
			'双模式节奏：深色 hero/页脚章节与白色正文章节交替，形成可预测的呼吸。',
			'超角几何：2px 圆角贯穿所有交互件——没有药丸、没有软糖感，一切都很工程师。',
			'角落签名：约 12px 的绿色方块锚在资源卡一角，是全站唯一的装饰动作。',
		],
		colors: [
			{ name: 'brand-green', hex: '#76b900', role: 'NVIDIA 绿 · 唯一强调色' },
			{ name: 'green-dark', hex: '#5a8d00', role: '深绿变体 / 按压态' },
			{ name: 'ink', hex: '#000000', role: '纯黑主文字 / 深色章节底' },
			{ name: 'surface-soft', hex: '#f7f7f7', role: '浅灰软面' },
			{ name: 'surface-elevated', hex: '#1a1a1a', role: '深色抬升面' },
			{ name: 'hairline', hex: '#cccccc', role: '卡片描边' },
			{ name: 'canvas', hex: '#ffffff', role: '正文白底' },
		],
		typeScale: [
			{
				sample: 'Accelerated Computing',
				spec: 'display-xl · 48px / 700 / 0 · NVIDIA Sans',
				style:
					'font-weight:700;font-size:clamp(28px,4vw,40px);letter-spacing:-0.01em;color:#000000;line-height:1.15',
			},
			{
				sample: 'Powering AI factories worldwide.',
				spec: 'body · 16px / 400',
				style: 'font-size:16px;color:#333333',
			},
			{
				sample: '■  Developer Resources',
				spec: 'corner-square 徽记 · 资源卡标准位',
				style: 'font-size:13px;color:#000000',
			},
		],
		dos: [
			'绿色留给 CTA、激活态与角标方块',
			'黑白章节交替形成页面节奏',
			'交互件圆角锁死 2px',
			'用 hairline 描边与软面区分层级，不靠投影',
		],
		donts: [
			'不要给按钮做成药丸',
			'不要给绿色增加同族新色相',
			'不要去掉卡角的绿色方块签名',
			'不要引入插画式装饰',
		],
		plate: {
			bg: '#ffffff',
			headline: 'The engine of AI',
			headlineStyle:
				'color:#000000;font-weight:700;font-size:clamp(26px,3.6vw,42px);letter-spacing:-0.01em;line-height:1.15',
			spec: 'NVIDIA Sans 700 · 2px 圆角 · 单一绿 · ■ 角落徽记',
			specColor: '#5a8d00',
		},
		sourceFile: 'nvidia',
	},
	{
		id: 'mistral',
		name: 'Mistral',
		category: 'AI',
		tagline: '山顶日落：橙色欧洲灵魂与奶油纸张',
		nameStyle: 'font-weight:400;letter-spacing:-0.02em;color:#fa520f',
		heroTitle: 'Mistral：把大模型写成南法日落',
		lede: '山脊剪影压着橙红黄的落日天空摄影，页面底部横着一条向奶油过渡的「日落条带」，表单和特性卡全是奶油黄纸张——在欧洲 AI 公司里，Mistral 是唯一一个把开放精神做成风景画的品牌。饱和橙 #fa520f 承担每一次行动召唤。',
		philosophy: [
			'日落是 logo 也是版式：山顶剪影摄影 hero 与横向日落条带带贯穿首尾。',
			'奶油纸张系：cream 三阶底色构成表单与特性卡的纸质温度。',
			'衬线仪式感：PP Editorial Old 近衬线负责 hero 大字，Inter 接管其余一切。',
			'克制的几何：8px 按钮、12px 卡片——比硅谷同行更收敛，更像出版物。',
		],
		colors: [
			{ name: 'primary', hex: '#fa520f', role: '落日橙 · 所有 CTA 的颜色' },
			{ name: 'primary-deep', hex: '#cc3a05', role: '深橙按压态' },
			{ name: 'sunshine', hex: '#ffd900', role: '日落条带的亮黄停' },
			{ name: 'cream', hex: '#fff8e0', role: '奶油黄面板底' },
			{ name: 'cream-light', hex: '#fffaeb', role: '最浅奶油' },
			{ name: 'cream-deep', hex: '#fff0c2', role: '深一档奶油' },
			{ name: 'beige-deep', hex: '#e6d5a8', role: '沙金分界' },
			{ name: 'ink', hex: '#1f1f1f', role: '近黑主文字' },
		],
		typeScale: [
			{
				sample: 'Open, portable, customizable',
				spec: 'display-lg · 64px / 400 / -1px · PP Editorial Old',
				style:
					"font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:clamp(30px,4.4vw,46px);letter-spacing:-0.015em;color:#1f1f1f;line-height:1.1",
			},
			{
				sample: 'Frontier AI in your hands.',
				spec: 'body · Inter · 奶油纸上仍保持清晰',
				style: 'font-size:15px;color:#44403c',
			},
		],
		dos: [
			'hero 必须是日落山景 photography',
			'页面底部横贯日落条带',
			'表单/特性卡用三阶奶油底',
			'CTA 统一饱和橙',
		],
		donts: [
			'不要给几何加太多圆角——保持出版物式的收敛',
			'不要让 Inter 做 hero——衬线的仪式感是品牌',
			'不要把亮黄单独用作按钮',
		],
		plate: {
			bg: '#fff8e0',
			strip: 'linear-gradient(90deg,#fa520f,#ffd900 55%,#fff8e0 100%)',
			headline: 'Frontier AI, European made',
			headlineStyle:
				"font-family:Georgia,'Times New Roman',serif;color:#1f1f1f;font-weight:400;font-size:clamp(27px,3.8vw,43px);letter-spacing:-0.015em;line-height:1.1",
			spec: 'PP Editorial Old · 日落条带 · 奶油纸张 · 单橙 CTA',
			specColor: '#cc3a05',
		},
		sourceFile: 'mistral',
	},
	{
		id: 'minimax',
		name: 'MiniMax',
		category: 'AI',
		tagline: '黑白底座上一条产品线一种荧光色',
		nameStyle: 'font-weight:700;letter-spacing:-0.03em;color:#0a0a0a',
		heroTitle: 'MiniMax：用色彩编码模型家族',
		lede: '系统几乎是彻底的黑与白，但每条模型线都有自己的专属荧光色：coral 珊瑚给 M2.7、洋红给 Music、蓝给海螺、橙给语音。DM Sans 以 80px/600/-2px 的重拳开路，全站的按钮与标签全是药丸，像一家把产品矩阵当成调色盘管理的公司。',
		philosophy: [
			'色彩即产品地图：每个模型线锁定一种荧光色，看到颜色就知道是哪条产品线。',
			'黑白打底：主色其实是近黑 #0a0a0a，所有的彩都发生在渐变卡与产品标识层。',
			'药丸行星：按钮、tab 全是 full-round，矩形只在数据表格与文档密集区出没。',
			'重拳标题：hero 80px、600 字重、-2px 字距、1.10 行高——冲击力优先。',
		],
		colors: [
			{ name: 'primary', hex: '#0a0a0a', role: '近黑主色 · 全局底座' },
			{ name: 'on-primary', hex: '#ffffff', role: '反白' },
			{ name: 'coral', hex: '#ff5530', role: 'M2.7 模型线专属' },
			{ name: 'magenta', hex: '#ea5ec1', role: 'Music 模型线专属' },
			{ name: 'blue', hex: '#1456f0', role: 'Hailuo 视频线专属' },
			{ name: 'cyan', hex: '#3daeff', role: '辅助亮蓝' },
			{ name: 'primary-soft', hex: '#181e25', role: '深色软面' },
		],
		typeScale: [
			{
				sample: 'Intelligence, minimized',
				spec: 'hero-display · 80px / 600 / -2px / 1.10 · DM Sans',
				style:
					'font-weight:700;font-size:clamp(32px,5vw,52px);letter-spacing:-0.03em;color:#0a0a0a;line-height:1.06',
			},
			{
				sample: 'One color per product line.',
				spec: 'body · DM Sans / Inter fallback',
				style: 'font-size:15px;color:#3f4650',
			},
		],
		dos: ['每条产品线只用它的专属色', '渐变卡是颜色的合法居所', 'UI 元素尽量 pill 化'],
		donts: ['不要跨产品线混用颜色', '不要在正文用荧光色', '表格密集区不要强行 pill'],
		plate: {
			bg: '#0a0a0a',
			headline: 'Models for everyone',
			headlineStyle:
				'color:#ffffff;font-weight:700;font-size:clamp(30px,4.3vw,48px);letter-spacing:-0.03em;line-height:1.08',
			spec: 'DM Sans 600 · 产品线色彩编码 · 药丸行星',
			specColor: '#3daeff',
		},
		sourceFile: 'minimax',
	},
	{
		id: 'coinbase',
		name: 'Coinbase',
		category: '金融',
		tagline: '蓝色托管的世界：涨跌二色永不换岗',
		nameStyle: 'font-weight:400;letter-spacing:-0.03em;color:#0052ff',
		heroTitle: 'Coinbase：把信任炼成一种蓝',
		lede: '#0052ff 包办了 brand CTA、字标与内联链接的一切高光时刻——用量如此节制以至于每一次出现都像盖章。展示字重从不超过 400，药丸按钮做到 100px 满半径，卡片 24px；深色 hero 里漂浮的产品 mockup 是品牌的第一视觉语言，而涨绿跌红永远只是文字色，从不填底。',
		philosophy: [
			'单一强调色统治：Coinbase 蓝 #0052ff 出现得越少越有分量，它是签名不是涂料。',
			'编辑部式的克制字重：Coinbase Display 最高 400，绝不用 700 咆哮。',
			'几何分级：CTA=100px 药丸、资产图标=full circle、卡片=24px，不同物件不同圆角阶层。',
			'交易语义只做文字色：上涨绿 #05b169、下跌红 #cf202f，永不当背景填色。',
		],
		colors: [
			{ name: 'brand-blue', hex: '#0052ff', role: '招牌蓝 · CTA 与字标专属' },
			{ name: 'blue-active', hex: '#003ecc', role: '按压态' },
			{ name: 'blue-disabled', hex: '#a8b8cc', role: '不可用态淡蓝' },
			{ name: 'semantic-up', hex: '#05b169', role: '上涨绿 · 仅文字色' },
			{ name: 'semantic-down', hex: '#cf202f', role: '下跌红 · 仅文字色' },
			{ name: 'ink', hex: '#0a0b0d', role: '近黑主文字' },
			{ name: 'body', hex: '#5b616e', role: '正文灰蓝' },
			{ name: 'muted', hex: '#7c828a', role: '辅助说明' },
			{ name: 'hairline', hex: '#dee1e6', role: '分隔线' },
		],
		typeScale: [
			{
				sample: 'Jump start your crypto portfolio',
				spec: 'display-xl · 64px / 400 / -1.6px · Coinbase Display',
				style:
					'font-weight:400;font-size:clamp(28px,4.2vw,44px);letter-spacing:-0.025em;color:#0a0b0d;line-height:1.05',
			},
			{
				sample: 'Buy, sell, and store cryptocurrency.',
				spec: 'body · 16px / 400',
				style: 'font-size:16px;color:#5b616e',
			},
			{
				sample: '+2.41% BTC   -1.08% ETH',
				spec: 'semantic up/down · 文字色语义',
				style: 'font-variant-numeric:tabular-nums;font-size:14px',
			},
		],
		dos: [
			'蓝只给 brand 表达，稀缺使用',
			'CTA 保持 100px 满药丸',
			'卡片维持 24px 圆角阶层',
			'涨跌只用文字色表达',
		],
		donts: ['展示字重不要超过 400', '涨跌色不要做背景填充', '不要稀释蓝色的稀缺性——泛滥即贬值'],
		plate: {
			bg: '#ffffff',
			headline: 'Update your portfolio',
			headlineStyle:
				'color:#0a0b0d;font-weight:400;font-size:clamp(28px,4vw,44px);letter-spacing:-0.025em;line-height:1.05',
			spec: 'Coinbase Display · 100px 药丸 · 24px 卡片 · 涨跌仅文字色',
			specColor: '#0052ff',
		},
		sourceFile: 'coinbase',
	},
	{
		id: 'wired',
		name: 'WIRED',
		category: '媒体',
		tagline: '黑白双人的排印实验场：衬线上位，方角到底',
		nameStyle:
			"font-family:Georgia,'Times New Roman',serif;font-weight:400;letter-spacing:-0.01em;color:#000000",
		heroTitle: 'WIRED：印刷杂志的网页复刻',
		lede: '一对纯粹的黑白双人舞：唯一的彩色破例是内联链接蓝 #057dbc。三种字脸各司其职——WiredDisplay 衬线管 display，BreveText 衬线管正文，Apercu 无衬线管元数据与按钮。按钮永远是方角，报头黑带是全站唯一的装饰动作，像一份搬上网页的印刷杂志。',
		philosophy: [
			'印刷品逻辑：黑白对比直接承继纸刊，彩色仅剩链接蓝一枚标本。',
			'三脸分工：衬线 display + 衬线 body + sans metadata，按钮也是 sans 的领地。',
			'方角党：rounded-none 贯穿全部可点击元素——直角就是媒体立场。',
			'报头条带：细黑带居中放 wordmark，除此之外不再有任何装饰。',
		],
		colors: [
			{ name: 'primary', hex: '#000000', role: '纯黑 · 双人舞的另一半' },
			{ name: 'on-primary', hex: '#ffffff', role: '黑底反白' },
			{ name: 'link', hex: '#057dbc', role: '唯一允许的内联链接蓝' },
			{ name: 'ink-soft', hex: '#1a1a1a', role: '柔化黑' },
			{ name: 'body', hex: '#757575', role: '正文灰' },
			{ name: 'hairline', hex: '#e0e0e0', role: '故事行分隔线' },
			{ name: 'canvas-soft', hex: '#f5f5f5', role: '次级面' },
		],
		typeScale: [
			{
				sample: 'The wired world',
				spec: 'display-hero · 64px / 400 / -0.5px · WiredDisplay serif',
				style:
					"font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:clamp(30px,4.4vw,46px);letter-spacing:-0.01em;color:#000000;line-height:1.0",
			},
			{
				sample: 'Longform reporting on technology and culture.',
				spec: 'body · BreveText serif · 18px',
				style: "font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#333333",
			},
		],
		dos: [
			'story grid 维持头条+两列+行列表的经典结构',
			'byline 行之间用发丝线分隔',
			'masthead 黑带永远居中放字标',
		],
		donts: ['不要给按钮加圆角', '除链接蓝外不要引入其它彩色', '不要让无衬线接管 display 层'],
		plate: {
			bg: '#ffffff',
			headline: 'Reporting on what comes next',
			headlineStyle:
				"font-family:Georgia,'Times New Roman',serif;color:#000000;font-weight:400;font-size:clamp(27px,3.9vw,44px);letter-spacing:-0.01em;line-height:1.05",
			spec: 'WiredDisplay serif · 方角按钮 · 报头黑带 · 唯一链接蓝',
			specColor: '#057dbc',
		},
		sourceFile: 'wired',
	},
	{
		id: 'xai',
		name: 'xAI',
		category: 'AI 模型',
		tagline: '近黑桌面上的一排白色空心药丸',
		nameStyle: 'font-weight:400;letter-spacing:-0.02em;color:#111111',
		heroTitle: 'xAI：把按钮做成描边，把信心做成留白',
		lede: '#0a0a0a 的近黑画布上，全站找不到一颗实心主色按钮——交互词汇只有透明白描边的药丸。Universal Sans 以 400 字重打 96px 大字，Geist Mono 全大写标签在另一头用等宽字体说话：两种脸的对比就是品牌的声音。落日强调色藏在 token 里，几乎不出场。',
		philosophy: [
			'空心即品牌：白描边药丸是全站唯一交互形态，实心 CTA 是稀缺例外而非默认。',
			'双面声音：无衬线大字负责音量，Geist Mono 大写标签负责精度。',
			'卡片只是浅一度：#191919 卡底加发丝线，深度不靠投影靠明度差。',
			'落日调色板藏着不用：sunset/dusk/twilight/breeze 罕见出场，克制到近乎吝啬。',
		],
		typePanelStyle: 'background:#191919;border-color:#2e2e2e',
		colors: [
			{ name: 'primary', hex: '#ffffff', role: '白 · 描边药丸与文字共用' },
			{ name: 'canvas', hex: '#0a0a0a', role: '近黑画布' },
			{ name: 'canvas-card', hex: '#191919', role: '卡片面 · 浅一度的黑' },
			{ name: 'accent-sunset', hex: '#ff7a17', role: '落日橙 · 罕见出场' },
			{ name: 'accent-dusk', hex: '#7c3aed', role: '黄昏紫' },
			{ name: 'accent-twilight', hex: '#c4b5fd', role: '暮光淡紫' },
			{ name: 'accent-breeze', hex: '#a0c3ec', role: '微风蓝' },
		],
		typeScale: [
			{
				sample: 'Understand the universe',
				spec: 'display-xl · 96px / 400 / -2.4px · Universal Sans',
				style:
					'font-weight:400;font-size:clamp(32px,5vw,52px);letter-spacing:-0.025em;color:#f4f4f6;line-height:1.05',
			},
			{
				sample: 'GROK 4 · NOW AVAILABLE',
				spec: 'mono 标签 · Geist Mono 全大写加宽字距',
				style:
					'font-family:ui-monospace,monospace;font-size:12px;color:#a0a0a0;letter-spacing:0.14em;text-transform:uppercase',
			},
		],
		dos: [
			'按钮一律白描边空心药丸',
			'display 用 400 字重大号负字距',
			'标签用等宽全大写拉开质感对比',
		],
		donts: [
			'不要给主 CTA 填充彩色——空心就是立场',
			'不要频繁使用落日强调色，它们是储备不是涂料',
			'不要用投影做深度',
		],
		plate: {
			bg: '#0a0a0a',
			headline: 'Understand the universe',
			headlineStyle:
				'color:#f4f4f6;font-weight:400;font-size:clamp(30px,4.3vw,48px);letter-spacing:-0.025em;line-height:1.05',
			spec: 'Universal Sans 400 · 白描边药丸 · Geist Mono 标签',
			specColor: '#a0a0a0',
		},
		sourceFile: 'xai',
	},
	{
		id: 'cohere',
		name: 'Cohere',
		category: 'AI 模型',
		tagline: '96px 纪念碑式标题下的企业编辑部气质',
		nameStyle: 'font-weight:400;letter-spacing:-0.04em;color:#17171c',
		heroTitle: 'Cohere：企业 AI 的编辑部气质',
		lede: 'CohereText 打出 96px、行高 1.0、-1.92px 字距的纪念碑式标题，白色编辑画布被深绿与深藏青的色带周期性打断。CTA 是近黑或纯白的药丸，次级行动一律下划线文本链接——企业级的不吵不闹，信任感靠留白和合作方黑白标志墙堆出来。',
		philosophy: [
			'标题即建筑：96px / 行高 1.0 / 负字距，页面先给分量再给信息。',
			'白纸 interrupt：深绿与藏青色带像杂志跨页一样切割白画布。',
			'次级行动不上色：下划线链接代替彩色按钮，安静得体。',
			'信任墙仪式：合作品牌标一律单色处理，垂直留白拉满。',
		],
		colors: [
			{ name: 'primary', hex: '#17171c', role: '近黑主色 · 药丸 CTA 用' },
			{ name: 'canvas', hex: '#ffffff', role: '编辑式白画布' },
		],
		typeScale: [
			{
				sample: 'Enterprise AI that works',
				spec: 'display · 96px / 400 / -1.92px / 1.0 · CohereText',
				style:
					'font-weight:400;font-size:clamp(32px,5vw,54px);letter-spacing:-0.03em;color:#17171c;line-height:1.02',
			},
			{
				sample: 'Read the documentation →',
				spec: 'text-link · 下划线次级行动',
				style: 'font-size:15px;color:#17171c;text-decoration:underline;text-underline-offset:3px',
			},
		],
		dos: ['标题保持超大字号加紧凑行高', '白画布上用深绿色带切分章节', '次级动作一律文本链接'],
		donts: ['不要稀释标题的纪念碑感', '不要引入彩虹色系', '合作方标志不要彩色化'],
		plate: {
			bg: '#ffffff',
			headline: 'AI built for enterprise',
			headlineStyle:
				'color:#17171c;font-weight:500;font-size:clamp(30px,4.4vw,48px);letter-spacing:-0.03em;line-height:1.02',
			spec: 'CohereText · 96px / -1.92px · 白底色带 · 下划线链接',
			specColor: '#5b6670',
		},
		sourceFile: 'cohere',
	},
	{
		id: 'together',
		name: 'Together AI',
		category: 'AI 模型',
		tagline: '一颗黑色按钮与三色渐变的推理云',
		nameStyle: 'font-weight:500;letter-spacing:-0.03em;color:#0a0a0a',
		heroTitle: 'Together AI：所有转化都指向同一颗黑色按钮',
		lede: '定价、注册、footer——所有转化目标都由同一颗黑色 4px 圆角矩形按钮承担；而整站唯一的装饰是一支橙→洋红→长春花的品牌渐变。等宽全大写眉题覆盖每个区块入口，4px 小圆角卡配暗亮交替的画布节奏，开发者气质拿摇得很稳。',
		philosophy: [
			'单一转化语言：黑色 4px 圆角矩形按钮不换形不换色，出现即是行动点。',
			'三色渐变即品牌：#fc4c02 → #ef2cc1 → #bdbbff 承担全部情绪表达。',
			'mono 眉题系统：每个区块开头都是等宽全大写小字。',
			'4px 克制圆角：卡片从不贪软，工程感优先。',
		],
		colors: [
			{ name: 'primary', hex: '#000000', role: '黑药丸 · 唯一 CTA 色' },
			{ name: 'accent-orange', hex: '#fc4c02', role: '三色渐变起点' },
			{ name: 'accent-magenta', hex: '#ef2cc1', role: '三色渐变中段' },
			{ name: 'accent-periwinkle', hex: '#bdbbff', role: '三色渐变收尾' },
			{ name: 'accent-mint', hex: '#c8f6f9', role: '薄荷软面' },
		],
		typeScale: [
			{
				sample: 'The fastest inference cloud',
				spec: 'display · 64px / 500 / -1.92px · The Future',
				style:
					'font-weight:500;font-size:clamp(28px,4.2vw,46px);letter-spacing:-0.03em;color:#0a0a0a;line-height:1.08',
			},
			{
				sample: 'OPEN SOURCE MODELS',
				spec: 'mono-caps 眉题 · 区块标配',
				style:
					'font-family:ui-monospace,monospace;font-size:12px;color:#6b6b6b;letter-spacing:0.12em;text-transform:uppercase',
			},
		],
		dos: [
			'转化点只用黑色 4px 圆角矩形按钮',
			'三色渐变作为唯一装饰动机',
			'每块区域开头放 mono 大写眉题',
		],
		donts: ['不要再发明第二颗彩色 CTA', '不要加大卡片圆角', '渐变不要铺满背景，只在局部点缀'],
		plate: {
			bg: '#ffffff',
			strip: 'linear-gradient(90deg,#fc4c02,#ef2cc1 55%,#bdbbff 100%)',
			headline: 'Inference for open models',
			headlineStyle:
				'color:#0a0a0a;font-weight:500;font-size:clamp(28px,4vw,44px);letter-spacing:-0.03em;line-height:1.08',
			spec: 'The Future 500 · 黑色 4px 按钮 · 三色渐变 · mono 眉题',
			specColor: '#6b6b6b',
		},
		sourceFile: 'together',
	},
	{
		id: 'ollama',
		name: 'Ollama',
		category: 'AI 模型',
		tagline: '一张连续白纸上的圆润力量：curl 安装条即门面',
		nameStyle: 'font-weight:500;color:#111111',
		heroTitle: 'Ollama：本地模型的极简主义郑重感',
		lede: '全页是一张没有分区切换的连续白纸，居中的 SF Pro Rounded 标题不扛大字压力——36px 就够，亲切但不幼稚。黑色药丸包办一切行动，最抢眼的位置给了那条 curl 安装命令：对开源工具而言，一行能复制的终端命令比任何文案都有说服力。',
		philosophy: [
			'一张纸到底：白面不分段，阅读体验是连续的卷轴。',
			'圆润但不幼稚：SF Pro Rounded 只用到 36px，克制的友好。',
			'黑药丸专制：不加第二行动色彩。',
			'命令即门面：可复制的 curl 片段是首页视觉中心。',
		],
		colors: [
			{ name: 'primary', hex: '#000000', role: '纯黑 · 药丸 CTA' },
			{ name: 'canvas', hex: '#ffffff', role: '连续白纸' },
		],
		typeScale: [
			{
				sample: 'Get up and running with large language models',
				spec: 'display-xl · 36px / 500 / 0 · SF Pro Rounded',
				style: 'font-weight:500;font-size:clamp(24px,3.4vw,34px);color:#111111;line-height:1.12',
			},
			{
				sample: 'curl -fsSL https://ollama.com/install.sh | sh',
				spec: 'install pill · 首页视觉中心',
				style:
					'font-family:ui-monospace,monospace;font-size:14px;color:#111111;background:#f5f5f4;border:1px solid #e7e5e4;padding:6px 16px;border-radius:999px;display:inline-block',
			},
		],
		dos: ['保持单张白面的连续性', '标题用 SF Pro Rounded 但控制字号', '给安装命令药丸最高展示位'],
		donts: ['不要拆分多个色面分段', '不要让标题大到失去亲切感', 'CTA 不需要第二色'],
		plate: {
			bg: '#ffffff',
			headline: 'Run models locally',
			headlineStyle:
				'color:#111111;font-weight:500;font-size:clamp(26px,3.7vw,40px);line-height:1.1',
			spec: 'SF Pro Rounded 500 · 黑药丸 · curl 安装条即门面',
			specColor: '#78716c',
		},
		sourceFile: 'ollama',
	},
	{
		id: 'warp',
		name: 'Warp',
		category: '开发工具',
		tagline: '暖棕黑夜里的终端复兴：3px 直角键盘味',
		nameStyle: 'font-weight:500;letter-spacing:-0.02em;color:#2b2622',
		heroTitle: 'Warp：终端的自然色是暖黑而不是纯黑',
		lede: '#2b2622 的暖棕黑画布是这个品牌的体温——不是科技业的冷黑。米白 #f7f5f0 同时充当文字色和按钮色；按钮圆角锁死 3/4px，从不做成药丸；Inter 配 DM Mono 打底，Instrument Serif 斜体偶尔客串编辑气质。终端 mockup 是唯一的装饰手段。',
		philosophy: [
			'暖棕黑即身份：#2b2622 取代行业默认冷黑，一眼认出。',
			'米白双职：同一个颜色既是正文又是实心按钮。',
			'直角键盘感：3/4px 圆角，拒绝 SaaS 式药丸。',
			'只用终端截图说话：mockup 是唯一的插画体系。',
		],
		typePanelStyle: 'background:#221d1a;border-color:#453d36',
		colors: [
			{ name: 'primary', hex: '#f7f5f0', role: '米白 · 文字与按钮共用' },
			{ name: 'canvas', hex: '#2b2622', role: '暖棕黑画布' },
		],
		typeScale: [
			{
				sample: 'The intelligent terminal',
				spec: 'display · 64px / 400 / -1.6px · Inter',
				style:
					'font-weight:400;font-size:clamp(28px,4.2vw,46px);letter-spacing:-0.025em;color:#f7f5f0;line-height:1.1',
			},
			{
				sample: '$ warp --agent run',
				spec: 'terminal · DM Mono 主场',
				style:
					'font-family:ui-monospace,monospace;font-size:14px;color:#f7f5f0;background:#221d1a;padding:4px 12px;border-radius:4px;display:inline-block',
			},
		],
		dos: [
			'画布只用暖棕黑，绝不换成冷黑',
			'文字与按钮共享米白',
			'圆角锁死 3/4px',
			'配图只用终端窗口 mockup',
		],
		donts: ['不要做药丸按钮', '不要加入彩色渐变氛围', '不要用插画风格装饰'],
		plate: {
			bg: '#2b2622',
			headline: 'Agentic development, implemented',
			headlineStyle:
				'color:#f7f5f0;font-weight:500;font-size:clamp(28px,4vw,44px);letter-spacing:-0.025em;line-height:1.1',
			spec: 'Inter 500 · 米白双职 · 3px 圆角 · 终端 mockup',
			specColor: '#a89f94',
		},
		sourceFile: 'warp',
	},
	{
		id: 'resend',
		name: 'Resend',
		category: '基础设施',
		tagline: '纯黑夜空上的五彩辉光：衬线压阵的开发者品牌',
		nameStyle:
			"font-family:Georgia,'Times New Roman',serif;font-weight:400;letter-spacing:-0.02em;color:#000000",
		heroTitle: 'Resend：发送邮件的公司做出了最好看的暗色官网',
		lede: 'Domaine Display 衬线以 76–96px 压在全黑画布上，ABC Favorit 管营销正文，Inter 管 UI——三层分工严格。五个辉光强调色只以低透明度大气晕染的方式存在，从不当实色用；半透明的发丝描边取代了全部阴影。',
		philosophy: [
			'衬线领导力：最大号的字永远是衬线体。',
			'辉光不上实色：五种彩只做低透明度的环境晕染。',
			'半透明发丝线体制：边界用 alpha 边框表达，零投影。',
			'邮件 mockup 是主角：产品可视化始终围绕收件箱场景。',
		],
		typePanelStyle: 'background:#0d0d0d;border-color:#242424',
		colors: [
			{ name: 'ink', hex: '#fcfdff', role: '米白主文字 / 实心按钮底' },
			{ name: 'canvas', hex: '#000000', role: '纯黑画布' },
			{ name: 'accent-orange', hex: '#ff801f', role: '辉光橙 · 仅低透明度晕染' },
			{ name: 'accent-yellow', hex: '#ffc53d', role: '辉光黄' },
			{ name: 'accent-blue', hex: '#3b9eff', role: '辉光蓝' },
			{ name: 'accent-green', hex: '#11ff99', role: '辉光绿' },
			{ name: 'accent-red', hex: '#ff2047', role: '辉光红' },
		],
		typeScale: [
			{
				sample: 'Email for developers',
				spec: 'display · Domaine Display · 76–96px / 400 / -0.96px',
				style:
					"font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:clamp(30px,4.5vw,50px);letter-spacing:-0.02em;color:#fcfdff;line-height:1.0",
			},
			{
				sample: 'Delivered in 1872ms',
				spec: 'metrics · 等宽字报数',
				style: 'font-family:ui-monospace,monospace;font-size:13px;color:#11ff99',
			},
		],
		dos: ['hero 永远用衬线体', '强调色只以低透明度晕染出现', '边框用半透明白 hairline 取代阴影'],
		donts: ['辉光色不要拿来做实心按钮', '不要引入投影', '正文字不要用衬线'],
		plate: {
			bg: '#000000',
			headline: 'The best API to reach humans',
			headlineStyle:
				"font-family:Georgia,'Times New Roman',serif;color:#fcfdff;font-weight:400;font-size:clamp(29px,4.2vw,47px);letter-spacing:-0.02em;line-height:1.02",
			spec: 'Domaine Display · 五彩辉光晕染 · 半透明 hairline · 零投影',
			specColor: '#11ff99',
		},
		sourceFile: 'resend',
	},
	{
		id: 'mintlify',
		name: 'Mintlify',
		category: '开发工具',
		tagline: '天空蓝渐变落到一片薄荷绿：文档基建的影院感',
		nameStyle: 'font-weight:600;letter-spacing:-0.03em;color:#0a0a0a',
		heroTitle: 'Mintlify：把文档工作台拍成电影开场',
		lede: '大气渐变横幅（天蓝化入奶油、青绿化入薄荷）给足首屏电影感；真正的功能色只有一片 Mintlify 薄荷绿 #00d4a4——激活态、确认态、强调 CTA 专属。Inter 写散文，Geist Mono 写代码，三栏文档布局里排着 16px 的长文正文（14px 留给导航与表格）。',
		philosophy: [
			'渐变氛围带：首屏永远是大气过渡，从不像 SaaS 那样平涂开屏。',
			'一片薄荷管全局：#00d4a4 出现必有含义。',
			'黑药丸营销 CTA：与文档区的极简形成分工。',
			'双字体纪律：UI 散文交给 Inter，代码签名永远 Geist Mono。',
		],
		colors: [
			{ name: 'brand-green', hex: '#00d4a4', role: '招牌薄荷绿 · 功能专属' },
			{ name: 'primary', hex: '#0a0a0a', role: '黑药丸营销 CTA' },
			{ name: 'canvas', hex: '#ffffff', role: '白色画布' },
		],
		typeScale: [
			{
				sample: 'Beautiful documentation that converts',
				spec: 'display-xl · 56px / 600 / -1.5px · Inter',
				style:
					'font-weight:600;font-size:clamp(27px,3.9vw,42px);letter-spacing:-0.027em;color:#0a0a0a;line-height:1.1',
			},
			{
				sample: 'import { Docs } from mintlify',
				spec: 'code · Geist Mono 浅灰底内联',
				style:
					'font-family:ui-monospace,monospace;font-size:13px;color:#0a0a0a;background:#f4f4f5;padding:3px 8px;border-radius:6px',
			},
		],
		dos: ['首屏用渐变氛围横幅', '薄荷绿只给有语义的位置', '营销区用黑药丸 CTA'],
		donts: ['不要把薄荷绿当普通蓝色用', '正文不要用 mono', '不要让渐变盖过内容可读性'],
		plate: {
			bg: '#ffffff',
			headline: 'Documentation your users will love',
			headlineStyle:
				'color:#0a0a0a;font-weight:600;font-size:clamp(27px,3.9vw,43px);letter-spacing:-0.027em;line-height:1.1',
			spec: 'Inter 600 · 天蓝奶油渐变带 · 薄荷绿语义 · Geist Mono',
			specColor: '#00856b',
		},
		sourceFile: 'mintlify',
	},
	{
		id: 'posthog',
		name: 'PostHog',
		category: '数据分析',
		tagline: '奶油纸上的一粒芥末黄与手绘刺猬军团',
		nameStyle: 'font-weight:800;letter-spacing:-0.02em;color:#23251d',
		heroTitle: 'PostHog：数据分析也可以很好玩',
		lede: '#eeefe9 的暖奶油画布从头铺到尾，唯一的强色是一粒芥末黄 CTA #f7a501 配上深橄榄黑 #23251d 的标题字。IBM Plex Sans 包揽全部字重从 400 到 800，手绘刺猬吉祥物是整个网站的装饰系统——在讲究效率的分析工具行业里，它选择了幽默。',
		philosophy: [
			'一张暖纸不分段：整页连续，没有章节之间的拼接感。',
			'芥末黄单点爆发：唯一的主色只出现在 CTA 上。',
			'一个字族包办一切：IBM Plex Sans 从 400 到 800 展示同一张脸的不同音量。',
			'手绘刺猬军队：插画不是装饰而是角色演员，到处客串。',
		],
		colors: [
			{ name: 'primary', hex: '#f7a501', role: '芥末黄 · 唯一 CTA 强色' },
			{ name: 'on-primary', hex: '#23251d', role: '黄底深橄榄黑字' },
			{ name: 'canvas', hex: '#eeefe9', role: '暖奶油画布' },
			{ name: 'accent-blue', hex: '#2c84e0', role: '图表蓝' },
			{ name: 'accent-red', hex: '#cd4239', role: '警示红' },
			{ name: 'accent-green', hex: '#2c8c66', role: '增长绿' },
			{ name: 'accent-purple', hex: '#7c44a6', role: '辅助紫' },
		],
		typeScale: [
			{
				sample: 'Seriously useful. Not boring.',
				spec: 'display · IBM Plex Sans · 800 加粗语气',
				style:
					'font-weight:800;font-size:clamp(28px,4vw,44px);letter-spacing:-0.025em;color:#23251d;line-height:1.15',
			},
			{
				sample: 'Analytics you might actually enjoy.',
				spec: 'body · 同一字族不同字重',
				style: 'font-size:15px;color:#4a4a45',
			},
		],
		dos: [
			'保持单张暖纸不分段',
			'CTA 只用芥末黄药丸配深橄榄字',
			'用字重表达层级而不是换字体',
			'合适的地方放一只刺猬',
		],
		donts: ['不要把黄色大面积铺底', '不要引入第二个品牌字体', '不要丢弃手绘风——那是品牌的人情味'],
		plate: {
			bg: '#eeefe9',
			headline: 'The only product toolkit you need',
			headlineStyle:
				'color:#23251d;font-weight:800;font-size:clamp(27px,3.9vw,43px);letter-spacing:-0.025em;line-height:1.15',
			spec: 'IBM Plex Sans 800 · 芥末黄药丸 · 手绘刺猬们',
			specColor: '#cd4239',
		},
		sourceFile: 'posthog',
	},
	{
		id: 'shopify',
		name: 'Shopify',
		category: '电商',
		tagline: '双画布切换：330 细体的商业叙事',
		nameStyle: 'font-weight:300;letter-spacing:0.01em;color:#000000',
		heroTitle: 'Shopify：把薄到 330 的字重当成权力',
		lede: '夜幕画布承担营销电影的独角戏，交易任务则转交亮白与奶油；两侧之间唯一的桥梁是全站统一的药丸按钮。Neue Haas Grotesk 打到 330 字重的 96px 是全站最大的视觉事件——在字重到处都是的时代，敢薄是一种自信。',
		philosophy: [
			'双画布剧场：夜幕负责惊叹，白天负责交易，各归其位。',
			'330 细体宣言：视觉重量降到最低，话语权反而最高。',
			'药丸统一两岸：不管哪个画布，按钮形状不变。',
			'商业专属色：芦荟绿与开心果绿只属于亮轨，信号生长与交易。',
		],
		colors: [
			{ name: 'canvas-night', hex: '#000000', role: '影月夜幕 · 电影营销' },
			{ name: 'canvas-light', hex: '#ffffff', role: '交易日亮轨' },
			{ name: 'canvas-cream', hex: '#fbfbf5', role: '柔和奶油过渡' },
			{ name: 'aloe', hex: '#c1fbd4', role: '芦荟绿 · 商业信号色' },
			{ name: 'pistachio', hex: '#d4f9e0', role: '开心果绿 · 商业信号色' },
			{ name: 'primary', hex: '#000000', role: '黑 · 亮轨实心药丸按钮底（夜轨文字为白色）' },
		],
		typeScale: [
			{
				sample: 'Making commerce better for everyone',
				spec: 'display-xxl · 96px / 330 / +2.4px 正字距',
				style:
					'font-weight:330;font-size:clamp(30px,4.6vw,50px);letter-spacing:0.015em;color:#000000;line-height:1.04',
			},
			{
				sample: 'Start selling today',
				spec: 'button-pill · 双画布唯一形状',
				style:
					'font-size:14px;color:#000000;background:#c1fbd4;padding:8px 20px;border-radius:999px;display:inline-block',
			},
		],
		dos: [
			'营销内容交给夜幕画布',
			'display 保持 330 细字重加微正字距',
			'亮轨内用芦荟/开心果绿做商业信号',
		],
		donts: [
			'不要给 display 加粗——细才是宣言',
			'不要在夜轨上用商业绿——它们属于日间',
			'按钮永远不要变成非药丸形',
		],
		plate: {
			bg: '#000000',
			headline: 'Making commerce better',
			headlineStyle:
				'color:#ffffff;font-weight:330;font-size:clamp(30px,4.4vw,48px);letter-spacing:0.015em;line-height:1.06',
			spec: 'Neue Haas Grotesk 330 · 双画布切换 · 药丸贯穿全球',
			specColor: '#c1fbd4',
		},
		sourceFile: 'shopify',
	},
	{
		id: 'mastercard',
		name: 'Mastercard',
		category: '金融',
		tagline: '石色纸面上的轨道游戏：一切都很 stadium',
		nameStyle: 'font-weight:600;letter-spacing:-0.01em;color:#141413',
		heroTitle: 'Mastercard：把金融年报导成一本轨道图',
		lede: '#F3F0EE 的石灰奶油纸面像一本高级年报，重要的一切都被塑成体育场形、药丸或完美圆形——40px 大圆角 hero、胶囊卡、圆形头像轨道。手绘感的橙色轨道弧线跨越整屏，连接这些圆形站点，红黄交扣的品牌遗产在角落低调共存。',
		philosophy: [
			'纸面温度：石灰奶油而非白，像年报的印刷纸张。',
			'stadium 语法：超大圆角贯穿 hero、卡片与图像罩。',
			'轨道叙事：橙色弧线跨屏连接圆形图片站点，暗示航线与轨迹。',
			'遗产色退居二线：交扣红黄保留在符号层，不参与界面染色。',
		],
		colors: [
			{ name: 'signal-orange', hex: '#cf4500', role: '信号橙 · 同意操作与眉题点缀' },
			{ name: 'peach', hex: '#f37338', role: '亮信号橙 · 轨道弧线装饰' },
			{ name: 'heritage-red', hex: '#eb001b', role: '交扣红 · 只在标志层' },
			{ name: 'heritage-yellow', hex: '#f79e1b', role: '交扣黄 · 只在标志层' },
			{ name: 'ink-black', hex: '#141413', role: '墨色 · 标题与正文' },
			{ name: 'paper', hex: '#f3f0ee', role: '石灰奶油画布' },
		],
		typeScale: [
			{
				sample: 'Priceless beginnings',
				spec: 'display · 大号加粗 · 石灰纸面上稳如磐石',
				style:
					'font-weight:700;font-size:clamp(27px,3.9vw,43px);letter-spacing:-0.015em;color:#141413;line-height:1.12',
			},
			{
				sample: 'Explore journeys →',
				spec: 'orbit link · 橙色常伴',
				style: 'font-size:15px;color:#f37338',
			},
		],
		dos: [
			'画布维持石灰奶油低饱和',
			'重要元素都用超大纲圆角或正圆',
			'用橙色弧线串联圆形站点讲旅程故事',
		],
		donts: ['不要用尖角容器', '不要把交扣红黄拿出来染界面', '弧线不要太粗，手绘感才是重点'],
		plate: {
			bg: '#f3f0ee',
			headline: 'Connections that matter',
			headlineStyle:
				'color:#141413;font-weight:700;font-size:clamp(27px,3.9vw,43px);letter-spacing:-0.015em;line-height:1.12',
			spec: 'stadium 圆角 · 石灰纸面 · 亮信号橙轨道弧线',
			specColor: '#cf4500',
		},
		sourceFile: 'mastercard',
	},
];

export const designBrandById = new Map(designBrands.map((brand) => [brand.id, brand]));

export interface DesignBrandGroup {
	id: string;
	label: string;
	note: string;
	brandIds: string[];
}

export const designBrandGroups: DesignBrandGroup[] = [
	{
		id: 'ai-models',
		label: 'AI 与模型',
		note: '把智能本身当产品的公司：有的极简到只剩描边，有的热闹得像调色盘。',
		brandIds: ['xai', 'cohere', 'together', 'ollama'],
	},
	{
		id: 'tools',
		label: '工具与 SaaS',
		note: '效率工具和开发平台的界面语言：克制、系统化、让产品截图自己说话。',
		brandIds: [
			'notion',
			'linear',
			'vercel',
			'figma',
			'ibm',
			'cursor',
			'raycast',
			'supabase',
			'framer',
			'warp',
			'mintlify',
			'posthog',
			'resend',
		],
	},
	{
		id: 'tech',
		label: '科技产品',
		note: '面向亿级用户的消费科技：摄影、氛围，和一个不容妥协的强调色。',
		brandIds: ['apple', 'spotify', 'claude', 'nvidia', 'mistral', 'minimax'],
	},
	{
		id: 'commerce',
		label: '商业与消费',
		note: '钱与生活方式的生意：信任感、精密感，和摄影的张力。',
		brandIds: ['stripe', 'nike', 'airbnb', 'coinbase', 'shopify', 'mastercard'],
	},
	{
		id: 'media',
		label: '媒体',
		note: '内容为王的编辑视觉：最大胆的排印实验发生在这里。',
		brandIds: ['theverge', 'wired'],
	},
];
