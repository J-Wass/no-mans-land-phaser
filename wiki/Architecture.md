# Architecture & Code Structure

[← Back to Home](README.md)

This page describes how the game is built: the tech stack, the module layout, how a frame/tick flows through the code, and the conventions every system follows. Read it first if you plan to re-implement the game.

---

## 1. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript 5 (strict — see §9) |
| Engine | **Phaser 3** (`package.json` range `^3.80.1`; 3.90.0 is what `npm install` currently resolves — the input-capture and scene-queue behaviour described in this wiki was read from 3.90 source) (`Phaser.AUTO` renderer, `Scale.RESIZE` mode, arcade physics configured but unused) |
| UI plugin | `phaser3-rex-plugins` (registered as scene plugin `rexUI`; only `src/utils/rexUiHelpers.ts` uses it and that file is currently **unused**) |
| Event emitter | `eventemitter3` (ships with Phaser) |
| Bundler / dev server | **Vite 6** (`base: './'`, dev port 3000, output `dist/`, esbuild minify, no sourcemaps) |
| Tests | **Jest 30** + `ts-jest`, `testEnvironment: 'node'`; `.terrain` files loaded through a raw-string transformer |
| Lint / format | ESLint 9 flat config with `typescript-eslint` (type-aware; `no-floating-promises` and `no-misused-promises` are errors) + Prettier (`singleQuote`, `trailingComma: all`, `printWidth: 100`, `arrowParens: avoid`) |
| Hosting | GitHub Pages via `.github/workflows/deploy.yml` (on push to `main`: `npm ci` → lint → test → build → upload `dist/`) |
| Local preview | `runlocal.py` serves `dist/` on `http://127.0.0.1:8000` (builds first if `dist/index.html` is missing) |

Path alias: `@/` → `src/` (in `vite.config.ts`, `tsconfig.json`, and Jest's `moduleNameMapper`). Scenario maps are imported as raw text with the `?raw` suffix (`import evershadowRaw from '@/config/maps/evershadow.terrain?raw'`).

`index.html` holds one `<div id="game-container">` (full-window, background `#0a0a12`, `overflow:hidden`, canvas `touch-action:none`), the SVG favicon (a purple "M" on `#0d0d1a`), and loads `/src/main.ts`.

### npm scripts
`dev` (vite), `build` (`tsc && vite build`), `preview`, `test`, `test:watch`, `test:coverage`, `type-check` (`tsc --noEmit`), `lint`, `lint:fix`, `format`, `format:check`.

---

## 2. Directory layout

```
src/
├── main.ts                    entry: UIManager.init(); new Phaser.Game(gameConfig); exposes window.game in DEV
├── config/
│   ├── gameConfig.ts           Phaser config: scenes [MenuScene, BootScene, GameScene, UIScene], bg #08090f
│   ├── constants.ts            TILE_SIZE=40, TICK_RATE=10, TICK_INTERVAL_MS=100, MAX_TICK_CATCHUP=5
│   ├── combatBalance.ts        shared damage helpers + combat constants
│   ├── moraleBalance.ts        morale bands, gains, losses, recovery, radii
│   ├── accessibility.ts        font family/size settings (localStorage)
│   ├── uiScale.ts / uiTheme.ts responsive scale formula, colour tokens
│   ├── flavorText.ts           hover quotes for units/techs
│   ├── names.json              skirmish nation names/colours/city names
│   ├── scenarios.json / .ts    scenario definitions + map registry
│   └── maps/*.terrain          60×60 plain-text scenario maps
├── types/                      common.ts (GridCoordinates, EntityId…), diplomacy.ts, gameSetup.ts (setup + save types)
├── entities/
│   ├── units/                  Unit base class + 8 subclasses, unitFactory (save restore)
│   ├── cities/City.ts          city entity (buildings, queue, HP, raze state)
│   ├── nations/Nation.ts       treasury, relations, research state
│   └── players/Player.ts       human/AI controller record
├── systems/
│   ├── tick/TickEngine.ts      the simulation clock — calls every system in a fixed order
│   ├── movement/               MovementSystem (in-flight paths), MovementCosts (stepCost)
│   ├── pathfinding/            A* Pathfinder
│   ├── combat/                 BattleSystem, CitySiegeSystem, TerritoryBattleSystem, RangedFireSystem, SpyDetectionSystem
│   ├── morale/                 MoraleSystem (event gains/losses + band polling), moraleRules (pure helpers)
│   ├── production/             ProductionSystem (income, build queues, research, upkeep), catalogs, spawn factory
│   ├── research/TechTree.ts    tech catalog
│   ├── resources/              ResourceType + ResourceStorage, TerritoryResourceType (deposits), ResourceBonuses
│   ├── territory/              CityBuilding + TerritoryBuilding catalogs
│   ├── grid/                   Grid, Territory (one tile), geometry helpers
│   ├── regions/RegionSystem.ts named regions + domination
│   ├── vision/VisionSystem.ts  fog of war
│   ├── diplomacy/              DiplomacySystem (auto-war, peace, trade evaluation)
│   ├── spawn/SpawnSystem.ts    start-of-game placement helpers
│   ├── ai/                     AISystem → AIController → AIProfile → (AIStrategy) → AIGoal
│   ├── tutorial/               TutorialManager + declarative tutorialSteps
│   ├── save/SaveSystem.ts      localStorage slots
│   ├── random/Rng.ts           deterministic mulberry32 RNG
│   └── events/                 GameEventBus (typed), EventSubscriptions (bulk unsubscribe)
├── managers/                   GameState (authoritative world state), MusicManager
├── commands/                   GameCommand union + CommandProcessor (validation + dispatch)
├── network/                    NetworkAdapter interface + LocalServerAdapter
├── scenes/                     MenuScene, BootScene, GameScene, UIScene, Minimap, gameSceneHelpers
├── ui/                         UIManager (DOM overlay), PhaserUIBridge, TutorialOverlay, modals/*, pages/MenuPage, styles/*.css
├── i18n/                       all user-facing strings (content, hud, modals, menu) + strings.ts barrel
└── utils/                      resourceIcons (emoji), uiHelpers (formatCost), rexUiHelpers (unused)
public/                         served as-is: terrain_squares/*.png, sprites/infantry_neutral_4x.png, audio/music/*.mp3, favicon.svg
```

---

## 3. Layered design

```
          ┌────────────── Presentation ──────────────┐
          │ MenuScene / GameScene / UIScene / Minimap │  Phaser canvas
          │ UIManager + DOM modals + TutorialOverlay  │  HTML overlay (#ui-overlay)
          └───────────────┬───────────────▲──────────┘
     GameCommand (async)  │               │ GameEventBus events (typed)
          ┌───────────────▼───────────────┴──────────┐
          │ NetworkAdapter → LocalServerAdapter        │
          │ CommandProcessor (validate + mutate)       │
          │ TickEngine (fixed-order systems)  AISystem │
          └───────────────┬───────────────────────────┘
          ┌───────────────▼───────────────────────────┐
          │ GameState: Grid/Territories, Nations,      │
          │ Cities, Units, Players, RNG, discovered    │
          └────────────────────────────────────────────┘
```

Rules the code follows:

1. **All player intent is a `GameCommand`** (see [Events & Commands](Events-and-Commands.md)). The UI never mutates state directly; it calls `networkAdapter.sendCommand(cmd)`, which returns `Promise<CommandResult>`. The AI calls `commandProcessor.dispatch(cmd)` synchronously with the same command objects.
2. **The renderer and HUD learn about changes through `GameEventBus` events** (plus per-frame polling of `GameState` for bars/overlays). Systems never call into Phaser.
3. **Entities hold data; systems hold behaviour.** Movement paths, battles, sieges, and territory battles live in their systems' private maps, not on the units.
4. **One authoritative RNG** (`GameState.getRng()`) feeds every random draw inside the simulation (map generation, spawn placement, combat variance, withdraw rolls, spy detection, raze target choice). Presentation-only randomness (music track choice, title track) uses `Math.random()`.
5. **Balance numbers live in config/catalog files** (`combatBalance.ts`, `moraleBalance.ts`, `ProductionCatalog.ts`, `TechTree.ts`, `CityBuilding.ts`, `TerritoryBuilding.ts`, `ResourceBonuses.ts`, `RegionSystem.ts`). A few remain inline (see [Constants & Glossary](Constants-and-Glossary.md)).
6. **All user-facing text lives in `src/i18n/`** (catalog labels/perks come from `i18n/content.ts`). See [Text & Content](Text-and-Content.md).

---

## 4. Scene flow

```
MenuScene ──(new game)──► BootScene ──► GameScene ──launches──► UIScene
    ▲          (load save) ─────────────►   │  (parallel HUD scene)
    └──────────── bridge.goToMenu() ◄───────┘
```

| Scene | Key | Responsibility |
|---|---|---|
| `MenuScene` | `MenuScene` | Preloads 4 calm tracks, plays one random title track (volume 0.8, looping, never the same one twice in a row across menu visits), shows the DOM `MenuPage` via `UIManager.showMenu`. On start: stops music, then `scene.start('BootScene', {setup})` for a new game or `scene.start('GameScene', {saveData, setup})` to load. |
| `BootScene` | `BootScene` | Builds a fresh `GameState` from a `GameSetup` (grid, terrain, deposits, nations, players, cities, units, territory) — see [World Generation](World-Generation.md) — then `scene.start('GameScene', {gameState, setup})`. |
| `GameScene` | `GameScene` | Owns the simulation objects (MovementSystem, Pathfinder, GameEventBus, TickEngine, DiplomacySystem, VisionSystem, CommandProcessor, LocalServerAdapter, AISystem, PhaserUIBridge, MusicManager, RegionSystem, TutorialManager). Renders the world, handles mouse input and the camera, drives the tick loop, evaluates victory/defeat, then `scene.launch('UIScene', …)`. |
| `UIScene` | `UIScene` | The canvas HUD drawn above the world at a fixed scale: top bar, toasts, alert history, resource breakdown, diplomacy widget, info panel, minimap. |

DOM modals (city menu, territory menu, research, diplomacy, pause, game over, war confirm) and the main menu are **HTML elements** appended to `#ui-overlay` (a `position:fixed` layer over the canvas, `pointer-events:none` unless something is open). `PhaserUIBridge` is the single object modals use to reach game state, the network adapter, the event bus, and scene control.

### GameScene construction order (`create()`)
1. Clear sprite maps and selection; `tickAccumulator = 0`.
2. `MovementSystem`, `Pathfinder(grid)`, `GameEventBus`, `EventSubscriptions`.
3. `TickEngine(gameState, movement, bus, isSandbox)` (constructs Production/Battle/Siege/RangedFire/SpyDetection/TerritoryBattle/Morale systems).
4. `DiplomacySystem`, `VisionSystem`; detect tutorial mode (`gameMode === 'scenario'` and the scenario has `isTutorial`).
5. `CommandProcessor(gameState, movement, bus, diplomacy, isSandbox)` wrapped in `LocalServerAdapter`.
6. `AISystem(gameState, commandProcessor, movement, pathfinder, difficulty)`.
7. `PhaserUIBridge`, `MusicManager`; register SHUTDOWN cleanup (music, subscriptions, tutorial, resize listener).
8. If loading a save: restore tick, movement states, battles, sieges, territory battles, peace cooldowns.
9. Draw terrain, deposits, territory-building icons; build `RegionSystem` from the grid and attach to `GameState`.
10. Create graphics layers, tutorial manager (only for a *new* tutorial game), animations, city and unit sprites; subscribe to render events.
11. Camera bounds/zoom/centre, resize handler, mouse controls, ESC → pause.
12. Victory/defeat listeners (skipped in sandbox and tutorial).
13. `scene.launch('UIScene', {...})`.

---

## 5. The frame / tick loop

`GameScene.update(time, delta)` runs every animation frame:

```ts
if (gameSpeed > 0) {
  interval = TICK_INTERVAL_MS / gameSpeed            // 100ms at 1×, 50ms at 2×, 25ms at 4×, 200ms at 0.5×
  accumulator = min(accumulator + delta, interval * MAX_TICK_CATCHUP)   // backlog capped at 5 ticks
  while (accumulator >= interval) {
    accumulator -= interval
    tickEngine.advance()                             // one simulation tick
    aiSystem.tick(tickEngine.getCurrentTick())       // AI thinks after every tick
  }
}
// then presentation, every frame regardless of pause:
updateFog(); updateUnitAnimations(); drawPaths(); drawSelection(); drawTutorialHighlight();
drawUnitHealthBars(); drawCityHealthBars(); drawConquestOverlay(); drawConstructionOverlay();
updateRangeOverlay(); updateStanceBadges();
```

While `gameSpeed === 0` (PAUSE on the speed button) no time accumulates, so resuming never fast-forwards. Opening the Pause modal or Game Over modal instead calls `scene.pause()` on both GameScene and UIScene.

`TickEngine.advance()` order is documented in [Map, Terrain & Movement → The Tick Engine](Map-Terrain-Movement.md#6-the-tick-engine).

---

## 6. Determinism

- `Rng` is **mulberry32** over a 32-bit state:
  ```ts
  constructor(seed) { state = seed >>> 0; if (state === 0) state = 0x9e3779b9; }
  next() {                               // float in [0,1)
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  nextInt(n) = floor(next()*n);  nextRange(a,b) = a + floor(next()*(b-a+1));
  fn() = () => next();  shuffle = Fisher-Yates using nextInt(i+1);
  randomSeed() = (Math.random() * 2^32) >>> 0
  ```
- The seed comes from `GameSetup.seed` if present, otherwise `Rng.randomSeed()`. The RNG `state` is saved (`rngState`) and restored on load.
- `TickEngine` passes the same `rng.fn()` closure to BattleSystem, CitySiegeSystem, RangedFireSystem, SpyDetectionSystem and TerritoryBattleSystem; ProductionSystem draws from it for raze targets. The order of draws inside a tick is therefore part of the spec (see [Combat → RNG draw order](Combat.md#rng-draw-order)).
- Some state is **not** persisted and resets on load: ranged-fire cooldowns (`nextFireTick`), trade-rejection backoff, MoraleSystem's last-seen bands, AI controller timers and Advanced-AI strategy. A reloaded game therefore diverges slightly from an uninterrupted one.

---

## 7. Networking seam

```ts
interface NetworkAdapter { sendCommand(cmd: GameCommand): Promise<CommandResult>; }
class LocalServerAdapter implements NetworkAdapter {
  constructor(private processor: CommandProcessor) {}
  async sendCommand(cmd) { return this.processor.dispatch(cmd); }   // synchronous under the hood
}
```
Only `LocalServerAdapter` exists. Player identity is a `Player` record (`isLocal: true` for the human). There is no multiplayer transport, no lockstep scheduler, and no turn system — `GameState.currentTurn`, `activeNationId`, `nextTurn()` and the units' `hasMovedThisTurn`/`hasAttackedThisTurn` flags are vestigial from an earlier turn-based design and have no gameplay effect.

---

## 8. Core state objects

| Object | Holds | Notes |
|---|---|---|
| `GameState` | `Grid`, maps of nations / cities / units / players, defeated-nation tombstones, per-nation discovered tiles, `RegionSystem` ref, `Rng`, `unitsByNation` index, `unitTypeCounters` (serials), `productionUnitSerial` | `getNationActiveDeposits(nationId)` and `getNationActiveDepositCounts(nationId)` compute mine bonuses on demand. |
| `Grid` | `Map<"row,col", Territory>` | Constructed as all-PLAINS; 4-neighbour `getNeighbors` in order N, S, W, E. |
| `Territory` | terrain, `controlledBy`, `cityId`, `resourceDeposit`, buildings + levels, `currentConstruction`, `currentHealth` | One per tile, including city tiles. |
| `Nation` | id, name, colour, `isAI`, `controlledBy` (player id), `ResourceStorage` treasury, relations map, researched set, `currentResearch`, `researchQueue` | Units/cities/territory are **not** stored on the nation. |
| `Player` | id, displayName, controlledNationId, `isLocal` | Local player display name is `"Player"`; AI players use the nation name. |
| `City` | name, owner, position, `currentOrder`, `productionQueue`, buildings + levels, HP, base melee, raze state | |
| `Unit` | see [Units → base Unit](Units.md#7-the-base-unit--what-every-unit-tracks) | |

`coordsToKey({row, col})` → `"row,col"` is the universal tile key.

---

## 9. TypeScript configuration

`target ES2020`, `module ESNext`, `moduleResolution node`, `resolveJsonModule`, `isolatedModules`, `noEmit`, `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `skipLibCheck`.

---

## 10. Testing

- 285 tests in ~30 `*.test.ts` files next to the code they cover (combat, morale, movement costs, pathfinding, production, diplomacy, save round-trips, spawn, spy detection, tutorial manager, scenario loading, RNG and combat determinism, i18n content wiring).
- Anything needing a live Phaser `Game` or DOM (scenes, HUD, modals) has no automated tests — importing `phaser` under Node throws.

→ Continue to **[World Generation](World-Generation.md)**
