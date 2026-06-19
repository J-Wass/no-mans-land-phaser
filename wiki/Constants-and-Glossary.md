# Constants & Glossary

[← Back to Home](README.md)

A single-page reference for every tunable number, plus definitions of the game's terms.

---

## Time & engine

| Constant | Value | Meaning |
|---|---|---|
| `TICK_RATE` | 10 | Ticks per second |
| `TICK_INTERVAL_MS` | 100 | Milliseconds per tick |
| `TILE_SIZE` | 40 | Pixels per tile |
| Day length | 100 ticks | In-game "day" on the clock |
| Game speeds | 0, 0.5, 1, 2, 4 | Selectable speed multipliers |

## Combat — shared

| Constant | Value | Meaning |
|---|---|---|
| Health factor | `0.55 + 0.45·(hp/max)` | Wounded units hit softer ([0.55, 1.0]) |
| Damage variance | `0.9 + rand·0.2` | ±10% per round |
| `MITIGATION_CAP` | 0.65 | Max damage a defender can block |
| `ADVANCE_PACE_FACTOR` | 1.25 | Battle speed-up if either side advances |
| `MORALE_DAMAGE_SCALAR` | 45 | Scales combat morale drain |
| Veteran multipliers | 1.0 / 1.1 / 1.2 | Recruit / Veteran / Elite damage |

## Combat — unit battle

| Constant | Value |
|---|---|
| Round length | 20 ticks (2s) |
| Stance mitigation base | HOLD 0.22, WITHDRAW 0.16, ADVANCE 0.04 |
| ADVANCE order factor | ×1.25 (Cavalry ×1.5) |
| `WITHDRAW_BASE_CHANCE` | 0.30 |
| `WITHDRAW_SPEED_WEIGHT` | 0.07 per speed point |
| Withdraw chance clamp | [0.15, 0.90] |
| `RETREAT_COOLDOWN_TICKS` | 20 |
| XP: kill / win / loss / ranged hit | 3 / 2 / 1 / 1 |
| XP thresholds | Veteran 5, Elite 15 |

## Combat — city siege

| Constant | Value |
|---|---|
| Round length | 10 ticks (1s) |
| City base HP / melee | 200 / 12 |
| Walls per level | +60 HP, +3 melee (max lvl 5) |
| `WALL_MITIGATION_PER_LEVEL` | 0.06 (capped 0.5) |
| `ADVANCE_MITIGATION_FACTOR` | 0.45 (ADVANCE cuts wall cover) |
| Siege-unit city bonus | ×1.30 |
| City regen | +5 / 50 ticks |
| Post-conquest HP | 35% of max |

## Combat — territory battle

| Constant | Value |
|---|---|
| Round length | 10 ticks (1s) |
| Base territory HP | 30 |
| Wall mitigation | 0.20 (ADVANCE bypasses) |
| Walls HP / attack | +50 HP/lvl; attack 10 → 14 +5/lvl |
| Walls range | lvl≥2 → 2, lvl≥4 → 3 |
| Ranged counter factor | 0.85 |
| Retreat regen | +10 HP |
| Territory regen | +5 / 50 ticks |

## Combat — ranged fire

| Constant | Value |
|---|---|
| Fire interval | 20 ticks (2s) |
| Targeting range | ≤ unit's attackRange (Manhattan) |
| vs city | chips, never below 1 HP |
| Counterfire range | ≤ 3 tiles |

## Morale

| Constant | Value |
|---|---|
| Default / Max morale | 80 / 100 |
| Recovery ceiling | 80 (rest can't exceed) |
| Bands | Inspired 90+, Steady 60+, Wavering 40+, Shaken 15+, Broken 0+ |
| Band damage ×| Inspired 1.12, Steady 1.0, Wavering 0.92, Shaken 0.80, Broken 0.60 |
| Band mitigation Δ | +0.04 / 0 / −0.03 / −0.06 / −0.10 |
| ADVANCE blocked at/below | 59 morale |
| Rout at/below | 14 morale |
| **Gains** | win +20, kill +8, witness +5, city +25, rally +10, territory +6, siege +1 |
| **Losses** | advance −2/rnd, allied death −6, city lost −10 (nation-wide), battle lost −15 |
| Recovery / pulse | enemy 0, neutral 1, friendly 2, city 4 |
| Post-battle recovery cooldown | 30 ticks (halved) |
| Radii (Chebyshev) | witness 3, rally 4, territory rally 3 |

## Movement & terrain

| Terrain | Move cost | Yield |
|---|---|---|
| Plains | 50 | Food |
| Snow-Forest | 75 | Raw Material |
| Desert | 75 | Gold |
| Forest | 100 | Raw Material |
| Mountain | ∞ (Earth Mana → 75) | — |
| Water | ∞ (Water Mana → 75) | — |

Step cost = `max(1, ceil(terrainCost / (speed + lightningBonus)))`. Heavy/cavalry/siege move through forest at effective speed 1. Pathfinder enemy-territory penalty: +12.

## Economy intervals

| Pulse | Interval |
|---|---|
| Food (city base) | 5 ticks |
| Material / Gold / Research (city) | 10 ticks |
| Research start | tick 300 |
| Upkeep drain | 30 ticks |
| Terrain food/material | 50 ticks |
| Terrain desert gold | 80 ticks |
| Region domination | 50 ticks |
| City/territory HP regen | 50 ticks |
| City heal + morale recovery + water-mana heal | 10 ticks |

## Deposits

| Bonus | Value |
|---|---|
| Weapon tiers | Copper +2, Iron +4, Fire Glass +6 (best only) |
| Fire Mana | +10% damage/mine (max 30%) |
| Earth Mana | +10% mitigation/mine (max 30%) |
| Water Mana | +5% heal/mine (max 15%) |
| Lightning Mana | +1 speed/mine (max 3) |
| Air Mana | +1 vision/mine (max 3) |
| Shadow Mana | conceal (1+ mine); +15% withdraw per mine (15/30/45% at 1/2/3) |
| Silver / Gold deposit | +2 / +4 gold per mine |
| Mine count cap | 3 per type |

## Research

| Constant | Value |
|---|---|
| `RESEARCH_SPEED_MULTIPLIER` | 4 (real time = base ticks × 4) |
| RP costs | 5 / 10 / 15 / 20 / 25 by tier |

## Buildings

| Constant | Value |
|---|---|
| City queue cap | 5 |
| Max city building level | 5 (Watchtower 1) |
| Max walls level (city & territory) | 5 |
| Barracks training speedup | −5% per level above 1 |
| Raze interval | 50 ticks |

## Regions

| Constant | Value |
|---|---|
| Min region size | 8 tiles |
| Control threshold | 66% |
| Domination bonus | `max(1, floor(tiles/3))` per 50 ticks |

## AI

| Constant | Noob / Basic / Advanced |
|---|---|
| Think interval | 80 / 30 / 20 ticks |
| Goals per cycle | 1 / 3 / 4 |
| Earliest attack | never / 1800 / 250 ticks |
| Outmatch caution | skip attack if own HP < 55% of enemy |
| Max dispatch per attack | 6 units |
| AI refuses peace if winning by | >40% |
| Phase stagger | `aiIndex × 7` ticks |

## Diplomacy

| Constant | Value |
|---|---|
| Peace cooldown | 1200 ticks (~2 min) |
| Trade fair ratio | 0.70 (offer/request) |
| Trade low-resource bonus | ×1.5 (below 20) |
| Trade backoff | 10s base, doubling; resets after 2 min |

## Save

| Constant | Value |
|---|---|
| Save slots | 10 (localStorage) |
| Quick-save target | Slot 1 |
| Save format version | 1 |

---

## Glossary

- **Tick** — one simulation step; 100 ms; 10/sec.
- **Stance / Battle Order** — HOLD, ADVANCE, or WITHDRAW; how a unit fights. → [Stances](Stances.md)
- **Effective order** — the stance after morale gating (e.g. ADVANCE→HOLD when shaken).
- **Morale band** — Inspired/Steady/Wavering/Shaken/Broken; buckets that set combat multipliers. → [Morale](Morale.md)
- **Rout** — morale ≤ 14; the unit can only HOLD or WITHDRAW and may break.
- **Mitigation** — the fraction of incoming damage absorbed (capped at 0.65).
- **Health factor** — wounded units' reduced damage output.
- **Veterancy** — Recruit/Veteran/Elite ranks earned with XP, giving a damage bonus.
- **Deposit** — a tile resource (metal or mana) that needs a mine to activate.
- **Mine** — a territory building that activates a deposit's bonus.
- **Weapon tier** — the flat damage bonus from your best metal mine (Copper/Iron/Fire Glass).
- **Region** — a named cluster of same-terrain tiles; ≥66% control gives a resource bonus.
- **Outpost** — the first territory building; claims a tile and gates all others.
- **Upkeep** — Food/Material a unit costs the treasury every 30 ticks.
- **Nation vs Player** — a Nation is a faction in the world; a Player (human or AI) controls it.
- **Siege** — combat against an enemy city (occupying its tile grinds its HP down).
- **Territory battle** — combat to capture an enemy-owned non-city tile.
- **Fog of war** — unseen tiles are hidden; near-vision shows unidentified contacts.

[← Back to Home](README.md)
