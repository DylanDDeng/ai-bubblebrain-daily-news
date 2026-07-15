const VALID_TYPES = new Set(["all", "news", "project", "paper", "socialMedia"]);

function normalized(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
}

function allowedValue(value, allowed) {
  return !value || allowed.has(value) ? value : "";
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
  const items = [...root.querySelectorAll("[data-knowledge-search-item]")];
  const count = root.querySelector("[data-search-result-count]");
  const empty = root.querySelector("[data-search-empty]");
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

  const apply = (nextState, updateUrl = true) => {
    state = nextState;
    let visible = 0;
    for (const item of items) {
      item.hidden = !itemMatchesKnowledgeState(item, state);
      if (!item.hidden) visible += 1;
    }
    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible !== 0;
    for (const [key, control] of Object.entries(controls)) {
      const value = state[key] ?? "";
      if (control && control.value !== value) control.value = value;
    }
    if (updateUrl) {
      const nextSearch = knowledgeSearchForState(window.location.search, state);
      window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}`);
    }
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
    apply(readControls());
  });
  controls.query?.addEventListener("input", () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => apply(readControls()), 140);
  });
  for (const control of [controls.type, controls.topicId, controls.entityId]) {
    control?.addEventListener("change", () => apply(readControls()));
  }
  root.querySelector("[data-clear-search]")?.addEventListener("click", () => {
    if (timer) window.clearTimeout(timer);
    apply({ query: "", type: "all", topicId: "", entityId: "" });
    controls.query?.focus();
  });
  window.addEventListener("popstate", () => {
    apply(parseKnowledgeSearchState(window.location.search, options), false);
  });
  apply(state, false);
}

if (typeof document !== "undefined") {
  const start = () => initKnowledgeSearch(document.querySelector("[data-knowledge-search]"));
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else start();
}
