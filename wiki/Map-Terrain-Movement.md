# Map, Terrain & Movement

[← Back to Home](README.md)

## 1. The grid

- The world is a **square-tile grid** addressed by `{row, col}`. Tile size is **40px**.
- Grid dimensions are set per game (roughly **22×22 to 30×30** for skirmishes, scaled to nation count), surrounded by an impassable **water border**.
- **Adjacency is 4-way (orthogonal)** for movement, pathfinding, and vision — **there is no diagonal movement.** (Only [morale radii](Morale.md#7-radii-reference) use 8-way Chebyshev distance.)
- Two distance metrics are used:
  - **Manhattan** (`|Δrow| + |Δcol|`) — movement, pathfinding, vision, ranged targeting.
  - **Chebyshev** (`max(|Δrow|, |Δcol|)`) — morale witness/rally radii.

---

## 2. Terrain

Six terrain types, each with a movement cost and combat effects:

| Terrain | Move cost | Notes |
|---|---|---|
| **Plains** | 50 | Open ground. Yields **Food**. |
| **Snow-Forest** | 75 | Yields Raw Material. Defensive cover for dug-in troops. |
| **Desert** | 75 | Yields **Gold**. |
| **Forest** | 100 | Yields Raw Material. Heavy cover; cripples cavalry. |
| **Mountain** | ∞ (impassable) | Passable only with **Earth Mana** (then costs 75). |
| **Water** | ∞ (impassable) | Passable only with **Water Mana** (then costs 75). |

Move cost is fed into the [step-cost formula](#3-movement) — lower is faster.

### Terrain combat modifiers
Terrain doesn't grant a flat "defense %" — its effects depend on **unit type and stance**.

**Offense** (multiplies the attacker's damage):
- **Forest:** Cavalry **×0.82**; ranged **×0.94**; melee **×1.08**.
- **Snow-Forest:** ranged **×1.12**; HOLD **×1.05**.
- **Desert:** Cavalry **×1.06**; Heavy Infantry **×0.95** (plate broils).
- **Plains:** Cavalry on ADVANCE **×1.12** (signature charge).

**Mitigation** (added to the defender's mitigation, before the 0.65 cap):
- **Forest:** **+0.06** for everyone *except cavalry* ("can't hide a horse").
- **Snow-Forest:** **+0.08** when defending on HOLD or WITHDRAW (dug in).
- **Plains:** **−0.04** for cavalry on ADVANCE (momentum cost).

> Terrain does **not** affect vision range. Concealment comes from **Shadow Mana**, not terrain.

### Terrain economic yields
Owned tiles slowly harvest their terrain (see [Production](Production-and-Buildings.md#resource-yields)): plains → Food (every 50 ticks), forest/snow-forest → Raw Material (every 50), desert → Gold (every 80).

---

## 3. Movement

Movement is **tick-based**, not point-based. Each step onto a new tile takes a number of ticks:

```
effectiveSpeed = (forest && unit is heavy/cav/siege) ? 1 : unitSpeed
stepCost       = max(1, ceil(terrainBaseCost / (effectiveSpeed + lightningBonus)))
```

- A speed-2 unit on plains (cost 50): `ceil(50/2) = 25` ticks per tile. A speed-5 unit: 10 ticks.
- **Forest penalty:** Heavy Infantry, Cavalry, Catapult, and Trebuchet always move through **forest** at effective speed 1 (so 100 ticks/tile) regardless of their speed stat.
- **Lightning Mana** adds +1 effective speed per mine (max +3).
- **The Wheel** tech multiplies effective speed by **1.2** (+20% movement) for all your units — stacks with Lightning Mana.
- **Earth/Water Mana** make mountain/water passable at cost 75.

How a move plays out each tick:
1. Units that are dead or **engaged in battle** don't move (combat freezes movement).
2. On entering a new step, the tile's terrain sets the step's tick cost.
3. The cost counts down; at 0 the unit commits the step.
4. **Friendly stacking is blocked** — if a friendly unit already holds the target tile, the mover waits and retries.
5. While moving, if the unit enters an **enemy unit** (→ battle), **enemy city** (→ siege), or **enemy territory at war** (→ territory battle), combat starts and movement halts. **Undercover spies are the exception** — they pass through enemy units, cities, and territory without triggering any of this (and enemy units likewise pass through them), so infiltrating never declares war (see [Units → Spies](Units.md#special-behaviors)).

**Stance does not change movement speed** — ADVANCE/HOLD/WITHDRAW and the battle pace factor affect combat only. A unit in battle simply stops moving.

---

## 4. Pathfinding

- **A\*** over the 4-connected grid.
- **Edge cost** = the same `stepCost` as movement (so a path's predicted cost equals the ticks actually spent).
- **Heuristic** = Manhattan distance.
- **Enemy-territory penalty:** entering another nation's tile adds **+12** to the edge cost, so paths route around enemy land when a reasonable detour exists.
- Returns the path **excluding the start, including the destination**, or nothing if the goal is impassable or unreachable.

When you left-click a destination (or drag a path), this is what plots the route.

---

## 5. Vision & fog of war

Each nation has three visibility tiers (all Manhattan distance):

- **Visible** — fully revealed (units and terrain shown).
- **Near-visible** — a 2-tile ring beyond each vision source, showing **unidentified contacts** (you see *something* is there — an orange **"Heavily Armored Contact"** / **"Lightly Armored Contact"** label telling you only the armor class — but not the exact unit).
- **Discovered** — every tile ever seen (persisted); shown dark when not currently visible.

What reveals the map:
1. **Your territory + a 2-tile border** around each owned tile.
2. **Unit vision circles** — radius = the unit's `vision` stat (+ Air Mana). Tiles within the radius are visible; the next 2 tiles are near-visible.
3. **Watchtowers** (city or territory buildings) — a vision circle of radius **3**.

Mana effects:
- **Air Mana:** +1 vision radius per mine (max +3) for all your units.
- **Shadow Mana** (on the *enemy's* nation): reduces each observer's effective vision by 1 against that unit — concealment. Air Mana on the viewer can cancel it.

Fog is **disabled entirely** in Sandbox and Tutorial. The minimap only ever shows **your own** units, never enemies.

---

## 6. The Tick Engine

The simulation clock. **`TICK_RATE = 10` ticks/sec** (`TICK_INTERVAL_MS = 100ms`). Each tick runs systems in this fixed order:

1. `currentTick++`
2. **Movement** — advance one step; trigger battles/sieges/territory fights on contact.
3. **Unit battles**
4. Promote stranded enemies on city tiles to **sieges**.
5. **City sieges**
6. **Territory battles**
7. **Ranged fire**
8. **Production** (resource income, build progress, unit spawns, upkeep)
9. **Territory construction** (outposts/mines/walls; outpost also claims adjacent water/mountain)
10. Sweep dead units
11. Check for defeated nations
12. **Periodic pulses** (`tick % interval == 0`):
    - Every **10 ticks** (1s): heal units resting in friendly cities (**+5%/sec of max HP**), recover morale, water-mana healing.
    - City HP regen **+5/50 ticks**, territory HP regen **+5/50 ticks**.
    - Region domination bonuses **every 50 ticks**.
13. Morale band-change polling (UI toasts).
14. Emit `game:tick`.

All systems pull from one **deterministic seeded RNG**, making the whole simulation reproducible (lockstep-ready).

---

## 7. The `.terrain` map file format

Scenario maps are plain-text grids — one line per row, one character per column:

| Char | Terrain |
|---|---|
| `W` | Water (impassable) |
| `.` | Plains |
| `H` | Snow-Forest ("hills/snow") |
| `F` | Forest |
| `M` | Mountain (impassable) |
| `D` | Desert |

Unknown characters leave a tile at its default. The grid is sized by config and the file is overlaid onto it. Resource deposits are placed separately (by scenario definition or procedurally), not in the `.terrain` file.

→ Continue to **[Economy & Resources](Economy-and-Resources.md)**
