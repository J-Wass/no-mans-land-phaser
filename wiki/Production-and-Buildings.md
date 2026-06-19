# Production & Buildings

[← Back to Home](README.md)

Cities are your production engines. Each city runs **one build at a time** plus a **queue of up to 5**. You build three kinds of things: **units**, **city buildings**, and (rarely) raw resources. Territory tiles have their own separate construction for outposts, mines, and walls.

> Costs are paid **upfront** when production starts. Build time is measured in **ticks** (10/sec) and counts down to completion, after which the next queued item starts automatically.

---

## 1. Producing units

Trained from a city's **Barracks**. See the full table in **[Units → Cost & requirements](Units.md#4-cost-build-time--requirements)**. Key rules:

- Each unit needs a **Barracks at the listed level** (build/upgrade it on the Buildings tab).
- Some need a **tech** and/or a controlled **deposit** (any one of the listed types).
- **Higher Barracks levels speed up training by −5% per level above 1** (so a level-5 Barracks builds units ~20% faster than level 1).
- A finished unit spawns on or beside the city (first free, passable neighbor tile) and remembers its **home city**.

In the City Menu's **UNITS tab**, each row shows the cost, build time, and a **BUILD / QUEUE / FULL / LOCKED** button (LOCKED tells you the missing requirement).

---

## 2. City buildings

Built/upgraded on the City Menu's **BUILDINGS tab**. Caps: most cap at **level 5**; Watchtower at 1. **City Hall** is built-in, permanent, and never removed.

| Building | Build cost | Build ticks | Tech | Max lvl | Upgrade cost | Effect |
|---|---|---|---|---|---|---|
| **City Hall** | — | (built-in) | — | 1 | — | Administration; can't be razed |
| **Barracks** | 15 G, 30 M | 400 | `masonry` | 5 | 20 G, 40 M | Trains units; higher levels unlock advanced units & speed training −5%/lvl |
| **Walls** | 10 G, 25 M | 450 | `masonry` | 5 | 15 G, 35 M | +60 HP & +3 city melee per level |
| **Farms** | 10 G, 20 M | 300 | `masonry` | 5 | 12 G, 24 M | +2 Food/sec per level |
| **Workshop** | 10 G, 20 M | 300 | `masonry` | 5 | 12 G, 24 M | +1 Raw Material/sec per level |
| **Watchtower** | 5 G, 15 M | 300 | `masonry` | 1 | — | +vision (radius-3 circle) |
| **School** | 15 G, 25 M, 10 F | 400 | `education` | 5 | 18 G, 30 M, 12 F | +1 Research/sec per level **and +10% research speed per level** (cap +50%) |
| **Market** | 20 G, 35 M | 400 | `trade` | 5 | 24 G, 42 M | +1 Gold/sec per level |

(G = Gold, M = Raw Material, F = Food.) Re-building an existing building is the **upgrade** path (level +1, up to max). Adding/upgrading Walls refills the city to its new max HP.

### Removing & razing buildings
- **−1 LVL** button: removes one level of a chosen building after a 5-second countdown.
- **RAZE City** toggle: destroys a random non-City-Hall building level every **50 ticks (5s)** until toggled off.
- On **conquest**, every non-City-Hall building drops a level automatically (level-1 buildings destroyed).

---

## 3. Territory buildings

Built on map tiles via the Territory Menu (double-click a tile). **Outpost is the gateway** — it claims an unclaimed tile and is the prerequisite for every other territory building. Mines also require the matching deposit on the tile.

| Building | Cost | Ticks | Needs building | Tech | Deposit | Max lvl | Effect |
|---|---|---|---|---|---|---|---|
| **Outpost** | 15 G, 30 M, 10 F | 80 | — | — | — | 1 | Claims the tile; prerequisite for all |
| **Walls** | 5 G, 20 M | 90 | Outpost | `masonry` | — | 5 | +50 HP, +attack & range per level |
| **Farms** | 20 M | 60 | Outpost | `masonry` | — | 1 | +Food |
| **Workshop** | 20 M | 70 | Outpost | `masonry` | — | 1 | +Raw Material |
| **Watchtower** | 15 M | 70 | Outpost | `masonry` | — | 1 | Reveals fog in a 2-tile radius (no units needed) |
| **Copper Mine** | 25 M | 80 | Outpost | `masonry` | Copper | 1 | +2 melee & ranged damage nation-wide |
| **Iron Mine** | 30 M | 90 | Outpost | `iron_working` | Iron | 1 | +4 damage nation-wide |
| **Fire Glass Mine** | 40 M | 100 | Outpost | `steel_working` | Fire Glass | 1 | +6 damage nation-wide |
| **Mana Mine** | 35 M, 10 F | 100 | Outpost | `mana_studies` | any mana | 1 | Activates the tile's mana deposit (bonus depends on type) |

Building a mine is what makes a [deposit "active"](Economy-and-Resources.md#2-tile-deposits). The single Mana Mine building works for any of the six mana types.

→ Detail on city HP, walls, and territory walls: **[Cities, Territory & Regions](Cities-Territory-Regions.md)**.

---

## 4. Resource yields recap

Buildings and tiles generate income on these pulses (see [Economy → yields](Economy-and-Resources.md#resource-yields)):

| Source | Yield |
|---|---|
| City base | +2 Food/s, +1 Material/s, +1 Gold/s, +1 Research/s (research after tick 300) |
| Farms (city) | +2 Food/s × level |
| Workshop (city) | +1 Material/s × level |
| Market (city) | +1 Gold/s × level |
| School (city) | +1 Research/s × level (also +10% research speed/level, cap +50%) |
| Terrain (owned tiles) | plains→Food, forest→Material (every 50t), desert→Gold (every 80t) |
| Region domination | region resource every 50t, scaled by size |

→ Continue to **[Research / Tech Tree](Research.md)**
