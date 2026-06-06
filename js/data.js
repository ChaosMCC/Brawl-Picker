// data.js — load + merge everything the engine needs.
// Live roster/maps/modes come straight from the Brawlify API (open CORS, no key),
// so new brawlers/maps appear automatically. Curated tiers/strategy live in /data.

import { RANKED_MODES } from "./engine.js";

const BRAWLIFY = "https://api.brawlify.com/v1";
const CACHE_KEY = "brawlpicker.live.v1";
const CACHE_TTL = 1000 * 60 * 60 * 12; // 12h

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function trimBrawler(b) {
  return {
    id: b.id,
    name: b.name,
    class: (b.class && b.class.name) || "Unknown",
    rarity: (b.rarity && b.rarity.name) || "",
    img: b.imageUrl2 || b.imageUrl,
    icon: b.imageUrl3 || b.imageUrl2 || b.imageUrl,
  };
}
function trimMap(m) {
  const gm = m.gameMode || {};
  return {
    id: m.id, name: m.name, mode: gm.name || "Unknown",
    img: m.imageUrl, disabled: !!m.disabled, new: !!m.new,
  };
}

// Try live Brawlify; fall back to localStorage cache, then bundled snapshot.
async function loadLive() {
  // fresh cache?
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return { ...cached.data, source: "cache" };
    }
  } catch (_) {}

  try {
    const [b, m, g] = await Promise.all([
      fetchJSON(`${BRAWLIFY}/brawlers`),
      fetchJSON(`${BRAWLIFY}/maps`),
      fetchJSON(`${BRAWLIFY}/gamemodes`),
    ]);
    const data = {
      brawlers: b.list.map(trimBrawler),
      maps: m.list.map(trimMap),
      modes: (g.list || []).map((x) => ({ id: x.id, name: x.name })),
    };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
    return { ...data, source: "live" };
  } catch (err) {
    // stale cache beats nothing
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached) return { ...cached.data, source: "stale-cache" };
    } catch (_) {}
    const fb = await fetchJSON("./data/fallback.json");
    return { brawlers: fb.brawlers, maps: fb.maps, modes: fb.modes, source: "bundled" };
  }
}

export async function loadData() {
  const [strategy, tiers, live] = await Promise.all([
    fetchJSON("./data/strategy.json"),
    fetchJSON("./data/tiers.json"),
    loadLive(),
  ]);

  // apply role overrides for brawlers Brawlify hasn't classified
  const roles = strategy.rolesOverride || {};
  const brawlers = live.brawlers.map((b) => {
    let cls = b.class;
    if ((!cls || cls === "Unknown") && roles[b.name]) cls = roles[b.name];
    return { ...b, class: cls || "Unknown" };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const byName = {};
  for (const b of brawlers) byName[b.name] = b;

  // maps: enabled only, ranked modes, deduped by name
  const seen = new Set();
  const mapsByMode = {};
  for (const mode of RANKED_MODES) mapsByMode[mode] = [];
  for (const m of live.maps) {
    if (m.disabled) continue;
    if (!RANKED_MODES.includes(m.mode)) continue;
    const key = m.mode + "|" + m.name;
    if (seen.has(key)) continue;
    seen.add(key);
    mapsByMode[m.mode].push(m);
  }
  for (const mode of RANKED_MODES) mapsByMode[mode].sort((a, b) => a.name.localeCompare(b.name));

  return {
    brawlers, byName, mapsByMode, tiers, strategy,
    modes: RANKED_MODES.filter((m) => mapsByMode[m] && mapsByMode[m].length),
    meta: { source: live.source, brawlerCount: brawlers.length, updated: tiers.updated, season: tiers.season },
  };
}
