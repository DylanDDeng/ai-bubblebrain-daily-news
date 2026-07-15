import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = () =>
	new Response(
		`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="description" content="The requested page does not exist or has moved.">
  <link rel="canonical" href="https://bubblenews.today/en/404">
  <link rel="alternate" hreflang="en" href="https://bubblenews.today/en/404">
  <link rel="alternate" hreflang="zh-CN" href="https://bubblenews.today/404">
  <link rel="alternate" hreflang="x-default" href="https://bubblenews.today/404">
  <title>Page not found · Bubble's Brain</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0b0d; color: #f4f4f5; }
    main { width: min(42rem, calc(100% - 2rem)); }
    p { color: #a1a1aa; line-height: 1.7; }
    a { color: #f4f4f5; margin-right: 1rem; }
    .skip-link { position: fixed; left: 1rem; top: 1rem; transform: translateY(-200%); padding: .75rem 1rem; background: #f4f4f5; color: #0b0b0d; z-index: 10; }
    .skip-link:focus { transform: translateY(0); }
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <main id="main-content" tabindex="-1">
    <p>404 · NOT FOUND</p>
    <h1>This knowledge path does not exist.</h1>
    <p>Return home or continue with the daily archive.</p>
    <nav aria-label="404 navigation"><a href="/en/">Home</a><a href="/en/daily/">Daily archive</a></nav>
  </main>
</body>
</html>`,
		{ headers: { 'Content-Type': 'text/html; charset=utf-8' } },
	);
