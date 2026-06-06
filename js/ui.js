// ui.js — tiny DOM helpers + shared widgets (badges, portraits, picker modal).

export const ROLE_COLORS = {
  Tank: "#e8743b", Assassin: "#e23d6d", Marksman: "#3d9be2", Artillery: "#9b6ddb",
  Controller: "#d05ce0", Support: "#3ec98a", "Damage Dealer": "#f0c020", Unknown: "#8a86a8",
};

// el("div", {class, text, html, onClick, ...attrs}, [children])
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "onClick") node.addEventListener("click", v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style") node.setAttribute("style", v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function tierBadge(tier) {
  const cls = tier === "S+" ? "tier-Splus" : "tier-" + tier;
  return el("span", { class: `tier-badge ${cls}`, text: tier });
}

export function roleDot(role) {
  return el("span", { class: "role-dot", style: `background:${ROLE_COLORS[role] || ROLE_COLORS.Unknown}` });
}

export function portrait(b, cls = "rec-portrait") {
  const img = el("img", { class: cls, alt: b.name, src: b.img, loading: "lazy", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => { img.style.visibility = "hidden"; });
  return img;
}

// ---- picker modal ----
let pickerState = { brawlers: [], onPick: null };

export function initPicker() {
  const modal = document.getElementById("picker");
  const search = document.getElementById("picker-search");
  document.getElementById("picker-close").addEventListener("click", closePicker);
  modal.addEventListener("click", (e) => { if (e.target === modal) closePicker(); });
  search.addEventListener("input", () => renderPickerGrid(search.value));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closePicker(); });
}

export function openPicker(title, brawlers, onPick) {
  pickerState = { brawlers, onPick };
  document.getElementById("picker-title").textContent = title;
  const search = document.getElementById("picker-search");
  search.value = "";
  document.getElementById("picker").hidden = false;
  renderPickerGrid("");
  setTimeout(() => search.focus(), 30);
}

export function closePicker() { document.getElementById("picker").hidden = true; }

function renderPickerGrid(query) {
  const grid = clear(document.getElementById("picker-grid"));
  const q = query.trim().toLowerCase();
  const list = pickerState.brawlers.filter((b) => b.name.toLowerCase().includes(q));
  if (!list.length) { grid.appendChild(el("p", { class: "empty", text: "No brawlers found." })); return; }
  for (const b of list) {
    grid.appendChild(el("button", { class: "pick-cell", title: `${b.name} · ${b.class}`, onClick: () => {
      closePicker();
      pickerState.onPick(b);
    } }, [portrait(b, ""), el("div", { class: "pc-name", text: b.name })]));
  }
}
