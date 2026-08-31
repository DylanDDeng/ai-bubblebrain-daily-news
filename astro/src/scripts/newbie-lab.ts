// Hands-on blocks for the Newbie Village tutorials. Markup lives in the
// markdown; this only wires behaviour so the articles stay plain HTML.

interface TokenChoice {
	word: string;
	pct: number;
}

// LAB 01 — every branch reads like an encyclopedia entry, none of it is real.
const NEXT_TOKEN_STEPS: Array<{ hint: string; choices: TokenChoice[] }> = [
	{
		hint: '第 1 步 · 先接一个姓',
		choices: [
			{ word: '张', pct: 41 },
			{ word: '李', pct: 27 },
			{ word: '王', pct: 19 },
		],
	},
	{
		hint: '第 2 步 · 再接一个名',
		choices: [
			{ word: '明', pct: 36 },
			{ word: '伟', pct: 29 },
			{ word: '磊', pct: 18 },
		],
	},
	{
		hint: '第 3 步 · 接一个身份或出处',
		choices: [
			{ word: '，清华大学出版社出版', pct: 38 },
			{ word: '，北京大学计算机系教授', pct: 33 },
			{ word: '，2019 年首次出版', pct: 22 },
		],
	},
	{
		hint: '第 4 步 · 收个尾',
		choices: [
			{ word: '。', pct: 70 },
			{ word: '，豆瓣评分 8.7。', pct: 20 },
			{ word: '，被誉为该领域的经典之作。', pct: 9 },
		],
	},
];

function setupNextTokenLab(lab: HTMLElement): void {
	const generated = lab.querySelector<HTMLElement>('[data-nb-generated]');
	const hint = lab.querySelector<HTMLElement>('[data-nb-hint]');
	const choices = lab.querySelector<HTMLElement>('[data-nb-choices]');
	const result = lab.querySelector<HTMLElement>('[data-nb-result]');
	const reset = lab.querySelector<HTMLButtonElement>('[data-nb-reset]');
	if (!generated || !hint || !choices || !result || !reset) return;

	let step = 0;

	const renderStep = () => {
		const current = NEXT_TOKEN_STEPS[step];
		choices.replaceChildren();
		if (!current) return;
		hint.textContent = current.hint;
		for (const choice of current.choices) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'nb-choice';
			button.innerHTML =
				`<span class="nb-choice-word-wrap"><span class="nb-choice-bar" style="--nb-p: ${choice.pct}%"></span>` +
				`<span class="nb-choice-word"></span></span><span class="nb-choice-pct"></span>`;
			button.querySelector('.nb-choice-word')!.textContent = choice.word;
			button.querySelector('.nb-choice-pct')!.textContent = `${choice.pct}%`;
			button.addEventListener('click', () => pick(choice.word));
			choices.append(button);
		}
	};

	const finish = () => {
		lab.classList.add('is-done');
		hint.textContent = '生成完毕';
		choices.replaceChildren();
		const sentence = `${lab.querySelector('.nb-prompt')?.textContent ?? ''}${generated.textContent ?? ''}`;
		result.replaceChildren();
		const line1 = document.createElement('p');
		line1.append('你刚刚生成的句子：「');
		const quote = document.createElement('b');
		quote.textContent = sentence;
		line1.append(quote, '」');
		const line2 = document.createElement('p');
		line2.innerHTML =
			'通顺吗？通顺。是真的吗？<b>这本书不存在，这位作者也不存在。</b>' +
			'你每一步都只是在挑「最像话」的词，没有任何一步停下来查证。模型做的正是同一件事。';
		result.append(line1, line2);
		result.hidden = false;
		reset.hidden = false;
		reset.focus();
	};

	const pick = (word: string) => {
		generated.textContent = `${generated.textContent ?? ''}${word}`;
		step += 1;
		if (step >= NEXT_TOKEN_STEPS.length) finish();
		else renderStep();
	};

	reset.addEventListener('click', () => {
		step = 0;
		generated.textContent = '';
		result.hidden = true;
		reset.hidden = true;
		lab.classList.remove('is-done');
		renderStep();
		choices.querySelector<HTMLButtonElement>('button')?.focus();
	});

	renderStep();
}

// LAB 02 — two students, 10 questions, both truly know 6.
const EXAM = {
	guess: { correct: 7, wrong: 3, blank: 0 },
	honest: { correct: 6, wrong: 0, blank: 4 },
} as const;

const EXAM_RULES: Record<string, { wrongPenalty: number; verdict: string }> = {
	a: {
		wrongPenalty: 0,
		verdict:
			'规则 A 下，<b>小猜</b>赢。不会就猜没有任何代价，这正是模型被训练和排名时最常见的规则。',
	},
	b: {
		wrongPenalty: 1,
		verdict:
			'规则 B 下，<b>小实</b>反超。只要答错要扣分，「不知道」就成了值钱的答案。但很少有测试这么打分。',
	},
	c: {
		wrongPenalty: 3,
		verdict:
			'规则 C 下，<b>小猜</b>直接负分。罚得越重，越诚实的考生越占优。想让模型少编，评分规则得先改。',
	},
};

function setupExamLab(lab: HTMLElement): void {
	const rows = {
		guess: lab.querySelector<HTMLElement>('[data-nb-score="guess"]'),
		honest: lab.querySelector<HTMLElement>('[data-nb-score="honest"]'),
	};
	const verdict = lab.querySelector<HTMLElement>('[data-nb-verdict]');
	const radios = lab.querySelectorAll<HTMLInputElement>('input[name="nb-exam-rule"]');
	if (!rows.guess || !rows.honest || !verdict) return;

	const render = () => {
		const rule = [...radios].find((radio) => radio.checked)?.value ?? 'a';
		const config = EXAM_RULES[rule] ?? EXAM_RULES.a;
		const scores = {
			guess: EXAM.guess.correct - EXAM.guess.wrong * config.wrongPenalty,
			honest: EXAM.honest.correct - EXAM.honest.wrong * config.wrongPenalty,
		};
		for (const key of ['guess', 'honest'] as const) {
			const row = rows[key]!;
			const score = scores[key];
			const bar = row.querySelector<HTMLElement>('[data-nb-bar]');
			const num = row.querySelector<HTMLElement>('[data-nb-num]');
			const detail = row.querySelector<HTMLElement>('[data-nb-detail]');
			if (bar) bar.style.width = `${Math.max(0, score) * 10}%`;
			if (num) num.textContent = `${score < 0 ? '−' : ''}${Math.abs(score)} 分`;
			if (detail) {
				const stats = EXAM[key];
				detail.textContent = `对 ${stats.correct} · 错 ${stats.wrong} · 空 ${stats.blank}`;
			}
			row.classList.toggle('is-leader', score >= scores[key === 'guess' ? 'honest' : 'guess']);
		}
		verdict.innerHTML = config.verdict;
	};

	for (const radio of radios) radio.addEventListener('change', render);
	render();
}

// Risk / quality meter — add up the checked weights, map to a level.
// Labels, tips and thresholds can be overridden per lab via data attributes.
const RISK_DEFAULTS = {
	labels: { low: '低', medium: '中', high: '高' },
	tips: {
		low: '开放式问题，或者它手里有资料可查。放心用，但仍然值得扫一眼具体细节。',
		medium: '有几处它只能靠印象补全。要求它给出处，对数字、日期、名字单独核对一遍。',
		high: '典型的幻觉高发问题。先把资料贴给它，或者改用能联网的模式；引用和链接必须逐条点开验证。',
	},
	empty: '勾选几项试试。什么都不勾，默认按开放式问题算。',
	medium: 1,
	high: 4,
};

function setupRiskLab(lab: HTMLElement): void {
	const meter = lab.querySelector<HTMLElement>('[data-nb-risk-meter]');
	const level = lab.querySelector<HTMLElement>('[data-nb-risk-level]');
	const tip = lab.querySelector<HTMLElement>('[data-nb-risk-tip]');
	const boxes = lab.querySelectorAll<HTMLInputElement>('input[data-nb-risk]');
	if (!meter || !level || !tip) return;

	const data = meter.dataset;
	const labels = {
		low: data.nbLabelLow ?? RISK_DEFAULTS.labels.low,
		medium: data.nbLabelMedium ?? RISK_DEFAULTS.labels.medium,
		high: data.nbLabelHigh ?? RISK_DEFAULTS.labels.high,
	};
	const tips = {
		low: data.nbTipLow ?? RISK_DEFAULTS.tips.low,
		medium: data.nbTipMedium ?? RISK_DEFAULTS.tips.medium,
		high: data.nbTipHigh ?? RISK_DEFAULTS.tips.high,
	};
	const emptyTip = data.nbEmpty ?? RISK_DEFAULTS.empty;
	const mediumAt = Number(data.nbMedium ?? RISK_DEFAULTS.medium);
	const highAt = Number(data.nbHigh ?? RISK_DEFAULTS.high);

	const render = () => {
		let score = 0;
		let touched = false;
		for (const box of boxes) {
			if (!box.checked) continue;
			touched = true;
			score += Number(box.dataset.nbRisk ?? 0);
		}
		const key = score >= highAt ? 'high' : score >= mediumAt ? 'medium' : 'low';
		meter.dataset.level = key;
		level.textContent = labels[key];
		tip.textContent = touched ? tips[key] : emptyTip;
	};

	for (const box of boxes) box.addEventListener('change', render);
	render();
}

// LAB (knowledge base) 01 — the reader plays retrieval; the "model" answers
// strictly from whatever chunks were handed over.
const KB_CHUNKS: Record<string, { src: string; text: string }> = {
	a: {
		src: '差旅管理制度（2025 版）· 第 3 条',
		text: '住宿标准：一线城市 500 元/晚，其他城市 350 元/晚，超标部分自理。',
	},
	b: {
		src: '差旅管理制度（2023 版）· 第 3 条',
		text: '住宿标准：一线城市 400 元/晚，其他城市 300 元/晚，超标部分自理。',
	},
	c: {
		src: '差旅管理制度（2025 版）· 第 5 条',
		text: '报销需在出差结束后 10 个工作日内提交发票与行程单。',
	},
	d: {
		src: '差旅管理制度（2025 版）· 第 1 条',
		text: '出差需提前 3 个工作日在 OA 提交审批，由直属上级审批。',
	},
	e: {
		src: '员工手册 · 第 8 章',
		text: '年假按工龄计算：满一年 5 天，满三年 10 天，满十年 15 天。',
	},
	f: {
		src: '差旅管理制度（2025 版）· 第 4 条',
		text: '本制度所称一线城市，指北京、上海、广州、深圳。',
	},
};

function kbAnswerFor(picked: string[]): {
	answer: string;
	source: string;
	verdict: string;
	tone: 'good' | 'bad' | 'meh';
} {
	const has = (id: string) => picked.includes(id);
	if (has('a') && has('b')) {
		return {
			answer:
				'资料里有两个版本的住宿标准：2025 版为一线城市 500 元/晚、其他城市 350 元/晚；2023 版为 400 元/晚、300 元/晚。建议以现行的 2025 版为准。',
			source: '差旅管理制度 2025 版第 3 条；2023 版第 3 条',
			verdict:
				'模型发现了两份资料打架，这次它处理得不错。但别指望每次都这么走运：更稳妥的做法是把作废的 2023 版从知识库里移除，别让它有机会被翻出来。',
			tone: 'meh',
		};
	}
	if (has('a')) {
		return {
			answer: has('f')
				? '住宿标准：北京、上海、广州、深圳为 500 元/晚，其他城市 350 元/晚，超出部分自理。'
				: '住宿标准：一线城市 500 元/晚，其他城市 350 元/晚，超出部分自理。',
			source: has('f') ? '差旅管理制度 2025 版第 3、4 条' : '差旅管理制度 2025 版第 3 条',
			verdict: has('f')
				? '最完整的一种答案：第 3 条给数字，第 4 条解释了「一线城市」指哪几个，新同事不用再追问。翻对了页，模型就只是照着念。'
				: '答对了，出处也对。如果再补上第 4 条，模型还能顺手解释「一线城市」是哪几个。',
			tone: 'good',
		};
	}
	if (has('b')) {
		return {
			answer: '住宿标准：一线城市 400 元/晚，其他城市 300 元/晚，超出部分自理。',
			source: '差旅管理制度 2023 版第 3 条',
			verdict:
				'注意：这个回答语气笃定、出处真实、格式完美，但数字是作废的。模型没有错，它认真读了你给它的资料；错的是被翻出来的那一页。知识库最常见的翻车方式就是这样。',
			tone: 'bad',
		};
	}
	return {
		answer:
			'所给资料里没有住宿标准的具体数字，只提到了审批流程、报销时限或与出差无关的内容。建议查阅差旅管理制度中的住宿条款。',
		source: '无',
		verdict:
			'没翻到对的页，模型老实说了「资料里没有」。这是好的表现——对比上一篇里凭印象硬答的裸模型，这是知识库带来的进步。但对新同事来说，问题还是没解决：检索这一步得修。',
		tone: 'meh',
	};
}

function setupRetrieveLab(lab: HTMLElement): void {
	const boxes = [...lab.querySelectorAll<HTMLInputElement>('input[data-nb-chunk]')];
	const hint = lab.querySelector<HTMLElement>('[data-nb-hint]');
	const submit = lab.querySelector<HTMLButtonElement>('[data-nb-submit]');
	const reset = lab.querySelector<HTMLButtonElement>('[data-nb-reset]');
	const result = lab.querySelector<HTMLElement>('[data-nb-result]');
	if (!hint || !submit || !reset || !result) return;

	const picked = () => boxes.filter((box) => box.checked).map((box) => box.dataset.nbChunk ?? '');

	const syncLimit = () => {
		const count = picked().length;
		for (const box of boxes) box.disabled = !box.checked && count >= 2;
		submit.disabled = count === 0;
		hint.textContent = count === 0 ? '最多选 2 段' : `已选 ${count} 段，最多 2 段`;
	};

	const show = () => {
		const ids = picked();
		const outcome = kbAnswerFor(ids);
		result.replaceChildren();
		result.dataset.tone = outcome.tone;

		const seen = document.createElement('p');
		seen.className = 'nb-kb-label';
		seen.textContent = '模型看到的输入';
		const input = document.createElement('div');
		input.className = 'nb-kb-input';
		const q = document.createElement('p');
		q.textContent = '问：出差住宿能报多少？';
		input.append(q);
		for (const id of ids) {
			const chunk = KB_CHUNKS[id];
			if (!chunk) continue;
			const block = document.createElement('p');
			const src = document.createElement('span');
			src.className = 'nb-chunk-src';
			src.textContent = chunk.src;
			block.append(src, chunk.text);
			input.append(block);
		}
		const ansLabel = document.createElement('p');
		ansLabel.className = 'nb-kb-label';
		ansLabel.textContent = '模型的回答';
		const answer = document.createElement('p');
		answer.className = 'nb-kb-answer';
		answer.textContent = outcome.answer;
		const source = document.createElement('p');
		source.className = 'nb-chunk-src';
		source.textContent = `出处：${outcome.source}`;
		const verdict = document.createElement('p');
		verdict.className = 'nb-kb-verdict';
		verdict.textContent = outcome.verdict;

		result.append(seen, input, ansLabel, answer, source, verdict);
		result.hidden = false;
		reset.hidden = false;
		submit.hidden = true;
		for (const box of boxes) box.disabled = true;
		reset.focus();
	};

	for (const box of boxes) box.addEventListener('change', syncLimit);
	submit.addEventListener('click', show);
	reset.addEventListener('click', () => {
		for (const box of boxes) box.checked = false;
		result.hidden = true;
		reset.hidden = true;
		submit.hidden = false;
		syncLimit();
		boxes[0]?.focus();
	});
	syncLimit();
}

// LAB (knowledge base) 02 — keyword match vs semantic neighbours.
const SEARCH_QUERIES: Array<{ text: string; keywords: string[]; semantic: string[] }> = [
	{ text: '住酒店能报多少钱', keywords: ['住酒店', '报多少'], semantic: ['a', 'b', 'f'] },
	{ text: '住宿标准', keywords: ['住宿标准'], semantic: ['a', 'b', 'f'] },
	{ text: '出差住宿费上限', keywords: ['住宿费', '上限'], semantic: ['a', 'b', 'f'] },
];
const SEARCH_ORDER = ['a', 'b', 'c', 'd', 'e', 'f'];

function setupSearchLab(lab: HTMLElement): void {
	const queries = lab.querySelector<HTMLElement>('[data-nb-queries]');
	const hits = lab.querySelector<HTMLElement>('[data-nb-hits]');
	const verdict = lab.querySelector<HTMLElement>('[data-nb-verdict]');
	const modes = lab.querySelectorAll<HTMLInputElement>('input[name="nb-search-mode"]');
	if (!queries || !hits || !verdict) return;

	let active = 0;
	const buttons: HTMLButtonElement[] = [];

	const render = () => {
		const query = SEARCH_QUERIES[active]!;
		const mode = [...modes].find((radio) => radio.checked)?.value ?? 'keyword';
		const ranked =
			mode === 'keyword'
				? SEARCH_ORDER.filter((id) =>
						query.keywords.some((word) => KB_CHUNKS[id]!.text.includes(word)),
					)
				: query.semantic;
		buttons.forEach((button, index) =>
			button.setAttribute('aria-pressed', String(index === active)),
		);

		hits.replaceChildren();
		for (const id of SEARCH_ORDER) {
			const chunk = KB_CHUNKS[id]!;
			const item = document.createElement('li');
			const rank = ranked.indexOf(id);
			item.className = rank >= 0 ? 'is-hit' : '';
			const badge = document.createElement('span');
			badge.className = 'nb-hit-badge';
			badge.textContent = rank >= 0 ? `第 ${rank + 1} 名` : '未命中';
			const body = document.createElement('span');
			body.className = 'nb-chunk-body';
			const src = document.createElement('span');
			src.className = 'nb-chunk-src';
			src.textContent = chunk.src;
			const text = document.createElement('span');
			text.textContent = chunk.text;
			body.append(src, text);
			item.append(badge, body);
			hits.append(item);
		}

		if (mode === 'keyword') {
			verdict.innerHTML =
				ranked.length === 0
					? `关键词搜索：<b>一段都没找到</b>。文档里写的是「住宿标准」，问题里一个字都没出现。模型什么都拿不到，只能凭印象答，或者说不知道。`
					: `关键词搜索：找到 ${ranked.length} 段，因为问题里恰好用了文档里的原词「住宿标准」。换个说法就搜不到了，试试另外两种问法。`;
		} else {
			verdict.innerHTML = `语义检索：三种问法都找到了同样的 3 段，因为比的是意思。但注意<b>第 2 名是 2023 年的旧版</b>——语义检索只管「像不像」，不管「还算不算数」。`;
		}
	};

	SEARCH_QUERIES.forEach((query, index) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'nb-pill';
		button.textContent = query.text;
		button.addEventListener('click', () => {
			active = index;
			render();
		});
		buttons.push(button);
		queries.append(button);
	});
	for (const radio of modes) radio.addEventListener('change', render);
	render();
}

function setupNewbieLabs(): void {
	for (const lab of document.querySelectorAll<HTMLElement>('[data-nb-lab]')) {
		if (lab.dataset.nbReady === 'true') continue;
		lab.dataset.nbReady = 'true';
		lab.classList.add('is-ready');
		const kind = lab.dataset.nbLab;
		if (kind === 'next-token') setupNextTokenLab(lab);
		else if (kind === 'exam') setupExamLab(lab);
		else if (kind === 'risk') setupRiskLab(lab);
		else if (kind === 'retrieve') setupRetrieveLab(lab);
		else if (kind === 'search') setupSearchLab(lab);
	}
}

setupNewbieLabs();
document.addEventListener('astro:page-load', setupNewbieLabs);
