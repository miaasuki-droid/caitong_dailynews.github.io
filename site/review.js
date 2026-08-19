const state = {
  data: null,
  date: "",
  edition: "morning",
  boards: { domestic: [], foreign: [] },
  initialBoards: null,
};

const els = {
  domesticBoard: document.getElementById("domesticBoard"),
  foreignBoard: document.getElementById("foreignBoard"),
  domesticCount: document.getElementById("domesticCount"),
  foreignCount: document.getElementById("foreignCount"),
  reviewCount: document.getElementById("reviewCount"),
  newDomesticGroupButton: document.getElementById("newDomesticGroupButton"),
  newForeignGroupButton: document.getElementById("newForeignGroupButton"),
  resetButton: document.getElementById("resetButton"),
  previewButton: document.getElementById("previewButton"),
  reportPanel: document.getElementById("reportPanel"),
  reportHeadingText: document.getElementById("reportHeadingText"),
  reportText: document.getElementById("reportText"),
  copyReportButton: document.getElementById("copyReportButton"),
  reviewError: document.getElementById("reviewError"),
  manualNewsInput: document.getElementById("manualNewsInput"),
  addManualDomesticButton: document.getElementById("addManualDomesticButton"),
  addManualForeignButton: document.getElementById("addManualForeignButton"),
};

const CIRCLED = [
  "①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩",
  "⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"
];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectionKey(date) {
  return `wscn-report-selections:${date}`;
}

function editionKey(date) {
  return `wscn-report-edition:${date}`;
}

function reviewStateKey(date) {
  return `wscn-review-layout:${date}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeItem(raw) {
  return {
    type: "item",
    uid: `news-${raw.id}`,
    newsId: String(raw.id),
    content: raw.content || raw.title || "",
    title: raw.title || "",
    time: raw.time || "",
  };
}

function makeManualItem(content) {
  return {
    type: "item",
    uid: newId("manual"),
    newsId: "",
    content: String(content || "").trim().replace(/\n{3,}/g, "\n\n"),
    title: "",
    time: "手动添加",
    manual: true,
  };
}

function makeGroup(title = "新建组") {
  return {
    type: "group",
    uid: newId("group"),
    title,
    items: [],
  };
}

function saveLayout() {
  try {
    localStorage.setItem(reviewStateKey(state.date), JSON.stringify(state.boards));
  } catch (_) {}
}

function loadSavedLayout() {
  try {
    const raw = localStorage.getItem(reviewStateKey(state.date));
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function countItems(board) {
  return board.reduce((sum, node) => sum + (node.type === "group" ? node.items.length : 1), 0);
}

function itemHtml(item, category, groupId = "", inGroup = false) {
  return `
    <article
      class="review-item draggable-node ${inGroup ? "in-group" : ""}"
      data-uid="${escapeHtml(item.uid)}"
      data-category="${category}"
      data-node-type="item"
      data-group-id="${escapeHtml(groupId)}"
    >
      <button class="drag-handle" aria-label="拖动新闻" title="拖动">⋮⋮</button>
      <div class="review-item-main">
        <div class="review-item-meta">${escapeHtml(item.time || "")}</div>
        <div class="review-item-content">${escapeHtml(item.content || "")}</div>
      </div>
      <button class="delete-btn delete-item" data-uid="${escapeHtml(item.uid)}">删除</button>
    </article>`;
}

function boardHtml(category) {
  return state.boards[category].map((node) => {
    if (node.type !== "group") return itemHtml(node, category);

    return `
      <section
        class="review-group draggable-node"
        data-uid="${escapeHtml(node.uid)}"
        data-category="${category}"
        data-node-type="group"
      >
        <div class="group-head">
          <button class="drag-handle" aria-label="拖动组" title="拖动">⋮⋮</button>
          <input class="group-title-input" data-group-id="${escapeHtml(node.uid)}" value="${escapeHtml(node.title)}" />
          <button class="delete-btn delete-group" data-group-id="${escapeHtml(node.uid)}">删除组</button>
        </div>
        <div class="group-dropzone" data-category="${category}" data-group-id="${escapeHtml(node.uid)}">
          ${node.items.map((item) => itemHtml(item, category, node.uid, true)).join("")}
          ${node.items.length === 0 ? '<div class="empty-group-hint">把新闻拖到这里</div>' : ""}
        </div>
      </section>`;
  }).join("");
}

function render() {
  els.domesticBoard.innerHTML = boardHtml("domestic");
  els.foreignBoard.innerHTML = boardHtml("foreign");

  const domesticCount = countItems(state.boards.domestic);
  const foreignCount = countItems(state.boards.foreign);

  els.domesticCount.textContent = `${domesticCount} 条`;
  els.foreignCount.textContent = `${foreignCount} 条`;
  els.reviewCount.textContent = `共 ${domesticCount + foreignCount} 条 · ${state.edition === "evening" ? "晚报" : "早报"}`;

  bindPointerSorting();
}

function findNode(board, uid) {
  for (let i = 0; i < board.length; i++) {
    const node = board[i];

    if (node.uid === uid) {
      return { parent: board, index: i, node, group: null };
    }

    if (node.type === "group") {
      const j = node.items.findIndex((item) => item.uid === uid);
      if (j >= 0) {
        return { parent: node.items, index: j, node: node.items[j], group: node };
      }
    }
  }

  return null;
}

function removeNode(uid) {
  for (const category of ["domestic", "foreign"]) {
    const found = findNode(state.boards[category], uid);

    if (found) {
      return {
        category,
        node: found.parent.splice(found.index, 1)[0],
      };
    }
  }

  return null;
}

function deleteGroup(category, groupId) {
  const board = state.boards[category];
  const index = board.findIndex((node) => node.uid === groupId && node.type === "group");

  if (index < 0) return;

  const group = board[index];
  board.splice(index, 1, ...group.items);

  saveLayout();
  render();
}

function targetInfoFromPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;

  const groupZone = element.closest(".group-dropzone");

  if (groupZone) {
    const category = groupZone.dataset.category;
    const groupId = groupZone.dataset.groupId;
    const group = state.boards[category].find((node) => node.uid === groupId && node.type === "group");

    if (group) {
      const itemEls = [...groupZone.querySelectorAll(":scope > .review-item")]
        .filter((el) => !el.classList.contains("dragging"));

      let index = group.items.length;

      for (let i = 0; i < itemEls.length; i++) {
        const rect = itemEls[i].getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          index = i;
          break;
        }
      }

      return { category, parent: group.items, index, group };
    }
  }

  const boardEl = element.closest(".board");

  if (boardEl) {
    const category = boardEl.dataset.category;
    const board = state.boards[category];
    const topEls = [...boardEl.querySelectorAll(":scope > .draggable-node")]
      .filter((el) => !el.classList.contains("dragging"));

    let index = board.length;

    for (let i = 0; i < topEls.length; i++) {
      const rect = topEls[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }

    return { category, parent: board, index, group: null };
  }

  return null;
}

function moveNode(uid, x, y) {
  const target = targetInfoFromPoint(x, y);
  const removed = removeNode(uid);

  if (!removed) return;

  if (!target) {
    state.boards[removed.category].push(removed.node);
    return;
  }

  if (removed.node.type === "group" && target.group) {
    state.boards[target.category].push(removed.node);
    return;
  }

  target.parent.splice(Math.min(target.index, target.parent.length), 0, removed.node);
}

let dragState = null;

function bindPointerSorting() {
  document.querySelectorAll(".drag-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", startDrag, { passive: false });
  });
}

function startDrag(event) {
  event.preventDefault();

  const nodeEl = event.currentTarget.closest(".draggable-node");
  if (!nodeEl) return;

  const rect = nodeEl.getBoundingClientRect();

  dragState = {
    uid: nodeEl.dataset.uid,
    nodeEl,
    offsetY: event.clientY - rect.top,
    lastX: event.clientX,
    lastY: event.clientY,
  };

  nodeEl.classList.add("dragging");

  Object.assign(nodeEl.style, {
    width: `${rect.width}px`,
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    zIndex: "3000",
    pointerEvents: "none",
  });

  document.body.classList.add("is-dragging");

  window.addEventListener("pointermove", onDragMove, { passive: false });
  window.addEventListener("pointerup", endDrag, { passive: false });
  window.addEventListener("pointercancel", endDrag, { passive: false });
}

function onDragMove(event) {
  if (!dragState) return;

  event.preventDefault();

  dragState.lastX = event.clientX;
  dragState.lastY = event.clientY;
  dragState.nodeEl.style.top = `${event.clientY - dragState.offsetY}px`;

  const edge = 70;
  if (event.clientY < edge) window.scrollBy(0, -14);
  else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 14);
}

function endDrag(event) {
  if (!dragState) return;

  event.preventDefault();

  const { uid, nodeEl, lastX, lastY } = dragState;

  Object.assign(nodeEl.style, {
    pointerEvents: "",
    position: "",
    left: "",
    top: "",
    width: "",
    zIndex: "",
  });

  nodeEl.classList.remove("dragging");

  moveNode(uid, lastX, lastY);

  dragState = null;
  document.body.classList.remove("is-dragging");

  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);

  saveLayout();
  render();
}

function reportItemText(item) {
  return String(item.content || "")
    .trim()
    .replace(/\n+/g, "\n");
}

function appendBoardLines(lines, board, numberRef) {
  for (const node of board) {
    if (node.type === "group") {
      lines.push(`（${numberRef.value}）【${String(node.title || "未命名组").trim()}】`);
      numberRef.value += 1;

      node.items.forEach((item, idx) => {
        const marker = CIRCLED[idx] || `${idx + 1}.`;
        lines.push(`${marker} ${reportItemText(item)}`);
      });
    } else {
      lines.push(`（${numberRef.value}）${reportItemText(node)}`);
      numberRef.value += 1;
    }
  }
}

function buildReport() {
  const [, month, day] = state.date.split("-").map(Number);
  const editionText = state.edition === "evening" ? "晚报" : "早报";

  const lines = [];
  lines.push(`${month}月${day}日利率${editionText} 重要事件回顾（财通固收·隋修平团队）`);
  lines.push("");
  lines.push("国内新闻：");

  const numberRef = { value: 1 };
  appendBoardLines(lines, state.boards.domestic, numberRef);

  lines.push("");
  lines.push("国外新闻：");
  appendBoardLines(lines, state.boards.foreign, numberRef);

  lines.push("");
  lines.push("资料来源：华尔街见闻，财通证券研究所");
  lines.push("免责声明：信息来自公开信息整理");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    const old = els.copyReportButton.textContent;
    els.copyReportButton.textContent = "已复制";
    setTimeout(() => {
      els.copyReportButton.textContent = old;
    }, 1400);
  } catch (_) {
    window.prompt("复制以下内容：", text);
  }
}

function addGroup(category) {
  const title = window.prompt("组标题", "新建组");
  if (title === null) return;

  state.boards[category].push(makeGroup(title.trim() || "新建组"));

  saveLayout();
  render();
}

function addManualNews(category) {
  const content = els.manualNewsInput.value.trim();
  if (!content) {
    els.manualNewsInput.focus();
    return;
  }

  state.boards[category].push(makeManualItem(content));
  els.manualNewsInput.value = "";
  saveLayout();
  render();
}

async function init() {
  try {
    const res = await fetch(`./data/latest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    state.data = data;
    state.date = data.date;

    const selectionRaw = localStorage.getItem(selectionKey(state.date));
    const selections = selectionRaw ? JSON.parse(selectionRaw) : {};
    state.edition = localStorage.getItem(editionKey(state.date)) || "morning";

    const selected = data.items.filter((item) => selections[String(item.id)]);

    if (!selected.length) {
      els.reviewError.hidden = true;
    }

    const baseBoards = {
      domestic: selected
        .filter((item) => selections[String(item.id)] === "domestic")
        .map(makeItem),
      foreign: selected
        .filter((item) => selections[String(item.id)] === "foreign")
        .map(makeItem),
    };

    state.initialBoards = clone(baseBoards);

    const saved = loadSavedLayout();

    if (saved?.domestic && saved?.foreign) {
      const validIds = new Set(selected.map((item) => `news-${item.id}`));

      function keepSavedItem(item) {
        return Boolean(item?.manual) || String(item?.uid || "").startsWith("manual-") || validIds.has(item?.uid);
      }

      function cleanBoard(board) {
        return board
          .map((node) => {
            if (node.type === "group") {
              node.items = (node.items || []).filter(keepSavedItem);
              return node;
            }

            return keepSavedItem(node) ? node : null;
          })
          .filter(Boolean);
      }

      state.boards = {
        domestic: cleanBoard(saved.domestic),
        foreign: cleanBoard(saved.foreign),
      };

      const present = new Set();

      for (const category of ["domestic", "foreign"]) {
        for (const node of state.boards[category]) {
          if (node.type === "group") node.items.forEach((item) => present.add(item.uid));
          else present.add(node.uid);
        }
      }

      for (const category of ["domestic", "foreign"]) {
        baseBoards[category].forEach((item) => {
          if (!present.has(item.uid)) state.boards[category].push(item);
        });
      }
    } else {
      state.boards = clone(baseBoards);
    }

    render();
  } catch (err) {
    els.reviewError.hidden = false;
    els.reviewError.querySelector("p").textContent = `读取失败：${err.message}`;
  }
}

document.addEventListener("click", (event) => {
  const deleteItem = event.target.closest(".delete-item");

  if (deleteItem) {
    removeNode(deleteItem.dataset.uid);
    saveLayout();
    render();
    return;
  }

  const deleteGroupButton = event.target.closest(".delete-group");

  if (deleteGroupButton) {
    const groupEl = deleteGroupButton.closest(".review-group");
    deleteGroup(groupEl.dataset.category, deleteGroupButton.dataset.groupId);
  }
});

document.addEventListener("input", (event) => {
  const input = event.target.closest(".group-title-input");
  if (!input) return;

  for (const category of ["domestic", "foreign"]) {
    const group = state.boards[category].find(
      (node) => node.type === "group" && node.uid === input.dataset.groupId
    );

    if (group) {
      group.title = input.value;
      saveLayout();
      break;
    }
  }
});

els.newDomesticGroupButton.addEventListener("click", () => addGroup("domestic"));
els.newForeignGroupButton.addEventListener("click", () => addGroup("foreign"));
els.addManualDomesticButton.addEventListener("click", () => addManualNews("domestic"));
els.addManualForeignButton.addEventListener("click", () => addManualNews("foreign"));

els.resetButton.addEventListener("click", () => {
  state.boards = clone(state.initialBoards);

  try {
    localStorage.removeItem(reviewStateKey(state.date));
  } catch (_) {}

  render();
  els.reportPanel.hidden = true;
});

els.previewButton.addEventListener("click", () => {
  els.reportText.value = buildReport();
  els.reportHeadingText.textContent = state.edition === "evening" ? "晚报" : "早报";
  els.reportPanel.hidden = false;

  requestAnimationFrame(() => {
    els.reportPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

els.copyReportButton.addEventListener("click", () => {
  copyText(els.reportText.value);
});

init();
