// app.js — orchestrates state, controls, tabs and actions.
import { loadData } from "./data.js";
import { initPicker } from "./ui.js";
import { draftOrder } from "./engine.js";
import { renderAssistant } from "./assistant.js";
import { renderCheatsheet } from "./cheatsheet.js";

const LS_KEY = "brawlpicker.session.v1";

const state = { mode: null, map: null, tab: "assistant" };
const draft = freshDraft();
let data = null;

function freshDraft() {
  return { firstPickTeam: "you", bans: { you: [], enemy: [] }, picks: [null, null, null, null, null, null], activeSlot: 0 };
}

function saveSession() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ mode: state.mode, map: state.map, tab: state.tab, draft })); } catch (_) {}
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (!s) return;
    if (s.tab) state.tab = s.tab;
    if (s.mode) state.mode = s.mode;
    if (s.map) state.map = s.map;
    if (s.draft) Object.assign(draft, s.draft);
  } catch (_) {}
}

/* ---------- actions passed to tabs ---------- */
const actions = {
  rerender: renderActiveTab,
  setActiveSlot(i) { draft.activeSlot = i; saveSession(); renderActiveTab(); },
  setFirstPick(team) {
    if (draft.firstPickTeam === team) return;
    draft.firstPickTeam = team;
    draft.picks = [null, null, null, null, null, null]; // layout changed; clear board (bans stay)
    draft.activeSlot = 0;
    saveSession(); renderActiveTab();
  },
  assignToSlot(i, name) {
    const order = draftOrder(draft.firstPickTeam);
    draft.picks[i] = { team: order[i].team, name };
    const next = draft.picks.findIndex((p) => !p);
    draft.activeSlot = next === -1 ? i : next;
    saveSession(); renderActiveTab();
  },
  clearSlot(i) { draft.picks[i] = null; draft.activeSlot = i; saveSession(); renderActiveTab(); },
  addBan(team, name) {
    if (draft.bans[team].length >= 3 || draft.bans[team].includes(name)) return;
    // don't allow same brawler banned by both sides or already picked
    if (draft.bans.you.includes(name) || draft.bans.enemy.includes(name)) return;
    draft.bans[team].push(name); saveSession(); renderActiveTab();
  },
  removeBan(team, name) { draft.bans[team] = draft.bans[team].filter((n) => n !== name); saveSession(); renderActiveTab(); },
  resetDraft() { Object.assign(draft, freshDraft()); saveSession(); renderActiveTab(); },
};

function ctx() { return { data, state, draft, actions }; }

/* ---------- rendering ---------- */
function renderActiveTab() {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === state.tab));
  document.getElementById("tab-assistant").classList.toggle("active", state.tab === "assistant");
  document.getElementById("tab-cheatsheet").classList.toggle("active", state.tab === "cheatsheet");
  if (state.tab === "assistant") renderAssistant(ctx(), document.getElementById("tab-assistant"));
  else renderCheatsheet(ctx(), document.getElementById("tab-cheatsheet"));
}

function renderModePills() {
  const box = document.getElementById("mode-pills");
  box.innerHTML = "";
  for (const mode of data.modes) {
    const btn = document.createElement("button");
    btn.className = "mode-pill" + (mode === state.mode ? " active" : "");
    btn.textContent = mode;
    btn.addEventListener("click", () => {
      if (state.mode === mode) return;
      state.mode = mode;
      populateMaps();
      box.querySelectorAll(".mode-pill").forEach((p) => p.classList.toggle("active", p.textContent === mode));
      saveSession(); renderActiveTab();
    });
    box.appendChild(btn);
  }
}

function populateMaps() {
  const sel = document.getElementById("map-select");
  const maps = data.mapsByMode[state.mode] || [];
  sel.innerHTML = "";
  for (const m of maps) {
    const o = document.createElement("option");
    o.value = m.name; o.textContent = m.name;
    sel.appendChild(o);
  }
  if (!maps.find((m) => m.name === state.map)) state.map = maps.length ? maps[0].name : null;
  sel.value = state.map || "";
  updateThumb();
}

function updateThumb() {
  const maps = data.mapsByMode[state.mode] || [];
  const m = maps.find((x) => x.name === state.map);
  const thumb = document.getElementById("map-thumb");
  if (m && m.img) { thumb.src = m.img; thumb.style.visibility = "visible"; }
  else thumb.style.visibility = "hidden";
}

function setDataStatus() {
  const node = document.getElementById("data-status");
  const src = data.meta.source;
  const map = { live: ["🟢 Live data", "live"], cache: ["🟢 Live (cached)", "live"], "stale-cache": ["🟡 Cached roster", "warn"], bundled: ["🟡 Offline snapshot", "warn"] };
  const [label, cls] = map[src] || ["roster", ""];
  node.textContent = `${label} · ${data.meta.brawlerCount} brawlers · tiers ${data.meta.updated}`;
  node.className = "data-status " + cls;
}

/* ---------- boot ---------- */
async function boot() {
  initPicker();
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    state.tab = t.dataset.tab; saveSession(); renderActiveTab();
  }));
  document.getElementById("map-select").addEventListener("change", (e) => {
    state.map = e.target.value; updateThumb(); saveSession(); renderActiveTab();
  });

  loadSession();
  try {
    data = await loadData();
  } catch (err) {
    const loading = document.getElementById("loading");
    const fileProto = location.protocol === "file:";
    loading.innerHTML = `<p style="max-width:520px;text-align:center;line-height:1.5">
      ⚠️ Couldn't load data.${fileProto ? " It looks like you opened this file directly. Browsers block local data over <code>file://</code>." : ""}
      <br><br>Run it from a web server instead — e.g. <code>python -m http.server</code> in this folder, then open <code>http://localhost:8000</code>. On GitHub Pages it just works.
      <br><br><span class="hint">${String(err)}</span></p>`;
    return;
  }

  if (!state.mode || !data.modes.includes(state.mode)) state.mode = data.modes[0];
  renderModePills();
  populateMaps();
  setDataStatus();

  document.getElementById("loading").hidden = true;
  document.getElementById("controls").hidden = false;
  document.getElementById("tabs").hidden = false;
  document.getElementById("main").hidden = false;
  renderActiveTab();
}

boot();
