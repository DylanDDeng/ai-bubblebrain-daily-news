const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

interface ViewTransform {
	scale: number;
	x: number;
	y: number;
}

function setupArticleLightbox(): void {
	const dialog = document.querySelector<HTMLDialogElement>('[data-article-lightbox-dialog]');
	if (!dialog || dialog.dataset.ready === 'true') return;
	dialog.dataset.ready = 'true';

	const image = dialog.querySelector<HTMLImageElement>('[data-lightbox-image]');
	const stage = dialog.querySelector<HTMLElement>('[data-lightbox-stage]');
	const caption = dialog.querySelector<HTMLElement>('[data-lightbox-caption]');
	const original = dialog.querySelector<HTMLAnchorElement>('[data-lightbox-original]');
	const scaleLabel = dialog.querySelector<HTMLElement>('[data-lightbox-scale]');
	const error = dialog.querySelector<HTMLElement>('[data-lightbox-error]');
	if (!image || !stage || !caption || !original || !scaleLabel || !error) return;

	let transform: ViewTransform = { scale: 1, x: 0, y: 0 };
	let originTrigger: HTMLAnchorElement | null = null;
	let dragOrigin: { x: number; y: number; transformX: number; transformY: number } | null = null;
	const pointers = new Map<number, { x: number; y: number }>();
	let pinchDistance: number | null = null;
	let pinchScale = 1;

	const applyTransform = () => {
		image.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
		scaleLabel.textContent = `${Math.round(transform.scale * 100)}%`;
		stage.dataset.zoomed = String(transform.scale > 1);
	};

	const resetTransform = () => {
		transform = { scale: 1, x: 0, y: 0 };
		applyTransform();
	};

	const setScale = (nextScale: number) => {
		const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
		if (scale <= 1) transform = { scale, x: 0, y: 0 };
		else transform = { ...transform, scale };
		applyTransform();
	};

	const open = (trigger: HTMLAnchorElement) => {
		const src = trigger.dataset.lightboxSrc || trigger.href;
		const preview = trigger.querySelector<HTMLImageElement>('img');
		originTrigger = trigger;
		caption.textContent = trigger.dataset.lightboxCaption ?? '';
		caption.hidden = !caption.textContent;
		original.href = src;
		error.hidden = true;
		stage.dataset.loading = 'true';
		image.alt = preview?.alt ?? '';
		image.src = src;
		resetTransform();
		if (!dialog.open) dialog.showModal();
	};

	document.addEventListener('click', (event) => {
		const trigger = (event.target as Element | null)?.closest<HTMLAnchorElement>(
			'a[data-article-lightbox]',
		);
		if (!trigger) return;
		event.preventDefault();
		open(trigger);
	});

	dialog.querySelector<HTMLElement>('[data-lightbox-close]')?.addEventListener('click', () => {
		dialog.close();
	});

	dialog.querySelectorAll<HTMLElement>('[data-lightbox-action]').forEach((control) => {
		control.addEventListener('click', () => {
			switch (control.dataset.lightboxAction) {
				case 'in':
					setScale(transform.scale + SCALE_STEP);
					break;
				case 'out':
					setScale(transform.scale - SCALE_STEP);
					break;
				default:
					resetTransform();
			}
		});
	});

	image.addEventListener('load', () => {
		stage.dataset.loading = 'false';
		error.hidden = true;
	});
	image.addEventListener('error', () => {
		stage.dataset.loading = 'false';
		error.hidden = false;
	});

	stage.addEventListener(
		'wheel',
		(event) => {
			if (!dialog.open) return;
			event.preventDefault();
			setScale(transform.scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
		},
		{ passive: false },
	);

	stage.addEventListener('dblclick', () => {
		setScale(transform.scale > 1 ? 1 : 2);
	});

	stage.addEventListener('pointerdown', (event) => {
		stage.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 1 && transform.scale > 1) {
			dragOrigin = {
				x: event.clientX,
				y: event.clientY,
				transformX: transform.x,
				transformY: transform.y,
			};
		}
		if (pointers.size === 2) {
			const [first, second] = [...pointers.values()];
			pinchDistance = Math.hypot(second!.x - first!.x, second!.y - first!.y);
			pinchScale = transform.scale;
			dragOrigin = null;
		}
	});

	stage.addEventListener('pointermove', (event) => {
		if (!pointers.has(event.pointerId)) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2 && pinchDistance) {
			const [first, second] = [...pointers.values()];
			const distance = Math.hypot(second!.x - first!.x, second!.y - first!.y);
			setScale(pinchScale * (distance / pinchDistance));
			return;
		}
		if (!dragOrigin || transform.scale <= 1) return;
		transform = {
			...transform,
			x: dragOrigin.transformX + event.clientX - dragOrigin.x,
			y: dragOrigin.transformY + event.clientY - dragOrigin.y,
		};
		applyTransform();
	});

	const releasePointer = (event: PointerEvent) => {
		pointers.delete(event.pointerId);
		dragOrigin = null;
		pinchDistance = null;
	};
	stage.addEventListener('pointerup', releasePointer);
	stage.addEventListener('pointercancel', releasePointer);

	dialog.addEventListener('click', (event) => {
		if (event.target === dialog) dialog.close();
	});
	dialog.addEventListener('keydown', (event) => {
		if (event.key === '+' || event.key === '=') setScale(transform.scale + SCALE_STEP);
		if (event.key === '-') setScale(transform.scale - SCALE_STEP);
		if (event.key === '0') resetTransform();
	});
	dialog.addEventListener('close', () => {
		image.removeAttribute('src');
		resetTransform();
		originTrigger?.focus({ preventScroll: true });
		originTrigger = null;
	});
}

setupArticleLightbox();
document.addEventListener('astro:page-load', setupArticleLightbox);
