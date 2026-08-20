(() => {
  const CONFIG = window.WSCN_CLOUD_CONFIG || {};
  const PASSWORD_KEY = "wscn-cloud-workspace-password-v1";
  const LOCAL_STATE_KEY = "wscn-shared-workspace-v1";

  let remoteVersion = 0;
  let lastRemoteUpdatedAt = "";
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

    // legacy anon keys are JWTs; publishable sb_publishable_* keys are not.
    if (key.startsWith("eyJ")) {
      result.Authorization = `Bearer ${key}`;
    }

    return result;
  }

  function emitStatus(text, kind = "neutral") {
    if (typeof statusListener === "function") {
      statusListener({ text, kind });
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

  function promptPassword(force = false) {
    if (!force) {
      const cached = getPassword();
      if (cached) return cached;
    }

    const value = window.prompt(
      "输入共享工作区密码。\n所有手机和电脑使用同一个密码即可共享进度：",
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
      schemaVersion: 1,
      selections: {},
      edition: "",
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

    if (
      input.reviewLayout &&
      Array.isArray(input.reviewLayout.domestic) &&
      Array.isArray(input.reviewLayout.foreign)
    ) {
      base.reviewLayout = input.reviewLayout;
    }

    return base;
  }

  function loadLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY) || "null");
      return normalizeState(parsed);
    } catch (_) {
      return defaultState();
    }
  }

  function saveLocal(state) {
    const normalized = normalizeState(state);
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(normalized));
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

  function migrateLegacyLocalIfNeeded() {
    const existing = localStorage.getItem(LOCAL_STATE_KEY);
    if (existing) return loadLocal();

    const migrated = defaultState();

    // v3.x: date-based keys
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

    // v4.0 default local account, in case it was ever partially tested.
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

    return saveLocal(migrated);
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

    remoteVersion = Number(payload.version || 0);
    lastRemoteUpdatedAt = payload.updated_at || "";

    return {
      state: normalizeState(payload.state),
      version: remoteVersion,
      updatedAt: lastRemoteUpdatedAt,
    };
  }

  async function loadWorkspace({ allowPrompt = true } = {}) {
    const local = migrateLegacyLocalIfNeeded();

    if (!configured()) {
      emitStatus("云端未配置 · 当前使用本机", "warning");
      return {
        cloud: false,
        state: local,
        version: 0,
        updatedAt: "",
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
        state: local,
        version: 0,
        updatedAt: "",
      };
    }

    try {
      emitStatus("正在读取云端…", "loading");

      const remote = await loadRemoteWithPassword(password);

      // 第一次启用云端时，如果云端还是空白、旧浏览器已有进度，
      // 自动把旧进度上传，避免升级时丢失。
      if (isMeaningfullyEmpty(remote.state) && !isMeaningfullyEmpty(local)) {
        const saved = await saveWorkspace(local, {
          password,
          skipLocal: false,
        });
        emitStatus("旧进度已迁移到云端", "success");
        return saved;
      }

      saveLocal(remote.state);
      emitStatus("云端已同步", "success");

      return {
        cloud: true,
        state: remote.state,
        version: remote.version,
        updatedAt: remote.updatedAt,
      };
    } catch (error) {
      if (error?.code === "invalid_password") {
        setPassword("");

        if (allowPrompt) {
          window.alert("工作区密码不正确，请重新输入。");
          const retryPassword = promptPassword(true);

          if (retryPassword) {
            return loadWorkspace({ allowPrompt: false });
          }
        }

        emitStatus("云端密码错误 · 当前使用本机", "error");
      } else if (error?.code === "cloud_timeout") {
        console.error(error);
        emitStatus("云端连接超时 · 当前使用本机", "error");
      } else {
        console.error(error);
        emitStatus("云端暂不可用 · 当前使用本机", "error");
      }

      return {
        cloud: false,
        state: local,
        version: 0,
        updatedAt: "",
      };
    }
  }

  async function saveWorkspace(state, options = {}) {
    const normalized = saveLocal(state);

    if (!configured()) {
      emitStatus("已保存本机 · 云端未配置", "warning");
      return {
        cloud: false,
        state: normalized,
        version: remoteVersion,
        updatedAt: lastRemoteUpdatedAt,
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

      remoteVersion = Number(payload.version || remoteVersion + 1);
      lastRemoteUpdatedAt = payload.updated_at || "";

      emitStatus("云端已同步", "success");

      return {
        cloud: true,
        state: normalizeState(payload.state || normalized),
        version: remoteVersion,
        updatedAt: lastRemoteUpdatedAt,
      };
    } catch (error) {
      console.error(error);

      if (error?.code === "invalid_password") {
        emitStatus("密码失效 · 已保存本机", "error");
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
      };
    }
  }

  async function refreshRemoteIfNewer() {
    if (!configured()) return null;

    const password = getPassword();
    if (!password) return null;

    try {
      const remote = await loadRemoteWithPassword(password);
      return remote;
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
    setStatusListener,
    getPollIntervalMs,
    getVersion: () => remoteVersion,
  };
})();
