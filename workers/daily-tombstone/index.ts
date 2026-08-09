const notFound = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>页面不存在 · Bubble's Brain</title>
  </head>
  <body>
    <main>
      <h1>页面不存在</h1>
      <p>该栏目已下线。</p>
      <a href="/">返回知识库</a>
    </main>
  </body>
</html>`;

export default {
  fetch(): Response {
    return new Response(notFound, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  },
};
