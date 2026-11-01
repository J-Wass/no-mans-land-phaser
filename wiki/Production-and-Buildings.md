# Production & Buildings

[← Back to Home](README.md)

Cities produce **units** and **city buildings** through one shared queue. Map tiles have a separate **territory construction** slot for outposts, walls, farms, workshops, watchtowers and mines.

---

## 1. The city production queue

- Each city has **one active order** (`currentOrder`) plus a **queue of up to 5** more (`CITY_QUEUE_MAX = 5`). Orders are units (`kind: 'unit'`), buildings (`kind: 'building'`), or resource projects (`kind: 'resource'`, supported by the engine but nothing in the game creates them).
- Placing an order is refused when the queue already holds 5 items, so a city holds at most 6 orders (1 active + 5 queued).
- Accepted orders pay their full cost immediately. If the city is idle the order becomes active, otherwise it is appended.
- Each tick, the active order's `ticksRemaining` counts down by 1. When it reaches 0:
  - **Unit:** if a [spawn tile](Units.md#4-cost-build-time--requirements) is free, the unit is created, `city:unit-spawned` fires and the next queued order becomes active; otherwise the order waits (stays at 0) and retries every tick.
  - **Building:** the building is added/upgraded (`city:building-built`) and the queue advances.
  - **Resource:** the amount is added to the treasury (`city:production-complete`).
- **Cancel** (City Menu): the CANCEL button cancels the active order and promotes the next queued one; each queued item has a ✕ to remove it. No refunds.
- Capturing a city wipes its queue and active order.
- Every new order's time comes from its catalog entry; units are additionally sped up by the Barracks level. In sandbox all order times are capped at 10 ticks.

### Producing units
See [Units → Cost & requirements](Units.md#4-cost-build-time--requirements). Requirements checked when ordering: queue not full; all `requiresTechs` researched (skipped in sandbox); Barracks at the required level (**always** enforced); required deposits active (skipped in sandbox); resources (skipped in sandbox).

---

## 2. City buildings

Built and upgraded from the City Menu's **BUILDINGS** tab via the city queue. Every city starts with only **City Hall**.

| Building | Enum | Map icon | Build cost | Build ticks | Tech | Max lvl | Upgrade cost (each level) | Effect |
|---|---|---|---|---|---|---|---|---|
| **City Hall** | `CITY_HALL` | 🏛 | — | built-in | — | 1 | — | Permanent; can't be removed or downgraded. |
| **Barracks** | `BARRACKS` | ⚔ | 40 G, 90 M, 40 F | 400 | `masonry` | 5 | 40 G, 90 M, 40 F | Required to train units; level gates advanced units; −5% unit build time per level above 1. |
| **Walls** | `WALLS` | 🧱 | 30 G, 90 M | 450 | `masonry` | 5 | 35 G, 90 M | +60 max HP and +3 garrison melee per level; up to −0.30 siege damage (0.06/level). Building or upgrading refills the city to full HP; the order pauses while the city is under siege or bombardment (and 120 ticks after). |
| **Farms** | `FARMS` | 🌾 | 25 G, 80 M | 300 | `masonry` | 5 | 25 G, 70 M | +L Food every 5 ticks (+2L/s). |
| **Workshop** | `WORKSHOP` | ⚒ | 25 G, 80 M | 300 | `masonry` | 5 | 25 G, 70 M | +L Raw Material every 10 ticks (+L/s). |
| **Watchtower** | `WATCHTOWER` | 🗼 | 20 G, 70 M | 300 | `masonry` | 1 | — | Vision circle of radius 3 around the city. |
| **School** | `SCHOOL` | 📚 | 40 G, 90 M, 50 F | 400 | `education` | 5 | 35 G, 80 M, 40 F | +L Research every 10 ticks after tick 300, **and** +10% research speed per level across the nation (cap +50%). |
| **Market** | `MARKET` | 🏪 | 50 G, 110 M | 400 | `trade` | 5 | 45 G, 100 M | +L Gold every 10 ticks (+L/s). |

(G = Gold, M = Raw Material, F = Food. L = building level.)

- Ordering a building that already exists is the **upgrade** (cost = `upgradeCost`, time = the same build ticks, order label "`{Label} Lvl {n}`"). Ordering one at max level is refused.
- Orders already queued count toward the level: a second Farms order while the first is still queued is charged the **upgrade** cost, labelled "Farms Lvl 2", and orders that would push past max level are refused. Each completion adds one level.
- Upgrades take the same time as the initial build. The City Menu shows unit training times after the Barracks speed-up.

### Downgrading and razing
- **−1 LVL** button (per built building except City Hall): schedules removal of one level of that building after **50 ticks** (5 s); the button shows a countdown. Only one pending removal per city; scheduling another replaces it. Level 1 → the building is removed.
- **RAZE / STOP** toggle at the top of the BUILDINGS tab: while on, every **50 ticks** a random non-City-Hall building (uniform pick from the city's list, using the game RNG) loses one level. Razing stops automatically when nothing is left. A pending −1 LVL removal takes priority over the raze timer.
- **Conquest:** every non-City-Hall building loses one level.
- Removing Walls levels lowers max HP (current HP is clamped).
- Each level change emits `city:buildings-changed`.

---

## 3. Territory buildings

Built from the Territory Menu (double-click a tile). Each tile has **one construction slot**: while something is being built or upgraded there, nothing else can start (button shows BUSY). Construction ticks down by 1 per tick regardless of who owns the tile.

| Building | Enum | Map icon | Cost | Ticks | Requires building | Tech | Deposit | Max lvl | Upgrade cost | Effect |
|---|---|---|---|---|---|---|---|---|---|---|
| **Outpost** | `OUTPOST` | ⚑ | 30 G, 80 M, 40 F | 80 | — | — | — | 1 | — | Claims the tile (and adjacent unowned water/mountain). Prerequisite for all others. |
| **Walls** | `WALLS` | ⊞ | 20 G, 70 M | 90 | Outpost | `masonry` | — | 5 | 25 G, 70 M | +50 tile HP per level; counter-attack 14/19/24/29/34; 0.20 damage reduction vs non-ADVANCE attackers. |
| **Farms** | `FARMS` | ⌘ | 70 M | 60 | Outpost | `masonry` | — | 1 | — | +1 Food / 5 ticks (+2/s). |
| **Workshop** | `WORKSHOP` | ✦ | 70 M | 70 | Outpost | `masonry` | — | 1 | — | +1 Raw Material / 10 ticks (+1/s). |
| **Watchtower** | `WATCHTOWER` | ◉ | 60 M | 70 | Outpost | `masonry` | — | 1 | — | Vision circle of radius 3 around the tile. |
| **Copper Mine** | `COPPER_MINE` | ⊛ | 80 M | 80 | Outpost | `masonry` | Copper | 1 | — | Activates Copper (weapon tier +2). |
| **Iron Mine** | `IRON_MINE` | ⊗ | 90 M | 90 | Outpost | `iron_working` | Iron | 1 | — | Activates Iron (+4). |
| **Fire Glass Mine** | `FIRE_GLASS_MINE` | ◈ | 120 M | 100 | Outpost | `steel_working` | Fire Glass | 1 | — | Activates Fire Glass (+6). |
| **Silver Mine** | `SILVER_MINE` | ☽ | 90 M | 90 | Outpost | `masonry` | Silver | 1 | — | +2 Gold / 10 ticks. |
| **Gold Mine** | `GOLD_MINE` | ☀ | 100 M | 95 | Outpost | `trade` | Gold | 1 | — | +4 Gold / 10 ticks. |
| **Mana Mine** | `MANA_MINE` | ◆ | 110 M, 40 F | 100 | Outpost | `mana_studies` | any mana | 1 | — | Activates the tile's mana deposit. |

### Build rules (`BUILD_TERRITORY`)
- Rejected if the tile already has a construction in progress, or the tech is missing (tech skipped in sandbox).
- **Outpost:** tile must be **unclaimed** and **orthogonally adjacent to a tile you own** (adjacency skipped in sandbox); pay cost; start an 80-tick construction tagged with your nation. There is no requirement to have a unit on the tile. The command doesn't check terrain, but the Territory Menu only offers Outposts on non-water tiles (mountains are allowed). On completion: tile owner = your nation, Outpost added, unowned orthogonal water/mountain neighbours claimed, `territory:claimed` + `territory:building-built`.
- **Everything else:** tile must be yours, the building must not exist yet, its prerequisite (Outpost) must exist, and the deposit must match (Mana Mine: any of the six mana types; other mines: exact type). Pay cost; start construction; on completion the building is added at level 1 and the tile's HP is refilled.

### Upgrades (`UPGRADE_TERRITORY`)
Only Walls can be upgraded (max level 5). Requires owning the tile, the building present, below max, affordable `upgradeCost`, and a free construction slot. Takes the building's normal ticks; label "`Walls Lvl {n}`". Completing an upgrade refills tile HP and emits `territory:building-upgraded`.

### Losing territory
- Territory conquest replaces all buildings with a free Outpost.
- A defeated nation's tiles are released (unowned, no buildings, full HP) and its constructions cancelled.
- A construction in progress continues even if the tile changes hands; on completion an Outpost sets the owner to the nation that started it, other buildings are just added.

---

## 4. Resource yields recap

| Source | Yield |
|---|---|
| City base | +2 Food/s, +1 Raw Material/s, +1 Gold/s, +1 Research/s (from tick 300) |
| City Farms / Workshop / Market / School (level L) | +2L Food/s / +L RM/s / +L Gold/s / +L Research/s |
| Territory Farms / Workshop | +2 Food/s / +1 RM/s |
| Owned Plains / Forest+Snow-Forest / Desert tile | +0.2 Food/s / +0.2 RM/s / +0.125 Gold/s |
| Silver / Gold mine | +2 / +4 Gold/s each (max 3 each) |
| Region domination | region resource × `max(1, floor(tiles/3))` every 5 s |

→ Continue to **[Research / Tech Tree](Research.md)**
