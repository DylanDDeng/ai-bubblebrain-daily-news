(() => {
  try {
    const saved = localStorage.getItem("bb-theme");
    document.documentElement.dataset.theme =
      saved === "dark" || saved === "light" ? saved : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
