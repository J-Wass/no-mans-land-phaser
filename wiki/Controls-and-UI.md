# Controls & UI

[← Back to Home](README.md)

The whole game is **mouse-driven**. There is one keyboard shortcut (ESC). Below is everything you can do and every panel you'll see.

---

## 1. Mouse controls

### Left button — the action button
Left-click is context-sensitive:

| You click… | …with this selected | Result |
|---|---|---|
| **Your own unit** | anything | Selects it; opens the unit panel + stance buttons. |
| **Your own unit (double-click)** | — | Opens the **City Menu** (if your city is there), **Diplomacy** (foreign city), or the **Territory Menu** (otherwise). |
| **An empty/other tile** | a unit | Pathfinds and issues a **MOVE** order to that tile. |
| **An enemy unit / city / territory** | a unit | Moving *into* the enemy is how you attack — combat starts automatically on arrival (see below). |
| **A city** | nothing | Single-click highlights it (info panel); double-click opens its menu. |
| **An empty tile** | nothing | Single-click shows the Territory info panel; double-click opens the Territory Menu. |

- **There is no separate "attack" command.** You attack by moving a unit onto an enemy. When a battle or siege begins, the game **auto-selects your unit and pops up its stance controls** so you can react.
- **Double-click window:** 350 ms, and must be on the same tile.

### Left drag — paint a custom path
After selecting a unit, **hold left and drag across tiles** to paint a multi-waypoint route. A faint dotted gold line previews it. On release, the waypoints are stitched into one path (routed by the pathfinder between each) and dispatched as a single move. Drag of a single tile falls back to a normal click-move.

### Right button — pan & deselect
- **Right-drag** → pans the camera (a 6px threshold separates a pan from a click).
- **Right-click (no drag)** → clears the current selection.

### Mouse wheel — zoom
Scroll to zoom (×0.9 out / ×1.1 in), clamped between a computed minimum (so you can't zoom past the water ring) and **2.5×** max.

### Minimap
Click anywhere on the minimap (top-right) to recenter the camera there.

### Camera notes
- No WASD/arrow keys — pan with right-drag or the minimap.
- The camera starts zoomed in on your first city (or unit).
- Camera bounds extend ~20 tiles past the water border for free edge-scrolling.

## 2. Keyboard

- **ESC** — opens the **Pause** modal, and closes any open modal. (The HUD **MENU** button does the same.)

There are no other hotkeys — no unit-selection, build, or stance shortcuts.

---

## 3. The HUD

The HUD is a separate overlay scene, so it does **not** zoom with the world. It switches to a compact two-row "skinny" layout when the window is narrower than 1100px.

### Top bar
Left to right:

- **Game clock** — "Day N HH:00" (100 ticks = 1 day).
- **Difficulty label** — color-coded (Easy green, Medium yellow, Hard red, Sandbox cyan).
- **SPEED button** — cycles `PAUSE → 0.5× → 1× → 2× → 4×`.
- **ALERTS button** — shows notification count; toggles the Alert History panel.
- **Resource readouts** — 🍎 Food, 🪨 Raw Material, 🪙 Gold, 📚 Research. **Click any one** to open a **Resource Breakdown** panel that itemizes every income source (city base, farms, workshops, markets, terrain harvest, deposits, region bonuses) and unit upkeep as "+X/s" rates.
- **RESEARCH button** — opens the Research modal; shows the current tech name and a thin progress bar.
- **SAVE button** — quick-saves to **Slot 1**.
- **MENU [ESC] button** — opens Pause.

### Minimap (top-right)
Shows discovered terrain (color per terrain), territory ownership tint, discovered cities, **only your own units** (enemies are hidden to respect fog), and a white camera-viewport rectangle. Undiscovered tiles are near-black. Click to recenter.

### Info panel (bottom-left, contextual)
Only one panel shows, based on what's selected:

**Unit panel**
- Full unit name + owning nation.
- **HP bar** (green→yellow→red) with cur/max.
- **Morale bar**, colored by [band](Morale.md#1-morale-bands--combat-effects): Inspired gold, Steady blue, Wavering amber, Shaken orange, Broken red — with the numeric value and a band-name warning when low.
- Stats: Melee, Ranged (incl. weapon-tier bonus), Speed, Armor tier, Range, Vision.
- Info: battles fought, home city, rank, XP (cur/next), status (IN BATTLE / READY).
- **Stance hint line** — dynamically explains the current morale/stance interaction (e.g. "Morale WAVERING: ADVANCE downgraded to HOLD", or for cavalry "Advance acts as Charge: +50% damage").
- **Mana line** — if you have active mana deposits, summarizes their bonuses.
- **Three STANCE buttons:** WITHDRAW, HOLD, ADVANCE.

**City panel** — name, owner, health, building list, current production + progress bar. (Double-click opens the full City Menu.)

**Territory panel** — coords + terrain + region name, owner, deposit, buildings, construction progress, region control %.

### Diplomacy widget (bottom-right)
A mini-panel listing known nations (color dot, name, relation, a one-click **WAR/PEACE** button). Clicking a row opens full Diplomacy. Defeated nations appear as "RIP … DEFEATED".

### Notifications & alerts
Game events (territory claimed, building finished, unit trained, research done, war declared, morale drops, etc.) push **toasts** (top-left, up to 4, auto-dismiss after 4s) and accumulate in the **Alert History** panel (last 100). A war declaration also **flashes red edges** three times.

### In-world overlays (these do scale with zoom)
- Selection ring (gold = unit, light-blue = city, cyan = territory).
- Movement-path polylines in your nation color.
- Floating **HP + morale bars** above each unit.
- City/territory HP bars when under attack.
- **Ranged firing-range overlay** (red diamond) when a ranged unit is selected.
- A floating **stance badge** above your units currently in battle (shows their *effective* stance).
- Conquest progress overlay on contested tiles; construction progress bars.
- Resource-deposit icons (**hover** for a tooltip explaining the mine).
- **Fog of war** — undiscovered tiles black, seen-but-not-visible dark; near-vision contacts show an orange **"Heavily Armored Contact"** / **"Lightly Armored Contact"** label. Fog is **off** in Sandbox and Tutorial.
- A "CAPTURED!" flash rises above a conquered city.

### Sandbox toolbar (left edge, Sandbox only)
AI LEVEL buttons (OFF / EASY / MED / HARD, applied live) and a **PAINT** tool that cycles a tile's terrain on click.

---

## 4. How to do everything

### Set a unit's stance
Select the unit, then click **WITHDRAW**, **HOLD**, or **ADVANCE** in the unit panel (each has a hover tooltip). **ADVANCE is greyed out** when the unit's morale would override it (a Broken unit only honors WITHDRAW). Full mechanics: **[Stances](Stances.md)**.

### Move / attack
Select + left-click a destination, or left-drag a path. Attacking = moving onto the enemy. If a path crosses neutral territory or ends on a neutral nation's unit/city, a **War Confirm modal** appears first — the move only proceeds after you confirm **"DECLARE WAR & MOVE"** (which declares war on each affected neutral nation).

### Build in a city (City Menu — double-click your city)
- **UNITS tab** — the production catalog. Each row shows cost + build time and a **BUILD / QUEUE / FULL / LOCKED** button (LOCKED explains the missing tech, Barracks level, or deposit). Queue cap is **5**.
- **BUILDINGS tab** — city buildings with perks, cost, and **BUILD / UPGRADE / BUILT n/max / LOCKED** states. Also a **−1 LVL** remove button (5s countdown) and a **RAZE City** toggle (destroys a random building level every 5s).
- A production status bar + cancellable queue list sit alongside.

See **[Production & Buildings](Production-and-Buildings.md)**.

### Build on territory (Territory Menu — double-click a tile)
- **Outpost** — on any unclaimed land tile (including mountains; only open water is off-limits); claims it. The prerequisite for everything else on a tile.
- On owned tiles: Farms, Workshop, Walls (multi-level), Watchtower, and **mines** (which only appear when the tile's deposit matches). Each row shows perks, cost, duration, requirements, and a **BUILD / ▲ UP / MAX / BUILT / BUSY** button.

See **[Cities, Territory & Regions](Cities-Territory-Regions.md)**.

### Research (Research modal — top-bar RESEARCH button)
A tech-tree graph in three branch bands (**Science** blue, **Society** green, **Arcane** purple) with prerequisite edges. Each node shows its cost ("N RP · Ns") and unlocks, with a button: **START / QUEUE / QUEUE PATH / QUEUED / DONE / LOCKED**. A current-research bar and reorderable queue sit at the top.

See **[Research](Research.md)**.

### Diplomacy (Diplomacy modal — widget "OPEN FULL", a nation row, or double-click a foreign city)
- Left: list of known (and defeated) nations.
- Right: the selected nation's relation, with **PROPOSE PEACE** (if at war; shows cooldown if blocked) or **DECLARE WAR** (if neutral). A **TRADE** section with per-resource +/- steppers (Gold/Materials/Food, 10 at a time) for "YOU GIVE"/"YOU RECEIVE" and an **⇄ EXECUTE TRADE** button.

See **[Diplomacy](Diplomacy.md)**.

---

## 5. Menu & game setup

The main menu is a 3-card layout plus a load row. A random calm title track plays.

- **Card 1 — Scenario picker.** Preset scenarios (★ marks the tutorial). Shows name, description, and "Player vs AI". Launches with **START SCENARIO / START TUTORIAL**.
- **Card 2 — Standard Match.** Pick **1–4 opponents** and **Easy/Medium/Hard**; launches a procedural skirmish.
- **Card 3 — Sandbox.** No costs, no fog, live AI + terrain controls.
- **Load row** — **LOAD SAVED GAME** loads your first non-empty save slot.

New players see a banner nudging them toward the tutorial (until `localStorage 'nml:hasPlayed'` is set).

The setup object passed into the game:
```ts
interface GameSetup {
  opponentCount: number;                              // clamped 1–4
  difficulty: 'easy' | 'medium' | 'hard' | 'sandbox';
  gameMode:   'skirmish' | 'scenario' | 'sandbox';
  scenarioId: string | null;
  seed?: number;                                      // fixed RNG seed for reproducible maps
}
```

### Victory / Defeat
The Game Over modal (not shown in Sandbox) appears when the scenario's victory condition is met or your nation is defeated, showing duration, survivors, and defeated nations, with **RETURN TO MENU**. Victory switches the music to the **glory** track.

---

## 6. Save / Load

Saving uses browser **localStorage**, with **10 slots**.

- **Top-bar SAVE** → quick-saves to **Slot 1**.
- **Pause modal (ESC)** → lists all 10 slots (timestamp, "Day N", mode) each with **SAVE/LOAD**, plus **EXPORT FILE** (downloads a slot as JSON) and **IMPORT FILE** (loads a JSON into the first empty slot) to move progress between computers. Also hosts **Accessibility** settings (font family + size, applied live) and **MAIN MENU / RESUME**.
- **Menu LOAD SAVED GAME** loads the first non-empty slot.

A save captures the full game state: nations, players, cities, units, the grid/territory, treasuries, diplomacy relations, discovered tiles, regions, plus in-flight **movement**, **battle**, **siege**, and **peace-cooldown** states, the current tick, and the original setup.

---

## 7. Music

In-game music (`MusicManager`) picks a category from the situation:
- **Glory** — after you win.
- **Focus** — while you're at war with anyone.
- **Melancholy** — early game (before tick 6000, ~10 min).
- **Hope** — later, at peace.

On war declared / peace signed it re-resolves and **cross-fades over 1.5s** if the category changed. When a track ends it waits 5s, then plays another from the current category (never the same track twice in a row). The menu plays its own random calm title track.

→ Continue to **[Units](Units.md)**
