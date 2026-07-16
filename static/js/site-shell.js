const root = document.documentElement;

function syncThemeIcons() {
  for (const icon of document.querySelectorAll("[data-theme-icon]")) {
    icon.className = root.dataset.theme === "dark" ? "ph ph-moon" : "ph ph-sun";
  }
}

for (const toggle of document.querySelectorAll("[data-theme-toggle]")) {
  toggle.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("bb-theme", next);
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
    syncThemeIcons();
  });
}
syncThemeIcons();

const menuButton = document.querySelector(".mobile-nav-toggle");
const menu = document.querySelector("#rail-menu");
menuButton?.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
  menu?.classList.toggle("is-open", !expanded);
});
