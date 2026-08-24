const setupVibeCodingTerms = () => {
  const root = document.querySelector("[data-vibe-coding-terms]");
  if (!root || root.dataset.filterMounted === "true") return;

  root.dataset.filterMounted = "true";
  const sections = Array.from(
    root.querySelectorAll(".vibe-term-category"),
  );
  const chips = Array.from(root.querySelectorAll(".vibe-category-nav a"));
  const ids = sections.map((section) => section.id);

  const apply = () => {
    const hash = decodeURIComponent(location.hash.slice(1));
    let target = ids[0];

    if (ids.includes(hash)) {
      target = hash;
    } else if (hash) {
      const owner = sections.find((section) => {
        try {
          return section.querySelector(`#${CSS.escape(hash)}`);
        } catch {
          return false;
        }
      });
      if (owner) target = owner.id;
    }

    for (const section of sections) section.hidden = section.id !== target;
    for (const chip of chips) {
      chip.classList.toggle(
        "is-active",
        chip.getAttribute("href") === `#${target}`,
      );
    }
  };

  window.__vibeTermsApply = apply;
  apply();
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      window.setTimeout(() => window.__vibeTermsApply?.(), 0);
    });
  }
};

setupVibeCodingTerms();
document.addEventListener("astro:page-load", setupVibeCodingTerms);
document.addEventListener("astro:after-swap", setupVibeCodingTerms);

if (window.__vibeTermsGlobalBound !== true) {
  window.__vibeTermsGlobalBound = true;
  const applyVibeTerms = () => {
    window.setTimeout(() => window.__vibeTermsApply?.(), 0);
  };
  window.addEventListener("hashchange", applyVibeTerms);
  window.addEventListener("popstate", applyVibeTerms);
}
