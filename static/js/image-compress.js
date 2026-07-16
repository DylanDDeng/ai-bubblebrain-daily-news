(() => {
	const input = document.querySelector('#imgc-input');
	const resize = document.querySelector('#imgc-resize');
	const preferWebp = document.querySelector('#imgc-quantize');
	const list = document.querySelector('#imgc-list');
	const summary = document.querySelector('#imgc-summary');
	const downloadAll = document.querySelector('#imgc-download-all');
	const clear = document.querySelector('#imgc-clear');
	if (!(input instanceof HTMLInputElement) || !(list instanceof HTMLElement)) return;
	let results = [];
	const human = (bytes) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	const loadBitmap = async (file) => {
		if (/heic|heif/i.test(file.type) && window.heic2any) {
			const converted = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
			return createImageBitmap(Array.isArray(converted) ? converted[0] : converted);
		}
		return createImageBitmap(file);
	};
	const compress = async (file) => {
		const bitmap = await loadBitmap(file);
		const max = Number(resize?.value || 0);
		const scale = max > 0 ? Math.min(1, max / Math.max(bitmap.width, bitmap.height)) : 1;
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		const type = preferWebp?.checked ? 'image/webp' : file.type === 'image/png' ? 'image/png' : 'image/jpeg';
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.82));
		const extension = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
		return { file, blob, name: `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, width: canvas.width, height: canvas.height };
	};
	const render = () => {
		list.replaceChildren();
		for (const result of results) {
			const row = document.createElement('article');
			const text = document.createElement('div');
			const title = document.createElement('strong');
			title.textContent = result.name;
			const meta = document.createElement('span');
			meta.textContent = `${result.width}×${result.height} · ${human(result.file.size)} → ${human(result.blob.size)}`;
			const link = document.createElement('a');
			link.href = URL.createObjectURL(result.blob);
			link.download = result.name;
			link.textContent = document.documentElement.lang === 'en' ? 'Download' : '下载';
			text.append(title, meta);
			row.append(text, link);
			list.append(row);
		}
		if (summary instanceof HTMLElement) {
			summary.hidden = results.length === 0;
			summary.textContent = results.length ? `${results.length} files ready` : '';
		}
		if (downloadAll instanceof HTMLButtonElement) downloadAll.disabled = results.length === 0;
		if (clear instanceof HTMLButtonElement) clear.disabled = results.length === 0;
	};
	input.addEventListener('change', async () => {
		results = [];
		for (const file of Array.from(input.files || [])) {
			try { results.push(await compress(file)); } catch (error) { console.error(error); }
		}
		render();
	});
	downloadAll?.addEventListener('click', async () => {
		if (!window.JSZip || results.length === 0) return;
		const zip = new window.JSZip();
		for (const result of results) zip.file(result.name, result.blob);
		const blob = await zip.generateAsync({ type: 'blob' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = 'compressed-images.zip';
		link.click();
	});
	clear?.addEventListener('click', () => { input.value = ''; results = []; render(); });
})();
