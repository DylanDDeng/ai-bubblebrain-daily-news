(() => {
  const ROOT_PAGE_SIZE = 20;
  const REPLY_PAGE_SIZE = 10;

  const DEFAULT_I18N = {
    loading: "Loading...",
    empty: "No comments yet. Be the first.",
    loadMore: "Load more",
    reply: "Reply",
    cancel: "Cancel",
    delete: "Delete",
    expandReplies: "Show replies ({count})",
    collapseReplies: "Hide replies",
    loginToComment: "Sign in to comment",
    placeholder: "Write a comment...",
    send: "Send",
    unavailable: "Comments unavailable",
    loadFailed: "Failed to load",
    sendFailed: "Failed to send",
    deleteConfirm: "Delete this comment?",
    deleteFailed: "Failed to delete",
  };

  const I18N = (() => {
    const overrides = (() => {
      try {
        return window.SUPABASE_COMMENTS_I18N || null;
      } catch (err) {
        return null;
      }
    })();

    if (!overrides || typeof overrides !== "object") return DEFAULT_I18N;
    return { ...DEFAULT_I18N, ...overrides };
  })();

  function getSupabase() {
    try {
      return typeof supabaseClient !== "undefined" ? supabaseClient : null;
    } catch (err) {
      return null;
    }
  }

  function getUser() {
    try {
      return typeof currentUser !== "undefined" ? currentUser : null;
    } catch (err) {
      return null;
    }
  }

  function isAuthed() {
    return !!getUser()?.id;
  }

  function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function formatTime(value) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function createAvatar(profile, fallbackUserId) {
    const wrap = createElement("div", "supabase-comment__avatar");
    const name = (profile?.display_name || "").toString().trim();
    const avatarUrl = (profile?.avatar_url || "").toString().trim();
    const label = name || (fallbackUserId ? fallbackUserId.slice(0, 6) : "User");

    if (avatarUrl) {
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = label;
      img.loading = "lazy";
      wrap.appendChild(img);
      return wrap;
    }

    wrap.textContent = label.slice(0, 1).toUpperCase();
    return wrap;
  }

  function ensureMapEntry(map, key, factory) {
    if (map.has(key)) return map.get(key);
    const created = factory();
    map.set(key, created);
    return created;
  }

  async function fetchCommentsPage({ threadId, parentId = null, offset = 0, limit = ROOT_PAGE_SIZE }) {
    const client = getSupabase();
    if (!client || !threadId) return { data: [], count: 0, error: new Error("missing_client") };

    const base = client
      .from("comments")
      .select("id, thread_id, parent_id, user_id, content, created_at, profiles(display_name, avatar_url)", { count: "exact" })
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const query = parentId ? base.eq("parent_id", parentId) : base.is("parent_id", null);
    const { data, error, count } = await query;
    if (!error) return { data: Array.isArray(data) ? data : [], count: count || 0, error: null };

    const fallbackBase = client
      .from("comments")
      .select("id, thread_id, parent_id, user_id, content, created_at", { count: "exact" })
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    const fallbackQuery = parentId ? fallbackBase.eq("parent_id", parentId) : fallbackBase.is("parent_id", null);
    const fallback = await fallbackQuery;
    return {
      data: Array.isArray(fallback.data) ? fallback.data : [],
      count: fallback.count || 0,
      error: fallback.error || error,
    };
  }

  async function refreshReplyCounts(threadId) {
    const client = getSupabase();
    if (!client || !threadId) return new Map();

    try {
      const { data, error } = await client
        .from("comments")
        .select("parent_id")
        .eq("thread_id", threadId)
        .not("parent_id", "is", null);
      if (error || !Array.isArray(data)) return new Map();

      const map = new Map();
      data.forEach((row) => {
        const pid = row?.parent_id;
        if (!pid) return;
        map.set(pid, (map.get(pid) || 0) + 1);
      });
      return map;
    } catch (err) {
      return new Map();
    }
  }

  function init(container) {
    const threadId = (container.getAttribute("data-thread-id") || "").toString().trim();
    if (!threadId) return;

    const statusEl = container.querySelector("[data-comments-status]");
    const listEl = container.querySelector("[data-comments-list]");
    const moreBtn = container.querySelector("[data-comments-more]");
    const loginHint = container.querySelector("[data-comments-login-hint]");
    const form = container.querySelector("[data-comments-form]");
    const textArea = container.querySelector("[data-comments-text]");
    const submitBtn = container.querySelector("[data-comments-submit]");

    if (textArea && !textArea.getAttribute("placeholder")) {
      textArea.setAttribute("placeholder", I18N.placeholder);
    }

    const state = {
      threadId,
      root: [],
      rootCount: 0,
      rootOffset: 0,
      rootHasMore: false,
      loadingRoot: false,
      replyCounts: new Map(),
      expandedReplies: new Set(),
      replies: new Map(),
      activeReplyParentId: null,
      replyDraft: "",
    };

    function setStatus(text) {
      if (!statusEl) return;
      const msg = (text || "").toString().trim();
      statusEl.textContent = msg;
      statusEl.hidden = !msg;
    }

    function updateComposerAuthUI() {
      const authed = isAuthed();
      if (loginHint) loginHint.hidden = authed;
      if (form) form.hidden = !authed;
      if (submitBtn) submitBtn.disabled = !authed;
    }

    function canDelete(comment) {
      const userId = getUser()?.id;
      if (!userId || !comment) return false;
      if (comment.user_id !== userId) return false;
      const replyCount = state.replyCounts.get(comment.id) || 0;
      return replyCount === 0;
    }

    function render() {
      if (!listEl) return;

      updateComposerAuthUI();

      if (state.loadingRoot && state.root.length === 0) {
        setStatus(I18N.loading);
        return;
      }

      setStatus("");
      listEl.innerHTML = "";

      if (state.rootCount === 0) {
        listEl.appendChild(createElement("div", "supabase-comments__empty", I18N.empty));
        return;
      }

      const frag = document.createDocumentFragment();

      state.root.forEach((comment) => {
        const card = createElement("article", "supabase-comment");
        card.dataset.id = comment.id;

        const header = createElement("div", "supabase-comment__header");
        header.appendChild(createAvatar(comment.profiles, comment.user_id));

        const meta = createElement("div", "supabase-comment__meta");
        const metaTop = createElement("div", "supabase-comment__meta-top");
        const name =
          (comment.profiles?.display_name || "").toString().trim() ||
          (comment.user_id ? comment.user_id.slice(0, 6) : "User");
        metaTop.appendChild(createElement("span", "supabase-comment__name", name));
        metaTop.appendChild(createElement("span", "supabase-comment__time", formatTime(comment.created_at)));
        meta.appendChild(metaTop);
        meta.appendChild(createElement("div", "supabase-comment__content", comment.content || ""));
        header.appendChild(meta);
        card.appendChild(header);

        const actions = createElement("div", "supabase-comment__actions");
        const replyBtn = createElement("button", "supabase-comment__action", I18N.reply);
        replyBtn.type = "button";
        replyBtn.addEventListener("click", () => {
          if (!isAuthed()) {
            if (typeof signInWithGoogle === "function") signInWithGoogle();
            return;
          }
          state.activeReplyParentId = comment.id;
          state.replyDraft = "";
          state.expandedReplies.add(comment.id);
          void ensureRepliesLoaded(comment.id);
          render();
        });
        actions.appendChild(replyBtn);

        if (canDelete(comment)) {
          const delBtn = createElement("button", "supabase-comment__action supabase-comment__action--danger", I18N.delete);
          delBtn.type = "button";
          delBtn.addEventListener("click", () => void deleteComment(comment.id));
          actions.appendChild(delBtn);
        }

        const replyCount = state.replyCounts.get(comment.id) || 0;
        if (replyCount > 0 || state.expandedReplies.has(comment.id)) {
          const toggleBtn = createElement(
            "button",
            "supabase-comment__action supabase-comment__action--muted",
            state.expandedReplies.has(comment.id)
              ? I18N.collapseReplies
              : I18N.expandReplies.replace("{count}", String(replyCount))
          );
          toggleBtn.type = "button";
          toggleBtn.addEventListener("click", () => {
            if (state.expandedReplies.has(comment.id)) {
              state.expandedReplies.delete(comment.id);
              render();
              return;
            }
            state.expandedReplies.add(comment.id);
            void ensureRepliesLoaded(comment.id);
            render();
          });
          actions.appendChild(toggleBtn);
        }

        card.appendChild(actions);

        if (state.expandedReplies.has(comment.id)) {
          const repliesWrap = createElement("div", "supabase-comment__replies");
          const repliesState = ensureMapEntry(state.replies, comment.id, () => ({
            items: [],
            offset: 0,
            hasMore: false,
            loading: false,
          }));

          if (repliesState.loading && repliesState.items.length === 0) {
            repliesWrap.appendChild(createElement("div", "supabase-comment__replies-status", I18N.loading));
          } else {
            repliesState.items.forEach((reply) => {
              const replyEl = createElement("article", "supabase-comment supabase-comment--reply");

              const replyHeader = createElement("div", "supabase-comment__header");
              replyHeader.appendChild(createAvatar(reply.profiles, reply.user_id));

              const replyMeta = createElement("div", "supabase-comment__meta");
              const replyTop = createElement("div", "supabase-comment__meta-top");
              const replyName =
                (reply.profiles?.display_name || "").toString().trim() ||
                (reply.user_id ? reply.user_id.slice(0, 6) : "User");
              replyTop.appendChild(createElement("span", "supabase-comment__name", replyName));
              replyTop.appendChild(createElement("span", "supabase-comment__time", formatTime(reply.created_at)));
              replyMeta.appendChild(replyTop);
              replyMeta.appendChild(createElement("div", "supabase-comment__content", reply.content || ""));
              replyHeader.appendChild(replyMeta);
              replyEl.appendChild(replyHeader);

              const replyActions = createElement("div", "supabase-comment__actions");
              if (canDelete(reply)) {
                const delBtn = createElement(
                  "button",
                  "supabase-comment__action supabase-comment__action--danger",
                  I18N.delete
                );
                delBtn.type = "button";
                delBtn.addEventListener("click", () => void deleteComment(reply.id));
                replyActions.appendChild(delBtn);
              }
              replyEl.appendChild(replyActions);

              repliesWrap.appendChild(replyEl);
            });

            if (repliesState.hasMore) {
              const moreRepliesBtn = createElement("button", "supabase-comment__more", I18N.loadMore);
              moreRepliesBtn.type = "button";
              moreRepliesBtn.addEventListener("click", () => void loadMoreReplies(comment.id));
              repliesWrap.appendChild(moreRepliesBtn);
            }
          }

          if (state.activeReplyParentId === comment.id) {
            const replyForm = createElement("form", "supabase-comment__reply-form");
            const ta = document.createElement("textarea");
            ta.className = "supabase-comment__reply-textarea";
            ta.rows = 2;
            ta.placeholder = I18N.reply;
            ta.value = state.replyDraft;
            ta.addEventListener("input", () => {
              state.replyDraft = ta.value || "";
            });
            replyForm.appendChild(ta);

            const formActions = createElement("div", "supabase-comment__reply-actions");
            const cancelBtn = createElement("button", "supabase-comment__reply-cancel", I18N.cancel);
            cancelBtn.type = "button";
            cancelBtn.addEventListener("click", () => {
              state.activeReplyParentId = null;
              state.replyDraft = "";
              render();
            });
            const sendBtn = createElement("button", "supabase-comment__reply-send", I18N.send);
            sendBtn.type = "submit";
            formActions.appendChild(cancelBtn);
            formActions.appendChild(sendBtn);
            replyForm.appendChild(formActions);

            replyForm.addEventListener("submit", (e) => {
              e.preventDefault();
              void postReply(comment.id);
            });

            repliesWrap.appendChild(replyForm);
          }

          card.appendChild(repliesWrap);
        }

        frag.appendChild(card);
      });

      listEl.appendChild(frag);

      if (moreBtn) {
        moreBtn.hidden = !state.rootHasMore;
      }
    }

    async function ensureRootLoaded({ reset = false } = {}) {
      const client = getSupabase();
      if (!client) {
        setStatus(I18N.unavailable);
        return;
      }

      if (reset) {
        state.root = [];
        state.rootCount = 0;
        state.rootOffset = 0;
        state.rootHasMore = false;
        state.replyCounts = new Map();
        state.expandedReplies = new Set();
        state.replies = new Map();
        state.activeReplyParentId = null;
        state.replyDraft = "";
      }

      state.loadingRoot = true;
      render();

      state.replyCounts = await refreshReplyCounts(state.threadId);

      const page = await fetchCommentsPage({ threadId: state.threadId, parentId: null, offset: 0, limit: ROOT_PAGE_SIZE });
      state.loadingRoot = false;

      if (page.error) {
        setStatus(I18N.loadFailed);
        render();
        return;
      }

      state.root = page.data || [];
      state.rootCount = page.count || (state.root ? state.root.length : 0);
      state.rootOffset = state.root.length;
      state.rootHasMore = state.rootOffset < state.rootCount;
      render();
    }

    async function loadMoreRoot() {
      if (state.loadingRoot || !state.rootHasMore) return;
      state.loadingRoot = true;
      render();

      const page = await fetchCommentsPage({
        threadId: state.threadId,
        parentId: null,
        offset: state.rootOffset,
        limit: ROOT_PAGE_SIZE,
      });
      state.loadingRoot = false;

      if (!page.error) {
        state.root = state.root.concat(page.data || []);
        state.rootCount = page.count || state.rootCount;
        state.rootOffset = state.root.length;
        state.rootHasMore = state.rootOffset < state.rootCount;
      }

      render();
    }

    async function ensureRepliesLoaded(parentId) {
      const repliesState = ensureMapEntry(state.replies, parentId, () => ({
        items: [],
        offset: 0,
        hasMore: false,
        loading: false,
      }));

      if (repliesState.items.length || repliesState.loading) return;
      repliesState.loading = true;
      render();

      const page = await fetchCommentsPage({
        threadId: state.threadId,
        parentId,
        offset: 0,
        limit: REPLY_PAGE_SIZE,
      });
      repliesState.loading = false;

      if (!page.error) {
        repliesState.items = page.data || [];
        repliesState.offset = repliesState.items.length;
        repliesState.hasMore = repliesState.offset < (page.count || repliesState.offset);
      }

      render();
    }

    async function loadMoreReplies(parentId) {
      const repliesState = state.replies.get(parentId);
      if (!repliesState || repliesState.loading || !repliesState.hasMore) return;

      repliesState.loading = true;
      render();

      const page = await fetchCommentsPage({
        threadId: state.threadId,
        parentId,
        offset: repliesState.offset,
        limit: REPLY_PAGE_SIZE,
      });
      repliesState.loading = false;

      if (!page.error) {
        repliesState.items = repliesState.items.concat(page.data || []);
        repliesState.offset = repliesState.items.length;
        repliesState.hasMore = repliesState.offset < (page.count || repliesState.offset);
      }

      render();
    }

    async function postRoot() {
      const client = getSupabase();
      const user = getUser();
      if (!client) return;
      if (!user?.id) {
        if (typeof signInWithGoogle === "function") signInWithGoogle();
        return;
      }

      const content = (textArea?.value || "").toString().trim();
      if (!content) return;

      if (submitBtn) submitBtn.disabled = true;

      try {
        const { error } = await client.from("comments").insert({
          thread_id: state.threadId,
          parent_id: null,
          user_id: user.id,
          type: "question",
          content,
        });
        if (error) throw error;

        if (textArea) textArea.value = "";
        await ensureRootLoaded({ reset: true });
      } catch (err) {
        console.error("comment post failed:", err);
        setStatus(I18N.sendFailed);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    async function postReply(parentId) {
      const client = getSupabase();
      const user = getUser();
      if (!client) return;
      if (!user?.id) {
        if (typeof signInWithGoogle === "function") signInWithGoogle();
        return;
      }

      const content = (state.replyDraft || "").toString().trim();
      if (!content) return;

      try {
        const { error } = await client.from("comments").insert({
          thread_id: state.threadId,
          parent_id: parentId,
          user_id: user.id,
          type: "reply",
          content,
        });
        if (error) throw error;

        state.replyDraft = "";
        state.activeReplyParentId = null;
        state.replyCounts = await refreshReplyCounts(state.threadId);

        state.replies.delete(parentId);
        state.expandedReplies.add(parentId);
        await ensureRepliesLoaded(parentId);
        render();
      } catch (err) {
        console.error("reply post failed:", err);
        setStatus(I18N.sendFailed);
      }
    }

    async function deleteComment(commentId) {
      const client = getSupabase();
      const user = getUser();
      if (!client || !user?.id) return;

      const ok = window.confirm(I18N.deleteConfirm);
      if (!ok) return;

      try {
        const { error } = await client.from("comments").delete().eq("id", commentId).eq("user_id", user.id);
        if (error) throw error;

        await ensureRootLoaded({ reset: true });
      } catch (err) {
        console.error("delete failed:", err);
        setStatus(I18N.deleteFailed);
      }
    }

    if (moreBtn) {
      moreBtn.addEventListener("click", () => void loadMoreRoot());
    }

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        void postRoot();
      });
    }

    if (loginHint) {
      loginHint.addEventListener("click", () => {
        if (typeof signInWithGoogle === "function") signInWithGoogle();
      });
    }

    window.addEventListener("authStateChanged", () => {
      updateComposerAuthUI();
      render();
    });

    setStatus("");
    updateComposerAuthUI();
    render();
    void ensureRootLoaded();
  }

  document.querySelectorAll("[data-supabase-comments]").forEach((container) => init(container));
})();
