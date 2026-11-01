# Constants & Glossary

[← Back to Home](README.md)

Every tunable number in one place, with its source file.

---

## Time & engine
| Constant | Value | Source |
|---|---|---|
| `TICK_RATE` | 10 ticks/s | `config/constants.ts` |
| `TICK_INTERVAL_MS` | 100 | 〃 |
| `MAX_TICK_CATCHUP` | 5 ticks per frame | 〃 |
| `TILE_SIZE` | 40 px | 〃 |
| Ticks per day (clock) | 100 | `UIScene` |
| Game speeds | 0 (pause), 0.5, 1, 2, 4 | `UIScene` |
| Double-click window | 350 ms, same tile | `GameScene` |
| Pan threshold | 6 px | `GameScene` |
| Zoom | ×0.9 / ×1.1 per wheel step, max 2.5, min `max(0.15, fit × 0.85)` | `GameScene` |
| Camera scroll padding | 20 tiles | `GameScene` |

## Combat — shared (`config/combatBalance.ts`)
| Constant | Value |
|---|---|
| Health factor | `0.55 + 0.45 × hp/max` |
| Damage variance | `0.9 + rand × 0.2` |
| `MITIGATION_CAP` | 0.65 |
| `ADVANCE_PACE_FACTOR` | 1.25 |
| `MORALE_DAMAGE_SCALAR` | 45 |
| `VETERAN_DAMAGE_MULT` | 1.0 / 1.1 / 1.2 |
| `XP_VETERAN` / `XP_ELITE` | 5 / 15 (`Unit.ts`) |
| `XP_KILL` / `XP_WIN` / `XP_LOSS` / `XP_RANGED_HIT` | 3 / 2 / 1 / 1 |
| `CAVALRY_RANGED_RESIST` | 0.5 |

## Combat — unit battle (`BattleSystem.ts`)
| Constant | Value |
|---|---|
| `UNIT_BATTLE_ROUND_TICKS` | 20 |
| Stance mitigation | HOLD 0.22, WITHDRAW 0.16, ADVANCE 0.04 |
| ADVANCE order factor | ×1.25, Cavalry ×1.5 |
| Ranged base | `max(ranged, melee × 0.7)` |
| `WITHDRAW_BASE_CHANCE` / `WITHDRAW_SPEED_WEIGHT` | 0.30 / 0.07 per speed point |
| Withdraw clamp | [0.15, 0.90] |
| `RETREAT_COOLDOWN_TICKS` | 20 |
| Matchups | ranged vs heavy +0.12; melee vs heavy −0.06; siege melee −0.30; vs siege in melee +0.08; HI vs Cav +0.35; HI vs light +0.15; XBow vs heavy +0.10; XBow vs light −0.30; siege firing in melee −0.80 |
| Matchup mitigation | HI HOLD +0.16; XBow WITHDRAW +0.12; siege hit by non-siege −0.08; HI vs Cav +0.20 |
| Terrain offense | Forest: Cav 0.82, ranged 0.94, melee 1.08; Snow: ranged 1.12, HOLD 1.05; Desert: Cav 1.06, HI 0.95; Plains: Cav ADVANCE 1.12 |
| Terrain mitigation | Forest +0.06 (not Cav); Snow +0.08 (HOLD/WITHDRAW); Plains Cav ADVANCE −0.04 |
| Retreat search | directional (2 back) → ring 2 → Chebyshev rings 3–6 |

## Combat — city siege
| Constant | Value | Source |
|---|---|---|
| `BATTLE_ROUND_TICKS` | 10 | `BattleSystem.ts` |
| City base HP / melee | 200 / 12 | `City.ts` |
| `CITY_WALLS_HP_PER_LEVEL` / `CITY_WALLS_DMG_PER_LEVEL` | 60 / 3 | `CityBuilding.ts` |
| `MAX_CITY_WALLS_LEVEL` | 5 | 〃 |
| `WALL_MITIGATION_PER_LEVEL` | 0.06, capped 0.5 | `combatBalance.ts` |
| `ADVANCE_MITIGATION_FACTOR` | 0.45 | 〃 |
| Siege-weapon city bonus | ×1.30 | `CitySiegeSystem.ts` |
| `CITY_REGEN_INTERVAL` / `AMOUNT` | 50 ticks / +5 | `combatBalance.ts` |
| `CITY_POST_CONQUEST_HP` | 0.35 (ceil) | 〃 |
| Siege retreat search | origin, then Chebyshev rings 1–5 | `CitySiegeSystem.ts` |

## Combat — territory battle
| Constant | Value | Source |
|---|---|---|
| Round | 10 ticks | |
| `BASE_TERRITORY_HP` | 30 | `Territory.ts` |
| `WALLS_HP_PER_LEVEL` | 50 | 〃 |
| `BASE_ATTACK_DAMAGE` | 10 | 〃 |
| `WALLS_DMG_BASE` / `WALLS_DMG_PER_LEVEL` | 14 / 5 | 〃 |
| `MAX_WALLS_LEVEL` | 5 | 〃 |
| `TERRITORY_WALL_MITIGATION` | 0.20 (not vs ADVANCE) | `combatBalance.ts` |
| `TERRITORY_RANGED_COUNTER_FACTOR` | 0.85 | 〃 |
| `TERRITORY_RETREAT_REGEN` | +10 | 〃 |
| `TERRITORY_REGEN_INTERVAL` / `AMOUNT` | 50 / +5 (owned tiles) | 〃 |

## Combat — ranged fire & spies
| Constant | Value | Source |
|---|---|---|
| `RANGED_FIRE_INTERVAL_TICKS` | 20 | `RangedFireSystem.ts` |
| City counterfire range | ≤ 3 (Manhattan), no variance | 〃 |
| Ranged vs city floor | city HP ≥ 1 | 〃 |
| `SPY_DETECTION_INTERVAL_TICKS` | 10 | `SpyDetectionSystem.ts` |
| `SPY_DETECTION_BASE` | on tile 0.50, adjacent 0.25, distance 2 0.10 | 〃 |
| `SPY_DETECTION_XP_WEIGHT` | 0.01 per XP difference | 〃 |
| Detection chance clamp | [0.02, 0.95] | 〃 |
| `SPY_DETECTION_RADIUS` | 2 (Chebyshev) | 〃 |

## Morale (`config/moraleBalance.ts`)
| Constant | Value |
|---|---|
| `DEFAULT_MORALE` / `MAX_MORALE` | 80 / 100 |
| `RECOVERY_CEILING` | 80 |
| Bands (min) | Inspired 90, Steady 60, Wavering 40, Shaken 15, Broken 0 |
| Band damage × | 1.12 / 1.00 / 0.92 / 0.80 / 0.60 |
| Band mitigation Δ | +0.04 / 0 / −0.03 / −0.06 / −0.10 |
| ADVANCE blocked at ≤ | 59 |
| Rout at ≤ | 14 |
| Gains | win 20, kill 8, witness 5, city conquer 25, rally 10, territory 6, siege 1 |
| Losses | advance 2/round, allied death 6, city lost 10 (nation-wide), battle lost 15 |
| Recovery / 10 ticks | enemy 0, neutral 1, friendly 2, city 4 |
| `POST_BATTLE_RECOVERY_COOLDOWN_TICKS` | 30 (recovery halved) |
| Radii (Chebyshev) | witness 3, rally 4, territory rally 3 |

## Movement & terrain (`systems/movement/MovementCosts.ts`, `Pathfinder.ts`)
| Terrain | Base cost |
|---|---|
| Plains | 50 |
| Snow-Forest | 75 |
| Desert | 75 |
| Forest | 100 |
| Mountain | ∞ (75 with Earth Mana) |
| Water | ∞ (75 with Water Mana) |

`stepCost = max(1, ceil(base / ((effSpeed + lightningMines) × (theWheel ? 1.2 : 1))))`; Heavy Infantry / Cavalry / Catapult / Trebuchet move at effective speed 1 in Forest. `WHEEL_SPEED_MULTIPLIER = 1.2`. `ENEMY_TERRITORY_PENALTY = 12` (pathfinding only).

## Vision (`VisionSystem.ts`)
| Constant | Value |
|---|---|
| Territory vision border | 2 (Manhattan) |
| Unit vision | `vision + airMines` |
| `WATCHTOWER_VISION_RADIUS` | 3 |
| `FOG_EDGE_DISTANCE` (near-visible ring) | 2 |
| Shadow concealment | −1 observer vision (units only) |

## Economy (`ProductionSystem.ts`)
| Constant | Value |
|---|---|
| `FOOD_INTERVAL` | 5 |
| `MATERIAL_INTERVAL` / `GOLD_INTERVAL` / `RESEARCH_INTERVAL` | 10 |
| `RESEARCH_START_TICK` | 300 |
| `TERRAIN_FOOD_INTERVAL` / `TERRAIN_MATERIAL_INTERVAL` | 50 |
| `TERRAIN_GOLD_INTERVAL` | 80 |
| `UPKEEP_INTERVAL` | 30 |
| `RESEARCH_SPEED_PER_SCHOOL_LEVEL` / `RESEARCH_SPEED_CAP` | 0.10 / 0.50 |
| City unit heal | `ceil(5% maxHP)` every 10 ticks (`TickEngine`) |
| Water-mana heal | `ceil(5% × mines × maxHP)` every 10 ticks |
| Silver / Gold mine | +2 / +4 Gold every 10 ticks per mine (max 3 each) |

## Deposits (`ResourceBonuses.ts`)
| Bonus | Value |
|---|---|
| Weapon tier | Copper +2, Iron +4, Fire Glass +6 (best only) |
| Fire / Earth Mana | +10% damage / +0.10 mitigation per mine |
| Water Mana | +5% max-HP heal per mine per second |
| Lightning / Air Mana | +1 speed / +1 vision per mine |
| Shadow Mana | concealment (1+ mine), +0.15 withdraw per mine |
| Mine-count cap | 3 per type |

## Production & buildings
| Constant | Value | Source |
|---|---|---|
| `CITY_QUEUE_MAX` | 5 (plus the active order) | `City.ts` |
| `CITY_RAZE_INTERVAL_TICKS` | 50 (raze and −1 LVL) | 〃 |
| `MAX_CITY_BUILDING_LEVEL` | 5 (Watchtower, City Hall: 1) | `CityBuilding.ts` |
| `UNIT_PRODUCTION_SPEED_MULTIPLIER` | 2 | `ProductionCatalog.ts` |
| `BARRACKS_MOBILIZATION_SPEEDUP_PER_LEVEL` | 0.05 (multiplier floor 0.5) | 〃 |
| Sandbox build/research cap | 10 ticks | `CommandProcessor.ts` |
| Spawn search order | city, E, S, W, N, SE, NW, SW, NE | `ProductionSystem.ts` |

## Research (`TechTree.ts`)
| Constant | Value |
|---|---|
| `RESEARCH_SPEED_MULTIPLIER` | 4/3 |
| Real durations | 400 / 600 / 800 / 1000 / 1200 ticks for base 300 / 450 / 600 / 750 / 900 |
| RP costs | 25 / 50 / 75 / 100 / 125 by tier |

## Regions (`RegionSystem.ts`)
| Constant | Value |
|---|---|
| `MIN_REGION_SIZE` | 8 tiles |
| `REGION_CONTROL_THRESHOLD` | 0.66 (`ceil(tiles × 0.66)` needed) |
| `REGION_BONUS_INTERVAL` | 50 ticks |
| Bonus | `max(1, floor(tiles / 3))` |
| Nearest-region search | 12 tiles |

## World generation (`BootScene.ts`, `SpawnSystem.ts`)
| Constant | Value |
|---|---|
| Skirmish grid | `clamp(18 + ceil(sqrt(12 × nations)), 22, 30)` |
| Water border | `max(3, round(G × 0.12))` |
| Island radius | `G × 0.46` + coast noise |
| Mountain ranges | 2–3, length `0.55G`–`0.9G` |
| Biome clusters | 6 attempts, radius 2–4 |
| Deposit scale | `max(0.5, G² / 3600)` |
| `COAST_DEPTH` | 4 |
| Spawn spacing target / minimum | 10 / 8 (Chebyshev) |
| City distance from anchor | 2–7; pair spacing 5–7 (ideal 6) |
| `OVAL_PADDING` (starting territory) | 2 |
| Starting treasury | 50 G / 30 F / 20 RM (sandbox human 9999 each) |

## AI
| Constant | Noob / Basic / Advanced |
|---|---|
| Think interval | 80 / 30 / 20 ticks |
| Goals per evaluation | 1 / 3 / 4 |
| Earliest attack | never / 1800 / 500 (Expansion), 250 (Military) |
| Noob unit cap | 4 |
| Outmatch threshold | own HP < 55% of at-war enemies' HP |
| `MAX_DISPATCH` per attack | 6 |
| Expansion → Military | threat ≤ 5 tiles from a city, or ≥ 12 tiles owned |
| Military → Defense | own units < 60% of the largest non-allied army and threat ≤ 4 |
| Defense → Military | no threat within 6 |
| Phase stagger | `aiIndex × 7` ticks |

## Diplomacy (`DiplomacySystem.ts`)
| Constant | Value |
|---|---|
| `PEACE_COOLDOWN_TICKS` | 1200 |
| AI refuses peace if | its unit HP > 1.4 × proposer's |
| `TRADE_FAIR_RATIO` | 0.70 |
| `AI_LOW_THRESHOLD` | 20 (offered amounts of scarce resources count ×1.5) |
| `TRADE_BACKOFF_BASE_TICKS` | 100, doubling |
| `TRADE_RESET_TICKS` | 1200 |

## UI & save
| Constant | Value |
|---|---|
| HUD scale | `clamp(height / 900, 0.75, 1.8)` |
| Modal scale | `clamp(shortSide / 900, 0.82, 1.42)` |
| Skinny HUD below | 1100 px wide |
| Toasts | max 4 visible, 4 s each; history 100 |
| Save slots | 10 (`phaser-rts-save-slot-N`), quick-save slot 1 |
| Save version | 1; max import size 20 MiB |
| Music early-game cutoff | 6000 ticks; fade 1.5 s; gap 5 s |

---

## Glossary

- **Tick** — one simulation step (100 ms at 1× speed).
- **Stance / battle order** — HOLD, ADVANCE or WITHDRAW. → [Stances](Stances.md)
- **Effective order** — the stance after morale gating.
- **Morale band** — Inspired / Steady / Wavering / Shaken / Broken. → [Morale](Morale.md)
- **Rout** — morale ≤ 14 during a battle; ends it with the routed unit as loser.
- **Mitigation** — fraction of incoming damage absorbed (max 0.65).
- **Health factor** — a wounded attacker's reduced output (0.55–1.0).
- **Veterancy** — Recruit / Veteran / Elite rank from XP.
- **Deposit** — a metal or mana resource on a tile; **active** once mined.
- **Mine** — the territory building that activates a deposit.
- **Weapon tier** — flat damage from your best metal mine.
- **Region** — named same-terrain cluster of ≥ 8 tiles; dominating it (≥ 66%) pays a bonus.
- **Outpost** — the claim building; prerequisite for every other territory building.
- **Upkeep** — Food/Raw Material each unit costs every 30 ticks (only if affordable).
- **Nation vs Player** — a Nation is a faction; a Player (human or AI) controls it.
- **Siege** — one unit attacking a city by standing on it.
- **Territory battle** — one unit attacking an enemy non-city tile while at war.
- **Spy** — an undercover Scout.
- **Known nation** — a nation you've discovered land/cities of or have a non-neutral relation with.
- **Fog of war** — undiscovered (black), discovered (dimmed), visible, and near-visible (contact markers).
- **Sandbox** — free-play mode without costs, fog or AI.

[← Back to Home](README.md)
