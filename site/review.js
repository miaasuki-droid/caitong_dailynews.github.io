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


