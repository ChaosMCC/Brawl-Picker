// engine.js — the drafting brain.
// Pure functions over the merged data set. No DOM here.

export const RANKED_MODES = [
  "Gem Grab", "Brawl Ball", "Knockout", "Heist", "Bounty", "Hot Zone", "Brawl Hockey",
];

// Fallback "how exposed to a hard counter" by role, when not listed in strategy.counterability.
const DEFAULT_COUNTERABILITY = {
  Tank: 0.62, Assassin: 0.70, Marksman: 0.55, Artillery: 0.45,
  Controller: 0.35, Support: 0.40, "Damage Dealer": 0.40, Unknown: 0.50,
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---------- per-brawler strength on a given mode/map ----------
export function modeScore(b, mode, map, data) {
  const base = data.tiers.base[b.name] ?? 5.0;
  const aff = (data.strategy.classAffinity[mode] || {})[b.class] ?? 0;
  const mo = (data.tiers.modeOverride[mode] || {})[b.name] ?? 0;
  const mapo = map && data.tiers.mapOverride[map] ? (data.tiers.mapOverride[map][b.name] ?? 0) : 0;
  return base + aff + mo + mapo;
}

// Thresholds account for mode affinity + overrides being added on top of the
// 0-10 base, so effective mode scores run ~2-11. Tuned for a readable spread.
export function tierOf(score) {
  if (score >= 9.7) return "S+";
  if (score >= 8.6) return "S";
  if (score >= 7.4) return "A";
  if (score >= 6.2) return "B";
  if (score >= 5.0) return "C";
  return "D";
}

export function counterabilityOf(b, data) {
  const c = data.strategy.counterability[b.name];
  if (typeof c === "number") return c;
  return DEFAULT_COUNTERABILITY[b.class] ?? 0.5;
}

// ---------- matchup: how candidate c fares vs enemy e, in [-1, 1] ----------
function matchup(c, e, data) {
  const beatsC = data.strategy.beats[c.name] || [];
  const beatsE = data.strategy.beats[e.name] || [];
  if (beatsC.includes(e.name)) return 1;
  if (beatsE.includes(c.name)) return -1;
  const a = (data.strategy.roleCounters[c.class] || {})[e.class] ?? 0;
  const b = (data.strategy.roleCounters[e.class] || {})[c.class] ?? 0;
  return clamp(a - b, -1, 1);
}

function counterScore(c, enemies, data) {
  if (!enemies.length) return { value: 0, beaten: [], lostTo: [] };
  let sum = 0; const beaten = [], lostTo = [];
  for (const e of enemies) {
    const m = matchup(c, e, data);
    sum += m;
    if (m >= 0.5) beaten.push(e.name);
    else if (m <= -0.5) lostTo.push(e.name);
  }
  return { value: sum / enemies.length, beaten, lostTo };
}

// ---------- comp archetypes ----------
function primaryArch(b, data) {
  return (data.strategy.roleArchetype[b.class] || ["damage"])[0];
}

function fillScore(c, allies, mode, data) {
  const needs = (data.strategy.compNeeds[mode] || []).slice();
  for (const a of allies) {
    const i = needs.indexOf(primaryArch(a, data));
    if (i >= 0) needs.splice(i, 1);
  }
  const cTags = data.strategy.roleArchetype[c.class] || [];
  const fills = cTags.find((t) => needs.includes(t));
  if (fills) return { value: 1, fills };
  if (allies.length && cTags.every((t) => !needs.includes(t))) return { value: -0.4, fills: null };
  return { value: 0, fills: null };
}

function synergyScore(c, allies, data) {
  let s = 0; const partners = [];
  for (const a of allies) {
    const hit = data.strategy.synergies.pairs.some(
      (p) => (p[0] === c.name && p[1] === a.name) || (p[1] === c.name && p[0] === a.name)
    );
    if (hit) { s += 0.5; partners.push(a.name); }
  }
  const sameClass = allies.filter((a) => a.class === c.class).length;
  s -= sameClass * 0.25; // discourage stacking identical roles
  return { value: s, partners };
}

// ---------- draft order helpers (1-2-2-1 snake) ----------
export function draftOrder(firstPickTeam) {
  const a = firstPickTeam;
  const b = a === "you" ? "enemy" : "you";
  const teams = [a, b, b, a, a, b];
  return teams.map((team, index) => ({
    index, team,
    isFirst: index === 0,
    isLast: index === 5,
    enemiesAfter: teams.slice(index + 1).filter((t) => t !== team).length,
  }));
}

export function pickTypeLabel(slot) {
  if (slot.isFirst) return "First pick";
  if (slot.isLast) return "Last pick";
  return `Pick ${slot.index + 1}`;
}

// ---------- the main recommender ----------
// state: { mode, map, firstPickTeam, bans:{you:[],enemy:[]}, picks:[{team,name}|null x6] }
export function availableBrawlers(data, state) {
  const used = new Set([
    ...state.bans.you, ...state.bans.enemy,
    ...state.picks.filter(Boolean).map((p) => p.name),
  ]);
  return data.brawlers.filter((b) => !used.has(b.name));
}

// recommend picks for a specific slot index, for that slot's team.
export function recommend(data, state, slotIndex, opts = {}) {
  const order = draftOrder(state.firstPickTeam);
  const slot = order[slotIndex] || order.find((s) => !state.picks[s.index]);
  const team = slot.team;
  const enemyTeam = team === "you" ? "enemy" : "you";

  const lookup = (name) => data.byName[name];
  const allies = state.picks.filter((p) => p && p.team === team).map((p) => lookup(p.name)).filter(Boolean);
  const enemies = state.picks.filter((p) => p && p.team === enemyTeam).map((p) => lookup(p.name)).filter(Boolean);

  const pool = availableBrawlers(data, state).filter((b) => !opts.roleFilter || b.class === opts.roleFilter);

  // weights driven by draft position
  const visibleEnemy = enemies.length;
  const W_counter = 1.5 * Math.min(1, visibleEnemy / 2);
  const W_safe = 1.6 * (slot.enemiesAfter / 3);
  const W_syn = 1.0;
  const W_fill = 1.2;

  const results = pool.map((b) => {
    const mapRaw = modeScore(b, state.mode, state.map, data);
    const cs = counterScore(b, enemies, data);
    const ss = synergyScore(b, allies, data);
    const fs = fillScore(b, allies, state.mode, data);
    const counterability = counterabilityOf(b, data);

    let firstAdj = 0;
    if (slot.isFirst && team === "you") {
      if (data.strategy.safeFirstPicks.list.includes(b.name)) firstAdj += 0.8;
      if (data.strategy.avoidFirstPick.list.includes(b.name)) firstAdj -= 1.2;
    }

    const total =
      mapRaw +
      W_counter * cs.value +
      W_syn * ss.value +
      W_fill * fs.value -
      W_safe * counterability +
      firstAdj;

    const reasons = [];
    const t = tierOf(mapRaw);
    if (t === "S+" || t === "S") reasons.push({ kind: "tier", text: `${t}-tier on this map` });
    else if (t === "A") reasons.push({ kind: "tier", text: `Strong (A) here` });
    if (cs.beaten.length) reasons.push({ kind: "counter", text: `beats ${cs.beaten.slice(0, 3).join(", ")}` });
    if (ss.partners.length) reasons.push({ kind: "syn", text: `pairs with ${ss.partners.slice(0, 2).join(", ")}` });
    if (fs.fills) reasons.push({ kind: "fill", text: `fills your ${fs.fills} gap` });
    if (slot.isFirst && team === "you" && data.strategy.safeFirstPicks.list.includes(b.name))
      reasons.push({ kind: "safe", text: "safe blind first pick" });
    if (slot.isLast && team === "you" && cs.beaten.length)
      reasons.push({ kind: "safe", text: "last pick — lock the counter" });
    if (cs.lostTo.length) reasons.push({ kind: "warn", text: `loses to ${cs.lostTo.slice(0, 2).join(", ")}` });

    return { brawler: b, total, mapRaw, tier: t, reasons, counterability, breakdown: { mapRaw, counter: cs.value, synergy: ss.value, fill: fs.value, counterability } };
  });

  results.sort((a, b) => b.total - a.total);
  return { slot, team, results };
}

// ---------- ban suggestions ----------
export function suggestBans(data, state, n = 6) {
  const pool = availableBrawlers(data, state);
  const scored = pool.map((b) => {
    let threat = modeScore(b, state.mode, state.map, data);
    if (data.strategy.safeFirstPicks.list.includes(b.name)) threat += 0.5; // flexible & hard to punish = ban-worthy
    if (data.strategy.avoidFirstPick.list.includes(b.name)) threat -= 0.2;
    return { brawler: b, threat, tier: tierOf(modeScore(b, state.mode, state.map, data)) };
  });
  scored.sort((a, b) => b.threat - a.threat);
  return scored.slice(0, n);
}

// ---------- cheat-sheet helpers ----------
export function bestPicks(data, mode, map, n = 16, roleFilter = null) {
  return data.brawlers
    .filter((b) => !roleFilter || b.class === roleFilter)
    .map((b) => ({ brawler: b, score: modeScore(b, mode, map, data), tier: tierOf(modeScore(b, mode, map, data)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export function safeFirstPicks(data, mode, map, n = 6) {
  return data.brawlers
    .map((b) => {
      const s = modeScore(b, mode, map, data);
      const safe = s - 1.6 * counterabilityOf(b, data) +
        (data.strategy.safeFirstPicks.list.includes(b.name) ? 0.8 : 0) +
        (data.strategy.avoidFirstPick.list.includes(b.name) ? -1.2 : 0);
      return { brawler: b, score: safe, tier: tierOf(s) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export function bestPerRole(data, mode, map) {
  const roles = ["Tank", "Assassin", "Marksman", "Artillery", "Controller", "Support", "Damage Dealer"];
  return roles.map((role) => {
    const top = bestPicks(data, mode, map, 1, role)[0];
    return { role, top };
  }).filter((r) => r.top);
}
