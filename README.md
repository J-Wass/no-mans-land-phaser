# No Man's Land

A grid-based, **real-time (tick-driven) strategy game** built with **Phaser 3** and **TypeScript** (strict mode). You command a nation: grow an economy, research a tech tree, raise an army, and conquer rival cities. Combat resolves automatically over time using a deep stat model where HP, **morale**, **stance**, terrain, unit matchups, veterancy, and magical **deposits** all feed the same damage math.

> 📖 **Full game documentation lives in [`wiki/`](wiki/README.md)** — every mechanic (morale, stances, withdraw, combat formulas, economy, research, AI, diplomacy) is documented there with exact numbers.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev          # start the Vite dev server (opens http://localhost:3000)
npm run build        # type-check + production build to dist/
npm run preview      # preview the production build
npm run type-check   # tsc --noEmit (no build)
npm run lint         # eslint
npm run lint:fix     # eslint --fix
npm run format       # prettier --write src
```

## Testing

Tests run on **Jest** (via `ts-jest`):

```bash
npm test             # run the suite
npm run test:watch   # watch mode
npm run test:coverage
```

Test files live next to the code they cover as `*.test.ts` (e.g. `BattleSystem.test.ts`, `MoraleSystem.test.ts`, `Grid.test.ts`). Combat is covered by a determinism test that asserts the seeded RNG produces reproducible results.

## Gameplay overview

- **Tick model:** the world advances at `TICK_RATE = 10` ticks/sec (100 ms/tick). The clock reads "Day N HH:00" (100 ticks = 1 day). Speed is adjustable (Pause / 0.5× / 1× / 2× / 4×).
- **Modes:** Scenario, Standard Match (procedural skirmish, 1–4 AI), Sandbox (no costs, no fog, live AI/terrain tools), and a guided Tutorial.
- **Difficulties:** Easy (passive-ish Noob AI), Medium (Basic AI), Hard (Advanced AI with a strategy state machine), Sandbox (passive).
- **Win condition:** scenario-defined — usually eliminate all rivals; some scenarios are "survive N ticks".
- **Controls:** mouse-driven. Left-click to select/move (left-drag paints a path), right-drag to pan, wheel to zoom, double-click cities/tiles for their menus, ESC for the pause menu. Attacking = moving a unit into an enemy; combat starts automatically.

### Core systems

| System | Summary |
|---|---|
| **Combat** | Multiplicative offense × additive-clamped mitigation (cap 0.65). Unit battles, city sieges, territory battles, and standalone ranged fire. |
| **Morale** | A parallel stat with 5 bands (Inspired→Broken) that scales damage/mitigation, gates stances, and routs broken units. |
| **Stances** | HOLD (defense), ADVANCE (offense, costs morale), WITHDRAW (disengage). Morale can override your chosen stance. |
| **Units** | 8 types — Infantry, Scout, Heavy Infantry, Cavalry, Longbowman, Crossbowman, Catapult, Trebuchet — with type/armor matchup counters and XP-based veterancy. |
| **Economy** | Gold, Food, Raw Material, Research from cities/territories, plus metal & mana **deposits** activated by mines. |
| **Research** | A 3-branch tech tree (Society / Science / Arcane) unlocking units, buildings, and mines. |
| **Map** | 4-connected grid, six terrain types, A\* pathfinding, fog of war, regions with domination bonuses. |
| **AI** | Profile → Strategy → Goal hierarchy; difficulty changes think-rate, aggression, and tech/economy behavior. |
| **Diplomacy** | War / Peace / Ally relations, auto-war on attack, peace cooldowns, and AI-evaluated resource trades. |

## Project structure

```
src/
├── main.ts                 # entry point
├── config/                 # balance constants, scenarios, maps, themes
│   ├── combatBalance.ts     #   damage formulas & combat constants
│   ├── moraleBalance.ts     #   morale bands, gains/losses, recovery
│   ├── constants.ts         #   TICK_RATE, TILE_SIZE, …
│   ├── scenarios.json/.ts   #   scenario definitions
│   └── maps/*.terrain       #   plain-text map files
├── types/                  # shared types (common, diplomacy, gameSetup, …)
├── entities/               # units/ (8 types + base Unit), cities/, nations/, players/
├── systems/                # game systems
│   ├── combat/              #   BattleSystem, CitySiegeSystem, TerritoryBattleSystem, RangedFireSystem
│   ├── morale/              #   MoraleSystem, moraleRules
│   ├── movement/            #   MovementSystem, MovementCosts
│   ├── pathfinding/         #   A* Pathfinder
│   ├── grid/                #   Grid, Territory, geometry
│   ├── vision/              #   fog of war
│   ├── tick/                #   TickEngine (the simulation clock)
│   ├── production/          #   ProductionSystem, ProductionCatalog
│   ├── research/            #   TechTree
│   ├── resources/           #   ResourceType, deposits, ResourceBonuses
│   ├── territory/           #   City/Territory building catalogs
│   ├── regions/             #   RegionSystem
│   ├── spawn/               #   start-of-game placement
│   ├── diplomacy/           #   DiplomacySystem
│   ├── ai/                  #   profiles, strategies, goals
│   ├── tutorial/            #   TutorialManager, tutorialSteps
│   └── save/                #   SaveSystem (localStorage, 10 slots)
├── managers/               # GameState, MusicManager
├── scenes/                 # Phaser scenes: Menu, Boot, Game, UI, Minimap
├── ui/                     # UIManager, modals, overlays, styles
├── i18n/                   # all user-facing strings (strings.ts barrel + content/hud/modals/menu)
├── commands/               # CommandProcessor + GameCommand (all player intent)
└── network/                # NetworkAdapter / LocalServerAdapter (multiplayer-ready seam)
```

## Architecture notes

- **Deterministic simulation.** All systems pull from one seeded RNG (`GameState.getRng()`), so the same seed + same commands always produce the same game. This is what makes the `LocalServerAdapter`/`NetworkAdapter` seam (and a future lockstep multiplayer) viable. The `seed` field in `GameSetup` exists for reproducible/shared maps.
- **Command-driven.** Player and AI intent flows through `CommandProcessor` as discrete `GameCommand`s (move, build, research, set stance, declare war, trade, …), never by mutating state directly.
- **Centralized balance.** Tunable numbers live in `src/config/` (`combatBalance.ts`, `moraleBalance.ts`, `constants.ts`) and the catalogs (`ProductionCatalog.ts`, `TechTree.ts`, building catalogs), keeping the shared formulas identical across every system.
- **Centralized strings.** All user-facing text lives under `src/i18n/` (imported via the `src/i18n/strings.ts` barrel), so the game can be localized without touching scenes, modals, or catalogs. The data catalogs source their `label`/`detail`/`perks`/`name`/`description` from `i18n/content.ts`; flavor-text quotes live in `src/config/flavorText.ts` (re-exported by the barrel).
- **Strict TypeScript.** `strict`, `noUnusedLocals/Parameters`, `noImplicitReturns`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are all enabled.

## TypeScript features

This project uses a strict TypeScript configuration:
- `strict: true` — all strict type checks
- `noUnusedLocals` & `noUnusedParameters` — no unused variables
- `noImplicitReturns` — all code paths must return
- `noUncheckedIndexedAccess` — indexed access returns `T | undefined`
- `exactOptionalPropertyTypes` — strict optional properties

## License

MIT
