const state = {
  data: null,
  date: "",
  edition: "morning",
  boards: { domestic: [], foreign: [] },
  initialBoards: null,
  expandedItems: new Set(),
  pendingGroupItem: null,
  activeNodeMenu: null,
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
  groupPickerOverlay: document.getElementById("groupPickerOverlay"),
  groupPickerList: document.getElementById("groupPickerList"),
  closeGroupPickerButton: document.getElementById("closeGroupPickerButton"),
  createGroupForItemButton: document.getElementById("createGroupForItemButton"),
  globalNodeMenu: document.getElementById("globalNodeMenu"),
  globalNodeMenuExtra: document.getElementById("globalNodeMenuExtra"),
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

function normalizeNewsText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
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
    content: String(content || "").trim(),
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

function previewLimit() {
  if (window.innerWidth <= 480) return 64;
  if (window.innerWidth <= 780) return 92;
  return Infinity;
}

function previewText(item) {
  const text = normalizeNewsText(item.content);
  const limit = previewLimit();

  if (!Number.isFinite(limit) || state.expandedItems.has(item.uid) || text.length <= limit) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, limit).trimEnd()}...`,
    truncated: true,
  };
}

function menuHtml(uid, category, nodeType, inGroup = false) {
  return `
    <button
      type="button"
      class="node-menu-button"
      aria-label="更多操作"
      aria-expanded="false"
      data-menu-uid="${escapeHtml(uid)}"
      data-menu-category="${category}"
      data-menu-type="${nodeType}"
      data-menu-in-group="${inGroup ? "true" : "false"}"
    >...</button>`;
}

function itemHtml(item, category, groupId = "", inGroup = false) {
  const preview = previewText(item);
  const fullText = normalizeNewsText(item.content);

  return `
    <article
      class="review-item ${inGroup ? "in-group" : ""}"
      data-uid="${escapeHtml(item.uid)}"
      data-category="${category}"
      data-node-type="item"
      data-group-id="${escapeHtml(groupId)}"
    >
      ${menuHtml(item.uid, category, "item", inGroup)}
      <button
        type="button"
        class="corner-delete-button delete-item-corner"
        data-delete-uid="${escapeHtml(item.uid)}"
        aria-label="删除新闻"
        title="删除"
      >×</button>
      <div class="review-item-main">
        <div class="review-item-meta">${escapeHtml(item.time || "")}${preview.truncated ? " · 点正文展开" : ""}</div>
        <div
          class="review-item-content ${preview.truncated ? "is-truncated" : ""}"
          data-expand-uid="${escapeHtml(item.uid)}"
          data-expandable="${fullText.length > previewLimit() ? "true" : "false"}"
        >${escapeHtml(preview.text)}</div>
      </div>
    </article>`;
}

function boardHtml(category) {
  return state.boards[category].map((node) => {
    if (node.type !== "group") return itemHtml(node, category);

    return `
      <section
        class="review-group"
        data-uid="${escapeHtml(node.uid)}"
        data-category="${category}"
        data-node-type="group"
      >
        <div class="group-head">
          ${menuHtml(node.uid, category, "group")}
          <input class="group-title-input" data-group-id="${escapeHtml(node.uid)}" value="${escapeHtml(node.title)}" />
          <span class="group-count">${node.items.length} 条</span>
          <button
            type="button"
            class="corner-delete-button delete-group-corner"
            data-delete-group="${escapeHtml(node.uid)}"
            data-category="${category}"
            aria-label="删除组"
            title="删除组"
          >×</button>
        </div>
        <div class="group-items">
          ${node.items.map((item) => itemHtml(item, category, node.uid, true)).join("")}
          ${node.items.length === 0 ? '<div class="empty-group-hint">暂无新闻，可从新闻“...”菜单选择“分组”加入</div>' : ""}
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
}

function locateNode(uid) {
  for (const category of ["domestic", "foreign"]) {
    const board = state.boards[category];

    for (let i = 0; i < board.length; i++) {
      const node = board[i];

      if (node.uid === uid) {
        return { category, parent: board, index: i, node, group: null, groupIndex: -1 };
      }

      if (node.type === "group") {
        const j = node.items.findIndex((item) => item.uid === uid);
        if (j >= 0) {
          return {
            category,
            parent: node.items,
            index: j,
            node: node.items[j],
            group: node,
            groupIndex: i,
          };
        }
      }
    }
  }

  return null;
}

function moveNodePosition(uid, action) {
  const found = locateNode(uid);
  if (!found) return;

  let targetIndex = found.index;

  if (action === "move-top") targetIndex = 0;
  else if (action === "move-up") targetIndex = Math.max(0, found.index - 1);
  else if (action === "move-down") targetIndex = Math.min(found.parent.length - 1, found.index + 1);
  else if (action === "move-bottom") targetIndex = found.parent.length - 1;
  else return;

  if (targetIndex === found.index) return;

  const [node] = found.parent.splice(found.index, 1);
  found.parent.splice(targetIndex, 0, node);

  saveLayout();
  render();
}

function moveUpDown(uid, direction) {
  moveNodePosition(uid, direction < 0 ? "move-up" : "move-down");
}

function deleteItem(uid) {
  const found = locateNode(uid);
  if (!found || found.node.type !== "item") return;

  found.parent.splice(found.index, 1);
  state.expandedItems.delete(uid);
  saveLayout();
  render();
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

function ungroupItem(uid) {
  const found = locateNode(uid);
  if (!found || !found.group) return;

  const item = found.parent.splice(found.index, 1)[0];
  const board = state.boards[found.category];
  const groupIndex = board.findIndex((node) => node.uid === found.group.uid);

  board.splice(groupIndex + 1, 0, item);
  saveLayout();
  render();
}

function moveItemToGroup(uid, category, groupId) {
  const found = locateNode(uid);
  if (!found || found.node.type !== "item") return;

  const targetGroup = state.boards[category].find(
    (node) => node.type === "group" && node.uid === groupId
  );
  if (!targetGroup) return;

  if (found.group?.uid === groupId) {
    closeGroupPicker();
    return;
  }

  const item = found.parent.splice(found.index, 1)[0];
  targetGroup.items.push(item);

  closeGroupPicker();
  saveLayout();
  render();
}

function addGroup(category, presetTitle = "新建组") {
  const title = window.prompt("组标题", presetTitle);
  if (title === null) return null;

  const group = makeGroup(title.trim() || "新建组");
  state.boards[category].push(group);
  saveLayout();
  render();
  return group;
}

function openGroupPicker(uid, category) {
  state.pendingGroupItem = { uid, category };

  const groups = state.boards[category].filter((node) => node.type === "group");

  els.groupPickerList.innerHTML = groups.length
    ? groups.map((group) => `
        <button
          type="button"
          class="group-picker-option"
          data-group-target="${escapeHtml(group.uid)}"
        >
          <span>${escapeHtml(group.title || "未命名组")}</span>
          <small>${group.items.length} 条</small>
        </button>
      `).join("")
    : '<div class="group-picker-empty">当前还没有组，可以直接新建。</div>';

  els.groupPickerOverlay.hidden = false;
  document.body.classList.add("modal-open");
}

function closeGroupPicker() {
  els.groupPickerOverlay.hidden = true;
  state.pendingGroupItem = null;
  document.body.classList.remove("modal-open");
}

function closeGlobalNodeMenu() {
  els.globalNodeMenu.hidden = true;

  document.querySelectorAll(".node-menu-button[aria-expanded='true']").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });

  state.activeNodeMenu = null;
}

function buildGlobalMenuExtra(nodeType, inGroup) {
  if (nodeType !== "item") return "";

  const parts = [
    '<button type="button" class="global-menu-extra-action" data-action="group">分组</button>',
  ];

  if (inGroup) {
    parts.push('<button type="button" class="global-menu-extra-action" data-action="ungroup">移出组</button>');
  }

  return parts.join("");
}

function positionGlobalNodeMenu(button) {
  const rect = button.getBoundingClientRect();
  const menu = els.globalNodeMenu;
  const gap = 8;
  const margin = 10;

  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";
  menu.style.visibility = "hidden";

  const menuRect = menu.getBoundingClientRect();

  let left = rect.left;
  if (left + menuRect.width > window.innerWidth - margin) {
    left = window.innerWidth - menuRect.width - margin;
  }
  left = Math.max(margin, left);

  let top = rect.bottom + gap;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = rect.top - menuRect.height - gap;
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - menuRect.height - margin));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "visible";
}

function openGlobalNodeMenu(button) {
  closeGlobalNodeMenu();

  const uid = button.dataset.menuUid;
  const category = button.dataset.menuCategory;
  const nodeType = button.dataset.menuType;
  const inGroup = button.dataset.menuInGroup === "true";

  state.activeNodeMenu = { uid, category, nodeType, inGroup };
  els.globalNodeMenuExtra.innerHTML = buildGlobalMenuExtra(nodeType, inGroup);

  button.setAttribute("aria-expanded", "true");
  positionGlobalNodeMenu(button);
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

function blockForNode(node, numberRef) {
  if (node.type !== "group") {
    const block = `（${numberRef.value}）${normalizeNewsText(node.content)}`;
    numberRef.value += 1;
    return block;
  }

  const header = `（${numberRef.value}）【${normalizeNewsText(node.title || "未命名组")}】`;
  numberRef.value += 1;

  if (!node.items.length) return header;

  const children = node.items.map((item, idx) => {
    const marker = CIRCLED[idx] || `${idx + 1}.`;
    return `${marker} ${normalizeNewsText(item.content)}`;
  });

  return `${header}\n${children.join("\n\n")}`;
}

function buildReport() {
  const [, month, day] = state.date.split("-").map(Number);
  const editionText = state.edition === "evening" ? "晚报" : "早报";
  const numberRef = { value: 1 };

  const domesticBlocks = state.boards.domestic.map((node) => blockForNode(node, numberRef));
  const foreignBlocks = state.boards.foreign.map((node) => blockForNode(node, numberRef));

  const parts = [
    `${month}月${day}日利率${editionText} 重要事件回顾（财通固收·隋修平团队）`,
    "",
    "国内新闻：",
  ];

  if (domesticBlocks.length) {
    parts.push("", domesticBlocks.join("\n\n"));
  }

  parts.push("", "国外新闻：");

  if (foreignBlocks.length) {
    parts.push("", foreignBlocks.join("\n\n"));
  }

  parts.push(
    "",
    "资料来源：华尔街见闻，财通证券研究所",
    "免责声明：信息来自公开信息整理"
  );

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
        return Boolean(item?.manual) ||
          String(item?.uid || "").startsWith("manual-") ||
          validIds.has(item?.uid);
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
  const menuButton = event.target.closest(".node-menu-button");

  if (menuButton) {
    event.stopPropagation();

    if (
      state.activeNodeMenu?.uid === menuButton.dataset.menuUid &&
      !els.globalNodeMenu.hidden
    ) {
      closeGlobalNodeMenu();
    } else {
      openGlobalNodeMenu(menuButton);
    }

    return;
  }

  const menuAction = event.target.closest(".global-menu-action, .global-menu-extra-action");

  if (menuAction && state.activeNodeMenu) {
    event.stopPropagation();

    const action = menuAction.dataset.action;
    const { uid, category } = state.activeNodeMenu;

    closeGlobalNodeMenu();

    if (["move-top", "move-up", "move-down", "move-bottom"].includes(action)) {
      moveNodePosition(uid, action);
    } else if (action === "group") {
      openGroupPicker(uid, category);
    } else if (action === "ungroup") {
      ungroupItem(uid);
    }

    return;
  }

  const deleteItemButton = event.target.closest(".delete-item-corner");

  if (deleteItemButton) {
    event.stopPropagation();
    closeGlobalNodeMenu();
    deleteItem(deleteItemButton.dataset.deleteUid);
    return;
  }

  const deleteGroupButton = event.target.closest(".delete-group-corner");

  if (deleteGroupButton) {
    event.stopPropagation();
    closeGlobalNodeMenu();
    deleteGroup(deleteGroupButton.dataset.category, deleteGroupButton.dataset.deleteGroup);
    return;
  }

  const content = event.target.closest(".review-item-content[data-expand-uid]");

  if (content && content.dataset.expandable === "true" && window.innerWidth <= 780) {
    const uid = content.dataset.expandUid;

    if (state.expandedItems.has(uid)) state.expandedItems.delete(uid);
    else state.expandedItems.add(uid);

    render();
    return;
  }

  const groupOption = event.target.closest(".group-picker-option");

  if (groupOption && state.pendingGroupItem) {
    moveItemToGroup(
      state.pendingGroupItem.uid,
      state.pendingGroupItem.category,
      groupOption.dataset.groupTarget
    );
    return;
  }

  if (!event.target.closest("#globalNodeMenu")) {
    closeGlobalNodeMenu();
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

window.addEventListener("resize", () => {
  closeGlobalNodeMenu();
  render();
});

window.addEventListener("scroll", () => {
  closeGlobalNodeMenu();
}, { passive: true });

els.newDomesticGroupButton.addEventListener("click", () => addGroup("domestic"));
els.newForeignGroupButton.addEventListener("click", () => addGroup("foreign"));
els.addManualDomesticButton.addEventListener("click", () => addManualNews("domestic"));
els.addManualForeignButton.addEventListener("click", () => addManualNews("foreign"));

els.closeGroupPickerButton.addEventListener("click", closeGroupPicker);

els.groupPickerOverlay.addEventListener("click", (event) => {
  if (event.target === els.groupPickerOverlay) closeGroupPicker();
});

els.createGroupForItemButton.addEventListener("click", () => {
  if (!state.pendingGroupItem) return;

  const { uid, category } = state.pendingGroupItem;
  const group = addGroup(category);

  if (group) {
    moveItemToGroup(uid, category, group.uid);
  }
});

els.resetButton.addEventListener("click", () => {
  state.boards = clone(state.initialBoards);

  try {
    localStorage.removeItem(reviewStateKey(state.date));
  } catch (_) {}

  state.expandedItems.clear();
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
