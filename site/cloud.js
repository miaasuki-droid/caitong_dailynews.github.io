(() => {
  const CONFIG = window.WSCN_CLOUD_CONFIG || {};
  const PASSWORD_KEY = "wscn-cloud-workspace-password-v2";
  const LEGACY_PASSWORD_KEY = "wscn-cloud-workspace-password-v1";
  const MODE_KEY = "wscn-cloud-workspace-mode-v2";
  const LEGACY_LOCAL_STATE_KEY = "wscn-shared-workspace-v1";
  const LOCAL_STATE_PREFIX = "wscn-shared-workspace-v2:";

  let remoteVersion = 0;
  let lastRemoteUpdatedAt = "";
  // Password and mode are pinned in memory for the lifetime of this page.
  // This prevents another browser tab from silently switching this tab from
  // Caitong to Zhoubao (or the reverse) by changing shared localStorage.
  let sessionPassword = localStorage.getItem(PASSWORD_KEY) || "";
  let currentMode = localStorage.getItem(MODE_KEY) || "caitong";
  let statusListener = null;

  function configured() {
    const url = String(CONFIG.supabaseUrl || "");
    const key = String(CONFIG.publishableKey || "");
    return (
      /^https:\/\/.+\.supabase\.co\/?$/.test(url) &&
      !url.includes("YOUR_PROJECT_REF") &&
      key &&
      !key.includes("YOUR_SUPABASE_")
    );
  }

  function normalizeBaseUrl() {
    return String(CONFIG.supabaseUrl || "").replace(/\/+$/, "");
  }

  function headers() {
    const key = String(CONFIG.publishableKey || "");
    const result = {
      "Content-Type": "application/json",
      apikey: key,
    };

    if (key.startsWith("eyJ")) {
      result.Authorization = `Bearer ${key}`;
    }

    return result;
  }

  function emitStatus(text, kind = "neutral") {
    if (typeof statusListener === "function") {
      statusListener({ text, kind, mode: currentMode });
    }
  }

  function setStatusListener(listener) {
    statusListener = listener;
  }

  function getPassword() {
    return sessionPassword;
  }

  function setPassword(value) {
    sessionPassword = String(value || "");
    if (sessionPassword) localStorage.setItem(PASSWORD_KEY, sessionPassword);
    else localStorage.removeItem(PASSWORD_KEY);
  }

  function getMode() {
    return currentMode || "caitong";
  }

  function setMode(mode) {
    currentMode = mode === "zhoubao" ? "zhoubao" : "caitong";
    localStorage.setItem(MODE_KEY, currentMode);
  }

  function modeLabel(mode = getMode()) {
    return mode === "zhoubao" ? "周报" : "财通";
  }

  function localStateKey(mode = getMode()) {
    return `${LOCAL_STATE_PREFIX}${mode === "zhoubao" ? "zhoubao" : "caitong"}`;
  }

  let loginPromise = null;

  function migrateLegacyPasswordIfNeeded() {
    if (getPassword()) return getPassword();

    const legacy = String(localStorage.getItem(LEGACY_PASSWORD_KEY) || "").trim();
    if (!legacy) return "";

    setPassword(legacy);
    setMode("caitong");
    return legacy;
  }

  function ensureLoginOverlay() {
    let overlay = document.getElementById("wscnCloudLoginOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "wscnCloudLoginOverlay";
    overlay.className = "cloud-login-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="cloud-login-card" role="dialog" aria-modal="true" aria-labelledby="wscnCloudLoginTitle">
        <div class="cloud-login-head">
          <div>
            <span class="cloud-login-kicker">SHARED WORKSPACE</span>
            <h2 id="wscnCloudLoginTitle">进入工作区</h2>
          </div>
        </div>
        <form class="cloud-login-form">
          <label for="wscnCloudPasswordInput">接入口令</label>
          <input id="wscnCloudPasswordInput" class="cloud-login-input" type="password" autocomplete="current-password" placeholder="请输入口令" />
          <p class="cloud-login-error" aria-live="polite"></p>
          <button class="cloud-login-submit" type="submit">进入</button>
        </form>
      </section>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function requestPassword(force = false, errorMessage = "") {
    if (!force) {
      const cached = getPassword() || migrateLegacyPasswordIfNeeded();
      if (cached) return Promise.resolve(cached);
    }

    if (loginPromise) return loginPromise;

    const overlay = ensureLoginOverlay();
    const form = overlay.querySelector(".cloud-login-form");
    const input = overlay.querySelector(".cloud-login-input");
    const error = overlay.querySelector(".cloud-login-error");

    input.value = "";
    error.textContent = errorMessage;
    overlay.hidden = false;

    loginPromise = new Promise((resolve) => {
      const finish = (value) => {
        overlay.hidden = true;
        form.onsubmit = null;
        loginPromise = null;
        resolve(value);
      };

      form.onsubmit = (event) => {
        event.preventDefault();
        const password = input.value.trim();
        if (!password) {
          error.textContent = "请输入口令";
          input.focus();
          return;
        }
        setPassword(password);
        finish(password);
      };

      requestAnimationFrame(() => input.focus());
    });

    return loginPromise;
  }

  async function rpc(functionName, args) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(
        `${normalizeBaseUrl()}/rest/v1/rpc/${functionName}`,
        {
          method: "POST",
          headers: {
            ...headers(),
            Accept: "application/json",
          },
          body: JSON.stringify(args),
          cache: "no-store",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Cloud HTTP ${response.status}: ${body.slice(0, 200)}`);
      }

      return response.json();
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("cloud_timeout");
        timeoutError.code = "cloud_timeout";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function defaultState() {
    return {
      schemaVersion: 3,
      selections: {},
      edition: "",
      filters: {
        minLength: 10,
        blockedTerms: "",
        filterPacks: [],
        activeFilterPackIds: [],
      },
      reviewLayout: {
        domestic: [],
        foreign: [],
      },
    };
  }

  function normalizeState(value) {
    const base = defaultState();
    const input = value && typeof value === "object" ? value : {};

    base.selections =
      input.selections && typeof input.selections === "object"
        ? input.selections
        : {};

    base.edition =
      input.edition === "morning" || input.edition === "evening"
        ? input.edition
        : "";

    const minLength = Number(input.filters?.minLength);
    base.filters.minLength =
      Number.isFinite(minLength) && minLength >= 0
        ? Math.min(10000, Math.floor(minLength))
        : 10;
    base.filters.blockedTerms = String(input.filters?.blockedTerms || "");

    const seenPackIds = new Set();
    base.filters.filterPacks = Array.isArray(input.filters?.filterPacks)
      ? input.filters.filterPacks
          .map((pack, index) => {
            if (!pack || typeof pack !== "object") return null;
            const id = String(pack.id || `pack-${index + 1}`).trim();
            const name = String(pack.name || "").trim();
            const terms = String(pack.terms || "");
            if (!id || !name || seenPackIds.has(id)) return null;
            seenPackIds.add(id);
            return { id, name: name.slice(0, 40), terms };
          })
          .filter(Boolean)
      : [];

    const validPackIds = new Set(base.filters.filterPacks.map((pack) => pack.id));
    base.filters.activeFilterPackIds = Array.isArray(input.filters?.activeFilterPackIds)
      ? [...new Set(input.filters.activeFilterPackIds.map(String))].filter((id) =>
          validPackIds.has(id)
        )
      : [];

    if (
      input.reviewLayout &&
      Array.isArray(input.reviewLayout.domestic) &&
      Array.isArray(input.reviewLayout.foreign)
    ) {
      base.reviewLayout = input.reviewLayout;
    }

    return base;
  }

  function loadLocal(mode = getMode()) {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(localStateKey(mode)) || "null"
      );
      return normalizeState(parsed);
    } catch (_) {
      return defaultState();
    }
  }

  function saveLocal(state, mode = getMode()) {
    const normalized = normalizeState(state);
    localStorage.setItem(localStateKey(mode), JSON.stringify(normalized));
    return normalized;
  }

  function findLatestLegacyDate(prefix) {
    const dates = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || "";
      if (!key.startsWith(prefix)) continue;

      const date = key.slice(prefix.length);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date);
    }

    dates.sort();
    return dates.at(-1) || "";
  }

  function migrateLegacyLocalIfNeeded(mode = getMode()) {
    if (localStorage.getItem(localStateKey(mode))) {
      return loadLocal(mode);
    }

    if (mode === "zhoubao") {
      return saveLocal(defaultState(), mode);
    }

    const migrated = defaultState();

    // v4.1 single shared workspace -> caitong workspace.
    try {
      const oldShared = JSON.parse(
        localStorage.getItem(LEGACY_LOCAL_STATE_KEY) || "null"
      );
      if (oldShared) {
        return saveLocal(normalizeState(oldShared), "caitong");
      }
    } catch (_) {}

    // v3.x date-based local state.
    const legacyDate = findLatestLegacyDate("wscn-report-selections:");

    if (legacyDate) {
      try {
        migrated.selections = JSON.parse(
          localStorage.getItem(`wscn-report-selections:${legacyDate}`) || "{}"
        );
      } catch (_) {}

      const edition =
        localStorage.getItem(`wscn-report-edition:${legacyDate}`) || "";

      if (edition === "morning" || edition === "evening") {
        migrated.edition = edition;
      }

      try {
        const layout = JSON.parse(
          localStorage.getItem(`wscn-review-layout:${legacyDate}`) || "null"
        );
        if (
          layout &&
          Array.isArray(layout.domestic) &&
          Array.isArray(layout.foreign)
        ) {
          migrated.reviewLayout = layout;
        }
      } catch (_) {}
    }

    // v4.0 temporary local account structure.
    if (!legacyDate) {
      try {
        const selections = JSON.parse(
          localStorage.getItem("wscn-account:%E9%BB%98%E8%AE%A4:selections") ||
            "null"
        );
        if (selections) migrated.selections = selections;
      } catch (_) {}

      const edition =
        localStorage.getItem("wscn-account:%E9%BB%98%E8%AE%A4:edition") || "";

      if (edition === "morning" || edition === "evening") {
        migrated.edition = edition;
      }

      try {
        const layout = JSON.parse(
          localStorage.getItem(
            "wscn-account:%E9%BB%98%E8%AE%A4:review-layout"
          ) || "null"
        );
        if (
          layout &&
          Array.isArray(layout.domestic) &&
          Array.isArray(layout.foreign)
        ) {
          migrated.reviewLayout = layout;
        }
      } catch (_) {}
    }

    return saveLocal(migrated, "caitong");
  }

  function isMeaningfullyEmpty(state) {
    const normalized = normalizeState(state);
    const filtersAreDefault =
      normalized.filters.minLength === 10 &&
      !normalized.filters.blockedTerms.trim() &&
      normalized.filters.filterPacks.length === 0 &&
      normalized.filters.activeFilterPackIds.length === 0;

    return (
      Object.keys(normalized.selections).length === 0 &&
      !normalized.edition &&
      filtersAreDefault &&
      normalized.reviewLayout.domestic.length === 0 &&
      normalized.reviewLayout.foreign.length === 0
    );
  }

  async function loadRemoteWithPassword(password) {
    const payload = await rpc("load_shared_workspace", {
      p_password: password,
    });

    if (!payload?.ok) {
      if (payload?.error === "invalid_password") {
        const error = new Error("invalid_password");
        error.code = "invalid_password";
        throw error;
      }
      throw new Error(payload?.error || "cloud_load_failed");
    }

    const mode = payload.mode === "zhoubao" ? "zhoubao" : "caitong";
    remoteVersion = Number(payload.version || 0);
    lastRemoteUpdatedAt = payload.updated_at || "";

    return {
      state: normalizeState(payload.state),
      version: remoteVersion,
      updatedAt: lastRemoteUpdatedAt,
      mode,
    };
  }

  async function loadWorkspace({ allowPrompt = true, freshLogin = false } = {}) {
    const preMode = getMode();
    const preLocal = migrateLegacyLocalIfNeeded(preMode);

    if (!configured()) {
      emitStatus("云端未配置 · 当前使用本机", "warning");
      return {
        cloud: false,
        state: preLocal,
        version: 0,
        updatedAt: "",
        mode: preMode,
      };
    }

    let password = getPassword();
    const hadCachedPassword = Boolean(password);
    let enteredNow = Boolean(freshLogin);

    if (!password && allowPrompt) {
      password = await requestPassword();
      enteredNow = Boolean(password);
    }

    if (!password) {
      emitStatus("未连接云端 · 当前使用本机", "warning");
      return {
        cloud: false,
        state: preLocal,
        version: 0,
        updatedAt: "",
        mode: preMode,
      };
    }

    try {
      emitStatus("正在读取云端…", "loading");

      const remote = await loadRemoteWithPassword(password);

      // A new login may resolve to either workspace. Once resolved, this page
      // remains pinned to that mode until the user explicitly logs out.
      if (enteredNow) {
        setMode(remote.mode);
      } else if (remote.mode !== preMode) {
        const mismatch = new Error("workspace_mode_mismatch");
        mismatch.code = "workspace_mode_mismatch";
        throw mismatch;
      }

      const local = migrateLegacyLocalIfNeeded(remote.mode);

      // Only migrate an existing local caitong workspace into an empty caitong cloud.
      if (
        remote.mode === "caitong" &&
        isMeaningfullyEmpty(remote.state) &&
        !isMeaningfullyEmpty(local)
      ) {
        const saved = await saveWorkspace(local, {
          password,
          mode: remote.mode,
        });
        emitStatus(`${modeLabel(remote.mode)}工作区已同步`, "success");
        return saved;
      }

      saveLocal(remote.state, remote.mode);
      emitStatus(`${modeLabel(remote.mode)}工作区已同步`, "success");

      return {
        cloud: true,
        state: remote.state,
        version: remote.version,
        updatedAt: remote.updatedAt,
        mode: remote.mode,
      };
    } catch (error) {
      if (error?.code === "invalid_password") {
        setPassword("");

        if (allowPrompt) {
          const retryPassword = await requestPassword(
            true,
            "口令不正确，请重新输入"
          );
          if (retryPassword) {
            return loadWorkspace({ allowPrompt: false, freshLogin: true });
          }
        }

        emitStatus("云端口令错误 · 当前使用本机", "error");
      } else if (error?.code === "workspace_mode_mismatch") {
        console.error(error);
        emitStatus("工作区已锁定，请退出后重新进入", "error");
      } else if (error?.code === "cloud_timeout") {
        console.error(error);
        emitStatus(
          hadCachedPassword ? "云端连接超时 · 当前使用本机" : "云端连接超时 · 请稍后重新进入",
          "error"
        );
      } else {
        console.error(error);
        emitStatus(
          hadCachedPassword ? "云端暂不可用 · 当前使用本机" : "云端暂不可用 · 请稍后重新进入",
          "error"
        );
      }

      // A freshly entered password has not yet been mapped to a workspace by Supabase.
      // Do not expose the previously used workspace's local cache as a fallback.
      if (!hadCachedPassword) setPassword("");
      const safeFallback = hadCachedPassword ? preLocal : defaultState();

      return {
        cloud: false,
        state: safeFallback,
        version: 0,
        updatedAt: "",
        mode: preMode,
      };
    }
  }

  async function saveWorkspace(state, options = {}) {
    const mode = options.mode || getMode();
    const normalized = saveLocal(state, mode);

    if (!configured()) {
      emitStatus("已保存本机 · 云端未配置", "warning");
      return {
        cloud: false,
        state: normalized,
        version: remoteVersion,
        updatedAt: lastRemoteUpdatedAt,
        mode,
      };
    }

    const password = options.password || getPassword();

    if (!password) {
      emitStatus("已保存本机 · 未连接云端", "warning");
      return {
        cloud: false,
        state: normalized,
        version: remoteVersion,
        updatedAt: lastRemoteUpdatedAt,
        mode,
      };
    }

    try {
      emitStatus("正在保存云端…", "loading");

      const payload = await rpc("save_shared_workspace", {
        p_password: password,
        p_state: normalized,
      });

      if (!payload?.ok) {
        if (payload?.error === "invalid_password") {
          setPassword("");
          const error = new Error("invalid_password");
          error.code = "invalid_password";
          throw error;
        }
        throw new Error(payload?.error || "cloud_save_failed");
      }

      const returnedMode =
        payload.mode === "zhoubao" ? "zhoubao" : "caitong";

      // A logged-in session is pinned to one workspace. Never switch modes as a side effect of save.
      if (returnedMode !== mode) {
        const mismatch = new Error("workspace_mode_mismatch");
        mismatch.code = "workspace_mode_mismatch";
        throw mismatch;
      }

      setMode(returnedMode);
      remoteVersion = Number(payload.version || remoteVersion + 1);
      lastRemoteUpdatedAt = payload.updated_at || "";

      const returnedState = normalizeState(payload.state || normalized);
      saveLocal(returnedState, returnedMode);
      emitStatus(`${modeLabel(returnedMode)}工作区已同步`, "success");

      return {
        cloud: true,
        state: returnedState,
        version: remoteVersion,
        updatedAt: lastRemoteUpdatedAt,
        mode: returnedMode,
      };
    } catch (error) {
      console.error(error);

      if (error?.code === "invalid_password") {
        emitStatus("口令失效 · 已保存本机", "error");
      } else if (error?.code === "cloud_timeout") {
        emitStatus("云端保存超时 · 已保存本机", "error");
      } else {
        emitStatus("云端保存失败 · 已保存本机", "error");
      }

      return {
        cloud: false,
        state: normalized,
        version: remoteVersion,
        updatedAt: lastRemoteUpdatedAt,
        mode,
      };
    }
  }

  async function refreshRemoteIfNewer() {
    if (!configured()) return null;

    const password = getPassword();
    if (!password) return null;

    try {
      const remote = await loadRemoteWithPassword(password);
      if (remote.mode !== getMode()) {
        emitStatus("工作区已锁定，请退出后重新进入", "error");
        return null;
      }
      return remote;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function logout() {
    // Fully terminate the current workspace session.
    // The legacy password must also be removed; otherwise a page reload can
    // silently migrate it back and immediately log the user into Caitong.
    sessionPassword = "";
    localStorage.removeItem(PASSWORD_KEY);
    localStorage.removeItem(LEGACY_PASSWORD_KEY);
    localStorage.removeItem(MODE_KEY);
    currentMode = "caitong";
    remoteVersion = 0;
    lastRemoteUpdatedAt = "";
    loginPromise = null;
    emitStatus("已退出", "neutral");
  }

  function getPollIntervalMs() {
    const value = Number(CONFIG.pollIntervalMs || 10000);
    return Number.isFinite(value) && value >= 3000 ? value : 10000;
  }

  migrateLegacyPasswordIfNeeded();

  window.WSCNCloud = {
    configured,
    defaultState,
    normalizeState,
    loadLocal,
    saveLocal,
    migrateLegacyLocalIfNeeded,
    loadWorkspace,
    saveWorkspace,
    refreshRemoteIfNewer,
    logout,
    getPassword,
    setPassword,
    migrateLegacyPasswordIfNeeded,
    getMode,
    modeLabel,
    setStatusListener,
    getPollIntervalMs,
    getVersion: () => remoteVersion,
  };
})();
