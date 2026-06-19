# Economy & Resources

[← Back to Home](README.md)

Your economy has two layers: four **treasury resources** that fund everything, and tile **deposits** (metals and mana) that grant powerful passive bonuses once you build a mine on them.

---

## 1. Treasury resources

Four nation-wide resources, stored in an uncapped treasury:

| Resource | Where it comes from | What it pays for |
|---|---|---|
| 🪙 **Gold** | City base income, Markets, desert tiles, silver/gold-deposit mines, region domination | Unit & building **costs**, unit **upkeep** |
| 🍎 **Food** | City base income, Farms, plains tiles, region domination | Unit costs and **upkeep** |
| 🪨 **Raw Material** | City base income, Workshops, forest tiles, region domination | Building & unit costs |
| 📚 **Research** | City base income (after tick 300), Schools | Funds the [tech tree](Research.md) |

Resource spending is **atomic** — a purchase only goes through if you can afford the whole cost.

### Resource yields

All income arrives on periodic pulses (`tick % interval == 0`). At `TICK_RATE = 10`:

**Per city (every city, base):**
- **Food:** +1 every 5 ticks → **+2/sec**
- **Raw Material:** +1 every 10 ticks → **+1/sec**
- **Gold:** +1 every 10 ticks → **+1/sec**
- **Research:** +1 every 10 ticks → **+1/sec**, but **only after tick 300** (the first 30 seconds produce none)

**Per city building (scales with level 1–5):**
- **Farms:** +2 Food/sec per level
- **Workshop:** +1 Raw Material/sec per level
- **Market:** +1 Gold/sec per level
- **School:** +1 Research/sec per level (after tick 300), **and +10% research speed per level** (cap +50%) — Schools make techs finish faster, which is their main value (research is time-gated, so the extra points matter less than the speed-up)

**Per owned territory:**
- Territory **Farms** building: +1 Food / 5 ticks
- Territory **Workshop** building: +1 Raw Material / 10 ticks
- Terrain harvest (slow): plains +1 Food/50 ticks, forest/snow-forest +1 Raw Material/50 ticks, desert +1 Gold/80 ticks
- Silver / Gold-deposit mines: gold bonus every 10 ticks

**[Region domination](Cities-Territory-Regions.md#regions):** the nation controlling ≥66% of a region gains its resource every 50 ticks, scaled by region size.

The HUD's resource-breakdown panels (click a resource readout) itemize all of this live as "+X/sec" rates.

### Upkeep
Every **30 ticks (3 sec)**, each living unit drains its **upkeep** (Food + Raw Material) from the treasury. A bloated army can bankrupt you — see [unit upkeep values](Units.md#1-full-stats-table).

---

## 2. Tile deposits

Deposits sit on specific tiles. They do **nothing** until you **control the tile and build the matching [mine](Cities-Territory-Regions.md#mines)** on it. Once active, they grant nation-wide bonuses.

### Material deposits → weapon tiers
- **Copper** → Copper Mine → **+2** melee & ranged damage (Bronze weapons)
- **Iron** → Iron Mine → **+4** damage (Iron weapons)
- **Fire Glass** → Fire Glass Mine → **+6** damage (Fire Glass weapons)
- **Silver / Gold deposit** → passive **gold** income (no dedicated mine tier; +2/+4 per mine)

Only the **single best** weapon tier you control applies to damage (they don't stack).

### Mana deposits → magical bonuses
Each mana type is activated by building a **Mana Mine** on its tile. Mine counts are clamped to **3 per type** (more mines of the same mana give no extra benefit beyond 3).

| Mana | Bonus | Scaling |
|---|---|---|
| 🔥 **Fire** | **+10% damage** | per mine, max **+30%** |
| 🌍 **Earth** | **+10% defense/mitigation** | per mine, max **+30%** |
| 💧 **Water** | **+5% heal per pulse** | per mine, max **+15%** |
| ⚡ **Lightning** | **+1 movement speed** | per mine, max **+3** |
| 🌬 **Air** | **+1 vision radius** | per mine, max **+3** |
| 🌑 **Shadow** | **Concealment** (enemies see your units 1 tile less); extra **WITHDRAW chance** | concealment at 1+ mine; +15% withdraw per mine (15/30/45% at 1/2/3 mines) |

These bonuses feed directly into [combat](Combat.md), [movement](Map-Terrain-Movement.md#3-movement), [vision](Map-Terrain-Movement.md#5-vision--fog-of-war), and [healing](Map-Terrain-Movement.md#6-the-tick-engine).

### Deposit bonuses — exact functions

| Bonus | Effect |
|---|---|
| **Weapon-tier damage** | Flat +2/+4/+6 from best of Copper/Iron/Fire Glass. |
| **Fire-mana damage** | ×(1 + 0.10·n), n = mines (max 3). |
| **Earth-mana defense** | mitigation +0.10·n (max +0.30). |
| **Water-mana regen** | +5% maxHP heal per mine (max +15%). |
| **Mineral gold** | Silver +2/mine, Gold deposit +4/mine (each max 3 mines). |
| **Air-mana vision** | +1/mine (max +3). |
| **Lightning speed** | +1/mine (max +3). |
| **Shadow concealment** | enemies lose 1 effective vision when any shadow mine is active. |
| **Shadow withdraw** | +0.15 per mine (15/30/45% at 1/2/3 mines). |

→ Continue to **[Production & Buildings](Production-and-Buildings.md)**
