import type { APIRoute } from 'astro';

import { renderSitemapIndex, xmlResponse } from '../lib/siteManifest';

export const prerender = true;
export const GET: APIRoute = () => xmlResponse(renderSitemapIndex());
