const VALID_TYPES = new Set(["all", "news", "project", "paper"]);

function normalized(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
}

function allowedValue(value, allowed) {
  return !value || allowed.has(value) ? value : "";
}

export function contentApiSearchUrl(origin, releaseId, query, limit = 100) {
  const base = new URL(origin);
  if (
    base.protocol !== "https:" ||
    base.pathname !== "/" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      releaseId,
    ) ||
    !query.trim() ||
    query.length > 200 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new Error("Invalid release-pinned historical search request");
  }
  const url = new URL(`/v1/releases/${releaseId}/search`, base);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", String(limit));
  return url;
}

export function normalizeHistoricalSearchResult(result) {
  const item = result?.item;
  const date = String(result?.report_date || "");
  const id = String(result?.item_id || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^n_[a-f0-9]{64}$/.test(id) ||
    !item ||
    typeof item !== "object"
  ) {
    throw new Error("Historical search result is malformed");
  }
  const sourceName = String(item.source?.name || item.source_name || "");
  const topicIds = Array.isArray(item.topic_ids) ? item.topic_ids.map(String) : [];
  const entityIds = Array.isArray(item.entity_ids) ? item.entity_ids.map(String) : [];
  const rawContentType = String(item.content_type || "news");
  return {
    id,
    date,
    href: `/daily/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}/#news-${id}`,
    title: String(item.title || ""),
    summary: String(item.summary || ""),
    sourceName,
    // socialMedia merges into news at display level.
    contentType: rawContentType === "socialMedia" ? "news" : rawContentType,
    topicIds,
    entityIds,
    searchText: [item.title, item.summary, sourceName].map(String).join(" "),
  };
}

export function parseKnowledgeSearchState(
  search = "",
  { topicIds = [], entityIds = [] } = {},
) {
  const params = new URLSearchParams(search);
  const requestedType = params.get("type") || "all";
  return {
    query: (params.get("q") || "").trim(),
    type: VALID_TYPES.has(requestedType) ? requestedType : "all",
    topicId: allowedValue(params.get("topic") || "", new Set(topicIds)),
    entityId: allowedValue(params.get("entity") || "", new Set(entityIds)),
  };
}

export function itemMatchesKnowledgeState(item, state) {
  const topics = new Set((item.dataset.topics || "").split(" ").filter(Boolean));
  const entities = new Set((item.dataset.entities || "").split(" ").filter(Boolean));
  return (
    (state.type === "all" || item.dataset.contentType === state.type) &&
    (!state.topicId || topics.has(state.topicId)) &&
    (!state.entityId || entities.has(state.entityId)) &&
    (!state.query || normalized(item.dataset.search).includes(normalized(state.query)))
  );
}

export function knowledgeSearchForState(currentSearch, state) {
  const params = new URLSearchParams(currentSearch);
  for (const [name, value, defaultValue = ""] of [
    ["q", state.query],
    ["type", state.type, "all"],
    ["topic", state.topicId],
    ["entity", state.entityId],
  ]) {
    if (!value || value === defaultValue) params.delete(name);
    else params.set(name, value);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function initKnowledgeSearch(root) {
  if (!root || root.dataset.searchReady === "true") return;
  root.dataset.searchReady = "true";
  const form = root.querySelector("[data-knowledge-search-form]");
  const results = root.querySelector("[data-knowledge-results]");
  const staticItems = [...root.querySelectorAll("[data-knowledge-search-item]")];
  let items = staticItems;
  const count = root.querySelector("[data-search-result-count]");
  const empty = root.querySelector("[data-search-empty]");
  const error = root.querySelector("[data-search-error]");
  const releaseId = root.dataset.contentReleaseId || "";
  const contentApiOrigin = root.dataset.contentApiOrigin || "";
  const controls = {
    query: form?.querySelector('[name="q"]'),
    type: form?.querySelector('[name="type"]'),
    topicId: form?.querySelector('[name="topic"]'),
    entityId: form?.querySelector('[name="entity"]'),
  };
  const options = {
    topicIds: [...(controls.topicId?.options || [])].map((option) => option.value).filter(Boolean),
    entityIds: [...(controls.entityId?.options || [])].map((option) => option.value).filter(Boolean),
  };
  let state = parseKnowledgeSearchState(window.location.search, options);
  let timer = null;
  let requestGeneration = 0;
  let activeRequest = null;

  const restoreStaticItems = () => {
    if (results && !staticItems.every((item) => item.parentElement === results)) {
      results.replaceChildren(...staticItems);
    }
    items = staticItems;
  };

  const renderHistoricalItems = (values) => {
    if (!results) return;
    const fragment = document.createDocumentFragment();
    const typeLabels = {
      news: "资讯",
      project: "项目",
      paper: "论文",
    };
    for (const value of values) {
      const article = document.createElement("article");
      article.className = "knowledge-result";
      article.dataset.knowledgeSearchItem = "";
      article.dataset.contentType = value.contentType;
      article.dataset.topics = value.topicIds.join(" ");
      article.dataset.entities = value.entityIds.join(" ");
      article.dataset.search = value.searchText;

      const date = document.createElement("div");
      date.className = "knowledge-result-date";
      const time = document.createElement("time");
      time.dateTime = value.date;
      time.textContent = value.date.slice(5);
      const year = document.createElement("span");
      year.textContent = value.date.slice(0, 4);
      date.append(time, year);

      const body = document.createElement("div");
      body.className = "knowledge-result-body";
      const metadata = document.createElement("p");
      metadata.className = "knowledge-result-meta";
      for (const text of [value.sourceName, typeLabels[value.contentType] || value.contentType]) {
        const span = document.createElement("span");
        span.textContent = text;
        metadata.append(span);
      }
      const heading = document.createElement("h2");
      const link = document.createElement("a");
      link.href = value.href;
      link.textContent = value.title;
      heading.append(link);
      body.append(metadata, heading);
      if (value.summary) {
        const summary = document.createElement("p");
        summary.className = "knowledge-result-summary";
        summary.textContent = value.summary;
        body.append(summary);
      }
      article.append(date, body);
      fragment.append(article);
    }
    results.replaceChildren(fragment);
    items = [...results.querySelectorAll("[data-knowledge-search-item]")];
  };

  const historicalSearch = async (query, signal) => {
    const url = contentApiSearchUrl(contentApiOrigin, releaseId, query);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) throw new Error(`Historical search returned ${response.status}`);
    const payload = await response.json();
    if (payload.site_release_id !== releaseId || !Array.isArray(payload.results)) {
      throw new Error("Historical search release identity mismatch");
    }
    return payload.results.map(normalizeHistoricalSearchResult);
  };

  const apply = async (nextState, updateUrl = true) => {
    state = nextState;
    const generation = ++requestGeneration;
    activeRequest?.abort();
    activeRequest = null;
    const useHistoricalSearch = Boolean(releaseId && contentApiOrigin && state.query);
    let historicalApplied = false;
    if (updateUrl) {
      const nextSearch = knowledgeSearchForState(window.location.search, state);
      window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}`);
    }
    for (const [key, control] of Object.entries(controls)) {
      const value = state[key] ?? "";
      if (control && control.value !== value) control.value = value;
    }
    if (useHistoricalSearch) {
      activeRequest = new AbortController();
      try {
        const historicalItems = await historicalSearch(state.query, activeRequest.signal);
        if (generation !== requestGeneration) return;
        renderHistoricalItems(historicalItems);
        historicalApplied = true;
        if (error) error.hidden = true;
      } catch (requestError) {
        if (generation !== requestGeneration || requestError?.name === "AbortError") return;
        restoreStaticItems();
        if (error) {
          error.textContent = "历史搜索暂不可用，当前显示最近的静态索引。";
          error.hidden = false;
        }
      }
    } else {
      restoreStaticItems();
      if (error) error.hidden = true;
    }
    let visible = 0;
    const matchState = historicalApplied ? { ...state, query: "" } : state;
    for (const item of items) {
      item.hidden = !itemMatchesKnowledgeState(item, matchState);
      if (!item.hidden) visible += 1;
    }
    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible !== 0;
  };

  const readControls = () => ({
    query: controls.query?.value.trim() || "",
    type: controls.type?.value || "all",
    topicId: controls.topicId?.value || "",
    entityId: controls.entityId?.value || "",
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (timer) window.clearTimeout(timer);
    void apply(readControls());
  });
  controls.query?.addEventListener("input", () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => void apply(readControls()), 140);
  });
  for (const control of [controls.type, controls.topicId, controls.entityId]) {
    control?.addEventListener("change", () => void apply(readControls()));
  }
  root.querySelector("[data-clear-search]")?.addEventListener("click", () => {
    if (timer) window.clearTimeout(timer);
    void apply({ query: "", type: "all", topicId: "", entityId: "" });
    controls.query?.focus();
  });
  const handlePopState = () => {
    void apply(parseKnowledgeSearchState(window.location.search, options), false);
  };
  window.addEventListener("popstate", handlePopState);
  document.addEventListener(
    "astro:before-swap",
    () => window.removeEventListener("popstate", handlePopState),
    { once: true },
  );
  void apply(state, false);
}

if (typeof document !== "undefined") {
  const start = () => initKnowledgeSearch(document.querySelector("[data-knowledge-search]"));
  document.addEventListener("astro:page-load", start);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else start();
}
