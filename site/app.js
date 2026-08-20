const state = {
  data: null,
  query: "",
  selections: {},
  edition: "",
  reviewLayout: { domestic: [], foreign: [] },
  selectedNavUid: null,
  cloudVersion: 0,
  applyingRemote: false,
};

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
  cloudReconnectButton: document.getElementById("cloudReconnectButton"),
};

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
  return Number(parts.find((p) => p.type === "hour")?.value || 0);
}

function getDefaultEdition() {
  return getBeijingHour() >= 14 ? "evening" : "morning";
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
    weekday: "long",
  }).formatToParts(d);
  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${map.year}/${map.month}/${map.day} ${map.weekday}`;
}

function workspaceSnapshot() {
  return {
    schemaVersion: 1,
    selections: state.selections,
    edition: state.edition || getDefaultEdition(),
    reviewLayout: state.reviewLayout,
  };
}

function applyWorkspace(workspace, { renderNow = true } = {}) {
  const normalized = window.WSCNCloud.normalizeState(workspace);

  state.selections = normalized.selections || {};
  state.edition =
    normalized.edition === "morning" || normalized.edition === "evening"
      ? normalized.edition
      : getDefaultEdition();

  state.reviewLayout =
    normalized.reviewLayout &&
    Array.isArray(normalized.reviewLayout.domestic) &&
    Array.isArray(normalized.reviewLayout.foreign)
      ? normalized.reviewLayout
      : { domestic: [], foreign: [] };

  pruneSelectionsToHistory();

  if (renderNow) render();
}

async function persistWorkspace() {
  if (state.applyingRemote) return;
  const saved = await window.WSCNCloud.saveWorkspace(workspaceSnapshot());
  state.cloudVersion = saved.version || state.cloudVersion;
}

function setCloudStatus({ text, kind }) {
  els.cloudStatus.textContent = text;
  els.cloudStatus.dataset.kind = kind || "neutral";
}

function allHistoryItems() {
  if (!state.data) return [];
  if (Array.isArray(state.data.history_items) && state.data.history_items.length) {
    return state.data.history_items;
  }
  return state.data.items || [];
}

function currentBrowseItems() {
  if (!state.data) return [];

  const map = new Map();

  for (const item of state.data.items || []) {
    map.set(String(item.id), item);
  }

  for (const item of allHistoryItems()) {
    const id = String(item.id);
    if (state.selections[id] && !map.has(id)) {
      map.set(id, item);
    }
  }

  return [...map.values()].sort(
    (a, b) => Number(b.display_time || 0) - Number(a.display_time || 0)
  );
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
  return Boolean(
    item?.manual || String(item?.uid || "").startsWith("manual-")
  );
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

function getVisibleItems() {
  const q = state.query.trim().toLowerCase();

  return currentBrowseItems().filter((item) => {
    if (!q) return true;

    return [item.content, item.title, item.article?.title]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
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
        <span class="news-time-main">${escapeHtml(formatTimelineTime(item.datetime, item.time || ""))}</span>
        <span class="news-time-date">${escapeHtml(formatTimelineDate(item.datetime))}</span>
      </time>
      <div class="rail"><span class="dot" aria-hidden="true"></span></div>
      <div class="news-card">
        <p class="news-content">${escapeHtml(item.content || item.title || "（无正文）")}</p>
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
    domestic: values.filter((x) => x === "domestic").length,
    foreign: values.filter((x) => x === "foreign").length,
  };
}

function renderEdition() {
  if (!state.edition) state.edition = getDefaultEdition();

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

  els.generateReportButton.disabled =
    counts.total === 0 && manualCount === 0;

  els.clearSelectionButton.disabled = counts.total === 0;
  els.clearManualButton.disabled = manualCount === 0;

  renderEdition();
}

function selectedItemsInTimelineOrder() {
  return currentBrowseItems().filter((item) =>
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
    const next = candidates.find((x) => x.center > viewportAnchor);
    return next ? next.i - 1 : selectedItems.length - 1;
  }

  const previous = [...candidates]
    .reverse()
    .find((x) => x.center < viewportAnchor);

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

    setTimeout(
      () => element.classList.remove("selected-nav-highlight"),
      1600
    );
  };

  const current = document.querySelector(
    `.news-item[data-news-id="${CSS.escape(String(target.id))}"]`
  );

  if (!current) {
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
  els.statusText.textContent =
    state.data.generated_at ? "已同步" : "已读取";

  renderSelectionStatus();
  updateSelectedNavigator();
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

    // 先显示新闻和本机已有进度，不等待云端。
    const localWorkspace = window.WSCNCloud.migrateLegacyLocalIfNeeded();
    applyWorkspace(localWorkspace, { renderNow: true });

    // 再后台连接云端。连接失败/超时也不会阻塞新闻页面。
    const workspace = await window.WSCNCloud.loadWorkspace({
      allowPrompt: true,
    });

    state.cloudVersion = workspace.version || 0;
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

  if (version > Number(state.cloudVersion || 0)) {
    state.applyingRemote = true;
    state.cloudVersion = version;
    applyWorkspace(remote.state, { renderNow: true });
    state.applyingRemote = false;
    setCloudStatus({ text: "已收到其他设备更新", kind: "success" });
  }
}

els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
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
  const isCollapsed =
    els.selectionWorkbench.classList.toggle("collapsed");

  els.selectionDrawerToggle.setAttribute(
    "aria-expanded",
    String(!isCollapsed)
  );
});

[els.morningButton, els.eveningButton].forEach((button) => {
  button.addEventListener("click", async () => {
    state.edition = button.dataset.edition;
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

els.previousSelectedButton.addEventListener(
  "click",
  () => navigateSelected(-1)
);

els.nextSelectedButton.addEventListener(
  "click",
  () => navigateSelected(1)
);

els.cloudReconnectButton.addEventListener("click", async () => {
  const result = await window.WSCNCloud.reconnect();
  state.cloudVersion = result.version || 0;
  applyWorkspace(result.state, { renderNow: true });
});

initialLoad();

setInterval(() => {
  loadNewsData()
    .then(() => render())
    .catch(() => {});
}, 60_000);

setInterval(
  pollCloud,
  window.WSCNCloud.getPollIntervalMs()
);
