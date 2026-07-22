const VALID_TYPES = new Set(["all", "news", "project", "paper"]);

export function parseTimelineState(search = "") {
  const params = new URLSearchParams(search);
  const requestedType = params.get("type") || "all";
  return {
    type: VALID_TYPES.has(requestedType) ? requestedType : "all",
    query: (params.get("q") || "").trim(),
  };
}

export function itemMatchesTimelineState(item, state) {
  const type = item.dataset.contentType || "";
  const searchText = (item.dataset.search || "").toLocaleLowerCase();
  const query = state.query.toLocaleLowerCase();
  return (
    (state.type === "all" || type === state.type) &&
    (!query || searchText.includes(query))
  );
}

export function timelineSearchForState(currentSearch, state) {
  const params = new URLSearchParams(currentSearch);
  if (state.type === "all") params.delete("type");
  else params.set("type", state.type);
  if (state.query) params.set("q", state.query);
  else params.delete("q");
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function applyState(root, state) {
  const items = [...root.querySelectorAll("[data-timeline-item]")];
  const batches = [...root.querySelectorAll("[data-timeline-batch]")];
  const count = root.querySelector("[data-result-count]");
  const empty = root.querySelector("[data-no-results]");
  const search = root.querySelector('[data-timeline-search] input[name="q"]');
  let visibleCount = 0;

  root.querySelectorAll("[data-filter-type]").forEach((button) => {
    const active = button.dataset.filterType === state.type;
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (search && search.value !== state.query) search.value = state.query;

  items.forEach((item) => {
    const visible = itemMatchesTimelineState(item, state);
    item.hidden = !visible;
    if (visible) visibleCount += 1;
  });

  batches.forEach((batch) => {
    const visibleItems = batch.querySelectorAll(
      "[data-timeline-item]:not([hidden])",
    );
    const batchCount = batch.querySelector("[data-batch-count]");
    if (batchCount) batchCount.textContent = String(visibleItems.length);
    const filtering = state.type !== "all" || Boolean(state.query);
    batch.hidden = filtering && visibleItems.length === 0;
  });

  if (count) count.textContent = String(visibleCount);
  if (empty) empty.hidden = visibleCount !== 0;
}

function replaceUrlState(state) {
  const nextSearch = timelineSearchForState(window.location.search, state);
  const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function prepareSummaryToggles(root) {
  const expandLabel = root.dataset.expandLabel || "Expand summary";
  const collapseLabel = root.dataset.collapseLabel || "Collapse summary";
  root.querySelectorAll(".timeline-summary").forEach((summary, index) => {
    if ((summary.textContent || "").trim().length <= 220) return;
    const summaryId = `timeline-summary-${root.dataset.reportDate || "day"}-${index}`;
    summary.id = summaryId;
    summary.classList.add("is-collapsible");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "timeline-summary-toggle";
    button.setAttribute("aria-controls", summaryId);
    button.setAttribute("aria-expanded", "false");
    button.textContent = expandLabel;
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", expanded ? "false" : "true");
      button.textContent = expanded ? expandLabel : collapseLabel;
      summary.classList.toggle("is-expanded", !expanded);
    });
    summary.insertAdjacentElement("afterend", button);
  });
}

export function initDailyTimeline(root) {
  if (!root || root.dataset.timelineReady === "true") return;
  root.dataset.timelineReady = "true";
  root.classList.add("timeline-enhanced");
  prepareSummaryToggles(root);
  let state = parseTimelineState(window.location.search);
  let searchTimer = null;

  const commit = (nextState, updateUrl = true) => {
    state = nextState;
    applyState(root, state);
    if (updateUrl) replaceUrlState(state);
  };

  root.querySelectorAll("[data-filter-type]").forEach((button) => {
    button.addEventListener("click", () => {
      commit({ ...state, type: button.dataset.filterType || "all" });
    });
  });

  const form = root.querySelector("[data-timeline-search]");
  const input = form?.querySelector('input[name="q"]');
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (searchTimer) window.clearTimeout(searchTimer);
    commit({ ...state, query: input?.value.trim() || "" });
  });
  input?.addEventListener("input", () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      commit({ ...state, query: input.value.trim() });
    }, 140);
  });

  root.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    commit({ type: "all", query: "" });
    input?.focus();
  });

  const handlePopState = () => {
    commit(parseTimelineState(window.location.search), false);
  };
  window.addEventListener("popstate", handlePopState);
  document.addEventListener(
    "astro:before-swap",
    () => window.removeEventListener("popstate", handlePopState),
    { once: true },
  );
  applyState(root, state);
}

if (typeof document !== "undefined") {
  const start = () =>
    document
      .querySelectorAll("[data-daily-timeline]")
      .forEach(initDailyTimeline);
  document.addEventListener("astro:page-load", start);
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
