# Events & Commands Reference

[← Back to Home](README.md)

Two message types connect the layers: **commands** carry intent into the simulation, **events** carry facts out of it.

---

## 1. Commands (`src/commands/GameCommand.ts`)

Every command is a plain JSON object with `type`, `playerId` and `issuedAtTick` (the UI passes the current tick for diplomacy/moves and `0` from most modals; it is only used as the event tick / cooldown reference). `CommandProcessor.dispatch(cmd)` returns `{ success: boolean; reason?: string }` and never throws. All handlers first resolve `playerId → Player → controlled Nation` and fail with "Player not found" / "Nation not found".

"Sandbox" = the processor was built with `sandboxMode = true` (`gameMode === 'sandbox'`).

| Command | Fields | Validation (in order) | Effect |
|---|---|---|---|
| `MOVE_UNIT` | `unitId, path[]` | path non-empty; player exists; unit exists, alive, not engaged; owned by the player's nation; each step at Chebyshev distance 1 from the previous | `MovementSystem.issueOrder` (replaces any order); emit `unit:move-ordered` |
| `BUILD_TERRITORY` | `position, building` | tile exists; known building; no construction in progress; tech (non-sandbox). **Outpost:** tile unclaimed; orthogonally adjacent to own tile (non-sandbox); affordable (non-sandbox). **Others:** tile owned; building absent; prerequisite present; deposit matches (Mana Mine: any mana); affordable (non-sandbox) | pay; start construction (`min(10, ticks)` in sandbox); emit `territory:building-started` |
| `UPGRADE_TERRITORY` | `position, building` | tile owned; building present; below max (Walls 5, others 1); affordable (non-sandbox); no construction | pay `upgradeCost`; start construction with `isUpgrade` |
| `BUILD_CITY_BUILDING` | `cityId, building` | city owned; queue not full; known; not already at max; tech (non-sandbox); affordable (non-sandbox) | pay (build or upgrade cost); enqueue a building order (`min(10, ticks‖10)` in sandbox) |
| `START_CITY_PRODUCTION` | `cityId, unitType` | city owned; queue not full; catalog entry exists; techs (non-sandbox); Barracks level (always); deposits (non-sandbox); affordable (non-sandbox) | pay; enqueue unit order with Barracks speed-up (then `min(10, …)` in sandbox); emit `city:production-started` |
| `CANCEL_CITY_PRODUCTION` | `cityId, queueIndex?` | city owned; index valid | no index → cancel active order and promote the next; else remove that queue item. No refund. |
| `RAZE_CITY` | `cityId, enabled` | city owned | `setRazing(enabled)` (starts the 50-tick countdown if not running); emit `city:buildings-changed` |
| `REMOVE_CITY_BUILDING_LEVEL` | `cityId, building` | city owned; not City Hall; building present | schedule a 50-tick single-level removal; emit `city:buildings-changed` |
| `START_RESEARCH` | `techId` | nothing active; not researched; prerequisites (non-sandbox); known; RP (non-sandbox) | pay; start (`10` ticks in sandbox); emit `nation:research-started` |
| `CANCEL_RESEARCH` | — | — | drop active research |
| `QUEUE_RESEARCH` | `techId` | known; at least one new tech to add | queue the tech and its missing prerequisites (dependency order); emit `nation:research-queue-updated` |
| `REMOVE_QUEUED_RESEARCH` | `techId` | is queued | remove; emit queue-updated |
| `MOVE_QUEUED_RESEARCH` | `techId, direction: 'up'\|'down'` | movable | swap; emit queue-updated |
| `SET_UNIT_BATTLE_ORDER` | `unitId, battleOrder` | unit owned | set order (any time); emit `unit:battle-order-changed` |
| `CONVERT_TO_SPY` | `unitId, spy: boolean` | unit owned; Scout; Ancient Rituals (non-sandbox); not engaged; tile unowned or own | set `isSpy`; emit `unit:spy-changed` (no-op success if unchanged) |
| `DECLARE_WAR` | `targetNationId` | diplomacy system present; no peace cooldown; not already at war | WAR both ways; emit `diplomacy:war-declared` |
| `PROPOSE_PEACE` | `targetNationId` | at war; AI target accepts | peace (see [Diplomacy](Diplomacy.md#3-making-peace)) |
| `OFFER_TRADE` | `targetNationId, offer, request` | target exists; AI target accepts; both sides can pay | transfer resources |

Failure reasons are human-readable strings, e.g. "Path is not a sequence of adjacent tiles", "Must be adjacent to your existing territory", "Production queue is full", "Requires BARRACKS level 3", "Requires an active COPPER/IRON/FIRE_GLASS mine", "Insufficient research points (need 25)", "Only Scouts can go undercover", "Cannot declare war (cooldown or already at war)", "Trade rejected. Try again in 10s.".

---

## 2. Events (`GameEventBus`)

A typed wrapper over `eventemitter3` with `emit`, `on`, `off`. `EventSubscriptions` records subscriptions so a scene/modal can `disposeAll()` on shutdown.

### Simulation events
| Event | Payload | Emitted by |
|---|---|---|
| `game:tick` | `{tick}` | TickEngine, end of every tick |
| `unit:move-ordered` | `{unitId, path, playerId}` | CommandProcessor |
| `unit:step-complete` | `{unitId, from, to, tick}` | MovementSystem; also retreats, peace teleports |
| `unit:move-complete` | `{unitId, destination, tick}` | MovementSystem; siege/territory conquest with no pending path |
| `unit:destroyed` | `{unitId, byUnitId \| null, ownerNationId, position, tick}` | battles, sieges, territory battles, ranged fire, spy detection, dead sweep |
| `unit:battle-order-changed` | `{unitId, battleOrder, tick}` | CommandProcessor |
| `unit:spy-changed` | `{unitId, isSpy, tick}` | CommandProcessor |
| `unit:withdrew` | `{unitId, from, to, tick}` | BattleSystem (loser retreat) |
| `spy:detected` | `{spyUnitId, ownerNationId, byNationId, byUnitId, position, tick}` | SpyDetectionSystem |
| `battle:started` | `{battleId, unitAId, unitBId, position, tick}` | BattleSystem |
| `battle:round-resolved` | `{battleId, round, unitAId, unitBId, damageToUnitA, damageToUnitB, tick}` | BattleSystem |
| `battle:ended` | `{battleId, winnerUnitId, loserUnitId, reason: 'ELIMINATION'\|'WITHDRAW'\|'ROUT'\|'MUTUAL_DESTRUCTION'\|'PEACE', tick}` | BattleSystem |
| `city:siege-started` | `{siegeId, unitId, cityId, position, tick}` | CitySiegeSystem |
| `city:siege-round` | `{siegeId, unitId, cityId, damageToCity, damageToUnit, cityHealth, tick}` | CitySiegeSystem |
| `city:conquered` | `{cityId, byUnitId, byNationId, fromNationId, position, tick}` | CitySiegeSystem |
| `ranged:fired` | `{unitId, targetId, targetType: 'unit'\|'city', damage, from, to, tick}` | RangedFireSystem |
| `city:production-started` | `{cityId, unitType, tick}` | CommandProcessor (units only) |
| `city:unit-spawned` | `{cityId, unitId, unitType, position, tick}` | ProductionSystem |
| `city:production-complete` | `{cityId, order, tick}` | ProductionSystem (resource orders) |
| `city:building-built` | `{cityId, building, tick}` | ProductionSystem |
| `city:buildings-changed` | `{cityId, tick}` | raze/removal decay, conquest, raze/removal commands |
| `territory:claimed` | `{position, nationId, tick, fromNationId?}` | outpost completion, territory conquest (with `fromNationId`), city conquest (without) |
| `territory:building-started` | `{position, building, nationId, tick}` | CommandProcessor |
| `territory:building-built` | `{position, building, tick}` | TickEngine construction |
| `territory:building-upgraded` | `{position, building, newLevel, tick}` | TickEngine construction |
| `territory:conquest-started` | `{position, nationId, needed, tick}` | TerritoryBattleSystem |
| `territory:conquest-progress` | `{position, progress, needed, tick}` | TerritoryBattleSystem (each round) |
| `territory:conquest-cancelled` | `{position, tick}` | territory battle end without conquest; siege ended by peace |
| `nation:research-started` | `{nationId, techId}` | CommandProcessor, ProductionSystem (queue) |
| `nation:research-complete` | `{nationId, techId}` | ProductionSystem |
| `nation:research-queue-updated` | `{nationId, queue}` | CommandProcessor, ProductionSystem |
| `nation:defeated` | `{nationId, name, tick}` | TickEngine |
| `diplomacy:war-declared` | `{nationId1, nationId2, tick}` | DiplomacySystem |
| `diplomacy:peace-signed` | `{fromNationId, toNationId, tick}` | DiplomacySystem |
| `region:dominated` | `{regionId, nationId, tick}` | ProductionSystem (every 50 ticks per dominated region) |
| `morale:band-changed` | `{unitId, oldBand, newBand, value, tick}` | MoraleSystem |
| `morale:gained` | `{unitId, amount, source, tick}` | MoraleSystem |
| `morale:lost` | `{unitId, amount, source, tick}` | MoraleSystem, BattleSystem (battle-lost) |

### UI events
| Event | Payload | Emitted by → consumer |
|---|---|---|
| `game:speed-change` | `{speed}` | UIScene speed button → GameScene |
| `unit:selected` | `{unit \| null}` | GameScene → UIScene, tutorial |
| `city:selected` | `{city \| null}` | GameScene → UIScene |
| `territory:highlighted` | `{position \| null}` | GameScene → UIScene |
| `ui:click-consumed` | `{}` | `makeButton` HUD buttons, widget rows, minimap → sets a flag that makes GameScene ignore its next left-click (see [Controls → How HUD clicks interact with the map](Controls-and-UI.md#how-hud-clicks-interact-with-the-map)) |
| `ui:camera-panned` | `{}` | GameScene right-drag → tutorial |
| `ui:modal-opened` | `{modal: 'cityMenu'\|'territoryMenu'\|'research'\|'diplomacy'}` | PhaserUIBridge → tutorial |

### Subscribers inside the simulation
- **MoraleSystem:** `battle:ended`, `unit:destroyed`, `city:conquered`, `territory:claimed`, `city:siege-round`.
- **DiplomacySystem:** `battle:started`, `city:siege-started`, `ranged:fired` (auto-war).
- **TickEngine:** `diplomacy:peace-signed` (force-end combat).
- **MusicManager:** `diplomacy:war-declared`, `diplomacy:peace-signed`, `game:tick`.

Event handlers run synchronously inside `emit`, so e.g. morale gains from a kill apply in the same tick as the kill.

→ Continue to **[Save Format](Save-Format.md)**
