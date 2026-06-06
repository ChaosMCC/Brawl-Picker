// cheatsheet.js — fast "prep this map" view.
import { el, clear, tierBadge, portrait, roleDot, ROLE_COLORS } from "./ui.js";
import { bestPicks, safeFirstPicks, suggestBans, bestPerRole } from "./engine.js";

const ROLES = ["Tank", "Assassin", "Marksman", "Artillery", "Controller", "Support", "Damage Dealer"];
let cheatRole = null;

export function renderCheatsheet(ctx, root) {
  clear(root);
  const { data, state, actions } = ctx;
  const { mode, map } = state;

  const filterRow = el("div", { class: "role-filter" }, [
    chip("All roles", cheatRole === null, () => { cheatRole = null; actions.rerender(); }, null),
    ...ROLES.map((r) => chip(r, cheatRole === r, () => { cheatRole = cheatRole === r ? null : r; actions.rerender(); }, ROLE_COLORS[r])),
  ]);

  const picks = bestPicks(data, mode, map, 18, cheatRole);
  const grid = el("div", { class: "pick-grid" }, picks.map((p) => el("div", { class: "pcard", title: `${p.brawler.name} · ${p.brawler.class}` }, [
    tierBadge(p.tier), portrait(p.brawler, ""),
    el("div", { class: "pname", text: p.brawler.name }),
  ])));

  const left = el("div", {}, [
    el("div", { class: "card" }, [
      el("div", { class: "card-title" }, [el("span", { text: `🏆 Best picks` }), el("span", { class: "hint", text: `${mode}${map ? " · " + map : ""}` })]),
      el("p", { class: "card-sub", text: "Ranked by strength on this mode/map. Filter by role to fill a specific slot." }),
      filterRow,
      grid,
    ]),
  ]);

  const safe = safeFirstPicks(data, mode, map, 6);
  const bans = suggestBans(data, { mode, map, bans: { you: [], enemy: [] }, picks: [] }, 6);
  const perRole = bestPerRole(data, mode, map);

  const right = el("div", {}, [
    miniCard("🛡️ Safe first picks", "Strong AND hard to hard-counter — good blind first picks.", safe.map((s) => miniRow(s.brawler, s.tier))),
    miniCard("🚫 Suggested bans", "The scariest picks to take off the board.", bans.map((s) => miniRow(s.brawler, s.tier))),
    miniCard("🎭 Best per role", "Top option in each class for this map.", perRole.map((r) => miniRow(r.top.brawler, r.top.tier, r.role))),
  ]);

  root.appendChild(el("div", { class: "cheat-grid" }, [left, right]));
}

function miniCard(title, sub, rows) {
  return el("div", { class: "card" }, [
    el("div", { class: "card-title" }, [el("span", { text: title })]),
    el("p", { class: "card-sub", text: sub }),
    el("div", { class: "mini-list" }, rows),
  ]);
}

function miniRow(b, tier, roleLabel) {
  return el("div", { class: "mini" }, [
    portrait(b, ""), tierBadge(tier),
    el("span", { class: "mname" }, [roleDot(b.class), document.createTextNode(" " + b.name)]),
    el("span", { class: "role-label", text: roleLabel || b.class }),
  ]);
}

function chip(label, active, onClick, color) {
  const c = el("button", { class: "role-chip" + (active ? " active" : ""), text: label, onClick });
  if (active && color) { c.style.background = color; c.style.borderColor = color; c.style.color = "#1a0030"; }
  return c;
}
