# Cities, Territory & Regions

[← Back to Home](README.md)

## 1. Cities

Cities are the heart of your nation — they [produce units and buildings](Production-and-Buildings.md), generate [income](Economy-and-Resources.md#resource-yields), heal resting units, and are the win/lose objective.

- **Base HP: 200. Base melee (garrison counterattack): 12.**
- **Walls** add **+60 HP and +3 melee per level** (max level 5 → +300 HP, +15 melee). The city's effective stats:
  - `maxHP = 200 + wallLevel × 60`
  - `melee = 12 + wallLevel × 3`
- A city heals **+5 HP every 50 ticks** while not under siege.
- Every city starts with only a **City Hall** (level 1); all else is built through the [production queue](Production-and-Buildings.md#2-city-buildings) (cap 5 in queue).
- City Hall is permanent. See [siege & conquest](Combat.md#2-city-siege) for what happens when a city falls (ownership flips, every other building drops a level, conqueror keeps 35% HP).
- **Razing:** the RAZE toggle destroys a random non-City-Hall building level every 50 ticks; the −1 LVL button removes a specific building level after a countdown.

Resting units in a friendly city heal **+5% of max HP per second** and recover morale fastest (**+4/sec**).

---

## 2. Territory

Every non-city tile is a **territory** you can claim and develop.

- **Base territory HP: 30** (the HP an attacker must grind through to [conquer it](Combat.md#3-territory-battle)).
- Claim a tile by building an **Outpost** (needs a friendly unit on an unclaimed, passable tile). The Outpost is the prerequisite for all other [territory buildings](Production-and-Buildings.md#3-territory-buildings) and mines.
- Conquering an enemy territory replaces its buildings with a **free Outpost** and also claims adjacent unowned water/mountain tiles.

### Territory walls
Walls fortify a tile and let it **shoot back** at attackers:

- **HP:** base 30 **+ 50 per wall level** (max level 5 → 280 HP).
- **Attack damage:** **10** unwalled; with walls **14 + (level−1)×5** → 14 / 19 / 24 / 29 at levels 1–4, capping at level 5.
- **Firing range:** level ≥4 → 3 tiles, level ≥2 → 2 tiles, else 1 (adjacent only).

A walled territory is a real speed-bump: it absorbs hits (0.20 mitigation vs non-ADVANCE attackers) and damages besiegers each round.

### Mines
Mines activate a tile's [deposit](Economy-and-Resources.md#2-tile-deposits). Build them on a controlled deposit tile with the right tech:

| Mine | Deposit | Tech | Effect |
|---|---|---|---|
| Copper Mine | Copper | `masonry` | +2 melee & ranged damage nation-wide |
| Iron Mine | Iron | `iron_working` | +4 damage nation-wide |
| Fire Glass Mine | Fire Glass | `steel_working` | +6 damage nation-wide |
| Mana Mine | any mana | `mana_studies` | Activates the mana bonus (Fire/Earth/Water/Lightning/Air/Shadow) |

Only the **best** weapon tier applies to damage; mana mines cap at 3 per type.

---

## 3. Regions

A **region** is a contiguous cluster of one terrain type — a natural geographic feature the game names and tracks for a domination bonus.

- Built by flood-filling adjacent same-terrain tiles (4-way). Water is excluded.
- **Minimum size: 8 tiles** — smaller clusters aren't regions.
- Each region gets a **deterministic "Adjective Noun" name** (same map → same name), shown in the territory info panel (e.g. "(12,8) Plains in **The Frozen North**").
- **Control:** a nation controlling **≥66%** of a region's tiles **dominates** it.
- **Domination bonus:** every **50 ticks** the dominating nation gains the region's resource:
  - Plains → **Food**, Forest/Snow-Forest → **Raw Material**, Desert → **Gold**, Mountain → none.
  - Amount = `max(1, floor(tiles / 3))` — bigger regions pay more.

Controlling a whole region is a meaningful economic objective beyond the per-tile yields, and the [AI weights expansion toward partially-controlled regions](AI.md#claimterritorygoal) to complete them.

→ Continue to **[Diplomacy](Diplomacy.md)**
