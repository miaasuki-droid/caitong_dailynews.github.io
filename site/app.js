const state = {
  data: null,
  query: "",
  selections: {},
  edition: "",
  filters: {
    minLength: 10,
    blockedTerms: "",
    filterPacks: [],
    activeFilterPackIds: [],
  },
  editingFilterPackId: "",
  openFilterPackMenuId: "",
  newsView: "filtered",
  reviewLayout: { domestic: [], foreign: [] },
  selectedNavUid: null,
  cloudVersion: 0,
  applyingRemote: false,
  workspaceMode: "caitong",
  historyWindowHours: 12,
  historyLoadingMore: false,
};

const EDITION_OVERRIDE_KEY = "wscn-edition-override-v1";
const HISTORY_WINDOW_STEP_HOURS = 12;

const els = {
  timeline: document.getElementById("timeline"),
  emptyState: document.getElementById("emptyState"),
  errorState: document.getElementById("errorState"),
  errorText: document.getElementById("errorText"),
  statusText: document.getElementById("statusText"),
  updatedText: document.getElementById("updatedText"),
  searchInput: document.getElementById("searchInput"),
  selectedCount: document.getElementById("selectedCount"),
  selectedBreakdown: document.getElementById("selectedBreakdown"),
  selectionWorkbench: document.getElementById("selectionWorkbench"),
  selectionDrawerToggle: document.getElementById("selectionDrawerToggle"),
  drawerSummary: document.getElementById("drawerSummary"),
  morningButton: document.getElementById("morningButton"),
  eveningButton: document.getElementById("eveningButton"),
  clearSelectionButton: document.getElementById("clearSelectionButton"),
  clearManualButton: document.getElementById("clearManualButton"),
  generateReportButton: document.getElementById("generateReportButton"),
  selectedNavigator: document.getElementById("selectedNavigator"),
  previousSelectedButton: document.getElementById("previousSelectedButton"),
  nextSelectedButton: document.getElementById("nextSelectedButton"),
  selectedNavPosition: document.getElementById("selectedNavPosition"),
  cloudStatus: document.getElementById("cloudStatus"),
  cloudLogoutButton: document.getElementById("cloudLogoutButton"),
  workspaceModeLabel: document.getElementById("workspaceModeLabel"),
  reportMaterialLabel: document.getElementById("reportMaterialLabel"),
  rawNewsTab: document.getElementById("rawNewsTab"),
  filteredNewsTab: document.getElementById("filteredNewsTab"),
  rawNewsCount: document.getElementById("rawNewsCount"),
  filteredNewsCount: document.getElementById("filteredNewsCount"),
  minLengthInput: document.getElementById("minLengthInput"),
  blockedTermsInput: document.getElementById("blockedTermsInput"),
  effectiveFilterTermCount: document.getElementById("effectiveFilterTermCount"),
  filterPackNameInput: document.getElementById("filterPackNameInput"),
  saveFilterPackButton: document.getElementById("saveFilterPackButton"),
  cancelFilterPackEditButton: document.getElementById("cancelFilterPackEditButton"),
  filterPackList: document.getElementById("filterPackList"),
  filterPackStatus: document.getElementById("filterPackStatus"),
  historyLoadStatus: document.getElementById("historyLoadStatus"),
};

let filterSaveTimer = null;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value = "") {
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch (_) {}
  return "#";
}

function formatUpdated(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function getBeijingHour() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "hour")?.value || 0);
}

function getDefaultEdition() {
  const hour = getBeijingHour();
  return hour >= 14 || hour < 2 ? "evening" : "morning";
}

function getBeijingDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function currentEditionWindowKey() {
  const date = getBeijingDateParts();
  const hour = getBeijingHour();
  const autoEdition = getDefaultEdition();
  return `${date.year}-${date.month}-${date.day}:${hour < 2 ? "overnight" : autoEdition}`;
}

function getPreferredEdition() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(EDITION_OVERRIDE_KEY) || "null");
    if (
      saved &&
      saved.windowKey === currentEditionWindowKey() &&
      (saved.edition === "morning" || saved.edition === "evening")
    ) {
      return saved.edition;
    }
  } catch (_) {}
  return getDefaultEdition();
}

function rememberEditionOverride(edition) {
  sessionStorage.setItem(
    EDITION_OVERRIDE_KEY,
    JSON.stringify({
      windowKey: currentEditionWindowKey(),
      edition,
    })
  );
}

function formatTimelineTime(iso, fallback = "") {
  if (!iso) return fallback || "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback || "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function formatTimelineDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${map.year}/${map.month}/${map.day}`;
}

function formatTimelineWeekday(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "long",
  }).format(d);
}

function normalizeFilters(filters) {
  const minLength = Number(filters?.minLength);
  const seen = new Set();
  const filterPacks = Array.isArray(filters?.filterPacks)
    ? filters.filterPacks
        .map((pack, index) => {
          if (!pack || typeof pack !== "object") return null;
          const id = String(pack.id || `pack-${index + 1}`).trim();
          const name = String(pack.name || "").trim();
          const terms = String(pack.terms || "");
          if (!id || !name || seen.has(id)) return null;
          seen.add(id);
          return { id, name: name.slice(0, 40), terms };
        })
        .filter(Boolean)
    : [];
  const validIds = new Set(filterPacks.map((pack) => pack.id));

  return {
    minLength:
      Number.isFinite(minLength) && minLength >= 0
        ? Math.min(10000, Math.floor(minLength))
        : 10,
    blockedTerms: String(filters?.blockedTerms || ""),
    filterPacks,
    activeFilterPackIds: Array.isArray(filters?.activeFilterPackIds)
      ? [...new Set(filters.activeFilterPackIds.map(String))].filter((id) => validIds.has(id))
      : [],
  };
}

function workspaceSnapshot() {
  return {
    schemaVersion: 3,
    selections: state.selections,
    edition: state.workspaceMode === "zhoubao" ? "" : (state.edition || getPreferredEdition()),
    filters: state.filters,
    reviewLayout: state.reviewLayout,
  };
}

function updateWorkspaceModeUI(mode = window.WSCNCloud.getMode()) {
  state.workspaceMode = mode === "zhoubao" ? "zhoubao" : "caitong";
  const hasPassword = Boolean(window.WSCNCloud.getPassword());
  els.workspaceModeLabel.textContent = hasPassword
    ? (state.workspaceMode === "zhoubao" ? "周报" : "财通")
    : "共享工作区";
  if (els.reportMaterialLabel) {
    els.reportMaterialLabel.textContent =
      state.workspaceMode === "zhoubao" ? "周报素材" : "早晚报素材";
  }
  document.body.dataset.workspaceMode = state.workspaceMode;
  if (state.workspaceMode === "zhoubao") {
    state.edition = "";
  } else if (!state.edition) {
    state.edition = getPreferredEdition();
  }
}

function applyWorkspace(workspace, { renderNow = true } = {}) {
  const normalized = window.WSCNCloud.normalizeState(workspace);

  state.selections = normalized.selections || {};
  updateWorkspaceModeUI();
  state.edition =
    state.workspaceMode === "zhoubao"
      ? ""
      : getPreferredEdition();
  state.filters = normalizeFilters(normalized.filters);
  state.reviewLayout =
    normalized.reviewLayout &&
    Array.isArray(normalized.reviewLayout.domestic) &&
    Array.isArray(normalized.reviewLayout.foreign)
      ? normalized.reviewLayout
      : { domestic: [], foreign: [] };

  pruneSelectionsToHistory();
  syncFilterInputs();

  if (renderNow) render();
}

async function persistWorkspace() {
  if (state.applyingRemote) return;
  const saved = await window.WSCNCloud.saveWorkspace(workspaceSnapshot());
  state.cloudVersion = saved.version || state.cloudVersion;
  updateWorkspaceModeUI(saved.mode || window.WSCNCloud.getMode());
}

function setCloudStatus({ text, kind, mode }) {
  els.cloudStatus.textContent = text;
  els.cloudStatus.dataset.kind = kind || "neutral";
  updateWorkspaceModeUI(mode || window.WSCNCloud.getMode());
}

function allHistoryItems() {
  if (!state.data) return [];
  if (Array.isArray(state.data.history_items) && state.data.history_items.length) {
    return state.data.history_items;
  }
  return state.data.items || [];
}

function itemTimestampSeconds(item) {
  const displayTime = Number(item?.display_time || 0);
  if (displayTime > 0) return displayTime;

  const parsed = Date.parse(item?.datetime || "");
  return Number.isFinite(parsed) ? parsed / 1000 : 0;
}

function fullBrowseItems() {
  if (!state.data) return [];

  const map = new Map();
  for (const item of allHistoryItems()) {
    map.set(String(item.id), item);
  }
  // Prefer the freshest payload when the same id also exists in items.
  for (const item of state.data.items || []) {
    map.set(String(item.id), item);
  }

  return [...map.values()].sort(
    (a, b) => itemTimestampSeconds(b) - itemTimestampSeconds(a)
  );
}

function maxHistoryWindowHours() {
  const retentionDays = Number(state.data?.retention_days || 10);
  return Math.max(12, Math.min(30, retentionDays || 10) * 24);
}

function currentBrowseItems() {
  const nowSeconds = Date.now() / 1000;
  const cutoff = nowSeconds - state.historyWindowHours * 3600;
  return fullBrowseItems().filter((item) => itemTimestampSeconds(item) >= cutoff);
}

function hasMoreHistoryItems() {
  if (state.historyWindowHours >= maxHistoryWindowHours()) return false;
  const nowSeconds = Date.now() / 1000;
  const cutoff = nowSeconds - state.historyWindowHours * 3600;
  return fullBrowseItems().some((item) => itemTimestampSeconds(item) < cutoff);
}

function historyWindowLabel() {
  if (state.historyWindowHours < 24) return `近 ${state.historyWindowHours} 小时`;
  const days = state.historyWindowHours / 24;
  return Number.isInteger(days) ? `近 ${days} 天` : `近 ${state.historyWindowHours} 小时`;
}

function renderHistoryLoadStatus() {
  if (!els.historyLoadStatus) return;
  const count = currentBrowseItems().length;
  if (hasMoreHistoryItems()) {
    els.historyLoadStatus.textContent = `已显示${historyWindowLabel()} · ${count} 条 · 继续向下滚动加载更早新闻`;
    els.historyLoadStatus.dataset.complete = "false";
  } else {
    els.historyLoadStatus.textContent = `已显示缓存内全部新闻 · ${count} 条`;
    els.historyLoadStatus.dataset.complete = "true";
  }
}

function loadMoreHistoryItems() {
  if (state.historyLoadingMore || !hasMoreHistoryItems()) return;
  state.historyLoadingMore = true;
  state.historyWindowHours = Math.min(
    maxHistoryWindowHours(),
    state.historyWindowHours + HISTORY_WINDOW_STEP_HOURS
  );
  render();
  window.setTimeout(() => {
    state.historyLoadingMore = false;
  }, 120);
}

function ensureHistoryWindowContains(item) {
  const timestamp = itemTimestampSeconds(item);
  if (!timestamp) return;
  const ageHours = Math.max(0, (Date.now() / 1000 - timestamp) / 3600);
  if (ageHours <= state.historyWindowHours) return;

  const needed = Math.ceil((ageHours + 1) / HISTORY_WINDOW_STEP_HOURS) * HISTORY_WINDOW_STEP_HOURS;
  state.historyWindowHours = Math.min(maxHistoryWindowHours(), Math.max(12, needed));
}

function pruneSelectionsToHistory() {
  if (!state.data) return;

  const valid = new Set(allHistoryItems().map((item) => String(item.id)));
  let changed = false;

  for (const id of Object.keys(state.selections)) {
    if (!valid.has(String(id))) {
      delete state.selections[id];
      changed = true;
    }
  }

  if (changed) {
    window.WSCNCloud.saveLocal(workspaceSnapshot());
  }
}

function isManualItem(item) {
  return Boolean(item?.manual || String(item?.uid || "").startsWith("manual-"));
}

function countManualItems(layout = state.reviewLayout) {
  if (!layout?.domestic || !layout?.foreign) return 0;

  let count = 0;

  for (const category of ["domestic", "foreign"]) {
    for (const node of layout[category] || []) {
      if (node.type === "group") {
        count += (node.items || []).filter(isManualItem).length;
      } else if (isManualItem(node)) {
        count += 1;
      }
    }
  }

  return count;
}

function clearManualItemsFromLayout() {
  function keep(item) {
    return !isManualItem(item);
  }

  const next = JSON.parse(JSON.stringify(state.reviewLayout));

  for (const category of ["domestic", "foreign"]) {
    next[category] = (next[category] || [])
      .map((node) => {
        if (node.type === "group") {
          node.items = (node.items || []).filter(keep);
          return node;
        }
        return keep(node) ? node : null;
      })
      .filter(Boolean);
  }

  state.reviewLayout = next;
}

function itemFilterText(item) {
  return [item.content, item.title, item.article?.title]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function itemCharacterCount(item) {
  return Array.from(itemFilterText(item).replace(/\s+/g, "")).length;
}

function splitFilterTerms(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function effectiveBlockedTerms() {
  const combined = [...splitFilterTerms(state.filters.blockedTerms)];
  const activeIds = new Set(state.filters.activeFilterPackIds || []);

  for (const pack of state.filters.filterPacks || []) {
    if (!activeIds.has(pack.id)) continue;
    combined.push(...splitFilterTerms(pack.terms));
  }

  const seen = new Set();
  return combined.filter((term) => {
    const key = term.toLocaleLowerCase("zh-CN");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function passesUserFilters(item) {
  if (itemCharacterCount(item) < state.filters.minLength) return false;

  // “重要 / 非常重要”只受最小字数约束，不受任何屏蔽词或词包影响。
  if (Number(item.score || 1) >= 2) return true;

  const haystack = itemFilterText(item).toLocaleLowerCase("zh-CN");
  return !effectiveBlockedTerms().some((term) =>
    haystack.includes(term.toLocaleLowerCase("zh-CN"))
  );
}

function filteredBrowseItems() {
  return currentBrowseItems().filter(passesUserFilters);
}

function getVisibleItems() {
  const base =
    state.newsView === "raw" ? currentBrowseItems() : filteredBrowseItems();
  const q = state.query.trim().toLocaleLowerCase("zh-CN");

  if (!q) return base;

  return base.filter((item) =>
    itemFilterText(item).toLocaleLowerCase("zh-CN").includes(q)
  );
}

function syncFilterInputs() {
  if (document.activeElement !== els.minLengthInput) {
    els.minLengthInput.value = String(state.filters.minLength);
  }
  if (document.activeElement !== els.blockedTermsInput) {
    els.blockedTermsInput.value = state.filters.blockedTerms;
  }
}

function setFilterPackStatus(message = "", kind = "neutral") {
  els.filterPackStatus.textContent = message;
  els.filterPackStatus.dataset.kind = kind;
}

function filterPackById(id) {
  return (state.filters.filterPacks || []).find((pack) => pack.id === id) || null;
}

function filterPackHtml(pack) {
  const active = (state.filters.activeFilterPackIds || []).includes(pack.id);
  const open = state.openFilterPackMenuId === pack.id;
  const termCount = splitFilterTerms(pack.terms).length;
  return `
    <div class="filter-pack-card ${active ? "active" : ""}" data-pack-id="${escapeHtml(pack.id)}">
      <button class="filter-pack-toggle" type="button" data-pack-toggle="${escapeHtml(pack.id)}" aria-pressed="${String(active)}">
        <span class="filter-pack-check" aria-hidden="true">${active ? "✓" : ""}</span>
        <span class="filter-pack-copy">
          <strong>${escapeHtml(pack.name)}</strong>
          <small>${termCount} 个词${active ? " · 已启用" : ""}</small>
        </span>
      </button>
      <button class="filter-pack-more" type="button" data-pack-menu-toggle="${escapeHtml(pack.id)}" aria-label="词包更多操作">...</button>
      <div class="filter-pack-menu" ${open ? "" : "hidden"}>
        <button type="button" data-pack-action="edit" data-pack-id="${escapeHtml(pack.id)}">编辑词包</button>
        <button type="button" data-pack-action="delete" data-pack-id="${escapeHtml(pack.id)}">删除此包</button>
      </div>
    </div>`;
}

function renderFilterPacks() {
  const packs = state.filters.filterPacks || [];
  els.filterPackList.innerHTML = packs.length
    ? packs.map(filterPackHtml).join("")
    : '<span class="filter-pack-empty">还没有保存词包</span>';

  const effectiveCount = effectiveBlockedTerms().length;
  els.effectiveFilterTermCount.textContent = `当前生效 ${effectiveCount} 个词`;

  const editingPack = filterPackById(state.editingFilterPackId);
  els.saveFilterPackButton.textContent = editingPack ? "保存修改" : "保存为词包";
  els.cancelFilterPackEditButton.hidden = !editingPack;
}

function renderNewsTabs() {
  const rawCount = currentBrowseItems().length;
  const filteredCount = filteredBrowseItems().length;

  els.rawNewsCount.textContent = String(rawCount);
  els.filteredNewsCount.textContent = String(filteredCount);

  for (const button of [els.rawNewsTab, els.filteredNewsTab]) {
    const active = button.dataset.view === state.newsView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
}

function scheduleFilterSave() {
  clearTimeout(filterSaveTimer);
  filterSaveTimer = setTimeout(() => {
    persistWorkspace().catch(console.error);
  }, 650);
}

function selectionFor(item) {
  return state.selections[String(item.id)] || "";
}

function itemHtml(item) {
  const score = Number(item.score || 1);
  const selected = selectionFor(item);

  let badge = "";
  if (score >= 3) badge = `<span class="badge important">非常重要</span>`;
  else if (score === 2) badge = `<span class="badge important">重要</span>`;

  const sourceUrl = safeUrl(
    item.uri || `https://wallstreetcn.com/livenews/${item.id}`
  );

  const article = item.article?.uri
    ? `<a class="article-link" href="${safeUrl(item.article.uri)}" target="_blank" rel="noreferrer">关联文章：${escapeHtml(item.article.title || "查看")}</a>`
    : "";

  return `
    <article
      class="news-item score-${Math.min(score, 3)} ${selected ? "is-selected" : ""}"
      data-news-id="${escapeHtml(String(item.id))}"
    >
      <time class="news-time">
        <span class="news-time-main">${escapeHtml(
          formatTimelineTime(item.datetime, item.time || "")
        )}</span>
        <span class="news-time-date">${escapeHtml(
          formatTimelineDate(item.datetime)
        )}</span>
        <span class="news-time-weekday">${escapeHtml(
          formatTimelineWeekday(item.datetime)
        )}</span>
      </time>
      <div class="rail"><span class="dot" aria-hidden="true"></span></div>
      <div class="news-card">
        <p class="news-content">${escapeHtml(
          item.content || item.title || "（无正文）"
        )}</p>
        <div class="news-card-bottom">
          <div class="news-footer">
            ${badge}
            <a class="source-link" href="${sourceUrl}" target="_blank" rel="noreferrer">原始快讯 ↗</a>
            ${article}
          </div>
          <div class="classification" aria-label="加入报告">
            <button
              class="classify-btn domestic ${selected === "domestic" ? "selected" : ""}"
              type="button"
              data-news-id="${escapeHtml(String(item.id))}"
              data-category="domestic"
            >国内</button>
            <button
              class="classify-btn foreign ${selected === "foreign" ? "selected" : ""}"
              type="button"
              data-news-id="${escapeHtml(String(item.id))}"
              data-category="foreign"
            >国外</button>
          </div>
        </div>
      </div>
    </article>`;
}

function selectionCounts() {
  const values = Object.values(state.selections);

  return {
    total: values.length,
    domestic: values.filter((value) => value === "domestic").length,
    foreign: values.filter((value) => value === "foreign").length,
  };
}

function renderEdition() {
  if (state.workspaceMode === "zhoubao") {
    els.morningButton.classList.remove("active");
    els.eveningButton.classList.remove("active");
    return;
  }

  if (!state.edition) state.edition = getPreferredEdition();
  els.morningButton.classList.toggle("active", state.edition === "morning");
  els.eveningButton.classList.toggle("active", state.edition === "evening");
}

function renderSelectionStatus() {
  const counts = selectionCounts();
  const manualCount = countManualItems();

  els.selectedCount.textContent = `已选 ${counts.total} 条`;
  els.selectedBreakdown.textContent =
    `国内 ${counts.domestic} · 国外 ${counts.foreign} · 自选 ${manualCount}`;

  els.drawerSummary.textContent =
    counts.total || manualCount
      ? `已选 ${counts.total} 条 · 国内 ${counts.domestic} / 国外 ${counts.foreign} · 自选 ${manualCount} · 提交`
      : "已选 0 条 · 提交";

  els.generateReportButton.disabled = counts.total === 0 && manualCount === 0;
  els.clearSelectionButton.disabled = counts.total === 0;
  els.clearManualButton.disabled = manualCount === 0;

  renderEdition();
}

function selectedItemsInTimelineOrder() {
  return fullBrowseItems().filter((item) =>
    Boolean(state.selections[String(item.id)])
  );
}

function updateSelectedNavigator() {
  const selectedItems = selectedItemsInTimelineOrder();
  const total = selectedItems.length;

  els.selectedNavigator.hidden = total === 0;

  if (total === 0) {
    state.selectedNavUid = null;
    els.selectedNavPosition.textContent = "0 / 0";
    return;
  }

  const index = selectedItems.findIndex(
    (item) => String(item.id) === String(state.selectedNavUid)
  );

  if (index < 0) {
    state.selectedNavUid = null;
    els.selectedNavPosition.textContent = `${total} 条已选`;
  } else {
    els.selectedNavPosition.textContent = `${index + 1} / ${total}`;
  }
}

function currentSelectedAnchorIndex(selectedItems, direction) {
  const explicitIndex = selectedItems.findIndex(
    (item) => String(item.id) === String(state.selectedNavUid)
  );

  if (explicitIndex >= 0) return explicitIndex;

  const viewportAnchor = window.innerHeight * 0.42;
  const candidates = [];

  for (let i = 0; i < selectedItems.length; i++) {
    const el = document.querySelector(
      `.news-item[data-news-id="${CSS.escape(String(selectedItems[i].id))}"]`
    );

    if (!el) continue;

    const rect = el.getBoundingClientRect();
    candidates.push({ i, center: rect.top + rect.height / 2 });
  }

  if (!candidates.length) {
    return direction > 0 ? -1 : selectedItems.length;
  }

  if (direction > 0) {
    const next = candidates.find((candidate) => candidate.center > viewportAnchor);
    return next ? next.i - 1 : selectedItems.length - 1;
  }

  const previous = [...candidates]
    .reverse()
    .find((candidate) => candidate.center < viewportAnchor);

  return previous ? previous.i + 1 : 0;
}

function navigateSelected(direction) {
  const selectedItems = selectedItemsInTimelineOrder();
  if (!selectedItems.length) return;

  const anchorIndex = currentSelectedAnchorIndex(selectedItems, direction);
  let targetIndex = anchorIndex + direction;

  if (targetIndex < 0) targetIndex = selectedItems.length - 1;
  if (targetIndex >= selectedItems.length) targetIndex = 0;

  const target = selectedItems[targetIndex];
  state.selectedNavUid = String(target.id);
  ensureHistoryWindowContains(target);

  const locateAndScroll = () => {
    const element = document.querySelector(
      `.news-item[data-news-id="${CSS.escape(String(target.id))}"]`
    );

    if (!element) return;

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    element.classList.add("selected-nav-highlight");

    setTimeout(() => element.classList.remove("selected-nav-highlight"), 1600);
  };

  const current = document.querySelector(
    `.news-item[data-news-id="${CSS.escape(String(target.id))}"]`
  );

  if (!current) {
    // A selected item may have been filtered out. Navigation always makes it reachable.
    state.newsView = "raw";
    state.query = "";
    els.searchInput.value = "";
    render();
    requestAnimationFrame(locateAndScroll);
  } else {
    locateAndScroll();
  }

  updateSelectedNavigator();
}

function render() {
  if (!state.data) return;

  const visible = getVisibleItems();

  els.updatedText.textContent = formatUpdated(state.data.generated_at);
  els.timeline.innerHTML = visible.map(itemHtml).join("");
  els.emptyState.hidden = visible.length !== 0;
  els.errorState.hidden = true;
  els.statusText.textContent = state.data.generated_at ? "已同步" : "已读取";

  syncFilterInputs();
  renderFilterPacks();
  renderNewsTabs();
  renderSelectionStatus();
  renderHistoryLoadStatus();
  updateSelectedNavigator();
  updateWorkspaceModeUI();
}

async function loadNewsData() {
  const res = await fetch(`./data/latest.json?t=${Date.now()}`, {
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  state.data = data;
}

async function initialLoad() {
  try {
    window.WSCNCloud.setStatusListener(setCloudStatus);

    await loadNewsData();

    // Render immediately from local state. Cloud never blocks the news list.
    const localWorkspace = window.WSCNCloud.migrateLegacyLocalIfNeeded();
    applyWorkspace(localWorkspace, { renderNow: true });

    const workspace = await window.WSCNCloud.loadWorkspace({
      allowPrompt: true,
    });

    state.cloudVersion = workspace.version || 0;
    updateWorkspaceModeUI(workspace.mode || window.WSCNCloud.getMode());
    applyWorkspace(workspace.state, { renderNow: true });
  } catch (error) {
    console.error(error);

    els.timeline.innerHTML = "";
    els.emptyState.hidden = true;
    els.errorState.hidden = false;
    els.errorText.textContent = `读取失败：${error.message}`;
    els.statusText.textContent = "数据读取失败";
  }
}

async function pollCloud() {
  if (document.hidden) return;

  const remote = await window.WSCNCloud.refreshRemoteIfNewer();
  if (!remote) return;

  const version = Number(remote.version || 0);

  // The current session is locked to the workspace selected at login.
  // Never jump from Caitong to Zhoubao (or the reverse) during background polling.
  if (remote.mode && remote.mode !== state.workspaceMode) {
    setCloudStatus({
      text: "工作区状态异常，请退出后重新进入",
      kind: "error",
      mode: state.workspaceMode,
    });
    return;
  }

  if (version > Number(state.cloudVersion || 0)) {
    state.applyingRemote = true;
    state.cloudVersion = version;
    applyWorkspace(remote.state, { renderNow: true });
    state.applyingRemote = false;
    setCloudStatus({
      text: `${window.WSCNCloud.modeLabel()}工作区已同步`,
      kind: "success",
      mode: state.workspaceMode,
    });
  }
}

els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

for (const tab of [els.rawNewsTab, els.filteredNewsTab]) {
  tab.addEventListener("click", () => {
    state.newsView = tab.dataset.view === "raw" ? "raw" : "filtered";
    render();
  });
}

els.minLengthInput.addEventListener("input", () => {
  const value = Number(els.minLengthInput.value);
  state.filters.minLength =
    Number.isFinite(value) && value >= 0 ? Math.min(10000, Math.floor(value)) : 10;
  render();
  scheduleFilterSave();
});

els.blockedTermsInput.addEventListener("input", () => {
  state.filters.blockedTerms = els.blockedTermsInput.value;
  render();
  scheduleFilterSave();
});

els.saveFilterPackButton.addEventListener("click", async () => {
  const name = els.filterPackNameInput.value.trim();
  const terms = String(state.filters.blockedTerms || "");

  if (!name) {
    setFilterPackStatus("请先填写词包名称", "error");
    els.filterPackNameInput.focus();
    return;
  }
  if (!splitFilterTerms(terms).length) {
    setFilterPackStatus("筛选词为空，无法保存词包", "error");
    els.blockedTermsInput.focus();
    return;
  }

  if (state.editingFilterPackId) {
    const pack = filterPackById(state.editingFilterPackId);
    if (!pack) {
      state.editingFilterPackId = "";
      setFilterPackStatus("原词包不存在，请重新保存", "error");
      renderFilterPacks();
      return;
    }
    pack.name = name.slice(0, 40);
    pack.terms = terms;
    state.editingFilterPackId = "";
    els.filterPackNameInput.value = "";
    setFilterPackStatus("词包已更新", "success");
  } else {
    const id = `pack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    state.filters.filterPacks.push({ id, name: name.slice(0, 40), terms });
    els.filterPackNameInput.value = "";
    setFilterPackStatus("词包已保存；点击词包可启用", "success");
  }

  render();
  await persistWorkspace();
});

els.cancelFilterPackEditButton.addEventListener("click", () => {
  state.editingFilterPackId = "";
  els.filterPackNameInput.value = "";
  setFilterPackStatus("已退出词包编辑", "neutral");
  renderFilterPacks();
});

els.filterPackList.addEventListener("click", async (event) => {
  const menuToggle = event.target.closest("[data-pack-menu-toggle]");
  if (menuToggle) {
    const id = String(menuToggle.dataset.packMenuToggle || "");
    state.openFilterPackMenuId = state.openFilterPackMenuId === id ? "" : id;
    renderFilterPacks();
    return;
  }

  const actionButton = event.target.closest("[data-pack-action]");
  if (actionButton) {
    const id = String(actionButton.dataset.packId || "");
    const pack = filterPackById(id);
    state.openFilterPackMenuId = "";
    if (!pack) {
      renderFilterPacks();
      return;
    }

    if (actionButton.dataset.packAction === "edit") {
      state.editingFilterPackId = id;
      state.filters.blockedTerms = pack.terms;
      els.blockedTermsInput.value = pack.terms;
      els.filterPackNameInput.value = pack.name;
      setFilterPackStatus(`正在编辑「${pack.name}」；文本框内容已替换为该词包`, "neutral");
      render();
      await persistWorkspace();
      return;
    }

    if (actionButton.dataset.packAction === "delete") {
      state.filters.filterPacks = state.filters.filterPacks.filter((item) => item.id !== id);
      state.filters.activeFilterPackIds = state.filters.activeFilterPackIds.filter((item) => item !== id);
      if (state.editingFilterPackId === id) {
        state.editingFilterPackId = "";
        els.filterPackNameInput.value = "";
      }
      setFilterPackStatus(`已删除词包「${pack.name}」`, "success");
      render();
      await persistWorkspace();
      return;
    }
  }

  const toggle = event.target.closest("[data-pack-toggle]");
  if (!toggle) return;
  const id = String(toggle.dataset.packToggle || "");
  if (!filterPackById(id)) return;

  const active = new Set(state.filters.activeFilterPackIds || []);
  if (active.has(id)) active.delete(id);
  else active.add(id);
  state.filters.activeFilterPackIds = [...active];
  state.openFilterPackMenuId = "";
  setFilterPackStatus("已更新启用词包；多个词包按屏蔽词并集生效", "success");
  render();
  await persistWorkspace();
});

document.addEventListener("click", (event) => {
  if (!state.openFilterPackMenuId) return;
  if (event.target.closest(".filter-pack-card")) return;
  state.openFilterPackMenuId = "";
  renderFilterPacks();
});

els.timeline.addEventListener("click", async (event) => {
  const button = event.target.closest(".classify-btn");
  if (!button) return;

  const id = String(button.dataset.newsId);
  const category = button.dataset.category;

  if (state.selections[id] === category) {
    delete state.selections[id];
  } else {
    state.selections[id] = category;
  }

  render();
  await persistWorkspace();
});

els.selectionDrawerToggle.addEventListener("click", () => {
  const isCollapsed = els.selectionWorkbench.classList.toggle("collapsed");
  els.selectionDrawerToggle.setAttribute("aria-expanded", String(!isCollapsed));
});

[els.morningButton, els.eveningButton].forEach((button) => {
  button.addEventListener("click", async () => {
    if (state.workspaceMode === "zhoubao") return;
    state.edition = button.dataset.edition;
    rememberEditionOverride(state.edition);
    renderEdition();
    await persistWorkspace();
  });
});

els.clearSelectionButton.addEventListener("click", async () => {
  state.selections = {};
  render();
  await persistWorkspace();
});

els.clearManualButton.addEventListener("click", async () => {
  clearManualItemsFromLayout();
  renderSelectionStatus();
  await persistWorkspace();
});

els.generateReportButton.addEventListener("click", async () => {
  await persistWorkspace();
  window.location.href = "./review.html";
});

els.previousSelectedButton.addEventListener("click", () => navigateSelected(-1));
els.nextSelectedButton.addEventListener("click", () => navigateSelected(1));

els.cloudLogoutButton.addEventListener("click", () => {
  window.WSCNCloud.logout();
  window.location.replace(`./index.html?login=${Date.now()}`);
});

let historyScrollTicking = false;
window.addEventListener(
  "scroll",
  () => {
    if (historyScrollTicking) return;
    historyScrollTicking = true;
    window.requestAnimationFrame(() => {
      historyScrollTicking = false;
      const root = document.documentElement;
      const remaining = root.scrollHeight - (window.scrollY + window.innerHeight);
      if (remaining <= 420) loadMoreHistoryItems();
    });
  },
  { passive: true }
);

initialLoad();

setInterval(() => {
  loadNewsData()
    .then(() => render())
    .catch(() => {});
}, 60_000);

setInterval(pollCloud, window.WSCNCloud.getPollIntervalMs());
