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
				style: 'font-weight:300;font-size:clamp(30px,4.5vw,46px);letter-spacing:-0.032em;color:#0d253d;line-height:1.05',
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
				style: 'font-size:13px;color:#64748d;font-variant-numeric:tabular-nums;letter-spacing:-0.02em',
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
			strip: 'linear-gradient(100deg, #f5e9d4, #ffb199 22%, #cabffd 47%, #533afd 72%, #ea2261 100%)',
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
				style: 'font-weight:600;font-size:clamp(28px,4vw,42px);letter-spacing:-0.035em;color:#f7f8f8;line-height:1.05',
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
				style: 'font-weight:700;font-size:clamp(26px,4vw,40px);letter-spacing:-0.02em;color:#191918',
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
				style: 'font-weight:600;font-size:clamp(28px,4vw,42px);letter-spacing:-0.045em;color:#171717;line-height:1.05',
			},
			{
				sample: 'The platform for frontend developers.',
				spec: 'body · 400',
				style: 'font-size:15px;color:#4d4d4d',
			},
			{
				sample: 'DEPLOYS — vercel.json',
				spec: 'caption-mono · Geist Mono · 技术眉题专用',
				style: "font-family:ui-monospace,'SF Mono',monospace;font-size:12px;color:#888;letter-spacing:0.04em",
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
				style: 'font-weight:900;font-size:clamp(30px,5vw,48px);text-transform:uppercase;letter-spacing:-0.02em;line-height:0.95;color:#111',
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
		nameStyle: "font-family:Georgia,'Songti SC',serif;font-weight:400;letter-spacing:-0.01em;color:#29261b",
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
				style: "font-family:Georgia,'Songti SC',serif;font-weight:400;font-size:clamp(26px,4vw,38px);letter-spacing:-0.02em;color:#141413",
			},
			{
				sample: 'Warm paper, serif voice, one terracotta accent.',
				spec: 'body · StyreneB / Inter',
				style: 'font-size:15px;color:#3d3d3a',
			},
			{
				sample: 'claude -p "explain this codebase"',
				spec: 'code · 深色产品面上的等宽',
				style: "font-family:ui-monospace,'SF Mono',monospace;font-size:13px;color:#faf9f5;background:#181715;padding:8px 12px;border-radius:8px;display:inline-block",
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
				style: 'font-weight:600;font-size:clamp(26px,3.6vw,40px);letter-spacing:-0.015em;color:#1d1d1f;line-height:1.08',
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
				style: 'font-weight:700;font-size:clamp(26px,3.6vw,40px);letter-spacing:-0.04em;color:#000000;line-height:1.05',
			},
			{
				sample: 'Body hovers at weight 320–340 of the same variable family.',
				spec: 'body · figmaSans 330 · 层次靠字重不靠灰度',
				style: 'font-size:15px;color:#333333',
			},
			{
				sample: 'DESIGN SYSTEMS',
				spec: 'figmaMono · 眉题 · 永远大写、正字距',
				style: "font-family:ui-monospace,'SF Mono',monospace;font-size:12px;letter-spacing:0.14em;color:#000000",
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
				style: 'font-weight:700;font-size:clamp(24px,3.4vw,38px);letter-spacing:-0.02em;color:#ffffff;line-height:1.1',
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
				style: 'font-weight:600;font-size:clamp(24px,3.4vw,38px);letter-spacing:-0.02em;color:#222222;line-height:1.1',
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
				style: 'font-weight:300;font-size:clamp(26px,3.6vw,40px);letter-spacing:-0.01em;color:#161616;line-height:1.15',
			},
			{
				sample: 'Body copy carries 0.16px letter-spacing — a Carbon precision detail.',
				spec: 'body · Plex Sans 400 · +0.16px 正字距',
				style: 'font-size:15px;color:#525252;letter-spacing:0.16px',
			},
			{
				sample: 'Start building →',
				spec: 'button · 方角 0px · 蓝底白字',
				style: 'display:inline-block;background:#0f62fe;color:#ffffff;padding:10px 18px;font-size:13.5px',
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
				style: 'font-weight:800;font-size:clamp(26px,3.8vw,42px);text-transform:uppercase;letter-spacing:-0.01em;color:#ffffff;line-height:0.95',
			},
			{
				sample: 'PolySans carries the body on the dark canvas.',
				spec: 'body · PolySans',
				style: 'font-size:14px;color:#e9e9e9',
			},
			{
				sample: 'FEB 26 · 14:02 EST',
				spec: 'PolySans Mono · 永远大写 · 字距 1.5–1.9px',
				style: "font-family:ui-monospace,'SF Mono',monospace;font-size:12px;letter-spacing:0.16em;color:#3cffd0",
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
		id: 'tools',
		label: '工具与 SaaS',
		note: '效率工具和开发平台的界面语言：克制、系统化、让产品截图自己说话。',
		brandIds: ['notion', 'linear', 'vercel', 'figma', 'ibm'],
	},
	{
		id: 'tech',
		label: '科技产品',
		note: '面向亿级用户的消费科技：摄影、氛围，和一个不容妥协的强调色。',
		brandIds: ['apple', 'spotify', 'claude'],
	},
	{
		id: 'commerce',
		label: '商业与消费',
		note: '钱与生活方式的生意：信任感、精密感，和摄影的张力。',
		brandIds: ['stripe', 'nike', 'airbnb'],
	},
	{
		id: 'media',
		label: '媒体',
		note: '内容为王的编辑视觉：最大胆的排印实验发生在这里。',
		brandIds: ['theverge'],
	},
];
