const state = {
  data: null,
  filter: "all",
  query: "",
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
  copyButton: document.getElementById("copyButton"),
};

function escapeHtml(value = "") {
  return value
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

function itemHtml(item) {
  const score = Number(item.score || 1);
  let badge = "";
  if (score >= 3) badge = `<span class="badge important">非常重要</span>`;
  else if (score === 2) badge = `<span class="badge important">重要</span>`;

  const sourceUrl = safeUrl(item.uri || `https://wallstreetcn.com/livenews/${item.id}`);
  const article = item.article?.uri
    ? `<a class="article-link" href="${safeUrl(item.article.uri)}" target="_blank" rel="noreferrer">关联文章：${escapeHtml(item.article.title || "查看")}</a>`
    : "";

  return `
    <article class="news-item score-${Math.min(score, 3)}">
      <time class="news-time">${escapeHtml(item.time || "")}</time>
      <div class="rail"><span class="dot" aria-hidden="true"></span></div>
      <div class="news-card">
        <p class="news-content">${escapeHtml(item.content || item.title || "（无正文）")}</p>
        <div class="news-footer">
          ${badge}
          <a class="source-link" href="${sourceUrl}" target="_blank" rel="noreferrer">原始快讯 ↗</a>
          ${article}
        </div>
      </div>
    </article>`;
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
}

async function loadData({ silent = false } = {}) {
  try {
    const res = await fetch(`./data/latest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    const previousGeneratedAt = state.data?.generated_at;
    state.data = data;
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

els.copyButton.addEventListener("click", async () => {
  const items = getVisibleItems();
  if (!items.length) return;

  const text = items
    .map((item) => `${item.time || ""}  ${item.content || item.title || ""}`.trim())
    .join("\n\n");

  try {
    await navigator.clipboard.writeText(text);
    const old = els.copyButton.textContent;
    els.copyButton.textContent = `已复制 ${items.length} 条`;
    setTimeout(() => { els.copyButton.textContent = old; }, 1400);
  } catch (_) {
    window.prompt("复制以下内容：", text);
  }
});

loadData();
setInterval(() => loadData({ silent: true }), 60_000);
