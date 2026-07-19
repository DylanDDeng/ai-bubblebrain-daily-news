// Preserve user-owned document state while Astro swaps server-rendered pages.
// The next document is always authored with the light-theme default, so copying
// the active theme before the swap prevents a light frame in dark mode.
document.addEventListener("astro:before-swap", (event) => {
  const theme = document.documentElement.dataset.theme;
  if (theme === "light" || theme === "dark") {
    event.newDocument.documentElement.dataset.theme = theme;
  }
});
