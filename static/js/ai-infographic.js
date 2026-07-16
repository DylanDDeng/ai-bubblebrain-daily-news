const root = document.querySelector('[data-aig-root]');

if (root) {
	const locale = root.dataset.locale === 'en' ? 'en' : 'zh-CN';
	const form = root.querySelector('[data-aig-form]');
	const apiKey = root.querySelector('#aig-api-key');
	const content = root.querySelector('#aig-content');
	const count = root.querySelector('[data-aig-count]');
	const toggleKey = root.querySelector('[data-aig-toggle-key]');
	const generate = root.querySelector('[data-aig-generate]');
	const generateLabel = root.querySelector('[data-aig-generate-label]');
	const error = root.querySelector('[data-aig-error]');
	const empty = root.querySelector('[data-aig-empty]');
	const result = root.querySelector('[data-aig-result]');
	const preview = root.querySelector('[data-aig-preview]');
	const previewWrapper = root.querySelector('[data-aig-preview-wrapper]');
	const zoomLevel = root.querySelector('[data-aig-zoom-level]');
	const storageKey = 'aig_api_key';
	let generatedHtml = '';
	let zoom = 1;

	const systemPrompt = `You are an information designer and content editor. Transform the user's source into a complete, standalone 9:16 vertical infographic as a single HTML document with embedded CSS. Use a rigorous Swiss editorial grid, alternating Klein blue (#002FA7) and warm white (#F5F5F2) sections, black and white type, restrained orange (#FF4500) accents, clear numbered sections, strong data callouts, and generous whitespace. Extract and reorganize the information instead of copying it verbatim. Preserve the source language. Use accessible semantic HTML, system fonts, no remote assets, and no scripts. Return HTML only, without Markdown fences or commentary.`;

	try {
		const saved = localStorage.getItem(storageKey);
		if (saved) apiKey.value = saved;
	} catch {}

	const setError = (message = '') => {
		error.textContent = message;
		error.hidden = !message;
	};

	const updateCount = () => {
		const length = content.value.length;
		count.textContent = locale === 'en' ? `${length} characters` : `${length} 字符`;
	};

	const updateZoom = () => {
		previewWrapper.style.transform = `scale(${zoom})`;
		zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
	};

	const extractHtml = (value) => {
		const fenced = value.match(/```(?:html)?\s*([\s\S]*?)```/i);
		if (fenced) return fenced[1].trim();
		if (/<(?:!doctype|html|body)[\s>]/i.test(value)) return value.trim();
		return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Infographic</title></head><body>${value}</body></html>`;
	};

	content.addEventListener('input', updateCount);
	updateCount();

	toggleKey.addEventListener('click', () => {
		apiKey.type = apiKey.type === 'password' ? 'text' : 'password';
		const icon = toggleKey.querySelector('i');
		if (icon) icon.className = apiKey.type === 'password' ? 'ph ph-eye' : 'ph ph-eye-slash';
	});

	apiKey.addEventListener('change', () => {
		try {
			localStorage.setItem(storageKey, apiKey.value);
		} catch {}
	});

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		setError();
		const key = apiKey.value.trim();
		const source = content.value.trim();
		if (!key) {
			setError(root.dataset.errorKey);
			apiKey.focus();
			return;
		}
		if (source.length < 50) {
			setError(root.dataset.errorContent);
			content.focus();
			return;
		}

		generate.disabled = true;
		generate.setAttribute('aria-busy', 'true');
		generateLabel.textContent = locale === 'en' ? 'Generating…' : '正在生成…';
		try {
			const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${key}`,
				},
				body: JSON.stringify({
					model: 'kimi-k2.5',
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: source },
					],
					temperature: 1,
				}),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload?.error?.message || `API ${response.status}`);
			generatedHtml = extractHtml(payload?.choices?.[0]?.message?.content || '');
			preview.srcdoc = generatedHtml;
			empty.hidden = true;
			result.hidden = false;
			zoom = 1;
			updateZoom();
		} catch (cause) {
			setError(cause instanceof Error && cause.message ? cause.message : root.dataset.errorGeneric);
		} finally {
			generate.disabled = false;
			generate.removeAttribute('aria-busy');
			generateLabel.textContent = locale === 'en' ? 'Generate infographic' : '生成信息图';
		}
	});

	root.querySelector('[data-aig-zoom-in]').addEventListener('click', () => {
		zoom = Math.min(1.5, Number((zoom + 0.1).toFixed(1)));
		updateZoom();
	});

	root.querySelector('[data-aig-zoom-out]').addEventListener('click', () => {
		zoom = Math.max(0.5, Number((zoom - 0.1).toFixed(1)));
		updateZoom();
	});

	root.querySelector('[data-aig-fullscreen]').addEventListener('click', () => {
		result.classList.toggle('is-fullscreen');
	});

	root.querySelector('[data-aig-copy]').addEventListener('click', async (event) => {
		if (!generatedHtml) return;
		try {
			await navigator.clipboard.writeText(generatedHtml);
			const button = event.currentTarget;
			const previous = button.textContent;
			button.textContent = locale === 'en' ? 'Copied' : '已复制';
			setTimeout(() => { button.textContent = previous; }, 1800);
		} catch {
			setError(locale === 'en' ? 'Clipboard access was unavailable.' : '无法访问剪贴板。');
		}
	});

	root.querySelector('[data-aig-download]').addEventListener('click', () => {
		if (!generatedHtml) return;
		const url = URL.createObjectURL(new Blob([generatedHtml], { type: 'text/html' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `infographic-${Date.now()}.html`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	});

	root.querySelector('[data-aig-new]').addEventListener('click', () => {
		content.value = '';
		generatedHtml = '';
		preview.removeAttribute('srcdoc');
		result.hidden = true;
		empty.hidden = false;
		setError();
		updateCount();
		content.focus();
	});
}
