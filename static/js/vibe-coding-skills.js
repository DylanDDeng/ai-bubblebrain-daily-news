const setupVibeCodingSkills = () => {
  const root = document.querySelector("[data-vibe-coding-skills]");
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
    if (!target) return;

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

  window.__vibeSkillsApply = apply;
  apply();
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      window.setTimeout(() => window.__vibeSkillsApply?.(), 0);
    });
  }
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const setupInstallCopy = () => {
  document.querySelectorAll("[data-copy-install]").forEach((button) => {
    if (button.dataset.copyMounted === "true") return;
    button.dataset.copyMounted = "true";
    button.addEventListener("click", async () => {
      const code = button
        .closest(".skill-install-box")
        ?.querySelector("code");
      if (!code || !(await copyText(code.textContent.trim()))) return;
      const original = button.textContent;
      button.textContent = "已复制";
      button.classList.add("is-copied");
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("is-copied");
      }, 1600);
    });
  });
};

setupVibeCodingSkills();
setupInstallCopy();
document.addEventListener("astro:page-load", () => {
  setupVibeCodingSkills();
  setupInstallCopy();
});
document.addEventListener("astro:after-swap", () => {
  setupVibeCodingSkills();
  setupInstallCopy();
});

if (window.__vibeSkillsGlobalBound !== true) {
  window.__vibeSkillsGlobalBound = true;
  const applyVibeSkills = () => {
    window.setTimeout(() => window.__vibeSkillsApply?.(), 0);
  };
  window.addEventListener("hashchange", applyVibeSkills);
  window.addEventListener("popstate", applyVibeSkills);
}
