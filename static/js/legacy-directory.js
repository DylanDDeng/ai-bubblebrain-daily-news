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
    // Grouped lists (highlights year groups) collapse a group once every
    // row inside it has been filtered out.
    for (const group of root.querySelectorAll("details.month-group")) {
      const anyVisible = [
        ...group.querySelectorAll("[data-directory-item]"),
      ].some((item) => !item.hidden);
      group.hidden = !anyVisible;
    }
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

  // Highlights carry no explicit date. Recover one from dated detail routes,
  // falling back to the cover upload timestamp in the thumb URL, which marks
  // when the entry was curated.
  const highlightDate = (record) => {
    const fromDetail = /\/highlights\/(\d{4}-\d{2}-\d{2})/.exec(
      text(record.detailUrl),
    );
    if (fromDetail) return fromDetail[1];
    const fromThumb = /\/(\d{4})(\d{2})(\d{2})\d{9}\.png/.exec(
      text(record.thumb),
    );
    return fromThumb ? `${fromThumb[1]}-${fromThumb[2]}-${fromThumb[3]}` : null;
  };

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
      meta =
        highlightDate(record) ??
        (record.kind === "highlight_article" ? "ARTICLE" : "BOOKMARK");
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

  // Highlights are grouped into collapsible year sections, mirroring the
  // server-rendered daily-archive markup.
  const renderHighlights = (records) => {
    const isZh = locale.toLowerCase().startsWith("zh");
    const monthFormatter = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      timeZone: "Asia/Shanghai",
    });
    const byMonth = new Map();
    let rendered = 0;
    for (const record of records) {
      const article = renderRecord(record);
      if (!article) continue;
      const monthKey = (highlightDate(record) || "").slice(0, 7) || null;
      if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
      byMonth
        .get(monthKey)
        .push({ article, date: highlightDate(record) || "" });
      rendered += 1;
    }
    const monthKeys = [...byMonth.keys()].sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return b.localeCompare(a);
    });
    const fragment = document.createDocumentFragment();
    monthKeys.forEach((monthKey, index) => {
      const group = document.createElement("details");
      group.className = "month-group";
      if (monthKey !== null && index < 3) group.open = true;
      const summary = document.createElement("summary");
      summary.className = "month-heading";
      const heading = document.createElement("h2");
      heading.textContent = monthKey
        ? monthFormatter.format(new Date(`${monthKey}-01T00:00:00+08:00`))
        : isZh
          ? "未注明日期"
          : "Undated";
      const counter = document.createElement("span");
      counter.className = "count";
      const entries = byMonth
        .get(monthKey)
        .sort((a, b) => b.date.localeCompare(a.date));
      counter.textContent = isZh
        ? `${entries.length} 条`
        : `${entries.length} items`;
      summary.append(heading, counter);
      if (monthKey !== null) {
        const range = document.createElement("span");
        range.className = "range";
        range.textContent = `${entries.at(-1).date.slice(5)} — ${entries[0].date.slice(5)}`;
        summary.append(range);
      }
      group.append(summary);
      for (const entry of entries) group.append(entry.article);
      fragment.append(group);
    });
    list.replaceChildren(fragment);
    if (count) count.textContent = String(rendered);
    apply();
  };

  const render = (records) => {
    if (kind === "highlights") {
      renderHighlights(records);
      return;
    }
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
