const state = {
  data: null,
  date: "",
  edition: "morning",
  selections: {},
  boards: { domestic: [], foreign: [] },
  groupResetBaseline: null,
  expandedItems: new Set(),
  pendingGroupItem: null,
  activeNodeMenu: null,
  cloudVersion: 0,
  applyingRemote: false,
};

const els = {
  domesticBoard: document.getElementById("domesticBoard"),
  foreignBoard: document.getElementById("foreignBoard"),
  domesticCount: document.getElementById("domesticCount"),
  foreignCount: document.getElementById("foreignCount"),
  reviewCount: document.getElementById("reviewCount"),
  newDomesticGroupButton: document.getElementById("newDomesticGroupButton"),
  newForeignGroupButton: document.getElementById("newForeignGroupButton"),
  clearGroupsButton: document.getElementById("clearGroupsButton"),
  resetGroupsButton: document.getElementById("resetGroupsButton"),
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
  reviewCloudStatus: document.getElementById("reviewCloudStatus"),
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeNewsText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceItems() {
  if (!state.data) return [];

  if (
    Array.isArray(state.data.history_items) &&
    state.data.history_items.length
  ) {
    return state.data.history_items;
  }

  return state.data.items || [];
}

function workspaceSnapshot() {
  return {
    schemaVersion: 1,
    selections: state.selections,
    edition: state.edition,
    reviewLayout: state.boards,
  };
}

function setCloudStatus({ text, kind }) {
  els.reviewCloudStatus.textContent = text;
  els.reviewCloudStatus.dataset.kind = kind || "neutral";
}

async function persistWorkspace() {
  if (state.applyingRemote) return;

  const result = await window.WSCNCloud.saveWorkspace(
    workspaceSnapshot()
  );

  state.cloudVersion = result.version || state.cloudVersion;
}

function makeItem(raw) {
  return {
    type: "item",
    uid: `news-${raw.id}`,
    newsId: String(raw.id),
    content: raw.content || raw.title || "",
    title: raw.title || "",
    time: raw.time || "",
    display_time: raw.display_time || 0,
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

function countItems(board) {
  return board.reduce(
    (sum, node) =>
      sum + (node.type === "group" ? node.items.length : 1),
    0
  );
}

function previewLimit() {
  if (window.innerWidth <= 480) return 64;
  if (window.innerWidth <= 780) return 92;
  return Infinity;
}

function previewText(item) {
  const text = normalizeNewsText(item.content);
  const limit = previewLimit();

  if (
    !Number.isFinite(limit) ||
    state.expandedItems.has(item.uid) ||
    text.length <= limit
  ) {
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
        <div class="review-item-meta">
          ${escapeHtml(item.time || "")}
          ${preview.truncated ? " · 点正文展开" : ""}
        </div>
        <div
          class="review-item-content ${preview.truncated ? "is-truncated" : ""}"
          data-expand-uid="${escapeHtml(item.uid)}"
          data-expandable="${fullText.length > previewLimit() ? "true" : "false"}"
        >${escapeHtml(preview.text)}</div>
      </div>
    </article>`;
}

function boardHtml(category) {
  return state.boards[category]
    .map((node) => {
      if (node.type !== "group") {
        return itemHtml(node, category);
      }

      return `
        <section
          class="review-group"
          data-uid="${escapeHtml(node.uid)}"
          data-category="${category}"
          data-node-type="group"
        >
          <div class="group-head">
            ${menuHtml(node.uid, category, "group")}
            <input
              class="group-title-input"
              data-group-id="${escapeHtml(node.uid)}"
              value="${escapeHtml(node.title)}"
            />
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
            ${node.items
              .map((item) =>
                itemHtml(item, category, node.uid, true)
              )
              .join("")}
            ${
              node.items.length === 0
                ? '<div class="empty-group-hint">暂无新闻，可从新闻“...”菜单选择“分组”加入</div>'
                : ""
            }
          </div>
        </section>`;
    })
    .join("");
}

function render() {
  els.domesticBoard.innerHTML = boardHtml("domestic");
  els.foreignBoard.innerHTML = boardHtml("foreign");

  const domesticCount = countItems(state.boards.domestic);
  const foreignCount = countItems(state.boards.foreign);

  els.domesticCount.textContent = `${domesticCount} 条`;
  els.foreignCount.textContent = `${foreignCount} 条`;

  els.reviewCount.textContent =
    `共 ${domesticCount + foreignCount} 条 · ${
      state.edition === "evening" ? "晚报" : "早报"
    }`;
}

function locateNode(uid) {
  for (const category of ["domestic", "foreign"]) {
    const board = state.boards[category];

    for (let i = 0; i < board.length; i++) {
      const node = board[i];

      if (node.uid === uid) {
        return {
          category,
          parent: board,
          index: i,
          node,
          group: null,
          groupIndex: -1,
        };
      }

      if (node.type === "group") {
        const j = node.items.findIndex(
          (item) => item.uid === uid
        );

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

async function moveNodePosition(uid, action) {
  const found = locateNode(uid);
  if (!found) return;

  let targetIndex = found.index;

  if (action === "move-top") targetIndex = 0;
  else if (action === "move-up") {
    targetIndex = Math.max(0, found.index - 1);
  } else if (action === "move-down") {
    targetIndex = Math.min(
      found.parent.length - 1,
      found.index + 1
    );
  } else if (action === "move-bottom") {
    targetIndex = found.parent.length - 1;
  } else {
    return;
  }

  if (targetIndex === found.index) return;

  const [node] = found.parent.splice(found.index, 1);
  found.parent.splice(targetIndex, 0, node);

  render();
  await persistWorkspace();
}

async function deleteItem(uid) {
  const found = locateNode(uid);
  if (!found || found.node.type !== "item") return;

  const item = found.parent.splice(found.index, 1)[0];

  // 删除来源新闻时，同步取消第一页选择，
  // 否则下次打开整理页会重新出现。
  if (item.newsId) {
    delete state.selections[String(item.newsId)];
  }

  state.expandedItems.delete(uid);

  render();
  await persistWorkspace();
}

async function deleteGroup(category, groupId) {
  const board = state.boards[category];

  const index = board.findIndex(
    (node) => node.uid === groupId && node.type === "group"
  );

  if (index < 0) return;

  const group = board[index];
  board.splice(index, 1, ...group.items);

  render();
  await persistWorkspace();
}

async function ungroupItem(uid) {
  const found = locateNode(uid);
  if (!found || !found.group) return;

  const item = found.parent.splice(found.index, 1)[0];
  const board = state.boards[found.category];

  const groupIndex = board.findIndex(
    (node) => node.uid === found.group.uid
  );

  board.splice(groupIndex + 1, 0, item);

  render();
  await persistWorkspace();
}

async function moveItemToGroup(uid, category, groupId) {
  const found = locateNode(uid);
  if (!found || found.node.type !== "item") return;

  const targetGroup = state.boards[category].find(
    (node) =>
      node.type === "group" && node.uid === groupId
  );

  if (!targetGroup) return;

  if (found.group?.uid === groupId) {
    closeGroupPicker();
    return;
  }

  const item = found.parent.splice(found.index, 1)[0];
  targetGroup.items.push(item);

  closeGroupPicker();
  render();
  await persistWorkspace();
}

async function switchItemCategory(uid) {
  const found = locateNode(uid);
  if (!found || found.node.type !== "item") return;

  const targetCategory =
    found.category === "domestic" ? "foreign" : "domestic";

  const [item] = found.parent.splice(found.index, 1);
  state.boards[targetCategory].push(item);

  if (item.newsId) {
    state.selections[String(item.newsId)] =
      targetCategory;
  }

  render();
  await persistWorkspace();
}

async function addGroup(category, presetTitle = "新建组") {
  const title = window.prompt("组标题", presetTitle);
  if (title === null) return null;

  const group = makeGroup(title.trim() || "新建组");
  state.boards[category].push(group);

  render();
  await persistWorkspace();

  return group;
}

function openGroupPicker(uid, category) {
  state.pendingGroupItem = { uid, category };

  const groups = state.boards[category].filter(
    (node) => node.type === "group"
  );

  els.groupPickerList.innerHTML = groups.length
    ? groups
        .map(
          (group) => `
        <button
          type="button"
          class="group-picker-option"
          data-group-target="${escapeHtml(group.uid)}"
        >
          <span>${escapeHtml(group.title || "未命名组")}</span>
          <small>${group.items.length} 条</small>
        </button>
      `
        )
        .join("")
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

  document
    .querySelectorAll(
      ".node-menu-button[aria-expanded='true']"
    )
    .forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });

  state.activeNodeMenu = null;
}

function buildGlobalMenuExtra(
  nodeType,
  inGroup,
  category
) {
  if (nodeType !== "item") return "";

  const switchLabel =
    category === "domestic"
      ? "切到国外"
      : "切到国内";

  const parts = [
    '<button type="button" class="global-menu-extra-action" data-action="group">分组</button>',
    `<button type="button" class="global-menu-extra-action" data-action="switch-category">${switchLabel}</button>`,
  ];

  if (inGroup) {
    parts.push(
      '<button type="button" class="global-menu-extra-action" data-action="ungroup">移出组</button>'
    );
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

  if (
    left + menuRect.width >
    window.innerWidth - margin
  ) {
    left =
      window.innerWidth -
      menuRect.width -
      margin;
  }

  left = Math.max(margin, left);

  let top = rect.bottom + gap;

  if (
    top + menuRect.height >
    window.innerHeight - margin
  ) {
    top =
      rect.top -
      menuRect.height -
      gap;
  }

  top = Math.max(
    margin,
    Math.min(
      top,
      window.innerHeight -
        menuRect.height -
        margin
    )
  );

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "visible";
}

function openGlobalNodeMenu(button) {
  closeGlobalNodeMenu();

  const uid = button.dataset.menuUid;
  const category = button.dataset.menuCategory;
  const nodeType = button.dataset.menuType;
  const inGroup =
    button.dataset.menuInGroup === "true";

  state.activeNodeMenu = {
    uid,
    category,
    nodeType,
    inGroup,
  };

  els.globalNodeMenuExtra.innerHTML =
    buildGlobalMenuExtra(
      nodeType,
      inGroup,
      category
    );

  button.setAttribute("aria-expanded", "true");
  positionGlobalNodeMenu(button);
}

async function addManualNews(category) {
  const content =
    els.manualNewsInput.value.trim();

  if (!content) {
    els.manualNewsInput.focus();
    return;
  }

  state.boards[category].push(
    makeManualItem(content)
  );

  els.manualNewsInput.value = "";

  render();
  await persistWorkspace();
}

async function flattenGroups() {
  for (const category of ["domestic", "foreign"]) {
    const flat = [];

    for (const node of state.boards[category]) {
      if (node.type === "group") {
        flat.push(...(node.items || []));
      } else {
        flat.push(node);
      }
    }

    state.boards[category] = flat;
  }

  render();
  await persistWorkspace();
}

function allCurrentItemsByCategory() {
  const result = {
    domestic: new Map(),
    foreign: new Map(),
  };

  for (const category of ["domestic", "foreign"]) {
    for (const node of state.boards[category]) {
      if (node.type === "group") {
        for (const item of node.items || []) {
          result[category].set(item.uid, item);
        }
      } else {
        result[category].set(node.uid, node);
      }
    }
  }

  return result;
}

async function restoreGroupsFromBaseline() {
  if (!state.groupResetBaseline) return;

  const current = allCurrentItemsByCategory();

  for (const category of ["domestic", "foreign"]) {
    const baseline =
      state.groupResetBaseline[category] || [];

    const rebuilt = [];
    const placed = new Set();

    for (const node of baseline) {
      if (node.type === "group") {
        const group = {
          type: "group",
          uid: node.uid,
          title: node.title,
          items: [],
        };

        for (const baselineItem of node.items || []) {
          const currentItem =
            current[category].get(
              baselineItem.uid
            );

          if (currentItem) {
            group.items.push(currentItem);
            placed.add(currentItem.uid);
          }
        }

        rebuilt.push(group);
      } else {
        const currentItem =
          current[category].get(node.uid);

        if (currentItem) {
          rebuilt.push(currentItem);
          placed.add(currentItem.uid);
        }
      }
    }

    for (const item of current[category].values()) {
      if (!placed.has(item.uid)) {
        rebuilt.push(item);
      }
    }

    state.boards[category] = rebuilt;
  }

  render();
  await persistWorkspace();
}

function blockForNode(node, numberRef) {
  if (node.type !== "group") {
    const block =
      `（${numberRef.value}）${normalizeNewsText(
        node.content
      )}`;

    numberRef.value += 1;
    return block;
  }

  const header =
    `（${numberRef.value}）【${normalizeNewsText(
      node.title || "未命名组"
    )}】`;

  numberRef.value += 1;

  if (!node.items.length) return header;

  const children = node.items.map(
    (item, idx) => {
      const marker =
        CIRCLED[idx] || `${idx + 1}.`;

      return `${marker} ${normalizeNewsText(
        item.content
      )}`;
    }
  );

  return `${header}\n${children.join("\n\n")}`;
}

function buildReport() {
  const [, month, day] =
    state.date.split("-").map(Number);

  const editionText =
    state.edition === "evening"
      ? "晚报"
      : "早报";

  const numberRef = { value: 1 };

  const domesticBlocks =
    state.boards.domestic.map((node) =>
      blockForNode(node, numberRef)
    );

  const foreignBlocks =
    state.boards.foreign.map((node) =>
      blockForNode(node, numberRef)
    );

  const parts = [
    `${month}月${day}日利率${editionText} 重要事件回顾（财通固收·隋修平团队）`,
    "",
    "国内新闻：",
  ];

  if (domesticBlocks.length) {
    parts.push(
      "",
      domesticBlocks.join("\n\n")
    );
  }

  parts.push("", "国外新闻：");

  if (foreignBlocks.length) {
    parts.push(
      "",
      foreignBlocks.join("\n\n")
    );
  }

  parts.push(
    "",
    "资料来源：华尔街见闻，财通证券研究所",
    "免责声明：信息来自公开信息整理"
  );

  return parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);

    const old =
      els.copyReportButton.textContent;

    els.copyReportButton.textContent =
      "已复制";

    setTimeout(() => {
      els.copyReportButton.textContent =
        old;
    }, 1400);
  } catch (_) {
    window.prompt("复制以下内容：", text);
  }
}

function reconcileLayoutWithSelections(
  layout,
  selections
) {
  const selectedRaw = sourceItems().filter(
    (item) => selections[String(item.id)]
  );

  const selectedMap = new Map(
    selectedRaw.map((item) => [
      `news-${item.id}`,
      makeItem(item),
    ])
  );

  function keepItem(item) {
    if (
      item?.manual ||
      String(item?.uid || "").startsWith("manual-")
    ) {
      return item;
    }

    return selectedMap.get(item?.uid) || null;
  }

  function cleanBoard(board) {
    return (board || [])
      .map((node) => {
        if (node.type === "group") {
          node.items = (node.items || [])
            .map(keepItem)
            .filter(Boolean);

          return node;
        }

        return keepItem(node);
      })
      .filter(Boolean);
  }

  const boards = {
    domestic: cleanBoard(
      clone(layout?.domestic || [])
    ),
    foreign: cleanBoard(
      clone(layout?.foreign || [])
    ),
  };

  const present = new Set();

  for (const category of ["domestic", "foreign"]) {
    for (const node of boards[category]) {
      if (node.type === "group") {
        for (const item of node.items || []) {
          present.add(item.uid);
        }
      } else {
        present.add(node.uid);
      }
    }
  }

  for (const raw of selectedRaw) {
    const uid = `news-${raw.id}`;

    if (present.has(uid)) continue;

    const category =
      selections[String(raw.id)];

    if (
      category === "domestic" ||
      category === "foreign"
    ) {
      boards[category].push(makeItem(raw));
      present.add(uid);
    }
  }

  return boards;
}

async function initialLoad() {
  try {
    window.WSCNCloud.setStatusListener(
      setCloudStatus
    );

    const res = await fetch(
      `./data/latest.json?t=${Date.now()}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    state.data = await res.json();
    state.date = state.data.date;

    const workspace =
      await window.WSCNCloud.loadWorkspace({
        allowPrompt: true,
      });

    state.cloudVersion =
      workspace.version || 0;

    const normalized =
      window.WSCNCloud.normalizeState(
        workspace.state
      );

    state.selections =
      normalized.selections || {};

    state.edition =
      normalized.edition === "morning" ||
      normalized.edition === "evening"
        ? normalized.edition
        : "morning";

    state.boards =
      reconcileLayoutWithSelections(
        normalized.reviewLayout,
        state.selections
      );

    state.groupResetBaseline =
      clone(state.boards);

    render();
    await persistWorkspace();
  } catch (error) {
    console.error(error);

    els.reviewError.hidden = false;
    els.reviewError.querySelector(
      "p"
    ).textContent =
      `读取失败：${error.message}`;
  }
}

async function pollCloud() {
  if (document.hidden) return;

  const active = document.activeElement;

  if (
    active?.classList?.contains(
      "group-title-input"
    ) ||
    active === els.manualNewsInput
  ) {
    return;
  }

  const remote =
    await window.WSCNCloud.refreshRemoteIfNewer();

  if (!remote) return;

  const version =
    Number(remote.version || 0);

  if (version <= Number(state.cloudVersion || 0)) {
    return;
  }

  state.applyingRemote = true;
  state.cloudVersion = version;

  const normalized =
    window.WSCNCloud.normalizeState(
      remote.state
    );

  state.selections =
    normalized.selections || {};

  state.edition =
    normalized.edition || state.edition;

  state.boards =
    reconcileLayoutWithSelections(
      normalized.reviewLayout,
      state.selections
    );

  render();

  state.applyingRemote = false;

  setCloudStatus({
    text: "云端：已收到其他设备更新",
    kind: "success",
  });
}

document.addEventListener("click", async (event) => {
  const menuButton =
    event.target.closest(".node-menu-button");

  if (menuButton) {
    event.stopPropagation();

    if (
      state.activeNodeMenu?.uid ===
        menuButton.dataset.menuUid &&
      !els.globalNodeMenu.hidden
    ) {
      closeGlobalNodeMenu();
    } else {
      openGlobalNodeMenu(menuButton);
    }

    return;
  }

  const menuAction =
    event.target.closest(
      ".global-menu-action, .global-menu-extra-action"
    );

  if (menuAction && state.activeNodeMenu) {
    event.stopPropagation();

    const action =
      menuAction.dataset.action;

    const { uid, category } =
      state.activeNodeMenu;

    closeGlobalNodeMenu();

    if (
      [
        "move-top",
        "move-up",
        "move-down",
        "move-bottom",
      ].includes(action)
    ) {
      await moveNodePosition(uid, action);
    } else if (action === "group") {
      openGroupPicker(uid, category);
    } else if (action === "ungroup") {
      await ungroupItem(uid);
    } else if (
      action === "switch-category"
    ) {
      await switchItemCategory(uid);
    }

    return;
  }

  const deleteItemButton =
    event.target.closest(
      ".delete-item-corner"
    );

  if (deleteItemButton) {
    event.stopPropagation();
    closeGlobalNodeMenu();

    await deleteItem(
      deleteItemButton.dataset.deleteUid
    );

    return;
  }

  const deleteGroupButton =
    event.target.closest(
      ".delete-group-corner"
    );

  if (deleteGroupButton) {
    event.stopPropagation();
    closeGlobalNodeMenu();

    await deleteGroup(
      deleteGroupButton.dataset.category,
      deleteGroupButton.dataset.deleteGroup
    );

    return;
  }

  const content =
    event.target.closest(
      ".review-item-content[data-expand-uid]"
    );

  if (
    content &&
    content.dataset.expandable === "true" &&
    window.innerWidth <= 780
  ) {
    const uid =
      content.dataset.expandUid;

    if (state.expandedItems.has(uid)) {
      state.expandedItems.delete(uid);
    } else {
      state.expandedItems.add(uid);
    }

    render();
    return;
  }

  const groupOption =
    event.target.closest(
      ".group-picker-option"
    );

  if (
    groupOption &&
    state.pendingGroupItem
  ) {
    await moveItemToGroup(
      state.pendingGroupItem.uid,
      state.pendingGroupItem.category,
      groupOption.dataset.groupTarget
    );

    return;
  }

  if (
    !event.target.closest(
      "#globalNodeMenu"
    )
  ) {
    closeGlobalNodeMenu();
  }
});

document.addEventListener("change", async (event) => {
  const input =
    event.target.closest(".group-title-input");

  if (!input) return;

  for (const category of [
    "domestic",
    "foreign",
  ]) {
    const group =
      state.boards[category].find(
        (node) =>
          node.type === "group" &&
          node.uid ===
            input.dataset.groupId
      );

    if (group) {
      group.title = input.value;
      await persistWorkspace();
      break;
    }
  }
});

window.addEventListener("resize", () => {
  closeGlobalNodeMenu();
  render();
});

window.addEventListener(
  "scroll",
  () => closeGlobalNodeMenu(),
  { passive: true }
);

els.newDomesticGroupButton.addEventListener(
  "click",
  () => addGroup("domestic")
);

els.newForeignGroupButton.addEventListener(
  "click",
  () => addGroup("foreign")
);

els.addManualDomesticButton.addEventListener(
  "click",
  () => addManualNews("domestic")
);

els.addManualForeignButton.addEventListener(
  "click",
  () => addManualNews("foreign")
);

els.clearGroupsButton.addEventListener(
  "click",
  flattenGroups
);

els.resetGroupsButton.addEventListener(
  "click",
  restoreGroupsFromBaseline
);

els.closeGroupPickerButton.addEventListener(
  "click",
  closeGroupPicker
);

els.groupPickerOverlay.addEventListener(
  "click",
  (event) => {
    if (
      event.target ===
      els.groupPickerOverlay
    ) {
      closeGroupPicker();
    }
  }
);

els.createGroupForItemButton.addEventListener(
  "click",
  async () => {
    if (!state.pendingGroupItem) return;

    const { uid, category } =
      state.pendingGroupItem;

    const group =
      await addGroup(category);

    if (group) {
      await moveItemToGroup(
        uid,
        category,
        group.uid
      );
    }
  }
);

els.previewButton.addEventListener(
  "click",
  () => {
    els.reportText.value =
      buildReport();

    els.reportHeadingText.textContent =
      state.edition === "evening"
        ? "晚报"
        : "早报";

    els.reportPanel.hidden = false;

    requestAnimationFrame(() => {
      els.reportPanel.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }
);

els.copyReportButton.addEventListener(
  "click",
  () =>
    copyText(els.reportText.value)
);

initialLoad();

setInterval(
  pollCloud,
  window.WSCNCloud.getPollIntervalMs()
);
