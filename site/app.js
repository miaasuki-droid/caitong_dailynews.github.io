const state = {
  data: null,
  query: "",
  selections: {},
  edition: null,
  editionManuallySet: false,
  selectedNavUid: null,
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
  generateReportButton: document.getElementById("generateReportButton"),
  selectedNavigator: document.getElementById("selectedNavigator"),
  previousSelectedButton: document.getElementById("previousSelectedButton"),
  nextSelectedButton: document.getElementById("nextSelectedButton"),
  selectedNavPosition: document.getElementById("selectedNavPosition"),
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

function storageKey() {
  return `wscn-report-selections:${state.data?.date || "unknown"}`;
}

function editionStorageKey() {
  return `wscn-report-edition:${state.data?.date || "unknown"}`;
}

function loadSelections() {
  try {
    const raw = localStorage.getItem(storageKey());
    state.selections = raw ? JSON.parse(raw) : {};

    const savedEdition = localStorage.getItem(editionStorageKey());
    if (savedEdition === "morning" || savedEdition === "evening") {
      state.edition = savedEdition;
      state.editionManuallySet = true;
    }
  } catch (_) {
    state.selections = {};
  }
}

function saveSelections() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state.selections));
    if (state.edition) localStorage.setItem(editionStorageKey(), state.edition);
  } catch (_) {}
}

function getVisibleItems() {
  if (!state.data?.items) return [];
  const q = state.query.trim().toLowerCase();

  return state.data.items.filter((item) => {
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

  const sourceUrl = safeUrl(item.uri || `https://wallstreetcn.com/livenews/${item.id}`);
  const article = item.article?.uri
    ? `<a class="article-link" href="${safeUrl(item.article.uri)}" target="_blank" rel="noreferrer">关联文章：${escapeHtml(item.article.title || "查看")}</a>`
    : "";

  return `
    <article class="news-item score-${Math.min(score, 3)} ${selected ? "is-selected" : ""}" data-news-id="${escapeHtml(String(item.id))}">
      <time class="news-time">${escapeHtml(item.time || "")}</time>
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
            <button class="classify-btn domestic ${selected === "domestic" ? "selected" : ""}" type="button" data-news-id="${escapeHtml(String(item.id))}" data-category="domestic">国内</button>
            <button class="classify-btn foreign ${selected === "foreign" ? "selected" : ""}" type="button" data-news-id="${escapeHtml(String(item.id))}" data-category="foreign">国外</button>
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
  els.selectedCount.textContent = `已选 ${counts.total} 条`;
  els.selectedBreakdown.textContent = `国内 ${counts.domestic} · 国外 ${counts.foreign}`;
  els.drawerSummary.textContent = counts.total
    ? `已选 ${counts.total} 条 · 国内 ${counts.domestic} / 国外 ${counts.foreign} · 提交`
    : "已选 0 条 · 提交";
  els.generateReportButton.disabled = counts.total === 0;
  els.clearSelectionButton.disabled = counts.total === 0;
  renderEdition();
}


function selectedItemsInTimelineOrder() {
  if (!state.data?.items) return [];
  return state.data.items.filter((item) => Boolean(state.selections[String(item.id)]));
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

  let index = selectedItems.findIndex((item) => String(item.id) === String(state.selectedNavUid));

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
    const el = document.querySelector(`.news-item[data-news-id="${CSS.escape(String(selectedItems[i].id))}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    candidates.push({ i, center: rect.top + rect.height / 2 });
  }

  if (!candidates.length) return direction > 0 ? -1 : selectedItems.length;

  if (direction > 0) {
    const next = candidates.find((x) => x.center > viewportAnchor);
    return next ? next.i - 1 : selectedItems.length - 1;
  }

  const previous = [...candidates].reverse().find((x) => x.center < viewportAnchor);
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

  const element = document.querySelector(
    `.news-item[data-news-id="${CSS.escape(String(target.id))}"]`
  );

  if (!element) {
    state.query = "";
    els.searchInput.value = "";
    render();

    requestAnimationFrame(() => {
      const restored = document.querySelector(
        `.news-item[data-news-id="${CSS.escape(String(target.id))}"]`
      );
      if (restored) {
        restored.scrollIntoView({ behavior: "smooth", block: "center" });
        restored.classList.add("selected-nav-highlight");
        setTimeout(() => restored.classList.remove("selected-nav-highlight"), 1600);
      }
    });
  } else {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("selected-nav-highlight");
    setTimeout(() => element.classList.remove("selected-nav-highlight"), 1600);
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

  renderSelectionStatus();
  updateSelectedNavigator();
}

async function loadData() {
  try {
    const res = await fetch(`./data/latest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const previousDate = state.data?.date;
    state.data = data;

    if (previousDate !== data.date) {
      state.edition = getDefaultEdition();
      state.editionManuallySet = false;
      loadSelections();
    }

    if (!state.edition) state.edition = getDefaultEdition();
    render();
  } catch (err) {
    if (!state.data) {
      els.timeline.innerHTML = "";
      els.emptyState.hidden = true;
      els.errorState.hidden = false;
      els.errorText.textContent = `读取失败：${err.message}`;
      els.statusText.textContent = "数据读取失败";
    }
  }
}

els.searchInput.addEventListener("input", (e) => {
  state.query = e.target.value;
  render();
});

els.timeline.addEventListener("click", (event) => {
  const button = event.target.closest(".classify-btn");
  if (!button) return;

  const id = String(button.dataset.newsId);
  const category = button.dataset.category;

  if (state.selections[id] === category) {
    delete state.selections[id];
  } else {
    state.selections[id] = category;
  }

  saveSelections();
  render();
});

els.selectionDrawerToggle.addEventListener("click", () => {
  const isCollapsed = els.selectionWorkbench.classList.toggle("collapsed");
  els.selectionDrawerToggle.setAttribute("aria-expanded", String(!isCollapsed));
});

[els.morningButton, els.eveningButton].forEach((button) => {
  button.addEventListener("click", () => {
    state.edition = button.dataset.edition;
    state.editionManuallySet = true;
    saveSelections();
    renderEdition();
  });
});

els.clearSelectionButton.addEventListener("click", () => {
  state.selections = {};
  saveSelections();
  render();
});

els.generateReportButton.addEventListener("click", () => {
  if (selectionCounts().total === 0) return;
  saveSelections();
  window.location.href = "./review.html";
});


els.previousSelectedButton.addEventListener("click", () => navigateSelected(-1));
els.nextSelectedButton.addEventListener("click", () => navigateSelected(1));

loadData();
setInterval(loadData, 60_000);
