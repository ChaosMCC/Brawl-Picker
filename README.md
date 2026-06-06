# 🎯 Brawl Draft Coach

A drafting assistant for **Brawl Stars Ranked**. Pick the right brawler for the map,
respect the ban phase, and stop throwing games at the draft screen on your way to Pro.

It has two tabs:

- **⚔️ Draft Assistant** — walk the real Ranked draft. Enter the coin-flip, the 3+3 bans,
  then click through the **1‑2‑2‑1 snake** (first pick → 2 enemy → your 2 → enemy last pick).
  For every slot it recommends brawlers, and the advice **changes with the slot**:
  - **First pick** → safe, flexible brawlers that are hard to hard‑counter (the enemy picks twice *after* you).
  - **Middle picks** → balance map strength, countering what the enemy has shown, and team synergy.
  - **Last pick** → you have full info and nobody counters you back, so it tells you the hardest **counter** to lock in.
- **📋 Cheat‑Sheet** — pick a map and instantly see best picks, safe first picks, suggested bans, and the best brawler per role.

> Not affiliated with Supercell. For personal/competitive use.

---

## 🚀 Deploy it on GitHub Pages (≈ 3 minutes)

1. Create a new GitHub repository and upload **all** of these files (keep the folder
   structure — `index.html` must be at the repo root). You can drag‑and‑drop the whole
   folder into GitHub's "Add file → Upload files" page.
2. In your repo go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Set **Branch** to `main` and the folder to **`/ (root)`**, then **Save**.
5. Wait ~1 minute and refresh. Your app is live at
   `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

That's it. Open it on your phone and bookmark it for game night.

### Turn on the weekly auto‑update (optional but recommended)
The included GitHub Action keeps the roster fresh and refreshes tiers (see below).
GitHub disables scheduled Actions on brand‑new repos until you enable them:

1. Open the **Actions** tab and click **"I understand my workflows, enable them"**.
2. (Optional) Open **Update meta data → Run workflow** once to test it now.

The Action commits any updates straight to your branch, which makes Pages redeploy
automatically. You don't have to do anything after that.

> **Heads‑up:** the Action needs to push commits. Go to **Settings → Actions → General →
> Workflow permissions** and select **Read and write permissions** if it isn't already.

---

## 🔄 How "stays updated" actually works

| Layer | Source | Updates |
|---|---|---|
| Brawler roster, maps, modes, art, roles | **Brawlify API** (live, no key) | **Automatic** — new brawlers/maps appear the moment Brawlify adds them, every time the page loads. |
| Tier ratings (`data/tiers.json`) | Seeded from the June 2026 meta | The weekly Action **best‑effort refreshes them from live win‑rates**; also fully hand‑editable. |
| Counters / synergy / first‑pick safety (`data/strategy.json`) | Curated, role‑based | Rarely needs changing — it's built on brawler *roles*, not raw numbers, so it survives balance patches. |

**Why tiers are partly curated:** there is no free, public, no‑key API that exposes live
Brawl Stars *win‑rates* to a website. So the app ships with a solid hand‑made tier list and
the Action tops it up from Brawlify's per‑map win‑rates **whenever that data is in season**.
When the win‑rate feed is empty (it often is between seasons) the Action simply leaves your
ratings untouched — it never wipes good data with noise.

---

## ✏️ Editing the meta (make it match *your* opinion)

Everything lives in two readable JSON files in `data/`:

### `data/tiers.json` — how strong each brawler is
- `base` — global strength, **0–10** (`9+` = S, `8` = S‑, `7` = A, `6` = B, `5` = C). Bump a number when a brawler gets buffed/nerfed.
- `modeOverride` — per‑mode tweaks, e.g. Mortis is great in Brawl Ball (`+1.2`) but terrible in Bounty (`‑2.0`).
- `mapOverride` — optional per‑map tweaks, keyed by the **exact** map name.
- `autoRefreshBase` — set to `false` if you'd rather the weekly Action **never** touch your hand‑tuned `base` values.

### `data/strategy.json` — how brawlers interact
- `classAffinity` — which roles a mode favors (throwers love Hot Zone, snipers love Bounty…).
- `beats` — specific hard counters: `"Mortis": ["Piper", "Bea", …]` means *Mortis beats those*.
- `synergies.pairs` — combos that work well together.
- `counterability` — how easily a brawler is countered (drives first‑pick safety; `0` = safe, `1` = exposed).
- `safeFirstPicks` / `avoidFirstPick` — the blind‑first‑pick allow/deny lists.
- `rolesOverride` — roles for brand‑new brawlers Brawlify hasn't classified yet.

After editing, just commit — Pages redeploys in about a minute. The numbers are simple; don't be
afraid to experiment.

---

## 🧪 Run it locally
Browsers block loading the local data files over `file://`, so use a tiny web server:

```bash
# from this folder:
python -m http.server 8000
# then open http://localhost:8000
```

(Any static server works — `npx serve`, VS Code "Live Server", etc.)

### Refresh data manually (needs Node 18+)
```bash
node scripts/build-data.mjs     # refresh roster/map snapshot + health report
node scripts/refresh-tiers.mjs  # pull live win-rates into tiers.json (no-op if off-season)
```

---

## 📁 Project layout
```
index.html              # app shell
css/styles.css          # Brawl-themed dark UI
js/
  app.js                # state, controls, tab routing
  data.js               # live Brawlify fetch + cache + offline fallback + merge
  engine.js             # the draft brain (scoring, pick order, counters, bans)
  assistant.js          # Draft Assistant tab
  cheatsheet.js         # Cheat-Sheet tab
  ui.js                 # DOM helpers + brawler picker modal
data/
  tiers.json            # power ratings (auto-refreshable + editable)
  strategy.json         # counters, synergy, roles, first-pick safety
  fallback.json         # offline snapshot of roster/maps (auto-generated)
scripts/                # data refresh scripts (run by the Action)
.github/workflows/      # weekly auto-update workflow
```

## 🙏 Credits
- Roster, maps, modes and artwork via the free **[Brawlify](https://brawlify.com) API**.
- Tier list seeded from June 2026 community meta consensus.

Brawl Stars is a trademark of Supercell. This project is fan‑made and not affiliated with or endorsed by Supercell.
