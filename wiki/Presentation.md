# Presentation: Rendering, Visual Style, Assets & Audio

[← Back to Home](README.md)

Everything here is cosmetic — it has no effect on the simulation — but it is what makes the game look and sound the way it does.

---

## 1. Assets (`public/`)

| File | Size | Loaded as | Used for |
|---|---|---|---|
| `terrain_squares/plains.png` | 256×384 | `terrain_plains` | Plains tiles |
| `terrain_squares/snowforest.png` | 256×384 | `terrain_snow_forest` | Snow-Forest tiles |
| `terrain_squares/forest.png` | 256×384 | `terrain_forest` | Forest tiles |
| `terrain_squares/mountains.png` | 256×384 | `terrain_mountain` | Mountain tiles |
| `terrain_squares/ocean.png` | 256×384 | `terrain_water` | Water tiles |
| `terrain_squares/desert.png` | 256×384 | `terrain_desert` | Desert tiles |
| `terrain_squares/town.png` | 256×384 | `city_town` | Every city |
| `sprites/infantry_neutral_4x.png` | 512×1024 | spritesheet `infantry_neutral`, 128×128 frames (4 cols × 8 rows) | **Every unit type** (one shared sprite) |
| `audio/music/{melancholy1,2,3, hope1, focus1,2, glory1,2}.mp3` | — | `music_*` | Music |
| `favicon.svg` | 64×64 | — | Tab icon |

Terrain images are 2:3 "tall" squares: the top third is overhang (trees, peaks, buildings) that draws over the tile above.

### Unit sprite sheet layout
Rows of 4 frames (`assets/sprites/FORMAT.md` documents the 32×32 original; the shipped sheet is the 4× upscale):

| Row | Animation key (`infantry_neutral_…`) | Frames | FPS | Loop |
|---|---|---|---|---|
| 0 | `walk-down` | 4 | 7 | yes |
| 1 | `walk-left` | 4 | 7 | yes |
| 2 | `walk-right` | 4 | 7 | yes |
| 3 | `walk-up` | 4 | 7 | yes |
| 4 | `idle` | 4 | 3 | yes |
| 5 | `attack-left` | 4 | 10 | yes |
| 6 | `attack-right` | 4 | 10 | yes |
| 7 | `rest` (unused) | 4 | 2 | yes |

---

## 2. World layers and depths (GameScene)

| Depth | Object |
|---|---|
| −1 | (water border images — `WATER_BORDER = 0`, so none are drawn) |
| `row` (0..G−1) | Terrain image per tile: centred horizontally, bottom-aligned to the tile's bottom edge, displayed at 40 × 60 px |
| `50 + row` | City image (`city_town`, same 40 × 60 placement) |
| `52 + row` | City name label: 8 px monospace white, black stroke 2, centred at the tile's top (+2 px), rendered at 2× device-pixel resolution ×2 |
| 80 | Territory fill + borders |
| 81 | Conquest overlay |
| 82 | Construction overlay; territory-building icon text |
| 83 | Ranged-range overlay; deposit glyphs |
| 84 | Invisible deposit hover zones |
| 90 | Unit and city HP bars |
| 92 | Movement path lines |
| 95 | Fog of war |
| 200 | Selection rectangles |
| 201 | Drag-path preview |
| 210 | Tutorial tile highlight |
| 290 | "Armored Contact" markers |
| `299 + row` | Unit nation-colour ring |
| `300 + row` | Unit sprite |
| `400 + row` | Unit letter label |
| 810 | Stance badges |
| 900 | "CAPTURED!" text |
| 950 | Deposit tooltip |

Depth by row gives correct overlap: lower rows draw over higher ones.

---

## 3. Map elements

- **Terrain:** one image per tile, drawn once at scene start (terrain never changes during play).
- **Deposits:** a 9 px monospace glyph (`#ffe066`, black stroke 2) at tile centre + (11, 11) — glyphs in [Economy](Economy-and-Resources.md#2-tile-deposits). A transparent hover zone over the tile shows the deposit tooltip (only on discovered tiles): `#0a0e1e` @ 95% box, 1 px `#5a6cc0` border, 10 px `#e6ecff` centred text, counter-scaled by `1/zoom`, anchored above the tile.
- **Territory-building icons:** the concatenated building glyphs (⚑⊞⌘✦◉⊛⊗◈☽☀◆) as 9 px `#dfe8ff` monospace, black stroke 2, at the tile's top-left (+4, +3). Visible only on currently visible tiles.
- **Territory ownership:** each discovered owned tile gets a fill in the owner's colour (alpha 0.12 visible / 0.06 fogged) and a 2 px border line on every edge whose neighbour has a different owner (alpha 0.9 visible / 0.55 fogged).
- **Cities:** `town.png` + name label. Hidden until discovered. HP bar (visible tiles only): (40−8) × 4 px at the tile bottom (`y = top + 33`), black @ 80% background, owner-colour fill, black outline.
- **Units:**
  - Nation-colour circle outline: radius `40 × 0.25 + 2 = 12`, 1 px stroke.
  - Sprite 40 × 40 at the tile centre (all types use the infantry sheet).
  - Letter label (I, S, H, C, L, X, K, T) 9 px bold white monospace, black stroke 2, 16 px above the centre.
  - Sprites **teleport** tile to tile on `unit:step-complete` (no tweening).
  - Animation: in combat, alternates `attack-left` / `attack-right` every 800 ms (based on `time.now % 1600`); moving → the last walk animation chosen by step direction (horizontal wins ties: right if `dc ≥ 0` else left; vertical: down if `dr ≥ 0` else up); idle otherwise.
  - Ranged shot: the shooter flashes white (`setTintFill(0xffffff)`) for 130 ms.
- **Unit HP + morale bars:** 24 × 4 px each, 1 px apart, starting 12 px above the tile's top edge; HP fill = nation colour, morale fill = morale-band colour, black background and outline. Several units on one tile stack upward (pitch 14 px) sorted by unit id.
- **Paths:** for every moving unit whose overlay is visible, a 2 px line in the nation colour @ 70% from the unit through every remaining waypoint, plus 3 px dots @ 90%.
- **Selection:** 2 px rectangle inset 1 px: unit gold `#ffd700`, city light blue `#88aaff`, territory cyan `#66ccff`.
- **Ranged-range overlay** (selected ranged unit): every tile within Manhattan `attackRange` except its own: fill `#ff3300` @ 13%, 1 px outline `#ff5500` @ 35%.
- **Stance badge** (your units in combat): a 52 × 14 box (`#0a0e1e` @ 88%, `#4455bb` outline) with the effective stance in 9 px bold (colours in [Stances](Stances.md#in-the-ui)), at the tile's top centre, counter-scaled by `1/zoom`.
- **Conquest overlay** (visible contested territory): pulsing owner-of-attacker colour fill (alpha `0.10 + 0.06·sin(t/300)`) and a (40−4) × 5 px progress bar at the tile bottom (`progress / needed`). Territory HP bar during a territory battle: green `#44cc88` > 50%, amber `#ffaa22` > 25%, red `#ff4444`.
- **Construction overlay** (visible tiles): city orders → a (40−8) × 5 px progress bar 4 px from the tile top in the owner's colour; territory construction → pulsing fill (alpha `0.10 + 0.05·sin(t/260)`) plus the same bar 6 px lower.
- **"CAPTURED!"** — on `city:conquered`, 11 px bold `#ffdd44` text with black stroke 3 rises 24 px and fades over 2.2 s (`Cubic.Out`).
- **Tutorial tile highlight:** 3 px `#7bd4ff` rectangle inset 2 px, alpha `0.4 + 0.5 × (0.5 + 0.5·sin(t/250))`.

---

## 4. Fog of war drawing
Recomputed every frame (unless sandbox/tutorial):
- Undiscovered tile → solid black rectangle.
- Discovered but not visible → black @ 55%.
- Enemy units: drawn only when `visible`; `near` → an orange (`#ff8844`) 9 px bold label "Heavily Armored Contact" / "Lightly Armored Contact", word-wrapped at 96 px, centred on the tile.
- Your own units, rings and labels are always drawn.
- Path lines and HP bars of enemy units are drawn only when the unit itself is `visible`.

---

## 5. HUD visual style (UIScene)
- Buttons: filled rectangles with a 1 px `#4464aa` stroke; hover adds `0x101018` to the fill; 11·s px `#d8e4ff` labels. Fills: speed `#1b2442`, alerts `#241c36` (`#3c2a5e` when open), research `#1a1e3c` (`#1e2810` while researching, label `#b8e89a`), save `#14321e`, menu `#1e2244`, panel close `#2a1e30`, widget "OPEN FULL" `#1b2540`, PEACE `#21402c`, WAR `#402020`.
- Resource buttons: `#162030` (active `#2b3d5d`), stroke `#345070` (active `#88aaff`), 12·s px `#eef5ff`.
- Panels: `#0a0f1c`–`#0d1426` @ 95–97% with `#3355bb`/`#4a6ec7` borders.
- Toasts: `#111a2a` @ 94%, `#3355aa` border, width `min(420·s, 45% of screen)`, height 30·s.
- Stance buttons: active `#34558e` / border `#8cb4ff`; disabled `#1b2230` / `#344155` / text `#59657a`; normal `#182235` / `#47628d`. Spy button: active `#4a2a6e` / `#c488e8`.

## 6. Minimap
- Drawn on UIScene at depth 5000+. Each map tile is `cell = mapW / cols` px.
- **Base layer** (redrawn every 12 frames): undiscovered tiles `#05070d`; discovered tiles in the terrain colour (Plains `#6b8f3a`, Snow-Forest `#c2cdd8`, Forest `#2f5d2f`, Mountain `#6f6f6f`, Water `#24416b`, Desert `#c9b069`) overlaid with the owner's colour @ 45%.
- **Dynamic layer** (every frame): cities (own always, others if discovered) as owner-colour squares of `max(2, round(cell × 1.4))` px with a black border; **your** units as a white square with a nation-colour centre; the camera's world view as a white @ 90% 1 px rectangle.

## 7. HTML theme (CSS)
`src/ui/styles/tokens.css` defines the palette (mirrors `config/uiTheme.ts`):

| Token | Value | Token | Value |
|---|---|---|---|
| `--color-bg` | `#050914` | `--color-dim` | `#8fa2c6` |
| `--color-panel` | `#101827` | `--color-muted` | `#6d80a4` |
| `--color-panel-alt` | `#162235` | `--color-lt` | `#eef4ff` |
| `--color-header` | `#1a2942` | `--color-white` | `#ffffff` |
| `--color-surface` | `#1b2b44` | `--color-gold` | `#ffd166` |
| `--color-surface-hi` | `#243a5a` | `--color-success` | `#7fe7a6` |
| `--color-accent` | `#64a8ff` | `--color-danger` | `#ff9d92` |
| `--color-accent-soft` | `#8dd7ff` | `--color-warning` | `#ffd991` |
| `--color-btn` / `-hov` / `-active` | `#1b2b44` / `#274066` / `#315b8f` | `--color-red-btn` / `-h` | `#5a2424` / `#7e3232` |
| `--color-green-btn` / `-h` | `#1f4633` / `#2a6245` | `--color-warn-btn` / `-h` | `#5c4520` / `#7b5c2c` |

Fonts: display/body `"Trebuchet MS", Verdana, sans-serif`; data `Consolas, "Courier New", monospace` — all three are overridden at runtime by the accessibility font (default `monospace`).

`UIManager` sets `--ui-scale = clamp(shortSide / 900, 0.82, 1.42) × fontSizeScale`, `--ui-pad = clamp(round(scale·20), 14, 30)px`, `--ui-gap = clamp(round(scale·14), 10, 22)px`, `--ui-small-gap = clamp(round(scale·8), 6, 15)px`, `--ui-btn-h = clamp(round(scale·40), 32, 52)px`.

`modals.css` classes: `.modal-backdrop` (rgba(5,9,20,.78), centred flex; `.fullscreen` uses the solid bg), `.modal-panel` (panel bg, 1 px accent border, 8 px radius, `wide` 900/90vh, `narrow` 560, `full` 1100/94vh, `medium` 700/88vh), `.panel-alt`, `.row`/`.col` (+`.tight`, `.spread`, `.grow`), typography (`.text-title` 28 px, `.text-heading` 20, `.text-body` 14, `.text-label` 13, `.text-caption` 11 — all × `--ui-scale`), buttons (`.btn` height `--ui-btn-h`, mono bold 12 px; `.btn-sm` 75% height; variants primary/secondary/danger/success/warning/ghost; disabled opacity 0.42), `.scrollable`, `.progress-track`/`.progress-fill` (8 px, accent-soft fill), `.tabs`, `.list-row`, `.section-label` (10 px mono, letter-spacing 2, uppercase), `.color-dot` (12 px circle), `.nation-row`, `.step-btn` (26 px), `.menu-card`, `.feedback`, and the research graph classes (`.tech-node` states: researched `#143222`/`#7fe7a6`, active `#3d3114`/`#ffd166`, queued `#2c2616`, available accent border, needs-rp `#8b3a3a` border, locked `#0c121e`).

## 8. Tutorial overlay
A fixed, non-blocking layer (z-index 10000) with:
- A **320 px card** (default top-right, 12 px from the edges; draggable by a "⠿ CLICK AND HOLD TO DRAG" handle; clamped to the viewport; position kept between steps): eyebrow ("STEP i OF n", "OPTIONAL", "TUTORIAL COMPLETE"), title, body, and buttons (Keep playing / Back to menu) when relevant.
- A glowing ring (2 px `#7bd4ff`, 8 px radius, glow) around a highlighted DOM element (`[data-tutorial="produce-unit"]` = the City Menu unit list).
- A 10 px triangle arrow on the card edge facing the target (DOM element, or the highlighted tile's screen rect).

## 9. Audio

### Title screen (MenuScene)
Plays one random track from {hope1, melancholy1, melancholy2, melancholy3} at volume 0.8, looping, avoiding the track played last time the menu was shown. Waits for the browser's audio unlock if needed. Stopped when a game starts.

### In game (MusicManager)
| Category | Tracks | When |
|---|---|---|
| **glory** | glory1, glory2 | after you win (`notifyVictory`) |
| **focus** | focus1, focus2 | while your nation is at war with anyone |
| **melancholy** | melancholy1–3 | otherwise, before tick 6000 (10 min) |
| **hope** | hope1 | otherwise, from tick 6000 |

- Tracks play once at volume 1.0. When a track ends: wait **5 s**, then play a random track of the *current* category, never repeating the previous track if another exists.
- On `diplomacy:war-declared` / `diplomacy:peace-signed`, if the category changed, the current track fades to 0 over **1.5 s** and a track of the new category starts. Victory switches to glory the same way.
- There are no sound effects.

→ Continue to **[Scenarios & Tutorial](Scenarios-and-Tutorial.md)**
