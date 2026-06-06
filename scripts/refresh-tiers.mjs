#!/usr/bin/env node
// refresh-tiers.mjs — best-effort refresh of base tier ratings from real
// win-rates. Uses Brawlify's per-map stats (free, no key). When those stats
// are live it blends them into data/tiers.json -> base; when they're empty
// (off-season) it changes nothing, so curated ratings are never wiped by noise.
//
// Set "autoRefreshBase": false in tiers.json to opt out entirely.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAWLIFY = "https://api.brawlify.com/v1";
const RANKED = ["Gem Grab", "Brawl Ball", "Knockout", "Heist", "Bounty", "Hot Zone", "Brawl Hockey"];
const MIN_COVERAGE = 40;     // need win-rate data for at least this many brawlers
const BLEND_NEW = 0.6;       // weight of live data vs existing curated rating

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "BrawlDraftCoach/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]).catch(() => null); }
  }));
  return out;
}

// win-rate (percent) -> 0-10 strength. 50% ≈ 5.0, 56% ≈ 8.0, capped.
const wrToScore = (wr) => Math.max(1, Math.min(10, 5 + (wr - 50) * 0.5));

function log(lines) {
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n"); } catch (_) {}
  }
}

(async () => {
  const tiersPath = path.join(ROOT, "data/tiers.json");
  const tiers = JSON.parse(fs.readFileSync(tiersPath, "utf-8"));
  if (tiers.autoRefreshBase === false) { log(["ℹ️ autoRefreshBase is false — leaving tiers.json untouched."]); return; }

  const brawlers = (await getJSON(`${BRAWLIFY}/brawlers`)).list;
  const idToName = new Map(brawlers.map((b) => [b.id, b.name]));
  const maps = (await getJSON(`${BRAWLIFY}/maps`)).list
    .filter((m) => !m.disabled && m.gameMode && RANKED.includes(m.gameMode.name));

  const details = await pool(maps, 6, (m) => getJSON(`${BRAWLIFY}/maps/${m.id}`));

  // aggregate win-rate per brawler across all sampled maps
  const agg = new Map(); // name -> {sum, w}
  let statRows = 0;
  for (const d of details) {
    if (!d || !Array.isArray(d.stats)) continue;
    for (const s of d.stats) {
      const name = idToName.get(s.brawler);
      let wr = s.winRate ?? s.winrate;
      if (wr == null) continue;
      if (wr <= 1.5) wr *= 100;          // fraction -> percent
      const weight = Math.max(0.2, (s.useRate ?? 1) <= 1.5 ? (s.useRate ?? 1) * 100 : (s.useRate ?? 1));
      if (!name) continue;
      const a = agg.get(name) || { sum: 0, w: 0 };
      a.sum += wr * weight; a.w += weight; agg.set(name, a);
      statRows++;
    }
  }

  const covered = [...agg.keys()].filter((n) => agg.get(n).w > 0);
  if (covered.length < MIN_COVERAGE) {
    log([
      `ℹ️ Live win-rate stats unavailable right now (only ${covered.length} brawlers had data, need ${MIN_COVERAGE}).`,
      `Kept the curated tier ratings unchanged. This is normal between seasons.`,
    ]);
    return; // graceful no-op
  }

  // blend into base
  let changed = 0;
  const movers = [];
  for (const name of covered) {
    const a = agg.get(name);
    const wr = a.sum / a.w;
    const fresh = +wrToScore(wr).toFixed(2);
    const prev = tiers.base[name] ?? 5.0;
    const blended = +(BLEND_NEW * fresh + (1 - BLEND_NEW) * prev).toFixed(1);
    if (blended !== prev) { changed++; movers.push({ name, prev, blended, wr: +wr.toFixed(1) }); }
    tiers.base[name] = blended;
  }

  tiers.updated = new Date().toISOString().slice(0, 10);
  tiers.autoRefreshedAt = new Date().toISOString();
  tiers.autoRefreshSource = `Brawlify per-map win-rates (${covered.length} brawlers, ${statRows} rows)`;
  fs.writeFileSync(tiersPath, JSON.stringify(tiers, null, 2) + "\n");

  movers.sort((x, y) => Math.abs(y.blended - y.prev) - Math.abs(x.blended - x.prev));
  log([
    `✅ Refreshed base tiers from live win-rates — ${changed} ratings updated (${covered.length} brawlers sampled).`,
    `Biggest movers:`,
    ...movers.slice(0, 12).map((m) => `  ${m.name}: ${m.prev} → ${m.blended}  (win-rate ${m.wr}%)`),
  ]);
})().catch((e) => { console.error("refresh-tiers failed:", e); process.exit(1); });
