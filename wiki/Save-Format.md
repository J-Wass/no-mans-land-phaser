# Save Format & Persistence

[← Back to Home](README.md)

## 1. Storage

| Key (`localStorage`) | Contents |
|---|---|
| `phaser-rts-save-slot-1` … `-10` | one `GameSaveData` JSON per slot |
| `nml:hasPlayed` | `'1'` once any game has been launched (hides the tutorial banner) |
| `accessibility:font` | chosen font-family string (default `monospace`) |
| `accessibility:fontSize` | font-size multiplier (default `1.0`) |

- `SaveSystem.save(slot, data)` → `true` on success, `false` if `localStorage` throws (full/blocked).
- `SaveSystem.load(slot)` / `parse(raw)`: rejects JSON longer than 20 MiB, unparsable JSON, or data failing the structural check: `version === 1`, numeric `savedAt` and `currentTick`, object `setup` and `state`, array `movementStates` and `battleStates`.
- `listSlots()` returns slots 1–10 with their parsed data (or null).
- Quick-save (top-bar SAVE) writes slot 1. The menu's LOAD SAVED GAME loads the first non-empty slot.
- Export downloads the first non-empty slot as `phaser-rts-save-slot-{N}.json` (pretty-printed). Import validates and writes to the first empty slot, or slot 10 after confirmation.

Loading starts `GameScene` with `{saveData, setup: saveData.setup}`; `GameState.fromJSON(saveData.state)` rebuilds the world, then the tick, movements, battles, sieges, territory battles and peace cooldowns are restored.

---

## 2. `GameSaveData`

```ts
interface GameSaveData {
  version: 1;
  savedAt: number;                 // Date.now()
  setup: GameSetup;                // {opponentCount, difficulty, gameMode, scenarioId, seed?}
  currentTick: number;
  state: GameStateJSON;            // below
  movementStates: { unitId; path: {row,col}[]; ticksRemainingOnStep: number }[];
  battleStates: {
    id; unitAId; unitBId; position; attackerId; attackerOrigin; defenderOrigin;
    ticksUntilRound; roundsElapsed; startedAtTick;
  }[];
  siegeStates?: { id; unitId; cityId; position; attackerOrigin; pendingPath?: {row,col}[]; ticksUntilRound; roundsElapsed }[];
  territoryBattleStates?: { id; unitId; position; attackerOrigin; pendingPath?; ticksUntilRound; roundsElapsed }[];
  peaceCooldowns?: { key: string /* "nationA:nationB" sorted */; expiresAtTick: number }[];
}
```

### `GameStateJSON` (`GameState.toJSON()`)
```ts
{
  currentTurn: number;               // vestigial
  activeNationId: string | null;     // vestigial
  rngState: number;                  // mulberry32 state
  grid: { rows; cols; territories: TerritoryData[] };      // every tile
  nations: NationJSON[];
  defeatedNations: { id; name; color; defeatedAtTick }[];
  cities: CityData[];
  units: UnitData[];
  players: { id; displayName; controlledNationId; isLocal }[];
  unitTypeCounters: Record<"nationId:UNIT_TYPE", number>;  // last serial issued (starts at 100)
  productionUnitSerial: number;                            // last N used in "unit-city-N" (starts at 1000)
  discoveredTiles: { nationId; tiles: string[] /* "r,c" */ }[];
}
```
Field definitions: `TerritoryData` and `CityData` in [Cities, Territory & Regions](Cities-Territory-Regions.md), `NationJSON` in [Diplomacy](Diplomacy.md#5-the-nation-entity), `UnitData` in [Units](Units.md#7-the-base-unit--what-every-unit-tracks), production orders in [Production](Production-and-Buildings.md#1-the-city-production-queue):
```ts
type ProductionOrder =
  | { kind: 'unit'; unitType; label; ticksTotal; ticksRemaining }
  | { kind: 'building'; buildingType; label; ticksTotal; ticksRemaining }
  | { kind: 'resource'; resourceType; resourceAmount; label; ticksTotal; ticksRemaining };
```

---

## 3. Restore details (`GameState.fromJSON`)
1. New `GameState({rows, cols})` (all plains), then `rng.setState(rngState)` if present.
2. Territories: terrain, owner, city id, deposit, buildings (default `[]`), levels, HP, construction.
3. Nations: treasury (added onto zeros), relations, researched techs, current research, queue (filtered: known, unique, not researched, not active).
4. Players; units via `createUnitFromData` (subclass by type; saved stats override defaults; legacy `FALL_BACK` → `WITHDRAW`); cities (current order, buildings, levels, HP, raze state, queue).
5. Turn fields, serial counters (if missing: derived from the highest serial per nation+type), `productionUnitSerial` (if missing: highest `unit-city-N` id), discovered tiles, defeated nations.
6. In GameScene: `tickEngine.setTick`, `movementSystem.restoreStates` (orders with empty paths dropped), battles/sieges/territory battles restored (entries whose units no longer exist are skipped; surviving units re-marked engaged; id counters advanced past the highest restored id), peace cooldowns.

### Not saved (reset on load)
Regions (recomputed from terrain — deterministic), ranged-fire cooldowns, trade rejection backoff, MoraleSystem band memory, AI timers and Advanced strategy, music state, camera, the tutorial overlay. Game speed, HUD notifications and the HUD's panel toggles are not saved either; they live on the GameScene/UIScene instances, which Phaser reuses, so they carry over from whatever game was running earlier in the same page session (see [Known Quirks](Known-Quirks.md)).

---

## 4. Identifier conventions

| Entity | Format |
|---|---|
| Nation | `nation-{1..}` (index order at boot) |
| Player | `player-{1..}` |
| City | `city-{nationIndex}-{1..}` |
| Skirmish starting units | `unit-inf-{n}`, `unit-scout-{n}` |
| Scenario starting units | `unit-{type lowercase}-{n}-{j}` (e.g. `unit-infantry-1-1`) |
| Trained units | `unit-city-{1001..}` |
| Battle / siege / territory battle | `battle-{N}`, `siege-{N}`, `tbattle-{N}` (territory battles are keyed internally by `"r,c"`) |
| Region | `region-{N}` |
| Tile key | `"{row},{col}"` |

→ Continue to **[Text & Content](Text-and-Content.md)**
