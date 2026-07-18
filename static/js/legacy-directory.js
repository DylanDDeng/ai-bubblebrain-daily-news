(() => {
  const root = document.querySelector("[data-directory-page]");
  if (!root) return;
  const input = root.querySelector("[data-directory-query]");
  const empty = root.querySelector("[data-directory-empty]");
  if (!(input instanceof HTMLInputElement)) return;
  const apply = () => {
    const query = input.value
      .trim()
      .toLocaleLowerCase(document.documentElement.lang || "zh-CN");
    let visible = 0;
    const items = Array.from(root.querySelectorAll("[data-directory-item]"));
    for (const item of items) {
      const match =
        !query || (item.getAttribute("data-search") || "").includes(query);
      item.hidden = !match;
      if (match) visible += 1;
    }
    if (empty instanceof HTMLElement) empty.hidden = visible !== 0;
  };
  input.addEventListener("input", apply);

  const api = root.getAttribute("data-library-api");
  const list = root.querySelector("[data-directory-list]");
  const count = root.querySelector("[data-directory-count]");
  if (!api || !(list instanceof HTMLElement)) return;

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
  const renderHighlights = (records) => {
    const fragment = document.createDocumentFragment();
    for (const record of records) {
      if (!record || typeof record.title !== "string") continue;
      const article = document.createElement("article");
      article.dataset.directoryItem = "";
      const tags = Array.isArray(record.tags)
        ? record.tags.filter((tag) => typeof tag === "string")
        : [];
      article.dataset.search = [record.title, record.description || "", ...tags]
        .join(" ")
        .toLocaleLowerCase(document.documentElement.lang || "zh-CN");
      const imageUrl = safeHref(record.thumb);
      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        article.append(image);
      }
      const body = document.createElement("div");
      const meta = document.createElement("p");
      meta.className = "directory-item-meta";
      meta.textContent =
        record.kind === "highlight_article" ? "ARTICLE" : "BOOKMARK";
      body.append(meta);
      const heading = document.createElement("h2");
      const href = safeHref(record.detailUrl) || safeHref(record.originalUrl);
      if (href) {
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.textContent = record.title;
        if (href.startsWith("https://")) {
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
        }
        heading.append(anchor);
      } else heading.textContent = record.title;
      body.append(heading);
      if (typeof record.description === "string" && record.description) {
        const description = document.createElement("p");
        description.textContent = record.description;
        body.append(description);
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
      fragment.append(article);
    }
    list.replaceChildren(fragment);
    if (count) count.textContent = String(records.length);
    apply();
  };

  fetch(api, { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error("highlight library unavailable");
      return response.json();
    })
    .then((payload) => {
      if (Array.isArray(payload.items)) renderHighlights(payload.items);
    })
    .catch(() => {
      // The server-rendered JSON list remains the no-JS and outage fallback.
    });
})();
