(() => {
  const root = document.querySelector("[data-prompt-library-detail]");
  if (!(root instanceof HTMLElement)) return;
  const locale = root.dataset.locale === "en" ? "en" : "zh-CN";
  const isEnglish = locale === "en";
  const title = root.querySelector("[data-prompt-title]");
  const meta = root.querySelector("[data-prompt-meta]");
  const description = root.querySelector("[data-prompt-description]");
  const status = root.querySelector("[data-prompt-status]");
  const body = root.querySelector("[data-prompt-body]");
  const id = new URLSearchParams(window.location.search).get("id") || "";

  const fail = (message) => {
    if (title)
      title.textContent = isEnglish
        ? "Prompt unavailable"
        : "Prompt 暂时不可用";
    if (status) status.textContent = message;
  };

  if (!/^prompt-[a-z0-9][a-z0-9-]{0,119}$/.test(id)) {
    fail(isEnglish ? "The Prompt link is invalid." : "这个 Prompt 链接无效。");
    return;
  }

  const appendParagraph = (container, lines) => {
    if (!lines.length) return;
    const paragraph = document.createElement("p");
    paragraph.textContent = lines.join(" ");
    container.append(paragraph);
    lines.length = 0;
  };

  // Render a conservative Markdown subset with DOM text nodes only. This keeps
  // manually entered Prompt bodies readable without executing embedded HTML.
  const renderMarkdown = (container, markdown) => {
    const lines = markdown.replaceAll("\r\n", "\n").split("\n");
    const paragraph = [];
    let code = null;
    let list = null;
    for (const line of lines) {
      if (line.startsWith("```")) {
        appendParagraph(container, paragraph);
        list = null;
        if (code) {
          container.append(code);
          code = null;
        } else {
          code = document.createElement("pre");
          const codeBody = document.createElement("code");
          code.append(codeBody);
        }
        continue;
      }
      if (code) {
        const codeBody = code.querySelector("code");
        if (codeBody) codeBody.textContent += `${line}\n`;
        continue;
      }
      const heading = /^(#{1,4})\s+(.+)$/.exec(line);
      if (heading) {
        appendParagraph(container, paragraph);
        list = null;
        const node = document.createElement(`h${heading[1].length}`);
        node.textContent = heading[2];
        container.append(node);
        continue;
      }
      const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
      if (bullet) {
        appendParagraph(container, paragraph);
        if (!list) {
          list = document.createElement("ul");
          container.append(list);
        }
        const item = document.createElement("li");
        item.textContent = bullet[1];
        list.append(item);
        continue;
      }
      if (!line.trim()) {
        appendParagraph(container, paragraph);
        list = null;
        continue;
      }
      list = null;
      paragraph.push(line);
    }
    appendParagraph(container, paragraph);
    if (code) container.append(code);
  };

  const apiBase =
    root.dataset.apiBase || "https://content-api.bubblenews.today";
  fetch(`${apiBase}/v1/prompts/${encodeURIComponent(id)}?locale=${locale}`, {
    headers: { Accept: "application/json" },
  })
    .then((response) => {
      if (!response.ok) throw new Error("prompt unavailable");
      return response.json();
    })
    .then((record) => {
      if (
        !record ||
        typeof record.title !== "string" ||
        typeof record.body_markdown !== "string"
      ) {
        throw new Error("malformed prompt");
      }
      if (title) title.textContent = record.title;
      document.title = `${record.title} · Bubble's Brain`;
      const metadata = [record.model, record.date]
        .filter((value) => typeof value === "string" && value)
        .join(" · ");
      if (meta && metadata) {
        meta.textContent = metadata;
        meta.hidden = false;
      }
      if (
        description &&
        typeof record.description === "string" &&
        record.description
      ) {
        description.textContent = record.description;
        description.hidden = false;
      }
      if (body instanceof HTMLElement) {
        renderMarkdown(body, record.body_markdown);
        body.hidden = false;
      }
      if (status) status.remove();
    })
    .catch(() => {
      fail(
        isEnglish
          ? "The content library could not return this Prompt. Please try again later."
          : "内容数据库暂时无法返回这个 Prompt，请稍后再试。",
      );
    });
})();
