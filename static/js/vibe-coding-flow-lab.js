const setupConceptFlowLabs = () => {
  for (const root of document.querySelectorAll("[data-concept-flow-lab]")) {
    if (root.dataset.flowLabMounted === "true") continue;
    root.dataset.flowLabMounted = "true";

    const buttons = Array.from(root.querySelectorAll("[data-flow-step]"));
    const items = Array.from(root.querySelectorAll("[data-flow-step-item]"));
    const statuses = Array.from(
      root.querySelectorAll("[data-flow-panel-status]"),
    );
    const panels = root.querySelector(".concept-process-panels");
    const current = root.querySelector("[data-flow-current]");
    const title = root.querySelector("[data-flow-title]");
    const detail = root.querySelector("[data-flow-detail]");
    const previous = root.querySelector("[data-flow-previous]");
    const next = root.querySelector("[data-flow-next]");
    const demoButtons = Array.from(
      root.querySelectorAll("[data-flow-demo-button]"),
    );
    const demoOutputs = Array.from(
      root.querySelectorAll("[data-flow-demo-output]"),
    );
    const editorFields = Array.from(
      root.querySelectorAll("[data-flow-editor]"),
    );
    const previewFields = Array.from(
      root.querySelectorAll("[data-flow-preview]"),
    );
    const styleEditorFields = Array.from(
      root.querySelectorAll("[data-flow-style-editor]"),
    );
    const styleValueFields = Array.from(
      root.querySelectorAll("[data-flow-style-value]"),
    );
    const browserPreview = root.querySelector("[data-flow-browser-preview]");
    let activeStep = 0;
    let demoClicks = 0;
    let previewUpdateTimer;

    const signalPreviewUpdate = () => {
      if (!browserPreview) return;
      browserPreview.dataset.previewUpdated = "true";
      window.clearTimeout(previewUpdateTimer);
      previewUpdateTimer = window.setTimeout(() => {
        browserPreview.dataset.previewUpdated = "false";
      }, 420);
    };

    const update = (index) => {
      const button = buttons[index];
      if (!button) return;

      activeStep = index;
      const isFinished = index === buttons.length - 1;
      root.dataset.activeStep = String(index);
      root.dataset.complete = isFinished ? "true" : "false";
      root.style.setProperty(
        "--flow-progress",
        `${buttons.length > 1 ? (index / (buttons.length - 1)) * 100 : 100}%`,
      );

      for (const [stepIndex, stepButton] of buttons.entries()) {
        const state = isFinished
          ? "complete"
          : stepIndex === index
            ? "active"
            : stepIndex < index
              ? "complete"
              : "idle";
        stepButton.setAttribute(
          "aria-pressed",
          !isFinished && stepIndex === index ? "true" : "false",
        );
        items[stepIndex]?.setAttribute("data-state", state);
        if (statuses[stepIndex]) {
          statuses[stepIndex].textContent =
            state === "active"
              ? "当前步骤"
              : state === "complete"
                ? "已经完成"
                : "等待进入";
        }
      }

      if (current) current.textContent = String(index + 1);
      if (title) title.textContent = button.dataset.stepLabel ?? "";
      if (detail) detail.textContent = button.dataset.stepDetail ?? "";
      if (previous) previous.disabled = index === 0;
      if (next) next.disabled = index === buttons.length - 1;
      if (panels && window.matchMedia("(max-width: 900px)").matches) {
        const activeItem = items[index];
        if (activeItem) {
          panels.scrollTo({
            left: Math.max(0, activeItem.offsetLeft - 16),
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
          });
        }
      }

      for (const demoButton of demoButtons) demoButton.disabled = index < 2;
      for (const output of demoOutputs) {
        output.textContent =
          index < 2
            ? "等待 JavaScript"
            : demoClicks === 0
              ? "可以点击了"
              : `已响应 ${demoClicks} 次`;
      }
    };

    for (const button of buttons) {
      button.addEventListener("click", () =>
        update(Number(button.dataset.stepIndex ?? 0)),
      );
    }
    for (const [itemIndex, item] of items.entries()) {
      item.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest("button, input, a, select, textarea")) return;
        update(itemIndex);
      });
    }

    previous?.addEventListener("click", () =>
      update(Math.max(0, activeStep - 1)),
    );
    next?.addEventListener("click", () =>
      update(Math.min(buttons.length - 1, activeStep + 1)),
    );
    for (const editorField of editorFields) {
      editorField.addEventListener("input", () => {
        const fieldName = editorField.dataset.flowEditor;
        for (const previewField of previewFields) {
          if (previewField.dataset.flowPreview === fieldName) {
            previewField.textContent = editorField.value;
          }
        }
        signalPreviewUpdate();
      });
    }
    for (const styleEditorField of styleEditorFields) {
      const applyStyleValue = () => {
        if (!browserPreview) return;
        const propertyName = styleEditorField.dataset.flowStyleEditor;
        if (!propertyName || styleEditorField.value === "") return;
        const unit = styleEditorField.dataset.flowStyleUnit ?? "";
        const propertyValue =
          unit === "px"
            ? `clamp(${styleEditorField.min || 0}px, ${styleEditorField.value}px, ${styleEditorField.max || 999}px)`
            : styleEditorField.value;
        browserPreview.style.setProperty(propertyName, propertyValue);
        for (const styleValueField of styleValueFields) {
          if (styleValueField.dataset.flowStyleValue === propertyName) {
            styleValueField.textContent = styleEditorField.value.toUpperCase();
          }
        }
        signalPreviewUpdate();
      };
      styleEditorField.addEventListener("input", applyStyleValue);
      styleEditorField.addEventListener("change", () => {
        if (styleEditorField.type === "number") {
          const minimum = Number(styleEditorField.min);
          const maximum = Number(styleEditorField.max);
          styleEditorField.value = String(
            Math.min(maximum, Math.max(minimum, Number(styleEditorField.value))),
          );
        }
        applyStyleValue();
      });
    }
    for (const demoButton of demoButtons) {
      demoButton.addEventListener("click", (event) => {
        event.stopPropagation();
        demoClicks += 1;
        if (demoButton.hasAttribute("data-flow-finish")) {
          update(buttons.length - 1);
        }
        for (const output of demoOutputs)
          output.textContent = `已响应 ${demoClicks} 次`;
      });
    }

    update(0);
  }
};

setupConceptFlowLabs();
document.addEventListener("astro:page-load", setupConceptFlowLabs);
