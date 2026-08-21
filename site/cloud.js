(() => {
  const CONFIG = window.WSCN_CLOUD_CONFIG || {};
  const PASSWORD_KEY = "wscn-cloud-workspace-password-v2";
  const MODE_KEY = "wscn-cloud-workspace-mode-v2";
  const LEGACY_LOCAL_STATE_KEY = "wscn-shared-workspace-v1";
  const LOCAL_STATE_PREFIX = "wscn-shared-workspace-v2:";

  let remoteVersion = 0;
  let lastRemoteUpdatedAt = "";
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
    return localStorage.getItem(PASSWORD_KEY) || "";
  }

  function setPassword(value) {
    if (value) localStorage.setItem(PASSWORD_KEY, value);
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

  function promptPassword(force = false) {
    if (!force) {
      const cached = getPassword();
      if (cached) return cached;
    }

    const value = window.prompt(
      "输入接入口令。\n输入 caitong 进入财通模式；输入 zhoubao 进入周报模式：",
      ""
    );

    if (value === null) return "";

    const password = value.trim();
    if (password) setPassword(password);
    return password;
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
      schemaVersion: 2,
      selections: {},
      edition: "",
      filters: {
        minLength: 10,
        blockedTerms: "",
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
    return (
      Object.keys(normalized.selections).length === 0 &&
      !normalized.edition &&
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
    setMode(mode);
    remoteVersion = Number(payload.version || 0);
    lastRemoteUpdatedAt = payload.updated_at || "";

    return {
      state: normalizeState(payload.state),
      version: remoteVersion,
      updatedAt: lastRemoteUpdatedAt,
      mode,
    };
  }

  async function loadWorkspace({ allowPrompt = true } = {}) {
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

    if (!password && allowPrompt) {
      password = promptPassword();
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
          window.alert("接入口令不正确，请重新输入。");
          const retryPassword = promptPassword(true);
          if (retryPassword) {
            return loadWorkspace({ allowPrompt: false });
          }
        }

        emitStatus("云端口令错误 · 当前使用本机", "error");
      } else if (error?.code === "cloud_timeout") {
        console.error(error);
        emitStatus("云端连接超时 · 当前使用本机", "error");
      } else {
        console.error(error);
        emitStatus("云端暂不可用 · 当前使用本机", "error");
      }

      return {
        cloud: false,
        state: preLocal,
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
        payload.mode === "zhoubao" ? "zhoubao" : mode;
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
      return await loadRemoteWithPassword(password);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function reconnect() {
    setPassword("");
    return loadWorkspace({ allowPrompt: true });
  }

  function getPollIntervalMs() {
    const value = Number(CONFIG.pollIntervalMs || 10000);
    return Number.isFinite(value) && value >= 3000 ? value : 10000;
  }

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
    reconnect,
    getPassword,
    setPassword,
    getMode,
    modeLabel,
    setStatusListener,
    getPollIntervalMs,
    getVersion: () => remoteVersion,
  };
})();
