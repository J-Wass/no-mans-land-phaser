# `window.__TEST__` API

Source: `src/testing/TestHarness.ts` (browser glue), `src/testing/playerView.ts` (state/map),
`src/testing/invariants.ts` (rule checks), `src/testing/eventInvolvement.ts` (the `mine` flag). Installed only on the Vite dev server with `?test=1`.

Call everything through `javascript_tool`; wrap in `JSON.stringify(...)`; `await` the async ones.

## URL parameters

| Param | Meaning |
|---|---|
| `test=1` | Required. Installs the harness. |
| `autostart=1` | Skip the menu and start a game from the params below. Omit to test the menu by hand. |
| `seed=<int>` | RNG seed (map, spawns, combat rolls). Default: random (recorded in `info().setup.seed`). |
| `difficulty=easy\|medium\|hard` | AI difficulty. Default `medium`. |
| `opponents=1..4` | Number of AI nations. Default 1. |
| `mode=skirmish\|scenario\|sandbox` | Default `skirmish`. |
| `scenario=<id>` | With `mode=scenario`: `tutorial`, `evershadow-tribe`, `the-invaders` (see `src/config/scenarios.json`). |
| `session=<name>` | Evidence folder name under `qa-reports/`. |
| `realtime=1` | Don't hold time — the game runs at the HUD's speed like normal play. |
| `sound=1` | Don't mute audio. |

Saves made during a test session use separate localStorage keys (`phaser-rts-save-slot-qa-N`), so the
player's real save slots are never touched.

## Session & observation

| Call | Returns |
|---|---|
| `__TEST__.ready` | `true` once a GameScene is running. |
| `__TEST__.info()` | `{ ready, sessionDir, scenes, setup, tick, myNationId, timeHeld, viewport, fogDisabled }` |
| `__TEST__.state()` | Player's-eye snapshot (fog applied) — see below. |
| `__TEST__.map({row, col, radius})` | ASCII map around a tile (default radius 12). `map()` = whole map (up to ~60×60; use sparingly). |
| `__TEST__.mapLegend()` | Legend for `map()`. Cities (`C`/`K`) stay drawn on every discovered tile, as in the game; owner digits only show on tiles currently in sight. |
| `__TEST__.tile(row, col)` | `{row, col, visible, terrain, deposit}` for any discovered tile, plus `city`/`cityName` if a city stands there (shown even out of sight, like the game's city sprite). Only for tiles in sight: `owner`, `hp`, `buildings`, `construction` (`"Farm (12t left)"`), `units`. Undiscovered: `{row, col, discovered: false}`. |
| `__TEST__.eventLog({since, mineOnly, limit})` | Recorded game events `{seq, tick, type, mine, data}`; `since` = last `seq` you saw. Events are logged before listeners run, so a cause precedes its effects (`battle:started` before the auto `diplomacy:war-declared`). `mine` = the payload names your nation, one of your units (including ones already destroyed) or cities, or a tile you hold. Frequent events (ticks, steps, battle rounds, morale deltas) are counted, not stored. |
| `__TEST__.notifications(sinceTick)` | Every HUD alert so far `{text, createdTick}` (toasts vanish on screen after 4 s; these don't). |
| `__TEST__.ui()` | `{ modals: [{id, text, controls: [{label, tag, enabled, x, y, tooltip?}]}], hud: [{text, x, y, button}] }` — open DOM modals/overlays (menu, cityMenu, territoryMenu, research, diplomacy, pause, warConfirm, gameOver, tutorial) and canvas HUD text. `x, y` are viewport click coordinates; `button: true` means the text sits on a clickable HUD button. |

### `state()` shape

```jsonc
{
  "tick": 1240,
  "me": { "nationId": "...", "name": "...", "resources": { "GOLD": 0, "FOOD": 0, "RAW_MATERIAL": 0, "RESEARCH": 0 },
          "research": { "current": "the_wheel — The Wheel (336t left)", "queue": ["writing"], "researched": [] }, "territoryTiles": 21 },
  "cities": [{ "id", "name", "at": [r, c], "hp": "200/200", "buildings": ["CITY_HALL:1"], "producing": "Infantry (12/40t left)", "queue": [], "razing?": true }],
  "units":  [{ "id", "name", "type", "at", "hp", "morale": "STEADY 80", "stance": "HOLD", "rank", "movingTo?": [r, c], "stepsLeft?", "inCombat?", "spy?" }],
  "constructing":   [{ "at", "building", "ticksLeft" }],
  "visibleEnemies": [{ "id", "owner", "type", "at", "hp", "inCombat?" }],
  "contacts":       [[r, c]],   // unidentified contacts at the edge of vision
  "foreignCities":  [{ "id", "name", "at", "visible": true, "owner", "hp" },   // in sight
                     { "id", "name", "at", "visible": false }],             // discovered, out of sight (owner/hp unknown)
  "nations":        [{ "id", "name", "mapDigit", "relation": "NEUTRAL|WAR|ALLY", "peaceCooldownTicks?" }],
  "combat":         { "battles": [...], "sieges": [...], "territoryBattles": [...] },
  "defeatedNations": []
}
```

All tick counts are whole ticks, rounded up. `research.current` is `"<techId> — <display name> (<n>t left)"`;
commands take the `techId`. `queue`/`researched` list tech ids.

Coordinates are always `[row, col]`, row 0 at the top. `TICK_RATE` is 10 ticks per second of normal play
(so 300 ticks ≈ 30 s at 1×).

## Time

| Call | Effect |
|---|---|
| `await __TEST__.advance(n, opts)` | Run up to `n` ticks, then wait for the screen to settle. |
| `__TEST__.holdTime(bool)` | `false` lets the game run in real time at HUD speed (use briefly to judge feel); `true` holds again. |

`advance` options: `stopOn` (`'notable'` default, `'none'`, or an array of event names), `mineOnly`
(default `true` — only stop on events involving you), `stopOnBug` (default `true` — stop on a new
error-level invariant violation or runtime error), `settleMs` (default 300).

Returns `{ from, to, advanced, stoppedBy, ticksSinceAnythingHappenedToMe, myEvents, otherEventCount,
newViolations, newErrors, gameOver, lastEventSeq }`. `stoppedBy` is `completed`, `event <type>`,
`invariant violation`, `runtime <kind>: ...`, `game over`, or `unknown` (suspicious — investigate).

Notable events: battle started/ended, siege started, city conquered, unit destroyed, war/peace, nation
defeated, spy detected, research complete, unit spawned, production complete, building built, territory
conquest started, unit withdrew, morale band changed.

## Acting

| Call | Effect |
|---|---|
| `await __TEST__.moveTo(unitId, row, col)` | Pathfinds like a map click and issues `MOVE_UNIT`. Skips the UI's war-confirm prompt. |
| `await __TEST__.issue({type, ...})` | Any command as the local player; `playerId` and `issuedAtTick` are filled in. Returns `{success, reason?}`. |
| `await __TEST__.focus(row, col, zoom?)` | Centre the camera on a tile; returns `tileToScreen` for it. |
| `__TEST__.tileToScreen(row, col)` | `{ x, y, onCanvas, coveredByDom, coveredByHud, tilePixels }` — where to click for that tile. |

Real input (clicks, keys) goes through the Claude-in-Chrome `computer` tool. Every command the player
issues — through the UI or `issue()` — is logged with its result.

### Command shapes (`src/commands/GameCommand.ts`)

| `type` | Fields |
|---|---|
| `MOVE_UNIT` | `unitId`, `path: [{row, col}, ...]` (adjacent steps, excluding start — prefer `moveTo`) |
| `START_CITY_PRODUCTION` | `cityId`, `unitType` |
| `CANCEL_CITY_PRODUCTION` | `cityId`, `queueIndex?` |
| `BUILD_CITY_BUILDING` | `cityId`, `building` |
| `REMOVE_CITY_BUILDING_LEVEL` | `cityId`, `building` |
| `RAZE_CITY` | `cityId`, `enabled` |
| `BUILD_TERRITORY` | `position: {row, col}`, `building` |
| `UPGRADE_TERRITORY` | `position`, `building` |
| `START_RESEARCH` / `QUEUE_RESEARCH` / `REMOVE_QUEUED_RESEARCH` | `techId` |
| `MOVE_QUEUED_RESEARCH` | `techId`, `direction: 'up' \| 'down'` |
| `CANCEL_RESEARCH` | — |
| `SET_UNIT_BATTLE_ORDER` | `unitId`, `battleOrder: 'WITHDRAW' \| 'HOLD' \| 'ADVANCE'` |
| `CONVERT_TO_SPY` | `unitId`, `spy: boolean` (Scouts only) |
| `DECLARE_WAR` / `PROPOSE_PEACE` | `targetNationId` |
| `OFFER_TRADE` | `targetNationId`, `offer`, `request` (`{GOLD?, FOOD?, RAW_MATERIAL?, RESEARCH?}`) |

IDs:
- **Unit types:** INFANTRY, SCOUT, HEAVY_INFANTRY, CAVALRY, LONGBOWMAN, CROSSBOWMAN, CATAPULT, TREBUCHET
- **City buildings:** CITY_HALL, BARRACKS, WALLS, FARMS, WORKSHOP, WATCHTOWER, SCHOOL, MARKET
- **Territory buildings:** OUTPOST, WALLS, FARMS, WORKSHOP, WATCHTOWER, COPPER_MINE, IRON_MINE,
  FIRE_GLASS_MINE, SILVER_MINE, GOLD_MINE, MANA_MINE
- **Techs:** writing, hunting, masonry, trade, education, the_wheel, scientific_method, mathematics,
  physics, chemistry, biology, animal_domestication, iron_working, steel_working, mechanization,
  ancient_rituals, mana_studies

Costs, prerequisites and timings live in the wiki (`wiki/Units.md`, `wiki/Production-and-Buildings.md`,
`wiki/Research.md`) and in the in-game modals.

## QA instruments

| Call | Returns |
|---|---|
| `__TEST__.invariants()` | Every violation seen this session: `{rule, severity, message, entities, firstTick, lastTick}`. Checked automatically every 10 ticks during `advance`. |
| `__TEST__.errorLog(sinceIndex)` | Captured `error`, `unhandledrejection`, `console.error`, `console.warn` with tick. (The AI swallows its own exceptions with `console.error`, so AI crashes show up here.) |
| `__TEST__.metrics()` | `{ tick, ticksAdvanced, commands: {total, failed, byType, failures}, clicks, deadTime, firsts, eventCounts, violations, errors, warnings, tasks }` |
| `__TEST__.startTask(name)` / `endTask('done'\|'gave-up')` | Measure one player task: clicks, commands, failed commands, ticks. |
| `await __TEST__.saveAndReload()` | Saves via the real save path, reloads via the real load path, diffs full state before/after. `{ ok, differences: [path: before → after] }`. |

Invariant rules (see `src/testing/invariants.ts`): `non-finite-number`, `orphan-unit`,
`unit-out-of-bounds`, `unit-hp-range`, `unit-on-impassable` (warn), `engaged-without-battle`,
`battle-without-engaged` (warn), `friendly-stack` (warn), `movement-for-missing-unit`,
`battle-missing-unit`, `battle-same-nation`, `battle-without-war` (also catches allies fighting),
`siege-missing-entity`, `siege-own-city`, `siege-without-war`, `territory-battle-missing-unit`,
`territory-battle-without-war`, `orphan-city`, `city-hp-range`, `city-out-of-bounds`,
`city-tile-mismatch`, `city-tile-owner`, `orphan-territory`, `tile-missing-city`, `negative-resource`,
`unknown-tech`, `research-repeat`, `research-progress`, `research-queue-duplicate` (warn),
`asymmetric-relation`.

## Evidence (written to `qa-reports/<session>/` via the dev server)

| Call | Writes |
|---|---|
| `await __TEST__.screenshot(name)` | `shots/<name>.png` — game canvas incl. HUD; **DOM modals are not in it**. |
| `await __TEST__.dumpSave(name)` | `saves/<name>.json` — a full save (importable from the pause menu). |
| `await __TEST__.writeFile(relPath, text)` | Any text file. |
| `await __TEST__.flush()` | `events.jsonl`, `replay.json` (setup + every player command with tick), `metrics.json`, `violations.json`, `errors.json`. |
