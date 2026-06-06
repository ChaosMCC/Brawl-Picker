// assistant.js — the live draft walk-through.
import { el, clear, tierBadge, roleDot, portrait, openPicker, ROLE_COLORS } from "./ui.js";
import { draftOrder, pickTypeLabel, recommend, suggestBans, availableBrawlers } from "./engine.js";

const ROLES = ["Tank", "Assassin", "Marksman", "Artillery", "Controller", "Support", "Damage Dealer"];
let roleFilter = null;

function engineState(ctx) {
  const { state, draft } = ctx;
  return { mode: state.mode, map: state.map, firstPickTeam: draft.firstPickTeam, bans: draft.bans, picks: draft.picks };
}

export function renderAssistant(ctx, root) {
  clear(root);
  root.appendChild(setupCard(ctx));
  root.appendChild(bansCard(ctx));
  root.appendChild(boardCard(ctx));
  root.appendChild(recCard(ctx));
}

/* ---------- setup ---------- */
function setupCard(ctx) {
  const { draft, actions } = ctx;
  const toggle = el("div", { class: "coin-toggle" }, [
    el("button", { class: "you" + (draft.firstPickTeam === "you" ? " active" : ""), text: "🟢 You pick first", onClick: () => actions.setFirstPick("you") }),
    el("button", { class: "enemy" + (draft.firstPickTeam === "enemy" ? " active" : ""), text: "🔴 Enemy first", onClick: () => actions.setFirstPick("enemy") }),
  ]);
  return el("div", { class: "card" }, [
    el("div", { class: "setup-row" }, [
      el("div", {}, [el("div", { class: "section-label", text: "Coin flip — who picks first?" }), toggle]),
      el("div", { style: "flex:1" }),
      el("button", { class: "btn ghost", text: "↺ Reset draft", onClick: actions.resetDraft }),
    ]),
    el("p", { class: "hint", style: "margin-top:10px", text: "Set the map above, enter bans, then walk the picks. Click any slot to get advice for it; tap a recommendation to lock it in." }),
  ]);
}

/* ---------- bans ---------- */
function banSide(ctx, team) {
  const { draft, data, actions } = ctx;
  const slots = el("div", { class: "ban-slots" });
  for (let i = 0; i < 3; i++) {
    const name = draft.bans[team][i];
    const b = name ? data.byName[name] : null;
    const slot = el("div", { class: "ban-slot" + (b ? " filled" : ""), title: b ? `Ban: ${b.name} (click to remove)` : "Add ban", onClick: () => {
      if (b) actions.removeBan(team, name);
      else openPicker(`${team === "you" ? "Your" : "Enemy"} ban`, availableBrawlers(data, engineState(ctx)), (pick) => actions.addBan(team, pick.name));
    } }, b ? [portrait(b, ""), el("span", { class: "ban-x", text: "✕" })] : [el("span", { text: "+" })]);
    slots.appendChild(slot);
  }
  return el("div", { class: `ban-side ${team}` }, [
    el("h4", { text: team === "you" ? "Your bans" : "Enemy bans" }),
    slots,
  ]);
}

function bansCard(ctx) {
  const { data } = ctx;
  const bans = suggestBans(data, engineState(ctx), 6);
  const sugg = el("div", { class: "mini-list" }, bans.map((s) => el("div", { class: "mini" }, [
    portrait(s.brawler, ""), tierBadge(s.tier),
    el("span", { class: "mname", text: s.brawler.name }),
    el("button", { class: "btn", text: "Ban", title: "Add to your bans", onClick: () => ctx.actions.addBan("you", s.brawler.name) }),
  ])));

  return el("div", { class: "card" }, [
    el("div", { class: "card-title" }, [el("span", { text: "🚫 Ban phase" })]),
    el("p", { class: "card-sub", text: "Each team bans 3 (Mythic+). Ban the strongest / safest threats on this map." }),
    el("div", { class: "ban-zone" }, [banSide(ctx, "you"), banSide(ctx, "enemy")]),
    el("p", { class: "section-label", style: "margin:16px 0 8px", text: "Suggested bans for this map" }),
    sugg,
  ]);
}

/* ---------- board ---------- */
function boardCard(ctx) {
  const { draft, data, actions } = ctx;
  const order = draftOrder(draft.firstPickTeam);
  const board = el("div", { class: "board" });
  order.forEach((slot) => {
    const i = slot.index;
    const pick = draft.picks[i];
    const b = pick ? data.byName[pick.name] : null;
    const cls = `slot ${slot.team}` + (draft.activeSlot === i ? " active" : "");
    const flag = slot.isFirst ? el("span", { class: "first-flag", text: "1ST PICK" })
      : slot.isLast ? el("span", { class: "last-flag", text: "LAST PICK" }) : null;

    const portraitBox = el("div", { class: "slot-portrait", onClick: (e) => {
      e.stopPropagation();
      if (b) { actions.clearSlot(i); return; }
      actions.setActiveSlot(i);
      openPicker(`${slot.team === "you" ? "Your" : "Enemy"} ${pickTypeLabel(slot).toLowerCase()}`,
        availableBrawlers(data, engineState(ctx)), (p) => actions.assignToSlot(i, p.name));
    } }, b ? [portrait(b, "")] : [el("span", { text: pick ? "" : "+" })]);

    board.appendChild(el("div", { class: cls, onClick: () => actions.setActiveSlot(i) }, [
      flag,
      el("div", { class: "slot-tag slot-team", text: slot.team === "you" ? "YOU" : "ENEMY" }),
      portraitBox,
      el("div", { class: "slot-name", text: b ? b.name : pickTypeLabel(slot) }),
      b ? el("span", { class: "slot-tag", html: `<span class="role-dot" style="background:${ROLE_COLORS[b.class] || ROLE_COLORS.Unknown}"></span> ${b.class}` }) : el("div", { class: "slot-tag", text: slot.team === "you" ? "tap for advice" : "record pick" }),
    ]));
  });

  return el("div", { class: "card" }, [
    el("div", { class: "card-title" }, [el("span", { text: "🧩 Draft board" }), el("span", { class: "hint", text: "1‑2‑2‑1 snake order →" })]),
    board,
  ]);
}

/* ---------- recommendations ---------- */
function strategyNote(slot, team, visibleEnemy) {
  if (team !== "you") return "Enemy is on the clock — these are their likely strong picks. Record what they take.";
  if (slot.isFirst) return "Blind first pick: the enemy picks twice after you. Favor safe, flexible brawlers that are hard to hard-counter.";
  if (slot.isLast) return "Last pick — you have full information and nobody counters you back. Lock the hardest counter to their comp.";
  return `You can see ${visibleEnemy} enemy pick${visibleEnemy === 1 ? "" : "s"}. Balance map strength, countering them, and your team's synergy.`;
}

function recCard(ctx) {
  const { data, draft, actions } = ctx;
  const estate = engineState(ctx);
  const order = draftOrder(draft.firstPickTeam);
  const slotIndex = draft.activeSlot;
  const slot = order[slotIndex];
  const { team, results } = recommend(data, estate, slotIndex, { roleFilter });

  const visibleEnemy = draft.picks.filter((p) => p && p.team === (team === "you" ? "enemy" : "you")).length;

  const filterRow = el("div", { class: "role-filter" }, [
    chip("All", roleFilter === null, () => { roleFilter = null; actions.rerender(); }, null),
    ...ROLES.map((r) => chip(r, roleFilter === r, () => { roleFilter = roleFilter === r ? null : r; actions.rerender(); }, ROLE_COLORS[r])),
  ]);

  const top = results.slice(0, 8);
  const maxT = top.length ? top[0].total : 1;
  const minT = top.length ? top[top.length - 1].total : 0;
  const span = Math.max(0.5, maxT - minT);

  const list = el("div", { class: "rec-list" }, top.length ? top.map((r, idx) => recRow(ctx, r, idx, slotIndex, team, (r.total - minT) / span)) :
    [el("p", { class: "empty", text: "No available brawlers match this filter." })]);

  const headLabel = `${slot.isFirst ? "First pick" : slot.isLast ? "Last pick" : pickTypeLabel(slot)} — ${team === "you" ? "YOUR pick" : "ENEMY pick"}`;

  return el("div", { class: "card" }, [
    el("div", { class: "rec-head" }, [
      el("div", { class: "card-title" }, [el("span", { text: `🎯 ${headLabel}` })]),
      el("span", { class: "hint", text: `${data.brawlers.length - draft.picks.filter(Boolean).length - draft.bans.you.length - draft.bans.enemy.length} available` }),
    ]),
    el("p", { class: "card-sub", text: strategyNote(slot, team, visibleEnemy) }),
    filterRow,
    list,
  ]);
}

function chip(label, active, onClick, color) {
  const c = el("button", { class: "role-chip" + (active ? " active" : ""), text: label, onClick });
  if (active && color) { c.style.background = color; c.style.borderColor = color; c.style.color = "#1a0030"; }
  return c;
}

function recRow(ctx, r, idx, slotIndex, team, barFrac) {
  const b = r.brawler;
  const reasons = r.reasons.slice(0, 3).map((rs) => el("span", { class: `chip ${rs.kind}`, text: rs.text }));
  const bar = el("div", { class: "score-bar" }, [el("i", { style: `width:${Math.round(20 + barFrac * 80)}%` })]);
  return el("div", { class: `rec rank-${idx}` }, [
    el("div", { class: "rec-rank", text: idx === 0 ? "★" : String(idx + 1) }),
    portrait(b, "rec-portrait"),
    el("div", { class: "rec-main" }, [
      el("div", { class: "rec-name" }, [roleDot(b.class), document.createTextNode(b.name), tierBadge(r.tier)]),
      el("div", { class: "rec-reasons" }, reasons.length ? reasons : [el("span", { class: "chip", text: `${b.class}` })]),
    ]),
    el("div", { class: "rec-actions" }, [
      bar,
      el("button", { class: "pick-btn", text: team === "you" ? "Pick" : "Set", onClick: () => ctx.actions.assignToSlot(slotIndex, b.name) }),
    ]),
  ]);
}
