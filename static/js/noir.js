(() => {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
      }
    });
  }, { threshold: 0.2 });

  document.querySelectorAll(".reveal-text").forEach((el) => revealObserver.observe(el));

  const heroImg = document.querySelector(".hero-img");
  if (heroImg) {
    window.addEventListener("scroll", () => {
      const scrollPos = window.scrollY;
      heroImg.style.transform = `scale(${1 + scrollPos * 0.0005}) translateY(${scrollPos * 0.1}px)`;
    });
  }

  const dropdownToggles = document.querySelectorAll(".nav-dropdown-toggle");
  dropdownToggles.forEach((toggle) => {
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdown = toggle.closest(".nav-dropdown");
      const isActive = dropdown.classList.contains("active");

      document.querySelectorAll(".nav-dropdown").forEach((d) => d.classList.remove("active"));
      dropdown.classList.toggle("active", !isActive);
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".nav-dropdown").forEach((d) => d.classList.remove("active"));
  });

  const cusdisThread = document.getElementById("cusdis_thread");
  if (!cusdisThread) return;

  const host = (cusdisThread.getAttribute("data-host") || "").trim();
  let hostOrigin = "";

  try {
    hostOrigin = new URL(host).origin;
  } catch (e) {}

  const getIframe = () => {
    const lightIframe = cusdisThread.querySelector("iframe");
    if (lightIframe) return lightIframe;

    const shadowRoot = cusdisThread.shadowRoot;
    if (shadowRoot && typeof shadowRoot.querySelector === "function") {
      return shadowRoot.querySelector("iframe");
    }

    return null;
  };

  const MIN_IFRAME_HEIGHT = 450;

  const styleIframe = () => {
    const iframe = getIframe();
    if (!iframe) return;
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.setAttribute("scrolling", "no");

    // Always ensure minimum height (works for Shadow DOM too)
    const currentHeight = parseInt(iframe.style.height, 10) || 0;
    if (currentHeight < MIN_IFRAME_HEIGHT) {
      iframe.style.height = `${MIN_IFRAME_HEIGHT}px`;
    }

    if (cusdisDebugEnabled && !cusdisLoggedIframe) {
      cusdisLoggedIframe = true;
      try {
        // eslint-disable-next-line no-console
        console.log("[cusdis_debug] iframe_found", {
          src: iframe.getAttribute("src"),
          styleHeight: iframe.style.height,
          offsetHeight: iframe.offsetHeight,
          clientHeight: iframe.clientHeight,
        });
      } catch (e) {}
    }
  };

  const toNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return null;
  };

  const extractHeight = (data) => {
    const direct = toNumber(data);
    if (direct != null) return direct;

    if (typeof data === "string") {
      const trimmed = data.trim();

      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          return extractHeight(JSON.parse(trimmed));
        } catch (e) {}
      }

      const pxMatch = trimmed.match(/^(\d{2,5})(?:\s*px)?$/i);
      if (pxMatch) return Number(pxMatch[1]);

      const heightMatch = trimmed.match(/height\D*(\d{2,5})/i);
      if (heightMatch) return Number(heightMatch[1]);

      const suffixMatch = trimmed.match(/[:=]\s*(\d{2,5})\s*$/);
      if (suffixMatch) return Number(suffixMatch[1]);

      const anyMatch = trimmed.match(/\b(\d{2,5})\b/);
      if (anyMatch) return Number(anyMatch[1]);

      return null;
    }

    if (data && typeof data === "object") {
      for (const key of ["height", "iframeHeight", "frameHeight", "threadHeight", "contentHeight"]) {
        if (key in data) {
          const value = extractHeight(data[key]);
          if (value != null) return value;
        }
      }

      for (const key of ["data", "detail", "payload", "message"]) {
        if (key in data) {
          const value = extractHeight(data[key]);
          if (value != null) return value;
        }
      }

      for (const [key, value] of Object.entries(data)) {
        if (typeof key === "string" && key.toLowerCase().includes("height")) {
          const extracted = extractHeight(value);
          if (extracted != null) return extracted;
        }
      }
    }

    return null;
  };

  const applyHeight = (height) => {
    const iframe = getIframe();
    if (!iframe) return null;

    const clamped = Math.max(100, Math.min(10000, Math.floor(height)));
    // Increased extra padding to ensure Reply textarea is fully visible
    const extra = clamped < 400 ? 280 : clamped < 600 ? 220 : 160;
    const appliedHeight = Math.max(MIN_IFRAME_HEIGHT, clamped + extra);
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.setAttribute("scrolling", "no");
    iframe.style.height = `${appliedHeight}px`;
    return appliedHeight;
  };

  const cusdisDebugEnabled = (() => {
    try {
      if (typeof window === "undefined") return false;
      const url = new URL(window.location.href);
      if (url.searchParams.has("cusdis_debug")) return true;
    } catch (e) {}

    try {
      if (localStorage.getItem("cusdis_debug") === "1") return true;
    } catch (e) {}

    return false;
  })();

  let cusdisLoggedIframe = false;
  if (cusdisDebugEnabled) {
    try {
      // eslint-disable-next-line no-console
      console.log("[cusdis_debug] enabled", { host, hostOrigin });
    } catch (e) {}
  }

  styleIframe();

  const cusdisObserver = new MutationObserver(() => styleIframe());
  cusdisObserver.observe(cusdisThread, { childList: true, subtree: true });

  const start = Date.now();
  let iframeFound = false;
  const poll = setInterval(() => {
    styleIframe();
    const iframe = getIframe();
    if (iframe) {
      iframeFound = true;
    }
    // Keep polling for 30 seconds to handle Cusdis resetting height after load
    if (Date.now() - start > 30_000) {
      clearInterval(poll);
      if (cusdisDebugEnabled && !iframeFound) {
        try {
          // eslint-disable-next-line no-console
          console.log("[cusdis_debug] iframe_not_found");
        } catch (e) {}
      }
    }
  }, 500);

  window.addEventListener("message", (event) => {
    const iframe = getIframe();
    if (!iframe) return;

    const isFromIframe = event.source === iframe.contentWindow;
    const isFromHost = hostOrigin ? event.origin === hostOrigin : false;
    if (!isFromIframe && !isFromHost) return;

    const height = extractHeight(event.data);
    if (height == null) return;

    const appliedHeight = applyHeight(height);

    if (cusdisDebugEnabled) {
      try {
        // eslint-disable-next-line no-console
        console.log("[cusdis_resize]", { origin: event.origin, data: event.data, height, appliedHeight });
      } catch (e) {}
    }
  });
})();
