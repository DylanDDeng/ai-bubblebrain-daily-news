import { describe, expect, it } from "vitest";

import {
  extractLocalReferences,
  tagAttribute,
} from "../../scripts/html-local-references.mjs";

describe("HTML local-reference extraction", () => {
  it("reads only real tag attributes, not attribute values or visible text", () => {
    const html = `
      <main
        data-search="example src=&quot; href=/inside-value data = {"
        data-code="data = {"
      >
        <p>data = { and href="/inside-text/"</p>
        <a href="/real/">Real</a>
      </main>
    `;

    expect(extractLocalReferences(html, "/daily/")).toEqual(["/real/"]);
  });

  it("ignores references inside scripts, styles, pre, and code", () => {
    const html = `
      <script>const href = "/script/";</script>
      <style>src="/style/"</style>
      <pre>href="/pre/"</pre>
      <code>href="/code/"</code>
      <img src="/image.png">
    `;

    expect(extractLocalReferences(html, "/")).toEqual(["/image.png"]);
  });

  it("resolves real URL attributes, srcsets, and refresh targets", () => {
    const html = `
      <a href="../older/">Older</a>
      <form action="/search/"></form>
      <img srcset="/small.png 1x, /large.png 2x">
      <meta http-equiv="refresh" content="0; url=/login/">
      <a href="https://outside.example/path/">External</a>
    `;

    expect(extractLocalReferences(html, "/daily/current/")).toEqual([
      "/daily/older/",
      "/search/",
      "/small.png",
      "/large.png",
      "/login/",
    ]);
  });

  it("does not find a nested attribute-like token", () => {
    const tag =
      '<article data-search="src=&quot; href=/not-real/" data-item-id="one">';

    expect(tagAttribute(tag, "data-search")).toContain("href=/not-real/");
    expect(tagAttribute(tag, "href")).toBeNull();
  });
});
