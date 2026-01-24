(() => {
  const initImageGenerator = (root) => {
    if (!root) return;

    const I18N = window.IMG_GEN_I18N || {};
    const MODEL = "gemini-3-pro-image-preview";
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const DEFAULT_IMAGE_SIZE = "1K";
    const HISTORY_LIMIT = 30;

    const keyInput = root.querySelector("#imggen-key");
    const saveKeyBtn = root.querySelector("#imggen-save-key");
    const clearKeyBtn = root.querySelector("#imggen-clear-key");
    const keyStatus = root.querySelector("#imggen-key-status");
    const keyWarning = root.querySelector("#imggen-key-warning");
    const promptInput = root.querySelector("#imggen-prompt");
    const ratioSelect = root.querySelector("#imggen-ratio");
    const sizeSelect = root.querySelector("#imggen-size");
    const generateBtn = root.querySelector("#imggen-generate");
    const statusEl = root.querySelector("#imggen-status");
    const resultsEl = root.querySelector("#imggen-results");
    const historyList = root.querySelector("#imggen-history-list");
    const historyEmpty = root.querySelector("#imggen-history-empty");
    const clearHistoryBtn = root.querySelector("#imggen-clear-history");
    const lockOverlay = root.querySelector("#imggen-lock-overlay");
    const guarded = root.querySelector("#imggen-guarded");
    const loginBtn = root.querySelector("#imggen-login-btn");

    let activeUserId = null;
    let apiKey = "";
    let isBusy = false;
    let imageSize = DEFAULT_IMAGE_SIZE;
    let dbPromise = null;

    const setLocked = (locked) => {
      root.classList.toggle("imggen-locked", locked);
      if (lockOverlay) lockOverlay.hidden = !locked;
      if (guarded) guarded.setAttribute("aria-hidden", locked ? "true" : "false");
    };

    setLocked(true);

    const readGlobalUser = () => {
      if (typeof currentUser !== "undefined" && currentUser) return currentUser;
      return null;
    };

    const applyAuth = (user) => {
      setLocked(!user);
      const nextId = user?.id || null;
      if (nextId !== activeUserId) {
        activeUserId = nextId;
        loadStoredKey();
        loadHistory();
      }
    };

    window.addEventListener("authStateChanged", (event) => {
      const user = event?.detail?.user || readGlobalUser();
      applyAuth(user);
    });

    const syncAuthState = async () => {
      try {
        const globalUser = readGlobalUser();
        if (globalUser) {
          applyAuth(globalUser);
          return;
        }
        if (typeof supabaseClient === "undefined") return;
        const sessionRes = await supabaseClient.auth.getSession();
        const user = sessionRes?.data?.session?.user || null;
        applyAuth(user);
      } catch (e) {}
    };

    const scheduleAuthSync = () => {
      syncAuthState();
      setTimeout(syncAuthState, 400);
      setTimeout(syncAuthState, 1200);
      setTimeout(syncAuthState, 2000);
    };

    document.addEventListener("DOMContentLoaded", () => {
      scheduleAuthSync();
    });

    window.addEventListener("pageshow", () => {
      scheduleAuthSync();
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleAuthSync();
    });

    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        if (typeof signInWithGoogle === "function") {
          signInWithGoogle();
        } else {
          window.location.href = "/login";
        }
      });
    }

    const keyStorageId = () => (activeUserId ? `gemini_api_key_${activeUserId}` : null);

    const updateKeyUI = () => {
      if (keyInput) keyInput.value = apiKey || "";
      if (keyStatus) {
        keyStatus.textContent = apiKey ? (I18N.apiSaved || "Saved") : "";
      }
      if (keyWarning) keyWarning.hidden = !!apiKey;
      updateGenerateState();
    };

    const loadStoredKey = () => {
      if (!activeUserId) {
        apiKey = "";
        updateKeyUI();
        return;
      }
      try {
        const storageId = keyStorageId();
        apiKey = storageId ? (localStorage.getItem(storageId) || "") : "";
      } catch (e) {
        apiKey = "";
      }
      updateKeyUI();
    };

    const saveKey = () => {
      if (!activeUserId || !keyInput) return;
      apiKey = (keyInput.value || "").trim();
      try {
        const storageId = keyStorageId();
        if (storageId && apiKey) localStorage.setItem(storageId, apiKey);
      } catch (e) {}
      updateKeyUI();
    };

    const clearKey = () => {
      if (!activeUserId) return;
      apiKey = "";
      try {
        const storageId = keyStorageId();
        if (storageId) localStorage.removeItem(storageId);
      } catch (e) {}
      updateKeyUI();
    };

    if (saveKeyBtn) saveKeyBtn.addEventListener("click", saveKey);
    if (clearKeyBtn) clearKeyBtn.addEventListener("click", clearKey);

    if (keyInput) {
      keyInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveKey();
        }
      });
    }

    if (sizeSelect) {
      imageSize = (sizeSelect.value || DEFAULT_IMAGE_SIZE).toUpperCase();
      sizeSelect.addEventListener("change", () => {
        imageSize = (sizeSelect.value || DEFAULT_IMAGE_SIZE).toUpperCase();
      });
    }

    const setStatus = (text, type = "") => {
      if (!statusEl) return;
      statusEl.textContent = text || "";
      statusEl.dataset.type = type || "";
    };

    const updateGenerateState = () => {
      if (!generateBtn) return;
      const prompt = (promptInput?.value || "").trim();
      const canGenerate = !!apiKey && !!prompt && !isBusy;
      generateBtn.disabled = !canGenerate;
    };

    if (promptInput) {
      promptInput.addEventListener("input", updateGenerateState);
    }

    const parseQueryPrompt = () => {
      try {
        const params = new URLSearchParams(window.location.search || "");
        const promptParam = params.get("prompt");
        if (promptParam && promptInput && !promptInput.value) {
          promptInput.value = promptParam;
        }
      } catch (e) {}
    };

    const openDb = () => {
      if (!("indexedDB" in window)) return Promise.resolve(null);
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open("imggen_history_v1", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          const store = db.createObjectStore("items", { keyPath: "id", autoIncrement: true });
          store.createIndex("byUser", "userId", { unique: false });
          store.createIndex("byUserTime", ["userId", "createdAt"], { unique: false });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return dbPromise;
    };

    const saveHistory = async (item) => {
      const db = await openDb();
      if (!db) return false;
      return new Promise((resolve) => {
        const tx = db.transaction("items", "readwrite");
        const store = tx.objectStore("items");
        store.add(item);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    };

    const loadHistory = async () => {
      if (!historyList || !historyEmpty) return;
      historyList.innerHTML = "";
      historyEmpty.hidden = true;
      if (!activeUserId) {
        historyEmpty.hidden = false;
        return;
      }

      const db = await openDb();
      if (!db) {
        historyEmpty.hidden = false;
        return;
      }

      const items = [];
      await new Promise((resolve) => {
        const tx = db.transaction("items", "readonly");
        const store = tx.objectStore("items");
        const index = store.index("byUserTime");
        const range = IDBKeyRange.bound([activeUserId, 0], [activeUserId, Number.MAX_SAFE_INTEGER]);
        const request = index.openCursor(range, "prev");
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor || items.length >= HISTORY_LIMIT) {
            resolve();
            return;
          }
          items.push(cursor.value);
          cursor.continue();
        };
        request.onerror = () => resolve();
      });

      if (items.length === 0) {
        historyEmpty.hidden = false;
        return;
      }

      items.forEach((item) => historyList.appendChild(renderCard(item, true)));
    };

    const clearHistory = async () => {
      if (!activeUserId) return;
      const db = await openDb();
      if (!db) return;
      await new Promise((resolve) => {
        const tx = db.transaction("items", "readwrite");
        const store = tx.objectStore("items");
        const index = store.index("byUser");
        const range = IDBKeyRange.only(activeUserId);
        const req = index.openCursor(range);
        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) {
            resolve();
            return;
          }
          store.delete(cursor.primaryKey);
          cursor.continue();
        };
        req.onerror = () => resolve();
      });
      loadHistory();
    };

    if (clearHistoryBtn) clearHistoryBtn.addEventListener("click", clearHistory);

    const base64ToBlob = (base64, mimeType) => {
      const bytes = atob(base64);
      const len = bytes.length;
      const buffer = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) {
        buffer[i] = bytes.charCodeAt(i);
      }
      return new Blob([buffer], { type: mimeType || "image/png" });
    };

    const downloadBlob = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    const renderCard = (item, isHistory = false) => {
      const card = document.createElement("div");
      card.className = "imggen-card";

      const img = document.createElement("img");
      if (item.blob instanceof Blob) {
        img.src = URL.createObjectURL(item.blob);
      } else if (item.dataUrl) {
        img.src = item.dataUrl;
      }
      img.alt = item.prompt || "image";

      const meta = document.createElement("div");
      meta.className = "imggen-card__meta";

      const prompt = document.createElement("div");
      prompt.className = "imggen-card__prompt";
      prompt.textContent = item.prompt || "";

      const info = document.createElement("div");
      info.className = "imggen-card__info";
      const sizeLabel = item.imageSize ? ` · ${item.imageSize}` : "";
      info.textContent = `${item.aspectRatio || "1:1"}${sizeLabel} · ${new Date(item.createdAt || Date.now()).toLocaleString()}`;

      const actions = document.createElement("div");
      actions.className = "imggen-card__actions";

      const downloadBtn = document.createElement("button");
      downloadBtn.className = "imggen-btn imggen-btn--small";
      downloadBtn.type = "button";
      downloadBtn.textContent = I18N.download || "Download";
      downloadBtn.addEventListener("click", () => {
        if (item.blob instanceof Blob) {
          downloadBlob(item.blob, item.filename || `image-${item.createdAt || Date.now()}.png`);
        }
      });

      const reuseBtn = document.createElement("button");
      reuseBtn.className = "imggen-btn imggen-btn--ghost imggen-btn--small";
      reuseBtn.type = "button";
      reuseBtn.textContent = I18N.reuse || "Reuse";
      reuseBtn.addEventListener("click", () => {
        if (promptInput) {
          promptInput.value = item.prompt || "";
          promptInput.focus();
          updateGenerateState();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });

      actions.appendChild(downloadBtn);
      actions.appendChild(reuseBtn);

      meta.appendChild(prompt);
      meta.appendChild(info);
      meta.appendChild(actions);

      card.appendChild(img);
      card.appendChild(meta);

      if (isHistory) {
        card.classList.add("is-history");
      }
      return card;
    };

    const appendResult = (item) => {
      if (!resultsEl) return;
      resultsEl.prepend(renderCard(item));
    };

    const generateImage = async () => {
      const prompt = (promptInput?.value || "").trim();
      if (!prompt) {
        setStatus(I18N.errorPrompt || "Please enter a prompt.", "error");
        return;
      }
      if (!apiKey) {
        setStatus(I18N.errorKey || "Please enter API key.", "error");
        if (keyWarning) keyWarning.hidden = false;
        return;
      }

      const aspectRatio = (ratioSelect?.value || "1:1").trim();
      const sizeValue = (imageSize || DEFAULT_IMAGE_SIZE).toUpperCase();
      const payload = {
        contents: [
          { role: "user", parts: [{ text: prompt }] }
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio,
            imageSize: sizeValue
          }
        }
      };

      isBusy = true;
      updateGenerateState();
      setStatus(I18N.generating || "Generating...", "loading");

      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || "Request failed");
        }

        const parts = data?.candidates?.[0]?.content?.parts || [];
        const images = parts
          .map((part) => part.inlineData || part.inline_data)
          .filter(Boolean);

        if (images.length === 0) {
          setStatus(I18N.resultsEmpty || "No images returned.", "error");
          return;
        }

        const createdAt = Date.now();
        for (const imgPart of images) {
          const mime = imgPart.mimeType || imgPart.mime_type || "image/png";
          const base64 = imgPart.data || "";
          if (!base64) continue;

          const blob = base64ToBlob(base64, mime);
          const ext = mime.split("/")[1] || "png";
          const item = {
            userId: activeUserId,
            prompt,
            aspectRatio,
            imageSize: sizeValue,
            createdAt,
            mimeType: mime,
            blob,
            filename: `gemini-${createdAt}.${ext}`
          };

          appendResult(item);
          await saveHistory(item);
        }

        loadHistory();
        setStatus("");
      } catch (err) {
        setStatus(I18N.errorFailed || "Generation failed.", "error");
      } finally {
        isBusy = false;
        updateGenerateState();
      }
    };

    if (generateBtn) generateBtn.addEventListener("click", generateImage);

    parseQueryPrompt();
    updateGenerateState();
  };

  const roots = Array.from(document.querySelectorAll("[data-imggen-root]"));
  if (roots.length === 0) return;
  roots.forEach((root) => initImageGenerator(root));
})();
