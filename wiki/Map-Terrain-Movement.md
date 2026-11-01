# Map, Terrain & Movement

[← Back to Home](README.md)

## 1. The grid

- The world is a **square grid of tiles** addressed by `{row, col}`; `(0,0)` is the top-left. One tile is **40 px** (`TILE_SIZE`); tile `(r,c)` occupies world pixels `[c·40, (c+1)·40) × [r·40, (r+1)·40)`.
- Size: 60×60 for scenarios, 23–26 for skirmishes (see [World Generation](World-Generation.md#2-grid-size)). Water surrounds the playable land.
- Every tile is a `Territory` record: terrain, owner (`controlledBy`), optional city id, optional resource deposit, territory buildings + levels, an in-progress construction, and HP.
- **Adjacency is 4-way (N/S/W/E)** for pathfinding, outpost adjacency, impassable-tile claiming and region flood fill. Paths produced by the pathfinder never move diagonally.
- Distance metrics (`systems/grid/geometry.ts`):
  - **Manhattan** `|Δr| + |Δc|` — pathfinding heuristic, vision circles, ranged targeting, AI threat radii, peace teleport.
  - **Chebyshev** `max(|Δr|, |Δc|)` — morale witness/rally radii, spy detection, spawn spacing, retreat rings.

---

## 2. Terrain

| Terrain | Enum | Move cost | `.terrain` char | Minimap colour | Harvest when owned |
|---|---|---|---|---|---|
| Plains | `PLAINS` | 50 | `.` | `#6b8f3a` | +1 Food / 50 ticks |
| Snow-Forest ("Snowy Forest", "hills") | `SNOW_FOREST` | 75 | `H` | `#c2cdd8` | +1 Raw Material / 50 ticks |
| Desert | `DESERT` | 75 | `D` | `#c9b069` | +1 Gold / 80 ticks |
| Forest | `FOREST` | 100 | `F` | `#2f5d2f` | +1 Raw Material / 50 ticks |
| Mountain | `MOUNTAIN` | ∞ (Earth Mana → 75) | `M` | `#6f6f6f` | — |
| Water | `WATER` | ∞ (Water Mana → 75) | `W` | `#24416b` | — |

### Terrain combat modifiers
Terrain effects depend on unit type and stance; they apply in **unit-vs-unit battles only**, using the terrain of the battle tile (the tile both units stand on).

**Offense multiplier** (attacker):
- **Forest:** Cavalry ×0.82; otherwise ranged attack ×0.94; otherwise (melee) ×1.08.
- **Snow-Forest:** ranged attack ×1.12; otherwise on HOLD ×1.05; otherwise ×1.
- **Desert:** Cavalry ×1.06; Heavy Infantry ×0.95.
- **Plains:** Cavalry on ADVANCE ×1.12.
- Mountain / Water: ×1.

**Mitigation bonus** (defender, added before the 0.65 cap):
- **Forest:** +0.06 for every unit type except Cavalry.
- **Snow-Forest:** +0.08 when the defender's effective stance is HOLD or WITHDRAW.
- **Plains:** −0.04 for Cavalry on ADVANCE.

Terrain does **not** affect vision.

---

## 3. Movement

Movement is continuous, tick-based, and orthogonal. A unit's order is a **path**: the list of tiles to step through, excluding its current tile.

### Step cost
```ts
stepCost(terrain, unitType, stats, activeDeposits?, activeCounts?, speedMultiplier = 1):
  base = TERRAIN_BASE_COST[terrain]
  if base is ∞:
     MOUNTAIN and nation has an active EARTH_MANA mine → base = 75
     WATER    and nation has an active WATER_MANA mine → base = 75
  if base is ∞ → ∞ (impassable)
  effectiveSpeed = (terrain == FOREST && unitType ∈ {HEAVY_INFANTRY, CAVALRY, CATAPULT, TREBUCHET}) ? 1 : stats.speed
  lightning      = min(3, # active Lightning-Mana mines)          // +1 speed per mine
  speedMultiplier = nation researched 'the_wheel' ? 1.2 : 1
  return max(1, ceil(base / ((effectiveSpeed + lightning) * speedMultiplier)))
```

Ticks per tile (no mana):

| Speed | Plains | Snow-Forest / Desert | Forest | …with The Wheel (Plains / SF-Desert / Forest) |
|---|---|---|---|---|
| 1 (Heavy Inf, Crossbow, Catapult, Trebuchet) | 50 | 75 | 100 | 42 / 63 / 84 |
| 2 (Infantry, Longbowman) | 25 | 38 | 50 | 21 / 32 / 42 |
| 3 (Scout) | 17 | 25 | 34 | 14 / 21 / 28 |
| 3 (Cavalry — forest at speed 1) | 17 | 25 | **100** | 14 / 21 / **84** |

### How a move plays out (`MovementSystem.tickWithBattles`, once per tick, for every unit with an order)
1. If the unit no longer exists or is dead → drop the order. If it is **engaged in battle** → skip (frozen).
2. Look up the owner's active deposits/counts and The Wheel.
3. If `ticksRemainingOnStep ≤ 0` (a freshly issued or resumed order): set it to `stepCost` of `path[0]`; if that tile is now impassable, drop the order.
4. `ticksRemainingOnStep--`. When it reaches 0:
   1. Shift `next = path[0]`.
   2. **Friendly stacking is blocked:** if another living unit of the **same owner** (the *blocker*) stands on `next`:
      - **Swap:** if the blocker is **idle** (no order, not engaged in combat), `next` is **not** the order's final tile, and the blocker can stand on the mover's tile (finite step cost for its type), the two trade places — the blocker moves onto the mover's tile (emits `unit:step-complete` for it) and the mover's step goes ahead normally. This is how a column gets through a one-tile pass held by a parked unit.
      - Otherwise put it back, retry next tick (`ticksRemainingOnStep = 1`) and count `blockedTicks += 1` (reset to 0 by any successful step). Then:
      - A blocker that **will clear by itself** — it has an order and isn't itself waiting (`blockedTicks = 0`), or it is **engaged in combat** (a besieger may fall, see [Known Quirks #3](Known-Quirks.md)) — is waited for indefinitely.
      - Otherwise (the blocker is parked on the destination, or stuck itself) the unit waits `FRIENDLY_BLOCK_GRACE_TICKS` = **5** ticks, then:
        - if `next` is the destination, or the destination is also held by a friendly that won't clear → **end the order** on the current tile and emit `unit:move-blocked {reason: 'destination-occupied'}` (blockedAt = the destination);
        - else **re-path** to the destination with every friendly that won't make way (fighting, or stuck mid-order) treated as impassable (`avoidParkedFriendlies`); idle ones stay passable since the mover swaps with them; the new path replaces the old one (step cost resolves next tick);
        - if there is no such path → end the order, emit `unit:move-blocked {reason: 'no-detour'}` (blockedAt = `next`).
      
      The HUD turns `unit:move-blocked` into an alert for the player's own units. So two units ordered onto each other's tiles, or a damaged unit ordered into its city after a fresh unit spawned there, stop next to the tile and say so instead of freezing.
   3. Move the unit (`unit.moveTo(next)`), emit `unit:step-complete`.
   4. Unless the mover is an undercover **spy**:
      - Another nation's living, non-spy unit that is **not already in a battle** on `next` **and that the [engagement policy](Diplomacy.md#2-going-to-war) lets the mover attack** → `BattleSystem.startBattle(mover, occupant)` (both now share the tile); stop processing this unit.
      - Else a city on `next` owned by another nation the policy lets it attack → `CitySiegeSystem.startSiege`; stop.
      - Else the tile is owned by another nation, has no city, **and the mover's nation is at WAR with that owner** → `TerritoryBattleSystem.startBattle`; stop.
   5. If the path is now empty → drop the order, emit `unit:move-complete`. Otherwise pre-compute `stepCost` of the new `path[0]` (0 if impassable, which drops the order next tick).

Consequences worth knowing:
- A unit with a cost-25 step spends exactly 25 ticks before arriving.
- Moving onto a **neutral** nation's land never starts a fight; moving onto a neutral nation's **unit** or **city** does (and auto-declares war — see [Diplomacy](Diplomacy.md)) unless a peace cooldown is running. Allied units and cities are never attacked.
- Walking onto an enemy unit that is already fighting someone else just shares its tile; the mover then gets the city/territory checks.
- Units of different nations can share a tile; same-nation units cannot.
- A unit never silently freezes behind a friendly: idle friendlies in the way swap places with it; behind a stuck one it re-paths or stops with an alert within 5 ticks. A re-path routes to the original destination, so a drag-painted route's intermediate waypoints are dropped.
- An idle unit parked on the mover's **final** tile is never displaced: the mover stops next to it (`destination-occupied`).
- Stance never changes movement speed.

### Command validation
`MOVE_UNIT` is rejected if the path is empty, the unit is dead or in battle, it isn't the player's, or the path isn't contiguous: each entry must be exactly one **orthogonal** step (Manhattan distance 1) from the previous one. Issuing a new order replaces the old one.

---

## 4. Pathfinding

`new Pathfinder(grid, movement?)`, `findPath(from, to, unitType, stats, ownerNationId?, gameState?, { avoidParkedFriendlies? })`:
- **A\*** over the 4-connected grid with a linear-scan open list (lowest `f`, first found wins ties) and a closed set.
- Destination check first: if `to` is impassable for this unit → `null`.
- **Edge cost** = `stepCost` for the neighbour's terrain (with the owner's mana and The Wheel), **+12** if the neighbour is owned by a nation other than the mover's that isn't its ally (`ENEMY_TERRITORY_PENALTY`; neutral and enemy tiles both count).
- **Parked friendlies:** a neighbour (other than `to`) held by a living unit of `ownerNationId` that **won't make way** — engaged in combat, or holding an order it's stuck on (per the `movement` lookup; GameScene passes the MovementSystem). Idle friendlies don't count (the mover swaps with them) and neither do advancing ones; without a lookup every friendly counts. Such a tile costs **+3 × its step cost** (`STATIONARY_FRIENDLY_STEP_PENALTY`), so detours of up to ~3 extra steps are preferred and a path only goes through a parked unit when there's no reasonable way round. With `avoidParkedFriendlies` such tiles are impassable instead (used by movement re-paths). Moving friendlies are pathed through freely (they'll clear). Other nations' units never affect paths.
- **Heuristic** = Manhattan distance (in tiles, not ticks — so it is very weak relative to edge costs of 14–100).
- Neighbours are expanded in N, S, W, E order; a node is re-pushed when a strictly better `g` is found.
- Returns the path **excluding `from`, including `to`**, or `null`. `from == to` returns `[]`.

The player's click-move, the drag-painted path (pathfinding between consecutive waypoints), and every AI move use this.

---

## 5. Vision & fog of war

`VisionSystem.compute(gameState, nationId, currentTick)` runs **every frame** for the local nation (and only for it) and returns three sets of tile keys:

- **Visible:**
  1. Every tile within Manhattan distance 2 of any tile the nation owns.
  2. For each living unit: tiles within Manhattan distance `vision + airBonus`.
  3. For each owned city with a **Watchtower** and each owned territory with a **Watchtower**: tiles within Manhattan distance **3**.
  4. **Revealed shooters:** whenever a unit's ranged fire hits one of the nation's units or cities (`ranged:fired`, recorded by `VisionSystem.noteRangedFire`), the shooter's tile is visible to that nation for `SHOOTER_REVEAL_TICKS` = **30** ticks (3 s). The ranged fire interval is 20 ticks, so a unit that keeps firing stays revealed. Reveals aren't saved.
- **Near-visible:** tiles within `radius + 2` of each unit / watchtower circle that are not visible ("unidentified contacts").
- **Discovered:** visible ∪ near-visible tiles are added to the nation's persistent discovered set (saved with the game).

`airBonus` = number of active Air-Mana mines (max 3).

### Seeing enemy units (`unitVisibility`)
1. An undercover **spy** is `hidden` from every nation except its owner and that owner's allies.
1b. A unit standing on a tile revealed to the viewer by its own ranged fire is `visible` (this beats Shadow Mana).
2. If the unit's nation has **no** active Shadow-Mana mine: `visible` if its tile is visible, `near` if near-visible, else `hidden`.
3. If it **has** Shadow Mana: only the observer's **units** count (territory borders and watchtowers no longer reveal it). For each living observer unit: `effectiveVision = max(0, vision + airBonus − 1)`; `visible` if Manhattan distance ≤ effectiveVision, else `near` if ≤ effectiveVision + 2.

On screen: own units always show; enemy units show only when `visible`; a `near` enemy shows an orange marker reading **"Heavily Armored Contact"** or **"Lightly Armored Contact"** (by armor type) instead of the sprite. Undiscovered tiles are drawn solid black, discovered-but-not-visible tiles at 55% black. Cities are shown once their tile is discovered. Territory-building icons, city HP bars, conquest and construction overlays only show on **visible** tiles. See [Presentation](Presentation.md#4-fog-of-war-drawing).

**Fog is disabled** (everything visible and discovered) in Sandbox and in the Tutorial. The minimap shows only discovered tiles and only your own units.

---

## 6. The Tick Engine

`TICK_RATE = 10` ticks/sec, `TICK_INTERVAL_MS = 100`. `TickEngine.advance()` runs, in order:

1. `currentTick++`
2. **Movement** (`tickWithBattles`) — steps, and starts battles / sieges / territory battles on arrival.
3. **Spy detection** (only on ticks divisible by 10).
4. **Unit-vs-unit battles.**
5. **Stranded-unit sieges** — any living, non-engaged, non-spy unit standing on a city tile owned by another nation it may attack (engagement policy) starts a siege there (e.g. after the city's defender withdrew).
6. **City sieges** (city HP regen happens inside on ticks divisible by 50).
7. **Territory battles** (territory HP regen inside on ticks divisible by 50).
8. **Ranged fire.**
9. **Production** — passive income, region domination, raze/level-removal decay, city build queues and unit spawns, upkeep, research.
10. **Territory construction** — every tile's construction counts down; completions apply (outposts claim the tile + adjacent unowned water/mountain).
11. **Sweep dead units** (HP 0 but not yet removed) → `unit:destroyed` with no killer.
12. **Defeat check** — any nation with no cities and no living units is defeated.
13. If `tick % 10 == 0`: heal units resting in own cities, then morale recovery.
14. If `tick % 10 == 0`: Water-Mana healing.
15. `MoraleSystem.tick` — emits `morale:band-changed` for band crossings.
16. Emit `game:tick`.

After each `advance()`, GameScene calls `AISystem.tick(currentTick)`.

When peace is signed (`diplomacy:peace-signed`), TickEngine immediately force-ends every battle, siege and territory battle between the two nations.

---

## 7. The `.terrain` map file format

Plain text, one line per row, one character per column (see the table in §2). Lines are taken after trimming the whole file and stripping trailing whitespace from each line; the number of lines sets the grid size. Unknown characters leave the tile as PLAINS. Deposits are not in the map file — they come from the scenario definition. All three shipped maps are 60×60; see [Scenario Data](Scenario-Data.md).

→ Continue to **[Units](Units.md)**
