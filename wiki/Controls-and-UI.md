# Controls & UI

[← Back to Home](README.md)

The game is **mouse-driven**; the only keyboard key is **ESC**. The UI has two layers:
- the **canvas HUD** (`UIScene`, Phaser objects at screen scale) — top bar, toasts, panels, minimap;
- **HTML modals** in `#ui-overlay` (main menu, city menu, territory menu, research, diplomacy, pause, game over, war confirm, tutorial card).

Exact colours, sizes and fonts are in [Presentation](Presentation.md); strings are in [Text & Content](Text-and-Content.md).

---

## 1. Mouse controls (GameScene)

The browser context menu is disabled on the canvas.

### Left click
A left-click acts on the tile under the pointer (`col = floor(worldX/40)`, `row = floor(worldY/40)`; clicks off the grid are ignored). It is a **double-click** if the previous handled left-click was on the same tile less than **350 ms** ago.

#### How HUD clicks interact with the map
UIScene sits above GameScene, and Phaser (`globalTopOnly = true`) delivers each pointer event to the top-most scene that has an **interactive** object under the pointer and stops there. So:
- Pressing, releasing, moving or wheeling over an **interactive** HUD object (any HUD button, resource button, stance/SPY button, diplomacy-widget row, the minimap) never reaches GameScene: no world click, no drag-path waypoint, no pan update, no zoom. (A pan released over the HUD is cleaned up on the next mouse press.)
- The HUD's panel **backgrounds** are interactive too (top bar, toasts, alert history, resource breakdown, diplomacy widget, unit/city/territory panels), so clicking or scrolling anywhere on a panel never acts on the map underneath.
- While any DOM modal is open its backdrop covers the canvas, so the map gets no mouse input at all.

Decision order:
1. **The tile holds one of your units** (the first unit found on the tile):
   - double-click → your city on the tile: open the **City Menu**; a foreign city: open **Diplomacy** for its owner; no city: open the **Territory Menu**.
   - single click → **select the unit** (closes any city/territory menu, shows the unit panel, draws the ranged-range overlay).
2. **You have a unit selected:**
   - double-click on your city → City Menu; on a foreign city → Diplomacy.
   - otherwise → pathfind from the unit to the tile and send `MOVE_UNIT` (with the [neutral-war check](Diplomacy.md#2-going-to-war)). Unreachable → nothing happens. The unit **stays selected**.
3. **Nothing selected, the tile has a city:** your city — single: highlight it (city info panel), double: City Menu. Foreign city — single: highlight it, double: Diplomacy.
4. **Any other tile:** single → highlight (territory info panel), double → Territory Menu.

Attacking = moving onto an enemy. When one of your units enters a battle or siege, it is **auto-selected** so its stance buttons appear.

### Left drag — paint a path
With a unit selected, holding the left button and dragging records every distinct tile the pointer passes over (a faint dotted gold `#ffd060` line previews it). On release with ≥ 2 waypoints: drop the first waypoint if it is the unit's tile, pathfind from the unit to each waypoint in turn (skipping unreachable ones), concatenate the segments and send one `MOVE_UNIT` (with the war check). A drag with < 2 waypoints is treated as a normal click.

### Right button
- **Right-drag** pans the camera (starts after the pointer moves > 6 px; scroll = start − delta / zoom). Emits `ui:camera-panned` on release.
- **Right-click** without dragging clears the selection (unit, city or territory), closes city/territory menus and hides the info panel.

### Wheel
Zoom ×0.9 (scroll down) or ×1.1 (scroll up), clamped to `[minZoom, 2.5]` with `minZoom = max(0.15, min(viewW/mapW, viewH/mapH) × 0.85)`.

### Camera
- Starts centred on the local nation's first city (else first unit) at zoom `clamp(viewHeight / 480, 1.2, 2.0)` (12 tiles tall); if neither exists, fits the map (`min(viewW/mapW, viewH/mapH, 1.5)`).
- Bounds extend 20 tiles (800 px) past the map on every side.
- No keyboard panning. Clicking the minimap recenters the camera.
- On window resize `minZoom` is recomputed and the zoom re-clamped.

### Minimap (top-right)
Click anywhere on it to centre the camera on that point.

## 2. Keyboard
- **ESC:**
  - With a DOM modal open (City, Territory, Research, Diplomacy, War Confirm, Pause), the modal's `document` keydown listener closes it **and calls `preventDefault()`**. Phaser's keyboard manager listens on `window` (reached after `document`) and ignores default-prevented events, so the same ESC never also opens Pause. ESC on Pause resumes the game.
  - With nothing open, Phaser delivers ESC to GameScene's `keydown-ESC` handler → **Pause**.
  - The Game Over modal pauses the scenes and has no ESC handler.
- The HUD's MENU button emits `keydown-ESC` on GameScene's keyboard directly → Pause.

---

## 3. The HUD (UIScene)

Rebuilt from scratch whenever the selection, notifications, window size, accessibility settings, or relevant game events change. HUD scale `s = clamp(viewHeight / 900, 0.75, 1.8)`; font sizes are multiplied by `s` and the accessibility size factor. All HUD text uses the accessibility font (default `monospace`). **Skinny mode** when the window is narrower than **1100 px**: the top bar gets a second row for resources.

### Top bar (height 52·s, or 88·s skinny; background `#0d1020` @ 94%, blue bottom line `#3355bb`)
Left to right:
1. **Clock** — "`Day N HH:00`" where `day = floor(tick/100) + 1`, `hour = floor((tick % 100) / 100 × 24)` zero-padded.
2. **Difficulty** — `setup.difficulty` uppercased (EASY green `#6bd26b`, MEDIUM yellow `#e2d26f`, HARD red `#e26f6f`, SANDBOX cyan `#7bd4ff`). Scenarios show whatever difficulty was selected on the menu (the tutorial shows SANDBOX).
3. **SPEED** — cycles `PAUSE → 0.5x → 1x → 2x → 4x → PAUSE…`; starts at 1x. Emits `game:speed-change`.
4. **ALERTS N** ("A N" skinny) — toggles the Alert History panel.
5. **Resources** — 🍎 Food, 🧱 Raw Material, 🪙 Gold, 🔬 Research: "`{emoji} {amount}`". Clicking one toggles its Resource Breakdown panel.
6. **RESEARCH** ("TECH" skinny) — shows the active tech id (underscores → spaces, uppercased, first 10 chars; 6 when the window < 820 px) with a thin green (`#44cc22`) progress bar along its bottom; toggles the Research modal.
7. **SAVE** — quick-saves to **slot 1**; toast "Game saved to Slot 1" or "Failed to save game — your browser storage may be full or blocked."
8. **MENU [ESC]** ("MENU" skinny) — opens Pause.

### Notification toasts (top-left, below the bar)
Up to **4** most recent toasts, newest at the top, each "`Day N HH:00  {text}`", removed after **4 s**. Every notification also enters the **Alert History** (last 100 kept; the panel shows as many as fit, newest first). Notifications are generated for the local nation only:

| Event | Toast |
|---|---|
| tile claimed by you | "{nation} claimed tile (r, c)." |
| tile captured by you | "{nation} captured tile (r, c) from {previous owner}." |
| your tile captured | "{captor} captured tile (r, c) from you." |
| your territory construction started / finished | "{label} started at (r, c)." / "{label} finished at (r, c)." |
| your city trained a unit | "{city} trained {unit type lowercase}." |
| your city building finished | "{city} built {building}." |
| your resource project finished | "{city} completed {label}." |
| your unit withdrew | "{unit full name} withdrew to (r, c)." |
| your research finished | "{nation} completed {tech id with spaces}." |
| war involving you | "{A} and {B} are now at war." + **red edge flash** (4 bars, 7% of the short side, `#cc1111`, alpha 0→0.55, 3 pulses ≈ 2.4 s) |
| peace involving you | "{A} and {B} signed peace." |
| your spy caught | "Your spy was discovered and killed at (r, c)." |
| region dominated (first time per region) | "You now dominate the {region}! Bonus resources granted." |
| your unit's morale band worsens, or recovers to STEADY/INSPIRED | "{unit full name}: {BAND}." |
| peace refused (widget) | the refusal reason |

### Resource Breakdown panel (320·s × 290·s, right side)
Title "`{emoji} {Food|Material|Gold|Research} Flow`", "Stored now: N", a **Sources** list and an **Outgoing** list as "+X/s" rates, and a green tip line.
- Food: Base city income, City farms, Territory farms, Plains harvest, Region domination (if any); outgoing Unit upkeep.
- Material: Base city income, City workshops, Territory workshops, Forests and hills, Region domination; outgoing Unit upkeep.
- Gold: Base city income, Markets, Desert revenue, Silver and gold deposits, Region domination.
- Research: Base city income, Schools.

Rates: `count × 10 / interval` (city buildings are counted per city, not per level).

### Diplomacy widget (bottom-right, 298·s wide)
"Diplomacy" / "Known nations" with an **OPEN FULL** button, then one row per known nation: colour dot, name, relation ("Allied" green `#8fe3a8`, "At War" red `#ff8686`, "At Peace" grey `#d9d9d9`), and a button **PEACE** (if at war → `PROPOSE_PEACE`) or **WAR** (if neutral → `DECLARE_WAR`); allies get no button. Clicking a row opens the Diplomacy modal on that nation. Defeated nations follow as greyed "RIP {name} / DEFEATED" rows. Hidden when there are no known or defeated nations.

### Info panel (bottom-left, one at a time)

**Unit panel** (360·s × 254·s):
- Full unit name (purple `#c488e8` with "  · UNDERCOVER" for a spy) and owning nation.
- **HP bar** (170·s wide; green `#44cc66` > 50%, yellow `#ddcc22` > 25%, red `#cc3322`) with "cur/max".
- **Morale bar** in the band colour with the value and, if not STEADY/INSPIRED, the band name in red.
- "`Melee:{m+tier}  Ranged:{r+tier}  Speed:{s}`", "`Armor:{Heavy|Light}  Weapons:{Basic|Bronze|Iron|Steel|Fire Glass}  Range:{r}  Vision:{v}`".
- "`Battles:{n}  Home:{city|-}  {Rank} XP:{xp}/{next}|MAX  {IN BATTLE|READY}`".
- Stance hint line ([Stances](Stances.md#in-the-ui)).
- Mana line if any mana is active: "`Mana: Fire+10%DMG  Earth+10%HP  Water+5%REGEN  Lightning+1SPD  Air+1VIS  Shadow:HIDDEN+15%WD`" (only the active parts).
- "STANCE" label and **WITHDRAW / HOLD / ADVANCE** buttons (68·s × 24·s) with hover tooltips; the active one is highlighted.
- For Scouts once Ancient Rituals is researched: a 4th button **SPY** / **DROP** (disabled in battle or on foreign territory).
- Only your own units can be selected, so the unit panel only ever shows your units. Clicking a tile with an enemy unit (and nothing selected) shows the territory panel.

**City panel** (340·s wide, redrawn every 10 ticks while shown): name (`#ffd9a8`), owner, "Health: cur/max", "Buildings: City Hall, Barracks, …", and either "Production: {label}  ({s}s left)" with a green progress bar or "Production: Idle".

**Territory panel** (380·s wide, redrawn every 10 ticks while shown): "`(r,c) {Terrain} in|near {Region}`", owner (or "Unclaimed"), "Deposit: {TYPE}" (gold) or "None", building list "`{icon} {NAME}`", construction "Building: {label} {pct}%", or the region control line.

### Minimap
Fixed top-right below the bar: width `clamp(viewWidth × 0.2, 120, 190)` px, height proportional, 10 px from the right edge, frame `#0a0f1c` @ 85% with a `#3355bb` border. See [Presentation → Minimap](Presentation.md#6-minimap).

---

## 4. City Menu (double-click your city)

A wide modal (`min(900px, 92vw)` × 90vh):
- **Header:** city name, owner nation, CLOSE.
- **Status panel:** current order "`{label}  |  {s}s remaining`" (gold) with progress bar and **CANCEL**; queue rows "`n. {label}  ({s}s)`" each with **✕**; the four treasury amounts.
- **Tabs: UNITS | BUILDINGS.**
- **UNITS:** one row per catalog unit — name, cost "`🍎400  🧱300  🪙30  24.0s`" (training time after this city's Barracks speed-up; ≤ 1 s in sandbox), the stat detail line, a status line, and a button: **LOCKED** (tech/barracks/deposit missing), **FULL** (queue full), **QUEUE** (city busy), **BUILD**. Disabled if unaffordable. Status line reasons: "Queue full (max 5 items).", "Requires research: {techs}.", "Requires barracks in this city.", "Requires barracks level N.", "Requires an active copper / iron / fire glass deposit.", "Insufficient resources.", "Ready to queue.". Hovering a row shows the unit's flavor quote.
- **BUILDINGS:** first a **Raze City** row ("Destroys a random building level every 5s until none remain." — RAZE / STOP), then each constructible building: name, perks, cost (switches to upgrade cost once the building exists **or is already queued**), status, a main button (**BUILD / QUEUE / FULL / UPGRADE / BUILT n/max / LOCKED**) and a **−1 LVL** button (only when built; shows "−1 LVL Ns" while pending).
- Sandbox: the UI skips tech/deposit/cost checks to match the command processor, but still requires the Barracks level and a non-full queue.
- Refreshes every animation frame and on spawn/build/research events.

## 5. Territory Menu (double-click a tile)

A medium modal (`min(700px, 88vw)` × 88vh):
- Header: owner colour dot, "`(r, c) — {TERRAIN}`", owner name or "Unclaimed", deposit badge (e.g. "⊛ Copper"), ✕ close.
- **BUILT** section: "`{icon} {NAME}`" entries (Walls with " L{n}"), plus "  |  Building {label} {pct}%" while constructing.
- Columns **BUILDING | COST | REQ |** button. Rows shown:
  - Unclaimed non-water tile → only **Outpost**.
  - Owned tile → every non-mine building, plus only the mine(s) matching the tile's deposit (Mana Mine for any mana).
- Buttons: **BUSY** (construction running), **MAX**, **▲ UP** (upgradeable Walls), **BUILT**, **BUILD**. Outposts are paid by the local nation; other rows by the tile owner. Feedback text "Started: {label} ({duration})" / "Upgrade started: …" or the failure reason, cleared after 2.5 s.
- Durations format as "Ns", "Nm", or "Nm Ns".

## 6. Research modal
See [Research → Research modal](Research.md#4-research-modal).

## 7. Diplomacy modal
Opened by the widget (OPEN FULL or a row), or by double-clicking a foreign city. `min(860px, 94vw)`:
- Left column: known nations (dot, name, relation in green/red/yellow) — clicking re-opens the modal on that nation; defeated nations ("RIP {name}" / DEFEATED).
- Right column for the selected nation: big name; **RELATIONS** "Status: AT WAR / AT PEACE / ALLIED" with **PROPOSE PEACE** (at war; "PEACE (Ns)" while on cooldown) or **DECLARE WAR** (neutral; "WAR (Ns)" during a peace cooldown). Allies get no button. Clicking either sends the command; on success the modal closes, on refusal the reason is shown in red under the status.
- **TRADE:** rows Gold 🪙 / Materials 🪨 / Food 🍎 with −/+ steppers for YOU GIVE and YOU RECEIVE (capped at the giver's current amount), **⇄ EXECUTE TRADE**, and a status line ("Trade accepted!" or the rejection reason).
- "No other nations have been discovered yet." if nothing is known.

## 8. Pause modal (ESC / MENU)
Pauses GameScene and UIScene. `min(980px, 92vw)`:
- "Paused" + description, **RESUME**; "LOCAL SLOTS" + **MAIN MENU**.
- **Save Slots:** 10 rows "Slot N" with "`{saved date/time}  |  Day N  |  {gameMode}`" or "Empty slot", and **SAVE** / **LOAD**.
- **EXPORT FILE** — downloads the **most recently saved slot** as `phaser-rts-save-slot-{N}.json`. **IMPORT FILE** — picks a `.json`, validates it, writes it to the first empty slot (or, after a `confirm()`, overwrites slot 10).
- **Accessibility:** Font (Monospace / Sans-serif / Serif) and Size (Small 0.85 / Normal 1.0 / Large 1.2 / X-Large 1.4), applied live and stored in localStorage.
- Feedback line cleared after 2.2 s.

## 9. Game Over modal
Shown (and the game paused) on victory or defeat outside sandbox/tutorial: "VICTORY" (green) / "DEFEAT" (red), "Game duration: Mm SSs", **Surviving Nations** (colour dots), **Defeated Nations** (struck through), **RETURN TO MENU**.

## 10. War Confirm modal
See [Diplomacy](Diplomacy.md#2-going-to-war).

---

## 11. Main menu (MenuPage)

Full-screen DOM page (background `#050914`, a 5 px `#8dd7ff` accent bar at the top):
- Title **NO MAN'S LAND**, subtitle "Pick a preset scenario, set up a standard match, or explore freely in sandbox mode."
- **New-player banner** (only if `localStorage['nml:hasPlayed']` is unset and a tutorial scenario exists): "👋 New here? The Tutorial walks you through the basics against a passive opponent." + START TUTORIAL + ✕ (dismiss sets the flag).
- Three cards in a wrapping row:
  1. **SCENARIO PICKER** — selected scenario name, "Choose a preset scenario.", one button per scenario (★ prefix for tutorials), the description + "`Player: {name} vs {AI names}`", and **START SCENARIO** / **START TUTORIAL**. Launches `{gameMode: 'scenario', opponentCount: 1, scenarioId}` with the currently selected difficulty (default Medium); tutorials force `difficulty: 'sandbox'`.
  2. **STANDARD MATCH** "Custom Setup" — Opponents 1/2/3/4, Difficulty EASY/MEDIUM/HARD, a summary "`N Opponent(s)  |  DIFFICULTY`", **START STANDARD MATCH** (`gameMode: 'skirmish'`, `scenarioId: null`).
  3. **SANDBOX** "Free Play" — **START SANDBOX** (`gameMode: 'sandbox'`, `difficulty: 'sandbox'`, 1 opponent).
- Load row: "Or continue from your last local save." + **LOAD SAVED GAME** (loads the **most recently saved slot**; disabled if none).
- Version "v0.1" bottom-right.
- Every launch sets `nml:hasPlayed = '1'`.

Defaults: opponents 1, difficulty medium, scenario = the first in `scenarios.json` (Evershadow Tribe).

---

## 12. Save / Load
See [Save Format](Save-Format.md). Quick-save = slot 1. The tutorial overlay is not restored when loading a tutorial save.

## 13. Music
See [Presentation → Audio](Presentation.md#9-audio).

→ Continue to **[Presentation](Presentation.md)**
