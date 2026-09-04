import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import sharp from 'sharp';

export type ArticleFigureVariant = 'compact' | 'default' | 'wide';

interface HastNode {
	type: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
}

interface ArticleImageInfo {
	width: number | null;
	height: number | null;
	variant: ArticleFigureVariant;
	avifSrcset: string | null;
	webpSrcset: string | null;
}

interface RehypeArticleFigureOptions {
	staticRoot: string;
}

const RESPONSIVE_WIDTHS = [640, 960, 1440] as const;
const RASTER_EXTENSIONS = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp']);
const METADATA_EXTENSIONS = new Set([...RASTER_EXTENSIONS, '.gif']);
const GENERIC_CAPTIONS = new Set(['', 'image', 'img', '图片', '截图']);

const metadataCache = new Map<string, Promise<ArticleImageInfo>>();

function numericDimension(value: string | undefined): number | null {
	if (!value) return null;
	const match = value.match(/^([\d.]+)/);
	if (!match) return null;
	const parsed = Number(match[1]);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function svgDimensions(source: string): { width: number | null; height: number | null } {
	const svgTag = source.match(/<svg\b[^>]*>/i)?.[0] ?? '';
	const width = numericDimension(svgTag.match(/\bwidth=["']([^"']+)["']/i)?.[1]);
	const height = numericDimension(svgTag.match(/\bheight=["']([^"']+)["']/i)?.[1]);
	if (width && height) return { width, height };

	const viewBox = svgTag.match(/\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
	return {
		width: numericDimension(viewBox?.[1]),
		height: numericDimension(viewBox?.[2]),
	};
}

export function responsiveWidths(width: number): number[] {
	const widths: number[] = RESPONSIVE_WIDTHS.filter((candidate) => candidate < width);
	if (width <= RESPONSIVE_WIDTHS.at(-1)! && !widths.includes(width)) widths.push(width);
	return widths;
}

export function responsiveVariantPath(
	publicPath: string,
	width: number,
	format: 'avif' | 'webp',
): string {
	const cleanPath = publicPath.split(/[?#]/, 1)[0] ?? publicPath;
	const extension = extname(cleanPath);
	const stem = cleanPath.slice(0, -extension.length);
	return `/_responsive${stem}-${width}.${format}`;
}

export function classifyArticleImage(
	width: number | null,
	height: number | null,
	explicit?: ArticleFigureVariant | null,
): ArticleFigureVariant {
	if (explicit) return explicit;
	if (!width || !height) return 'default';
	const ratio = width / height;
	if (width < 640 || ratio <= 0.9) return 'compact';
	return 'default';
}

export function parseFigureTitle(title: string | null | undefined): {
	variant: ArticleFigureVariant | null;
	caption: string | null;
} {
	const normalized = title?.trim() ?? '';
	const match = normalized.match(/^\[(compact|default|wide)\]\s*(.*)$/i);
	if (!match) return { variant: null, caption: normalized || null };
	return {
		variant: match[1]!.toLowerCase() as ArticleFigureVariant,
		caption: match[2]?.trim() || null,
	};
}

function localAssetPath(src: string, staticRoot: string): string | null {
	if (!src.startsWith('/') || src.startsWith('//')) return null;
	const publicPath = decodeURIComponent(src.split(/[?#]/, 1)[0] ?? src);
	const filePath = resolve(staticRoot, `.${publicPath}`);
	const rootPrefix = `${resolve(staticRoot)}${sep}`;
	return filePath.startsWith(rootPrefix) ? filePath : null;
}

async function inspectArticleImage(
	src: string,
	staticRoot: string,
	explicitVariant: ArticleFigureVariant | null,
): Promise<ArticleImageInfo> {
	const assetPath = localAssetPath(src, staticRoot);
	if (!assetPath) {
		return {
			width: null,
			height: null,
			variant: explicitVariant ?? 'default',
			avifSrcset: null,
			webpSrcset: null,
		};
	}

	const extension = extname(assetPath).toLowerCase();
	let width: number | null = null;
	let height: number | null = null;

	try {
		if (extension === '.svg') {
			({ width, height } = svgDimensions(await readFile(assetPath, 'utf8')));
		} else if (METADATA_EXTENSIONS.has(extension)) {
			const metadata = await sharp(assetPath).metadata();
			width = metadata.width ?? null;
			height = metadata.height ?? null;
		}
	} catch {
		// Missing and unsupported assets remain readable as ordinary images.
	}

	const widths = width && RASTER_EXTENSIONS.has(extension) ? responsiveWidths(width) : [];
	const makeSrcset = (format: 'avif' | 'webp') =>
		widths.length
			? widths
					.map((candidate) => `${responsiveVariantPath(src, candidate, format)} ${candidate}w`)
					.join(', ')
			: null;

	return {
		width,
		height,
		variant: classifyArticleImage(width, height, explicitVariant),
		avifSrcset: makeSrcset('avif'),
		webpSrcset: makeSrcset('webp'),
	};
}

function meaningfulCaption(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const caption = value.trim();
	return GENERIC_CAPTIONS.has(caption.toLowerCase()) ? null : caption;
}

function element(
	tagName: string,
	properties: Record<string, unknown>,
	children: HastNode[],
): HastNode {
	return { type: 'element', tagName, properties, children };
}

function text(value: string): HastNode {
	return { type: 'text', value };
}

function onlyImageChild(node: HastNode): HastNode | null {
	if (node.tagName !== 'p' || !node.children) return null;
	const meaningful = node.children.filter(
		(child) => child.type !== 'text' || Boolean(child.value?.trim()),
	);
	return meaningful.length === 1 && meaningful[0]?.tagName === 'img' ? meaningful[0] : null;
}

function pictureFor(image: HastNode, info: ArticleImageInfo): HastNode {
	const properties = { ...image.properties };
	if (info.width && info.height) {
		properties.width = info.width;
		properties.height = info.height;
		properties.style = `aspect-ratio: ${info.width} / ${info.height}`;
	}
	properties.decoding = 'async';
	properties.referrerPolicy = 'no-referrer';
	delete properties.title;

	const children: HastNode[] = [];
	if (info.avifSrcset) {
		children.push(
			element(
				'source',
				{
					type: 'image/avif',
					srcSet: info.avifSrcset,
					sizes: figureSizes(info.variant),
				},
				[],
			),
		);
	}
	if (info.webpSrcset) {
		children.push(
			element(
				'source',
				{
					type: 'image/webp',
					srcSet: info.webpSrcset,
					sizes: figureSizes(info.variant),
				},
				[],
			),
		);
	}
	children.push({ ...image, properties });
	return element('picture', { className: ['article-figure__picture'] }, children);
}

function figureSizes(variant: ArticleFigureVariant): string {
	if (variant === 'wide') return '(max-width: 719px) calc(100vw - 16px), 960px';
	if (variant === 'compact') return '(max-width: 719px) calc(100vw - 32px), 560px';
	return '(max-width: 719px) calc(100vw - 32px), 720px';
}

export function rehypeArticleFigures(options: RehypeArticleFigureOptions) {
	return async function transform(tree: HastNode): Promise<void> {
		let imageIndex = 0;

		async function visit(parent: HastNode): Promise<void> {
			if (!parent.children) return;
			for (let index = 0; index < parent.children.length; index += 1) {
				const node = parent.children[index]!;
				const image = onlyImageChild(node);
				if (!image) {
					await visit(node);
					continue;
				}

				const properties = image.properties ?? {};
				const src = typeof properties.src === 'string' ? properties.src : '';
				if (!src) continue;

				const title = parseFigureTitle(
					typeof properties.title === 'string' ? properties.title : null,
				);
				const cacheKey = `${options.staticRoot}\0${src}\0${title.variant ?? ''}`;
				const infoPromise =
					metadataCache.get(cacheKey) ??
					inspectArticleImage(src, options.staticRoot, title.variant);
				metadataCache.set(cacheKey, infoPromise);
				const info = await infoPromise;
				const caption = title.caption ?? meaningfulCaption(properties.alt);
				const loading = imageIndex === 0 ? 'eager' : 'lazy';
				imageIndex += 1;
				image.properties = { ...properties, loading };

				const trigger = element(
					'a',
					{
						className: ['article-figure__trigger'],
						href: src,
						target: '_blank',
						rel: ['noopener', 'noreferrer'],
						dataArticleLightbox: '',
						dataLightboxSrc: src,
						dataLightboxCaption: caption ?? '',
					},
					[
						pictureFor(image, info),
						element('span', { className: ['article-figure__hint'], ariaHidden: 'true' }, []),
					],
				);

				const figureChildren = [trigger];
				if (caption) {
					figureChildren.push(
						element('figcaption', { className: ['article-figure__caption'] }, [text(caption)]),
					);
				}
				parent.children[index] = element(
					'figure',
					{
						className: [
							'article-figure',
							`article-figure--${info.variant}`,
							...(title.variant === 'wide' ? ['article-figure--breakout'] : []),
						],
					},
					figureChildren,
				);
			}
		}

		await visit(tree);
	};
}
