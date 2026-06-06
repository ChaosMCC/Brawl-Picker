#!/usr/bin/env node
// build-data.mjs — refresh the bundled roster/map snapshot from Brawlify and
// report any newly released brawlers that still need a tier/role entry.
// Runs server-side (in CI), so no CORS concerns. No API key required.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAWLIFY = "https://api.brawlify.com/v1";

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "BrawlDraftCoach/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

const trimBrawler = (b) => ({
  id: b.id, name: b.name,
  class: (b.class && b.class.name) || "Unknown",
  rarity: (b.rarity && b.rarity.name) || "",
  img: b.imageUrl2 || b.imageUrl,
  icon: b.imageUrl3 || b.imageUrl2 || b.imageUrl,
});
const trimMap = (m) => ({
  id: m.id, name: m.name, mode: (m.gameMode && m.gameMode.name) || "Unknown",
  img: m.imageUrl, disabled: !!m.disabled, new: !!m.new,
});

function summary(lines) {
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n"); } catch (_) {}
  }
}

(async () => {
  const [b, m, g] = await Promise.all([
    getJSON(`${BRAWLIFY}/brawlers`),
    getJSON(`${BRAWLIFY}/maps`),
    getJSON(`${BRAWLIFY}/gamemodes`),
  ]);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    brawlers: b.list.map(trimBrawler),
    maps: m.list.filter((x) => !x.disabled).map(trimMap), // only active maps; the app never shows retired ones

    modes: (g.list || []).map((x) => ({ id: x.id, name: x.name })),
  };
  fs.writeFileSync(path.join(ROOT, "data/fallback.json"), JSON.stringify(snapshot));

  // health report: any roster brawler missing tier/role data?
  const tiers = JSON.parse(fs.readFileSync(path.join(ROOT, "data/tiers.json"), "utf-8"));
  const strategy = JSON.parse(fs.readFileSync(path.join(ROOT, "data/strategy.json"), "utf-8"));
  const base = new Set(Object.keys(tiers.base).filter((k) => !k.startsWith("_")));
  const roleOv = new Set(Object.keys(strategy.rolesOverride).filter((k) => !k.startsWith("_")));

  const missingTier = [], missingRole = [];
  for (const br of snapshot.brawlers) {
    if (!base.has(br.name)) missingTier.push(br.name);
    if (br.class === "Unknown" && !roleOv.has(br.name)) missingRole.push(br.name);
  }

  const lines = [
    `## Brawl Draft Coach — data refresh`,
    `Roster: **${snapshot.brawlers.length}** brawlers · **${snapshot.maps.filter((x) => !x.disabled).length}** active maps · ${new Date().toISOString().slice(0, 10)}`,
  ];
  if (missingTier.length) lines.push(`\n⚠️ **New brawlers without a base tier** (engine defaults them to 5.0 — add to \`data/tiers.json\` → \`base\`): ${missingTier.join(", ")}`);
  if (missingRole.length) lines.push(`\n⚠️ **New brawlers with no role yet** (add to \`data/strategy.json\` → \`rolesOverride\`): ${missingRole.join(", ")}`);
  if (!missingTier.length && !missingRole.length) lines.push(`\n✅ All brawlers have tier + role data.`);
  summary(lines);
})().catch((e) => { console.error("build-data failed:", e); process.exit(1); });
