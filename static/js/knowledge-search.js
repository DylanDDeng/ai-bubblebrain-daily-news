function normalized(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
}

export function parseKnowledgeSearchState(search = "", sectionIds = []) {
  const params = new URLSearchParams(search);
  const section = params.get("section") || "";
  return {
    query: (params.get("q") || "").trim(),
    section: sectionIds.includes(section) ? section : "",
  };
}

export function itemMatchesKnowledgeState(item, state) {
  return (
    (!state.section || item.dataset.section === state.section) &&
    (!state.query || normalized(item.dataset.search).includes(normalized(state.query)))
  );
}

export function knowledgeSearchForState(currentSearch, state) {
  const params = new URLSearchParams(currentSearch);
  for (const [name, value] of [["q", state.query], ["section", state.section]]) {
    if (!value) params.delete(name);
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
  const queryControl = form?.querySelector('[name="q"]');
  const sectionControl = form?.querySelector('[name="section"]');
  const filterMenu = form?.querySelector("[data-knowledge-filter-menu]");
  const filterLabel = form?.querySelector("[data-knowledge-filter-label]");
  const filterOptions = [...(form?.querySelectorAll("[data-section-value]") || [])];
  const sectionIds = [...(sectionControl?.options || [])].map((option) => option.value).filter(Boolean);
  const sectionLabelFor = new Map(
    filterOptions.map((option) => [option.dataset.sectionValue || "", option.textContent.trim()]),
  );
  let timer = null;

  const syncFilterMenu = (section) => {
    if (filterLabel) filterLabel.textContent = sectionLabelFor.get(section) || "全部栏目";
    for (const option of filterOptions) {
      option.setAttribute("aria-checked", String((option.dataset.sectionValue || "") === section));
    }
  };

  const apply = (state, updateUrl = true) => {
    if (updateUrl) {
      const nextSearch = knowledgeSearchForState(window.location.search, state);
      window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}`);
    }
    if (queryControl && queryControl.value !== state.query) queryControl.value = state.query;
    if (sectionControl && sectionControl.value !== state.section) sectionControl.value = state.section;
    syncFilterMenu(state.section);
    let visible = 0;
    for (const item of items) {
      item.hidden = !itemMatchesKnowledgeState(item, state);
      if (!item.hidden) visible += 1;
    }
    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible !== 0;
  };

  const readControls = () => ({
    query: queryControl?.value.trim() || "",
    section: sectionControl?.value || "",
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (timer) window.clearTimeout(timer);
    apply(readControls());
  });
  queryControl?.addEventListener("input", () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => apply(readControls()), 140);
  });
  sectionControl?.addEventListener("change", () => apply(readControls()));
  for (const option of filterOptions) {
    option.addEventListener("click", () => {
      if (sectionControl) sectionControl.value = option.dataset.sectionValue || "";
      filterMenu?.removeAttribute("open");
      apply(readControls());
    });
  }
  filterMenu?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      filterMenu.removeAttribute("open");
      filterMenu.querySelector("summary")?.focus();
    }
  });
  const handleDocumentClick = (event) => {
    if (filterMenu?.open && !filterMenu.contains(event.target)) filterMenu.removeAttribute("open");
  };
  document.addEventListener("click", handleDocumentClick);
  root.querySelector("[data-clear-search]")?.addEventListener("click", () => {
    if (timer) window.clearTimeout(timer);
    apply({ query: "", section: "" });
    queryControl?.focus();
  });
  const handlePopState = () => apply(parseKnowledgeSearchState(window.location.search, sectionIds), false);
  window.addEventListener("popstate", handlePopState);
  document.addEventListener("astro:before-swap", () => {
    window.removeEventListener("popstate", handlePopState);
    document.removeEventListener("click", handleDocumentClick);
  }, { once: true });
  apply(parseKnowledgeSearchState(window.location.search, sectionIds), false);
}

if (typeof document !== "undefined") {
  const start = () => initKnowledgeSearch(document.querySelector("[data-knowledge-search]"));
  document.addEventListener("astro:page-load", start);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
