# Economy & Resources

[← Back to Home](README.md)

The economy has two layers: four **treasury resources** that pay for everything, and tile **deposits** (metals and mana) that grant nation-wide bonuses once mined.

---

## 1. Treasury resources

| Resource | Enum | HUD emoji | Comes from | Spent on |
|---|---|---|---|---|
| **Food** | `FOOD` | 🍎 | city base, Farms, Plains tiles, region domination | unit costs, unit upkeep, some buildings |
| **Raw Material** | `RAW_MATERIAL` | 🧱 (🪨 in the diplomacy trade rows) | city base, Workshops, Forest/Snow-Forest tiles, region domination | buildings, units, upkeep |
| **Gold** | `GOLD` | 🪙 | city base, Markets, Desert tiles, Silver/Gold mines, region domination | units, buildings |
| **Research** | `RESEARCH` | 🔬 | city base (after tick 300), Schools | starting a tech |

- Stored per nation in a `ResourceStorage` (map of type → number, all start at 0), **uncapped**.
- `consumeResources(cost)` is **atomic**: it checks the whole cost first and deducts nothing if any part is unaffordable.
- Costs are paid **upfront** when an order/construction/research is accepted. Nothing is ever refunded (cancelled production, cancelled research, demolished buildings, captured queues).
- Starting treasury: skirmish 50 Gold / 30 Food / 20 Raw Material; sandbox human 9999 of everything; scenarios set their own.

### Income (all on `tick % interval == 0`)

**Per city (each city, every owner):**

| Source | Amount | Interval | Rate |
|---|---|---|---|
| Base Food | +1 | 5 ticks | +2/s |
| Base Raw Material | +1 | 10 | +1/s |
| Base Gold | +1 | 10 | +1/s |
| Base Research | +1 | 10, **only once tick ≥ 300** | +1/s |
| Farms (level L) | +L Food | 5 | +2L/s |
| Workshop (L) | +L Raw Material | 10 | +L/s |
| Market (L) | +L Gold | 10 | +L/s |
| School (L) | +L Research | 10, tick ≥ 300 | +L/s |

**Per owned territory tile** (including city tiles):

| Source | Amount | Interval | Rate |
|---|---|---|---|
| Territory Farms building | +1 Food | 5 | +2/s |
| Territory Workshop building | +1 Raw Material | 10 | +1/s |
| Plains terrain | +1 Food | 50 | +0.2/s |
| Forest / Snow-Forest terrain | +1 Raw Material | 50 | +0.2/s |
| Desert terrain | +1 Gold | 80 | +0.125/s |

**Per nation:**

| Source | Amount | Interval |
|---|---|---|
| Silver Mines | +2 Gold per active Silver mine (max 3 counted) | 10 ticks (+2/s each) |
| Gold Mines | +4 Gold per active Gold mine (max 3 counted) | 10 ticks (+4/s each) |
| [Region domination](Cities-Territory-Regions.md#3-regions) | `max(1, floor(regionTiles / 3))` of the region's resource | 50 ticks |

The HUD's resource breakdown panels (click a resource on the top bar) list these as "+X/s" lines. City building lines sum building **levels** across your cities.

### Upkeep
Every **30 ticks**, for every living unit (in insertion order), the owner pays the unit's upkeep (Food + Raw Material, see [Units](Units.md#1-stats)) with `consumeResources`. If the treasury can't cover that unit's whole upkeep, **nothing is deducted for it and nothing bad happens** — there is no starvation, desertion or debt.

---

## 2. Tile deposits

A deposit (`TerritoryResourceType`) sits on a tile. It does nothing until the nation **owns the tile and has built the matching mine on that same tile** — then it is "active". `getNationActiveDeposits` returns the set of active types; `getNationActiveDepositCounts` counts active mined tiles per type (only tiles that individually have their mine).

| Deposit | Enum | Map glyph | Mine | Mine tech |
|---|---|---|---|---|
| Copper | `COPPER` | ⊛ | Copper Mine | `masonry` |
| Iron | `IRON` | ⊗ | Iron Mine | `iron_working` |
| Fire Glass | `FIRE_GLASS` | ◈ | Fire Glass Mine | `steel_working` |
| Silver | `SILVER` | ◇ | Silver Mine | `masonry` |
| Gold | `GOLD_DEPOSIT` | ◆ | Gold Mine | `trade` |
| Water Mana | `WATER_MANA` | ~ | Mana Mine | `mana_studies` |
| Fire Mana | `FIRE_MANA` | ▲ | Mana Mine | `mana_studies` |
| Lightning Mana | `LIGHTNING_MANA` | ⚡ | Mana Mine | `mana_studies` |
| Earth Mana | `EARTH_MANA` | ◉ | Mana Mine | `mana_studies` |
| Air Mana | `AIR_MANA` | ≋ | Mana Mine | `mana_studies` |
| Shadow Mana | `SHADOW_MANA` | ◐ | Mana Mine | `mana_studies` |

### Bonus functions (`systems/resources/ResourceBonuses.ts`)
`n(type)` = active mines of that type, clamped to 0..3 (0 if none active).

| Function | Formula | Used by |
|---|---|---|
| `weaponTierDamageBonus` | Fire Glass active → +6; else Iron → +4; else Copper → +2; else 0 (best tier only, no stacking) | battle offense base, ranged-fire damage, HUD stats |
| `fireManaDamageFactor` | `1 + 0.10 × n(FIRE_MANA)` | battle offense, ranged fire |
| `earthManaHPFactor` | `1 + 0.10 × n(EARTH_MANA)` — the `−1` is added to mitigation (+0.10 per mine) | battle mitigation |
| `waterManaRegenBonus` | `0.05 × n(WATER_MANA)` | every 10 ticks heals each non-engaged unit of the nation by `ceil(maxHP × bonus)`, anywhere on the map |
| `mineralGoldBonus` | `2 × n(SILVER) + 4 × n(GOLD_DEPOSIT)` | Gold every 10 ticks |
| `airManaVisionBonus` | `n(AIR_MANA)` | +vision radius for all own units |
| `lightningManaSpeedBonus` | `n(LIGHTNING_MANA)` | +effective speed in the step-cost formula |
| `shadowManaVisionReduction` | `1` if `n(SHADOW_MANA) > 0`, else 0 | observers' vision −1 against this nation's units (units only; territory/watchtower vision can't see them) |
| `shadowManaWithdrawBonus` | `0.15 × n(SHADOW_MANA)` | WITHDRAW roll |

Earth Mana also lets the nation's units walk on **mountains**, and Water Mana on **water**, at cost 75 (as long as at least one such mine is active).

Metal deposits also gate units: Cavalry, Crossbowman and Catapult need any active Copper/Iron/Fire Glass mine; Heavy Infantry and Trebuchet need Iron or Fire Glass.

### Deposit tooltips (hover a discovered deposit on the map)
```
Copper         Copper Mine → Bronze weapons (+2 melee & ranged). Enables Cavalry, Crossbowman & Catapult.
Iron           Iron Mine → Iron weapons (+4 melee & ranged). Enables Cavalry, Crossbowman, Catapult, Heavy Infantry & Trebuchet.
Fire Glass     Fire Glass Mine → Fire Glass weapons (+6 melee & ranged). Enables Cavalry, Crossbowman, Catapult, Heavy Infantry & Trebuchet.
Silver         Silver Mine → +2 Gold per second.
Gold           Gold Mine → +4 Gold per second (requires Trade).
Water Mana     Mana Mine → heals your whole army (+5% max HP per pulse, up to +15%).
Fire Mana      Mana Mine → +10% unit damage per mine (up to +30%).
Lightning Mana Mana Mine → +1 movement speed per mine (up to +3).
Earth Mana     Mana Mine → +10% damage mitigation per mine (up to +30%).
Air Mana       Mana Mine → +1 vision per mine (up to +3).
Shadow Mana    Mana Mine → conceals your units and improves withdrawals.
```
(Each tooltip is two/three lines: the name, then the description lines.)

---

## 3. Trading
Resources can be traded with other nations from the Diplomacy modal (Gold, Raw Material, Food in steps of 10). AI nations evaluate offers. See [Diplomacy → Trading](Diplomacy.md#4-trading).

→ Continue to **[Production & Buildings](Production-and-Buildings.md)**
