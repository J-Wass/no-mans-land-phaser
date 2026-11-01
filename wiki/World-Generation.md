# World Generation (BootScene)

[← Back to Home](README.md)

`BootScene.create(data)` turns a `GameSetup` into a fully populated `GameState`, then starts `GameScene`. Everything random here draws from the game's seeded RNG (`rng = gameState.getRng().fn()`), so the same seed always produces the same world.

---

## 1. The GameSetup

```ts
type Difficulty = 'easy' | 'medium' | 'hard' | 'sandbox';
type GameMode   = 'skirmish' | 'scenario' | 'sandbox';
interface GameSetup {
  opponentCount: number;        // clamped to 1..4
  difficulty: Difficulty;       // default 'medium'
  gameMode: GameMode;           // default 'skirmish'
  scenarioId: string | null;    // default null
  seed?: number;                // optional fixed RNG seed
}
```
`normalizeGameSetup()` applies the clamps/defaults. Total nations = `1 + min(opponentCount, 4)`.

Sandbox mode uses the **skirmish** generator (procedural map, 1 opponent). Scenario mode uses the scenario's own map and nations.

---

## 2. Grid size

- **Scenario:** the grid is exactly the scenario map's size (all shipped maps are **60×60**).
- **Skirmish / sandbox:**
  ```ts
  gridSize = clamp(18 + ceil(sqrt(12 × totalNations)), 22, 30)
  ```
  | Total nations | 2 | 3 | 4 | 5 |
  |---|---|---|---|---|
  | Grid | 23×23 | 24×24 | 25×25 | 26×26 |

The grid is always square. `new GameState({rows, cols}, seed)` creates every tile as PLAINS, then generation overwrites terrain.

---

## 3. Procedural terrain (skirmish / sandbox)

Run in this exact order.

### 3a. Water border
`waterBorder = max(3, round(gridSize × 0.12))` (= 3 for every skirmish size). Every tile with `r < waterBorder`, `r ≥ G − waterBorder`, `c < waterBorder` or `c ≥ G − waterBorder` becomes WATER. (Step 3b re-paints the inner rows 1..G−2, so the island shape — not this border — decides most of the coastline. Row/column 0 and G−1 always stay water.)

### 3b. Island + biomes (`placeProceduralTerrain`)
```ts
center     = (G - 1) / 2
baseRadius = G * 0.46
coastPhaseA = rng() * 2π;  coastPhaseB = rng() * 2π
for r in 1..G-2, c in 1..G-2:
  dx = c - center; dy = r - center
  distance = sqrt(dx² + dy²);  angle = atan2(dy, dx)
  coastNoise = sin(angle*3 + coastPhaseA)*1.2 + cos(angle*5 + coastPhaseB)*0.7 + sin((r+c)*0.55)*0.45
  if distance > baseRadius + coastNoise: WATER; continue
  latitude  = |(r - center) / center|
  moisture  = (sin(r*0.7 + c*0.35 + coastPhaseA) + cos(c*0.6 - r*0.25 + coastPhaseB)) * 0.5
  roughness = sin(r*0.32) + cos(c*0.28) + sin((r+c)*0.18)
  terrain = PLAINS
  if latitude > 0.74:                         terrain = roughness > 0.8 ? MOUNTAIN : SNOW_FOREST
  else if latitude < 0.18 && moisture < 0.35:  DESERT
  else if latitude < 0.34 && moisture < -0.2:  DESERT
  else if moisture > 0.55:                     FOREST
  else if roughness > 1.35:                    SNOW_FOREST
```
So the far north/south are snowy, a desert belt sits near the equator, and forests follow the moisture field.

### 3c. Mountain ranges
`rangeCount = randomInRange(2, 3)` (inclusive). Each `carveMountainRange`:
```ts
row = randomInRange(3, G-4)
col = rng() < 0.5 ? 2 : G-3
dirRow = rng() < 0.5 ? -1 : 1
dirCol = col < floor(G/2) ? 1 : -1
length = randomInRange(floor(G*0.55), floor(G*0.9))
repeat length times:
  paintMountainCell(row, col)
  if rng() < 0.45: paintMountainCell(row + dirRow, col)
  if rng() < 0.35: paintMountainCell(row, col + dirCol)
  row += dirRow; col += dirCol
  if rng() < 0.4: dirRow += (rng() < 0.5 ? -1 : 1);  dirRow = clamp(dirRow, -1, 1)
  if rng() < 0.25: dirCol *= -1
  row = clamp(row, 2, G-3); col = clamp(col, 2, G-3)

paintMountainCell(r, c):
  skip if out of grid or WATER
  set MOUNTAIN
  for each 4-neighbour that is not WATER/MOUNTAIN: if rng() < 0.55 → SNOW_FOREST
```

### 3d. Biome clusters
6 attempts: pick `row, col = randomInRange(3, G-4)`. Skip if WATER or MOUNTAIN. Otherwise call `enrichBiomeCluster(terrain, row, col, radius = randomInRange(2,4))` where `terrain` is DESERT if the centre is desert, else FOREST:
```ts
for every tile within the (2·radius+1) box, inside rows/cols 1..G-2, not WATER/MOUNTAIN:
  dist = |Δr| + |Δc|;  if dist > radius skip
  if rng() < 0.72 - dist*0.12 → set terrain
```

### 3e. Coastline smoothing (single pass, in place, row-major)
For each tile in rows/cols 1..G−2, count WATER among its 4 neighbours:
- land with ≥ 3 water neighbours → WATER
- water with ≤ 1 water neighbour → PLAINS

---

## 4. Resource deposits (skirmish / sandbox)

```ts
scale = max(0.5, G² / 3600);   s(base) = max(1, round(base * scale))
```
For every skirmish grid (≤ 26×26) `scale = 0.5`. Ores are placed first, then mana, each slot in this order:

| Deposit | Base | Count at scale 0.5 | Allowed terrain |
|---|---|---|---|
| Copper | 14 | 7 | Snow-Forest, Mountain, Forest |
| Iron | 11 | 6 | Snow-Forest, Mountain |
| Fire Glass | 1 | 1 | Desert, Snow-Forest |
| Silver | 4 | 2 | Snow-Forest, Mountain |
| Gold deposit | 2 | 1 | Desert, Snow-Forest |
| Water Mana | 2 | 1 | Forest, Plains |
| Fire Mana | 2 | 1 | Desert, Snow-Forest |
| Lightning Mana | 2 | 1 | Snow-Forest, Plains |
| Earth Mana | 2 | 1 | Mountain, Snow-Forest |
| Air Mana | 2 | 1 | Snow-Forest, Plains |
| Shadow Mana | 2 | 1 | Forest, Snow-Forest |

`placeDeposits(type, count, terrains)`: collect every tile in rows/cols 1..G−2 that has no deposit yet, has an allowed terrain, and has **no WATER among its 8 neighbours**; shuffle (Fisher-Yates with `rng`); assign the first `count`. If there are too few candidates, fewer are placed.

---

## 5. Nations, cities, units (skirmish / sandbox)

### 5a. Names
`names.json` holds five nations; they are shuffled with the RNG and assigned in order (nation index 0 = the human):

| Nation | Colour | City 1 | City 2 |
|---|---|---|---|
| Valdris | `#e63946` | Valdrak | Stoneholt |
| Mirefall | `#457b9d` | Mireby | Ashbridge |
| Thornwall | `#2a9d8f` | Grimholt | Irongate |
| Dustmere | `#e9c46a` | Sandkeep | Ashford |
| Ironcroft | `#f4a261` | Coalfort | Slagmere |

### 5b. Coastal spawn anchors (`pickCoastalSpawnPairs`, called once for all nations)
```ts
COAST_DEPTH = 4
candidates = tiles r,c in 1..G-2 that are passable (not WATER/MOUNTAIN) and
             (r ≤ 4 || r ≥ G-5 || c ≤ 4 || c ≥ G-5)
shuffle(candidates)
anchors = [candidates[0]]
while anchors.length < count:
  for each candidate not already an anchor:
    minDist = min Chebyshev distance to any anchor
    score   = -|minDist - 10| - (minDist < 8 ? 100 : 0)
  take the highest score (first one wins ties)
for each anchor: scout tile = findAdjacentPassable(anchor) ?? anchor
```
`findAdjacentPassable` tries the 4 orthogonal offsets `[E, S, W, N]` starting from index `floor(rng()*4)` and wrapping; it skips tiles outside rows/cols 1..G−2, impassable tiles, and tiles that are another anchor.

Spawns aim for rivals about **10 tiles apart** (Chebyshev), never closer than 8 if avoidable.

### 5c. Per nation (in index order)
1. `nationId = "nation-{i+1}"`, `playerId = "player-{i+1}"`; `isLocal = (i === 0)`; `new Nation(id, name, colour, isAI = !isLocal)`; `setControlledBy(playerId)`.
2. **Starting treasury:** sandbox human: 9999 Gold/Food/Raw Material/Research. Everyone else: **50 Gold, 30 Food, 20 Raw Material, 0 Research**.
3. **Starting tech:** one random root tech, `ROOT_TECHS[floor(rng()*5)]` from `['writing','hunting','masonry','scientific_method','mathematics']` (granted instantly).
4. Add nation and `Player(playerId, isLocal ? 'Player' : nationName, nationId, isLocal)`.
5. **Units:** Infantry `unit-inf-{n}` on the anchor, Scout `unit-scout-{n}` on the scout tile (n = i+1). Each gets the next serial (101, …).
6. **Cities** (`findCityPositions(anchor)`):
   ```ts
   candidates = tiles within the ±7 box around the anchor, inside rows/cols 1..G-2,
                Chebyshev distance 2..7 from anchor, passable, not already taken
   shuffle(candidates)
   best pair (i<j) with 5 ≤ Chebyshev(a,b) ≤ 7, minimising
     |dist(a,b) - 6| + 0.25·|dist(anchor,a) - 4| + 0.25·|dist(anchor,b) - 4|
   fallback: the first two candidates
   ```
   Cities are `city-{n}-1` and `city-{n}-2` named from the nation's list (fallback `"City {n}-{j}"`). Both starting units get city 1 as their home city. "Taken" positions accumulate as nations are seeded: the unit tiles and cities of this nation and every earlier one (later nations' anchors are not yet in the list).
7. **Starting territory** (`assignStartingTerritory`, no overwrite): every tile with `dist(tile, cityA) + dist(tile, cityB) ≤ dist(cityA, cityB) + 2` (Euclidean — an ellipse with the two cities as foci) that isn't already claimed becomes the nation's. Passable tiles in the ellipse also get a free **Outpost**; water/mountain tiles are claimed without one. (With cities ~6 apart this is roughly 30 tiles.)

### 5d. RNG draw order (skirmish)
coast phases → mountain ranges → biome clusters → deposit shuffles (11 slots in table order) → nation-name shuffle → spawn-candidate shuffle → one draw per anchor for scout direction → for each nation: root-tech pick, then the city-candidate shuffle.

---

## 6. Scenario generation

1. Grid = scenario map size; apply the map file (`W` water, `.` plains, `H` snow-forest, `F` forest, `M` mountain, `D` desert; unknown characters leave PLAINS). Rows are the file's lines after `trim()` with trailing whitespace stripped.
2. Apply deposits: `{row, col, type}` where `type` is a `TerritoryResourceType` key.
3. For each scenario nation (index i, n = i+1):
   - `nation-{n}` / `player-{n}`; local if `isPlayer`; colour from the scenario.
   - Treasury = the scenario's `resources` (amounts ≤ 0 skipped). Techs = `startingTechs`.
   - Units first: id `unit-{type lowercased}-{n}-{j+1}`, with serials. **Scenario units have no home city.**
   - Cities: `city-{n}-{j+1}`; any `buildings` listed are added at level 1.
   - Starting territory ellipse as above but with **overwrite** (later nations can take earlier nations' tiles).
4. Apply `diplomacy` entries symmetrically (`WAR` or `ALLY`); all other pairs stay NEUTRAL.

If the scenario id is unknown, `getScenarioById` falls back to the first scenario; if there are none, the skirmish generator runs.

Scenario content (descriptions, nations, coordinates, and the full map files) is reproduced in [Scenario Data](Scenario-Data.md).

---

## 7. After BootScene

`GameScene.create()` builds the `RegionSystem` from the finished grid (regions are therefore **not** saved — they are recomputed from terrain on every load) and starts the clock at tick 0 (or the saved tick).

→ Continue to **[Map, Terrain & Movement](Map-Terrain-Movement.md)**
