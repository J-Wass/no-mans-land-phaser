# Cities, Territory & Regions

[← Back to Home](README.md)

## 1. Cities

Cities produce units and buildings, generate income, heal resting units, and are the main win/lose objective.

| Property | Value |
|---|---|
| Base max HP | 200 (+60 per Walls level) |
| Base garrison melee | 12 (+3 per Walls level) |
| Starting buildings | City Hall (level 1) only (scenarios can pre-build more at level 1) |
| Queue | 1 active order + up to 5 queued |
| HP regen | +5 every 50 ticks while not besieged |
| Unit healing | own units on the city tile, not in combat: +`ceil(5% maxHP)` every 10 ticks |
| Morale recovery | +4 per 10 ticks (cap 80) for own units on the tile |
| Capture | HP → 0 in a siege; the conqueror keeps `ceil(35% maxHP)`; every non-City-Hall building drops a level; queue wiped |

- A city's tile is also a `Territory` with `cityId` set and owned by the city's nation. Cities can't be built — every city is placed at game start. Nations lose cities only by conquest.
- City HP is clamped against the walls-adjusted max; adding/upgrading Walls sets HP to the new max.
- **Razing** and **−1 LVL** are described in [Production → Downgrading and razing](Production-and-Buildings.md#downgrading-and-razing).
- Watchtower gives the city a radius-3 vision circle.

```ts
interface CityData {
  id; name; ownerId; position;
  currentOrder: ProductionOrder | null; productionQueue: ProductionOrder[];
  buildings: CityBuildingType[]; buildingLevels: Partial<Record<CityBuildingType, number>>;
  currentHealth; maxHealth /* base 200 */; meleeDamage /* base 12 */;
  razing: boolean; razeCountdown: number;
  pendingRemoval: { building; ticksRemaining } | null;
}
```

---

## 2. Territory

Every tile is a territory; owned tiles are the nation's land.

| Property | Value |
|---|---|
| Base HP | 30 (+50 per Walls level) |
| Counter-attack | 10 unwalled; 14 + 5 × (level − 1) walled |
| Regen | +5 every 50 ticks for **owned** tiles not under attack; +10 when an attacker withdraws |
| Claimed by | starting ellipse, building an Outpost, conquering it, or adjacency (water/mountain next to a claim) |

- **Claiming land:** build an **Outpost** on an unclaimed tile orthogonally adjacent to your land (80 ticks, 30 G 80 M 40 F). The Territory Menu offers it on any non-water tile, including mountains. When the outpost completes, each **orthogonally adjacent unowned water or mountain** tile is claimed too (without buildings).
- **Starting territory:** an ellipse around a nation's two starting cities; passable tiles get a free Outpost ([World Generation](World-Generation.md#5c-per-nation-in-index-order)).
- **Conquering** an enemy tile (territory battle) gives it to you with a free Outpost (old buildings gone) and claims adjacent unowned water/mountain.
- Owned tiles extend your vision by 2 (Manhattan) and harvest their terrain ([Economy](Economy-and-Resources.md#income-all-on-tick--interval--0)).
- Entering a tile owned by a nation you are at war with starts a [territory battle](Combat.md#3-territory-battle); tiles of neutral or allied nations can be walked through freely (the UI asks for confirmation first for neutrals).

### Territory walls
- HP: 30 + 50 × level (lvl 5 → 280).
- Counter-attack per round vs the unit on the tile: 14 / 19 / 24 / 29 / 34 (×0.85 vs ranged attackers).
- 0.20 damage reduction vs attackers not on ADVANCE.
- `getWallsRange()` (1 / 2 at lvl ≥ 2 / 3 at lvl ≥ 4) is defined but unused — walls don't shoot at range. The Territory Menu perk text mentions range for flavour only.

### Mines
Mines activate the tile's deposit for the whole nation (see [Economy → Tile deposits](Economy-and-Resources.md#2-tile-deposits)). Each needs the Outpost, the matching deposit on that tile, and its tech:

| Mine | Deposit | Tech | Effect |
|---|---|---|---|
| Copper Mine | Copper | `masonry` | weapon tier +2 |
| Iron Mine | Iron | `iron_working` | weapon tier +4 |
| Fire Glass Mine | Fire Glass | `steel_working` | weapon tier +6 |
| Silver Mine | Silver | `masonry` | +2 Gold / 10 ticks |
| Gold Mine | Gold | `trade` | +4 Gold / 10 ticks |
| Mana Mine | any of the 6 mana types | `mana_studies` | that mana's bonus |

Only the best weapon tier applies; per-type mine counts are capped at 3 for scaling bonuses.

```ts
interface TerritoryData {
  coordinates; terrainType; controlledBy: string | null; cityId: string | null;
  resourceDeposit: TerritoryResourceType | null;
  buildings: TerritoryBuildingType[]; buildingLevels: Partial<Record<TerritoryBuildingType, number>>;
  currentConstruction: { building; nationId; label; ticksTotal; ticksRemaining; isUpgrade? } | null;
  currentHealth: number;
}
```

---

## 3. Regions

A **region** is a named, contiguous cluster of one terrain type. Regions are generated from the grid when GameScene starts (not saved).

### Generation (`RegionSystem.generateFromGrid`)
- Scan tiles row-major. For each unvisited tile of PLAINS, FOREST, SNOW_FOREST, DESERT or MOUNTAIN (water is never a region), BFS flood-fill (4-way, queue order N, S, W, E) all connected tiles of the same terrain.
- Clusters with **fewer than 8 tiles** are not regions.
- Ids `region-1`, `region-2`, … in discovery order.
- **Name** = "`{Adjective} {Noun}`":
  ```ts
  first = the cluster's first tile (its top-left-most, the scan start)
  h = (first.row * 31 + first.col) * 17
  h = ((h >>> 0) * 2654435761) >>> 0      // Knuth multiplicative hash (note: JS number multiply, then >>> 0)
  for offset in 0 .. adj.length * nouns.length - 1:
     adj  = ADJECTIVES[(h + offset) % 27]
     noun = NOUNS[terrain][floor((h + offset) / 27) % nouns.length]
     if "adj noun" unused: use it
  fallback: "{ADJECTIVES[h % 27]} {nouns[h % len]} {i}" with i = 2, 3, …
  ```
  Names are unique per map.

**Adjectives (27):** Ancient, Ashen, Bitter, Blazing, Crimson, Darkened, Dreary, Emerald, Faded, Frozen, Gilded, Grim, Hallowed, Iron, Jade, Lonely, Misty, Pale, Scarlet, Shadow, Silver, Sunken, Twilight, Verdant, Weeping, Whispering, Withered.

**Nouns by terrain:**
| Terrain | Nouns |
|---|---|
| Plains | Plains, Fields, Lowlands, Steppes, Meadows, Flats, Expanse |
| Forest | Wood, Forest, Thicket, Grove, Timberland, Wilds, Canopy |
| Snow-Forest | Snowwood, Frostwood, Winter Glen, Snowpines, Frozen Wilds, Icewood, Coldwood |
| Desert | Desert, Wastes, Sands, Barrens, Flats, Dunes, Expanse |
| Mountain | Mountains, Peaks, Range, Crags, Heights, Ridges, Spires |
| Water (unused) | Sea, Depths, Waters, Shallows |

### Control & domination
- A nation **dominates** a region when it owns at least `ceil(tiles × 0.66)` of its tiles.
- Every **50 ticks**, each dominating nation gains the region's resource: Plains → Food, Forest/Snow-Forest → Raw Material, Desert → Gold, Mountain → nothing. Amount = `max(1, floor(tiles / 3))`. Emits `region:dominated` (the HUD toasts "You now dominate the {region}! Bonus resources granted." the first time per region).
- `getNearestRegion(pos, maxDistance = 12)` finds the closest region by Manhattan distance to any of its tiles (used for "near {region}" in the territory panel).
- The territory info panel shows "`(r,c) {Terrain} in {Region}`" (or "near {Region}", or just coordinates), and "`⬡ {Region} ({pct}% controlled)`" coloured gold if you dominate it, red if someone else does, blue-grey otherwise.
- The AI's expansion scoring favours tiles in regions it partially controls ([AI](AI.md#3-goals)).

→ Continue to **[Diplomacy](Diplomacy.md)**
