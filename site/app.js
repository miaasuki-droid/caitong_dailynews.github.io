const state = {
  data: null,
  filter: "all",
  query: "",
  selections: {},
  edition: null,
  editionManuallySet: false,
};

const els = {
  timeline: document.getElementById("timeline"),
  emptyState: document.getElementById("emptyState"),
  errorState: document.getElementById("errorState"),
  errorText: document.getElementById("errorText"),
  statusText: document.getElementById("statusText"),
  dateText: document.getElementById("dateText"),
  updatedText: document.getElementById("updatedText"),
  totalCount: document.getElementById("totalCount"),
  importantCount: document.getElementById("importantCount"),
  criticalCount: document.getElementById("criticalCount"),
  resultCount: document.getElementById("resultCount"),
  searchInput: document.getElementById("searchInput"),
  selectedCount: document.getElementById("selectedCount"),
  selectedBreakdown: document.getElementById("selectedBreakdown"),
  morningButton: document.getElementById("morningButton"),
  eveningButton: document.getElementById("eveningButton"),
  clearSelectionButton: document.getElementById("clearSelectionButton"),
  generateReportButton: document.getElementById("generateReportButton"),
  reportPanel: document.getElementById("reportPanel"),
  reportHeadingText: document.getElementById("reportHeadingText"),
  reportText: document.getElementById("reportText"),
  copyReportButton: document.getElementById("copyReportButton"),
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

function formatDate(dateString) {
  if (!dateString) return "—";
  const [year, month, day] = dateString.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
    timeZone: "UTC",
  }).format(d);
  return `${year}年${month}月${day}日 · ${weekday}`;
}

function formatUpdated(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
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

function loadSelections() {
  try {
    const raw = localStorage.getItem(storageKey());
    state.selections = raw ? JSON.parse(raw) : {};
  } catch (_) {
    state.selections = {};
  }
}

function saveSelections() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state.selections));
  } catch (_) {}
}

function getVisibleItems() {
  if (!state.data?.items) return [];
  const q = state.query.trim().toLowerCase();

  return state.data.items.filter((item) => {
    if (state.filter === "important" && Number(item.score || 1) < 2) return false;
    if (state.filter === "critical" && Number(item.score || 1) < 3) return false;

    if (q) {
      const text = [
        item.content,
        item.title,
        item.article?.title,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
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
    <article class="news-item score-${Math.min(score, 3)} ${selected ? "is-selected" : ""}">
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
            <button
              class="classify-btn domestic ${selected === "domestic" ? "selected" : ""}"
              type="button"
              data-news-id="${escapeHtml(String(item.id))}"
              data-category="domestic"
              aria-pressed="${selected === "domestic"}"
            >国内</button>
            <button
              class="classify-btn foreign ${selected === "foreign" ? "selected" : ""}"
              type="button"
              data-news-id="${escapeHtml(String(item.id))}"
              data-category="foreign"
              aria-pressed="${selected === "foreign"}"
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
  els.morningButton.setAttribute("aria-pressed", state.edition === "morning");
  els.eveningButton.setAttribute("aria-pressed", state.edition === "evening");
}

function renderSelectionStatus() {
  const counts = selectionCounts();
  els.selectedCount.textContent = `已选 ${counts.total} 条`;
  els.selectedBreakdown.textContent = `国内 ${counts.domestic} · 国外 ${counts.foreign}`;
  els.generateReportButton.disabled = counts.total === 0;
  els.clearSelectionButton.disabled = counts.total === 0;
  renderEdition();
}

function render() {
  if (!state.data) return;

  const items = state.data.items || [];
  const visible = getVisibleItems();
  const important = items.filter((x) => Number(x.score || 1) >= 2).length;
  const critical = items.filter((x) => Number(x.score || 1) >= 3).length;

  els.dateText.textContent = formatDate(state.data.date);
  els.updatedText.textContent = formatUpdated(state.data.generated_at);
  els.totalCount.textContent = items.length;
  els.importantCount.textContent = important;
  els.criticalCount.textContent = critical;
  els.resultCount.textContent = `当前显示 ${visible.length} / ${items.length} 条`;

  els.timeline.innerHTML = visible.map(itemHtml).join("");
  els.emptyState.hidden = visible.length !== 0 || items.length === 0;
  els.errorState.hidden = true;
  els.statusText.textContent = state.data.generated_at
    ? `已同步 · ${formatUpdated(state.data.generated_at)}`
    : "已读取";

  renderSelectionStatus();
}

function reportItemText(item) {
  const content = String(item.content || "").trim();
  const title = String(item.title || "").trim();

  if (!content && title) return `【${title}】`;
  if (!title) return content;
  if (content.startsWith("【") || content.includes(title)) return content;
  return `【${title}】 ${content}`;
}

function getSelectedItemsByCategory(category) {
  if (!state.data?.items) return [];
  return state.data.items.filter(
    (item) => state.selections[String(item.id)] === category
  );
}

function buildReport() {
  const domestic = getSelectedItemsByCategory("domestic");
  const foreign = getSelectedItemsByCategory("foreign");

  const [year, month, day] = (state.data?.date || "").split("-").map(Number);
  const editionText = state.edition === "evening" ? "晚报" : "早报";

  const lines = [];
  lines.push(`${month}月${day}日利率${editionText} 重要事件回顾（财通固收·隋修平团队）`);
  lines.push("");
  lines.push("国内新闻：");
  lines.push("");

  let number = 1;

  for (const item of domestic) {
    lines.push(`（${number}）${reportItemText(item)}`);
    lines.push("");
    number += 1;
  }

  lines.push("国外新闻：");
  lines.push("");

  for (const item of foreign) {
    lines.push(`（${number}）${reportItemText(item)}`);
    lines.push("");
    number += 1;
  }

  lines.push("资料来源：华尔街见闻，财通证券研究所");
  lines.push("免责声明：信息来自公开信息整理");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function copyText(text, button, successLabel) {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = successLabel;
    setTimeout(() => { button.textContent = old; }, 1500);
  } catch (_) {
    window.prompt("复制以下内容：", text);
  }
}

async function loadData({ silent = false } = {}) {
  try {
    const res = await fetch(`./data/latest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    const previousDate = state.data?.date;
    const previousGeneratedAt = state.data?.generated_at;
    state.data = data;

    if (!state.editionManuallySet) {
      state.edition = getDefaultEdition();
    }

    if (previousDate !== data.date) {
      loadSelections();
      els.reportPanel.hidden = true;
      els.reportText.value = "";
    }

    render();

    if (!silent || previousGeneratedAt !== data.generated_at) {
      document.title = `${data.date || "今日"} · 全球快讯`;
    }
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

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((x) => x.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    render();
  });
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

[els.morningButton, els.eveningButton].forEach((button) => {
  button.addEventListener("click", () => {
    state.edition = button.dataset.edition;
    state.editionManuallySet = true;
    renderEdition();
  });
});

els.clearSelectionButton.addEventListener("click", () => {
  state.selections = {};
  saveSelections();
  render();
  els.reportPanel.hidden = true;
  els.reportText.value = "";
});

els.generateReportButton.addEventListener("click", () => {
  const report = buildReport();
  els.reportText.value = report;
  const label = state.edition === "evening" ? "晚报" : "早报";
  els.reportHeadingText.textContent = `${label} · ${selectionCounts().total} 条新闻`;
  els.reportPanel.hidden = false;

  requestAnimationFrame(() => {
    els.reportPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

els.copyReportButton.addEventListener("click", () => {
  copyText(els.reportText.value, els.copyReportButton, "已复制");
});

loadData();
setInterval(() => loadData({ silent: true }), 60_000);
