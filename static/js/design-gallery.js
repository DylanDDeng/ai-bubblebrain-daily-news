const copyText = async (text) => {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
};

document.querySelectorAll('[data-copy-hex]').forEach((cell) => {
	cell.addEventListener('click', async () => {
		const hex = cell.getAttribute('data-copy-hex');
		if (!(await copyText(hex))) return;
		const code = cell.querySelector('code');
		cell.classList.add('is-copied');
		if (code) code.textContent = '已复制';
		setTimeout(() => {
			cell.classList.remove('is-copied');
			if (code) code.textContent = hex;
		}, 1200);
	});
});

document.querySelectorAll('[data-copy-raw]').forEach((button) => {
	button.addEventListener('click', async () => {
		const raw = document.querySelector('[data-raw-content]');
		if (!raw) return;
		if (!(await copyText(raw.textContent ?? ''))) return;
		const original = button.textContent;
		button.textContent = '已复制 ✓';
		setTimeout(() => {
			button.textContent = original;
		}, 1500);
	});
});
