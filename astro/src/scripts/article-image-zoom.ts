// Wrap article figures in a link to the raw asset so readers can open
// diagrams at full size in a new tab (animations keep playing there).
function setupArticleImageZoom(): void {
	for (const img of document.querySelectorAll<HTMLImageElement>('.article-content img')) {
		if (img.closest('a')) continue;
		const src = img.getAttribute('src');
		if (!src) continue;
		const link = document.createElement('a');
		link.href = src;
		link.target = '_blank';
		link.rel = 'noopener';
		link.className = 'article-img-zoom';
		link.title = '在新标签页查看大图';
		img.replaceWith(link);
		link.append(img);
	}
}

setupArticleImageZoom();
document.addEventListener('astro:page-load', setupArticleImageZoom);
