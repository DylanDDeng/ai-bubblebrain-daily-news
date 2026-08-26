const setupVibeCodingPatternDetails = () => {
  for (const root of document.querySelectorAll("[data-pick]")) {
    if (root.dataset.pickMounted === "true") continue;

    root.dataset.pickMounted = "true";
    for (const radio of root.querySelectorAll('input[type="radio"]')) {
      radio.addEventListener("change", () => {
        root.dataset.picked = radio.value;
        for (const note of root.querySelectorAll("[data-pick-note]")) {
          note.hidden = note.dataset.pickNote !== radio.value;
        }
        for (const option of root.querySelectorAll("[data-pick-option]")) {
          option.classList.toggle(
            "is-picked",
            option.dataset.pickOption === radio.value,
          );
        }
      });
    }
  }

  for (const button of document.querySelectorAll("[data-copy]")) {
    if (button.dataset.copyMounted === "true") continue;

    button.dataset.copyMounted = "true";
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy ?? "");
        const original = button.textContent;
        button.textContent = "已复制";
        window.setTimeout(() => {
          button.textContent = original;
        }, 1400);
      } catch {
        /* Clipboard access is unavailable in this browser context. */
      }
    });
  }
};

setupVibeCodingPatternDetails();
document.addEventListener("astro:page-load", setupVibeCodingPatternDetails);
