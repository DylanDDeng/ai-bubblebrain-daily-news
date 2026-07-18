(() => {
  const root = document.querySelector("[data-directory-page]");
  if (!(root instanceof HTMLElement)) return;
  const input = root.querySelector("[data-directory-query]");
  const empty = root.querySelector("[data-directory-empty]");
  const list = root.querySelector("[data-directory-list]");
  const count = root.querySelector("[data-directory-count]");
  const kind = root.dataset.directoryPage;
  if (!(input instanceof HTMLInputElement)) return;

  const locale = document.documentElement.lang || "zh-CN";
  const apply = () => {
    const query = input.value.trim().toLocaleLowerCase(locale);
    let visible = 0;
    for (const item of root.querySelectorAll("[data-directory-item]")) {
      const match =
        !query || (item.getAttribute("data-search") || "").includes(query);
      item.hidden = !match;
      if (match) visible += 1;
    }
    if (empty instanceof HTMLElement) empty.hidden = visible !== 0;
  };
  input.addEventListener("input", apply);

  const api = root.dataset.libraryApi;
  if (!api || !(list instanceof HTMLElement)) return;

  const text = (value) => (typeof value === "string" ? value : "");
  const safeHref = (value) => {
    if (typeof value !== "string" || !value) return null;
    if (value.startsWith("/")) return value;
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  };
  const safeTags = (value) =>
    Array.isArray(value)
      ? value.filter((tag) => typeof tag === "string" && tag)
      : [];

  const addImage = (article, value, contain = false) => {
    const imageUrl = safeHref(value);
    if (!imageUrl) return;
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    if (contain) image.style.objectFit = "contain";
    article.append(image);
  };

  const addHeading = (body, title, href) => {
    const heading = document.createElement("h2");
    const safe = safeHref(href);
    if (safe) {
      const anchor = document.createElement("a");
      anchor.href = safe;
      anchor.textContent = title;
      if (safe.startsWith("https://")) {
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
      }
      heading.append(anchor);
    } else {
      heading.textContent = title;
    }
    body.append(heading);
  };

  const renderRecord = (record) => {
    if (!record || typeof record !== "object") return null;
    const title =
      kind === "model-evals" ? text(record.name) : text(record.title);
    if (!title) return null;
    const tags = safeTags(record.tags);
    const description = text(record.description);
    const article = document.createElement("article");
    article.dataset.directoryItem = "";

    let meta = "";
    let href = null;
    if (kind === "highlights") {
      meta = record.kind === "highlight_article" ? "ARTICLE" : "BOOKMARK";
      href = safeHref(record.detailUrl) || safeHref(record.originalUrl);
      addImage(article, record.thumb);
    } else if (kind === "prompts") {
      meta = [text(record.model), text(record.date)]
        .filter(Boolean)
        .join(" · ");
      href = safeHref(record.detailUrl);
    } else if (kind === "model-evals") {
      meta = [text(record.company), text(record.releaseDate)]
        .filter(Boolean)
        .join(" · ");
      addImage(article, record.logo, true);
    } else {
      return null;
    }

    article.dataset.search = [title, description, meta, ...tags]
      .join(" ")
      .toLocaleLowerCase(locale);
    const body = document.createElement("div");
    const metaNode = document.createElement("p");
    metaNode.className = "directory-item-meta";
    metaNode.textContent = meta;
    body.append(metaNode);
    addHeading(body, title, href);
    if (description) {
      const detail = document.createElement("p");
      detail.textContent = description;
      body.append(detail);
    }
    if (tags.length) {
      const tagList = document.createElement("ul");
      for (const tag of tags) {
        const item = document.createElement("li");
        item.textContent = tag;
        tagList.append(item);
      }
      body.append(tagList);
    }
    article.append(body);
    return article;
  };

  const render = (records) => {
    const fragment = document.createDocumentFragment();
    let rendered = 0;
    for (const record of records) {
      const article = renderRecord(record);
      if (!article) continue;
      fragment.append(article);
      rendered += 1;
    }
    list.replaceChildren(fragment);
    if (count) count.textContent = String(rendered);
    apply();
  };

  fetch(api, { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error("content library unavailable");
      return response.json();
    })
    .then((payload) => {
      if (Array.isArray(payload.items)) render(payload.items);
    })
    .catch(() => {
      // Server-rendered legacy content remains the no-JS and outage fallback.
    });
})();
