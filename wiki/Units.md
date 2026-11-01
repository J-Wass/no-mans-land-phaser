# Units

[← Back to Home](README.md)

There are **eight unit types**. Each is a thin subclass that only supplies a stat block to the base `Unit` class; all behaviour lives in the systems. A unit is **ranged** when `attackRange > 1` **and** `rangedDamage > 0` (Longbowman, Crossbowman, Catapult, Trebuchet). "Siege" means Catapult or Trebuchet; matchup rules key off unit type and armor, not separate flags.

---

## 1. Stats

| Unit (`UnitType`) | Map letter | HP | Melee | Ranged | Armor | Speed | Range | Vision | Upkeep (Food / Raw Mat per 30 ticks) |
|---|---|---|---|---|---|---|---|---|---|
| **Infantry** (`INFANTRY`) | I | 100 | 10 | 0 | light | 2 | 1 | 1 | 1 / 1 |
| **Scout** (`SCOUT`) | S | 100 | 2 | 0 | light | 3 | 1 | **2** | 1 / 1 |
| **Heavy Infantry** (`HEAVY_INFANTRY`) | H | 250 | 20 | 0 | heavy | 1 | 1 | 1 | 2 / 1 |
| **Cavalry** (`CAVALRY`) | C | 160 | 32 | 0 | heavy | 3 | 1 | 1 | 2 / 1 |
| **Longbowman** (`LONGBOWMAN`) | L | 100 | 10 | 12 | light | 2 | **3** | 1 | 1 / 1 |
| **Crossbowman** (`CROSSBOWMAN`) | X | 150 | 10 | 15 | heavy | 1 | 2 | 1 | 1 / 1 |
| **Catapult** (`CATAPULT`) | K | 200 | 15 | 25 | heavy | 1 | 2 | 1 | 1 / 2 |
| **Trebuchet** (`TREBUCHET`) | T | 250 | 25 | 50 | heavy | 1 | **3** | 1 | 2 / 3 |

- **HP** — wounded units also hit softer (health factor 0.55–1.0).
- **Speed** — divides terrain cost when moving ([step cost](Map-Terrain-Movement.md#3-movement)) and feeds the [WITHDRAW roll](Stances.md#the-withdraw-roll).
- **Range** — 1 = melee only. Ranged units fire automatically at targets within this Manhattan distance ([Ranged fire](Combat.md#4-ranged-fire-system)) and use their ranged stat in battles unless on ADVANCE.
- **Vision** — Manhattan sight radius (+ Air Mana).
- **Upkeep** — charged every 30 ticks while alive. If the treasury can't cover a unit's full upkeep, **nothing** is charged for that unit (there is no starvation penalty) — see [Economy → Upkeep](Economy-and-Resources.md#upkeep).
- The HUD unit panel shows `Melee` and `Ranged` **plus** the nation's weapon-tier bonus (+2/+4/+6), and an "Armor" label that is really the weapon tier: Fire Glass (Fire Glass mine), Steel (Iron mine + Steel Working), Iron (Iron mine), Bronze (Copper mine), else Leather.

---

## 2. Unit matchups — the rock-paper-scissors triangle

Matchups are applied by the [BattleSystem](Combat.md#1-unit-vs-unit-battle) as offense/mitigation modifiers:

> 🛡 **HEAVY INFANTRY (spears) → 🐎 CAVALRY → 🏹 RANGED (Longbow / Crossbow / Catapult / Trebuchet) → 🛡 HEAVY INFANTRY**

- **Heavy Infantry beats Cavalry** — the planted spear wall.
- **Cavalry beats Ranged** — it takes half damage from standalone ranged fire while closing, and siege units are nearly helpless once caught in melee.
- **Ranged beats Heavy Infantry** — through pre-damage at range plus armor-piercing bonuses. This is an army-level edge, not a 1v1 guarantee.
- **Infantry** is the cheap, no-tech generalist; **Scout** is recon (and, with Ancient Rituals, a spy).

### Offense modifiers (summed into one `matchupFactor`, starting at 1)
| Condition | Δ |
|---|---|
| Attacker uses its ranged attack **and** defender has heavy armor | +0.12 |
| Attacker uses melee **and** defender has heavy armor | −0.06 |
| Attacker is siege **and** uses melee (i.e. on ADVANCE) | −0.30 |
| Defender is siege **and** attacker uses melee | +0.08 |
| Heavy Infantry attacking Cavalry | +0.35 |
| Heavy Infantry attacking a light-armored unit | +0.15 |
| Crossbowman attacking heavy armor | +0.10 (total +0.22 with the ranged rule) |
| Crossbowman attacking light armor | −0.30 |
| Attacker is siege **and** uses its ranged attack (pinned in a melee battle, firing point-blank) | −0.80 |

### Mitigation modifiers (added to the defender's mitigation)
| Condition (defender's effective stance) | Δ |
|---|---|
| Heavy Infantry on HOLD (shield wall) | +0.16 |
| Crossbowman on WITHDRAW (kiting) | +0.12 |
| Defender is siege and the attacker is not siege (any stance) | −0.08 |
| Heavy Infantry being hit by Cavalry | +0.20 |

### Stance-based
- ADVANCE order factor: **Cavalry ×1.5** ("Charge"), every other unit ×1.25.
- Cavalry on Plains while advancing: ×1.12 offense, −0.04 mitigation. In Forest: ×0.82 offense and no forest cover.

### Ranged-fire specific
- **Cavalry takes 50% of standalone ranged-fire damage** (`CAVALRY_RANGED_RESIST = 0.5`, rounded, minimum 1). This applies only in the RangedFireSystem, never inside melee battles.

---

## 3. Unit roles

- **Infantry** — cheap filler and screen; available from a level-1 Barracks with no tech.
- **Scout** — speed 3, vision 2, melee 2. Recon, land grabbing, and spying (below).
- **Heavy Infantry** — 250 HP, the anti-cavalry anchor (+0.16 mitigation on HOLD, +0.35 offense / +0.20 mitigation vs Cavalry, +0.15 vs light armor). Slow; softened by ranged fire.
- **Cavalry** — 32 melee, ×1.5 charge, speed 3, half damage from volleys. Crippled in forest (speed 1 and ×0.82). Countered by Heavy Infantry.
- **Longbowman** — range 3, light armor, fragile.
- **Crossbowman** — range 2, heavy armor, anti-armor specialist; poor vs light armor.
- **Catapult** — ranged 25, range 2; ×1.30 vs cities; helpless when caught in melee.
- **Trebuchet** — ranged 50, range 3; best siege and pre-damage unit; helpless up close.

### Ranged vs melee choice
In a battle, siege or territory battle a unit uses its ranged attack when `range > 1 && ranged > 0 && effectiveOrder !== 'ADVANCE'`. In unit battles the ranged base damage is `max(rangedDamage, meleeDamage × 0.7)` (always `rangedDamage` for the shipped units). ADVANCE forces a shooter into melee.

### Spies (undercover Scouts)
- Requires the nation to have researched **Ancient Rituals** (waived in sandbox). Only Scouts.
- Toggle with the **SPY / DROP** button in the unit panel (command `CONVERT_TO_SPY`). Allowed only when the Scout is **not in battle** and stands on its **own or unowned** territory (applies to both going undercover and dropping cover).
- While undercover a spy:
  - is invisible to every nation except its owner and allies (not drawn, no contact marker, no HP bar or path line, cannot be targeted by ranged fire);
  - never starts battles, sieges or territory battles when moving, and enemy units that move onto its tile ignore it (no war is ever declared because of a spy);
  - is never promoted to a stranded-unit siege on a city tile;
  - is drawn with a purple name ("· UNDERCOVER") in its own unit panel.
- **Detection** (`SpyDetectionSystem`, every 10 ticks): only while the spy stands on a tile **owned by a nation that is not the spy's owner and not allied with it**. For each other living unit (not same owner, not allied — neutral nations count) within **Chebyshev 2**, roll:
  ```
  base = 0.50 on the same tile, 0.25 adjacent (distance 1), 0.10 at distance 2
  chance = clamp(base + (detectorXP − spyXP) × 0.01, 0.02, 0.95)
  ```
  The first successful roll destroys the spy (`spy:detected` + `unit:destroyed`, killer = the detector, so morale kill/witness effects apply). The owner gets a toast: "Your spy was discovered and killed at (r, c)."

---

## 4. Cost, build time & requirements

All units are trained in a city with a **Barracks** of at least the listed level. "Deposit" means the nation must have **at least one active mine** on any of the listed deposit types.

| Unit | Gold | Food | Raw Mat | Build ticks (seconds) | Tech | Barracks | Deposit (any of) |
|---|---|---|---|---|---|---|---|
| **Infantry** | 30 | 400 | 300 | 240 (24 s) | — | 1 | — |
| **Scout** | 20 | 300 | 0 | 200 (20 s) | — | 1 | — |
| **Longbowman** | 40 | 500 | 350 | 300 (30 s) | `hunting` | 2 | — |
| **Cavalry** | 80 | 700 | 500 | 400 (40 s) | `animal_domestication` | 2 | Copper / Iron / Fire Glass |
| **Crossbowman** | 50 | 550 | 400 | 360 (36 s) | `mechanization` | 3 | Copper / Iron / Fire Glass |
| **Heavy Infantry** | 80 | 700 | 450 | 400 (40 s) | `iron_working` | 3 | Iron / Fire Glass |
| **Catapult** | 80 | 350 | 600 | 480 (48 s) | `physics` + `the_wheel` | 3 | Copper / Iron / Fire Glass |
| **Trebuchet** | 100 | 400 | 800 | 560 (56 s) | `mechanization` + `steel_working` | 5 | Iron / Fire Glass |

- Build ticks above already include `UNIT_PRODUCTION_SPEED_MULTIPLIER = 2` (catalog base ticks: 120 / 100 / 150 / 200 / 180 / 200 / 240 / 280).
- **Barracks mobilization speed-up:** when the order is placed, `ticks = max(1, round(catalogTicks × max(0.5, 1 − 0.05 × (barracksLevel − 1))))` — level 1 ×1.00, 2 ×0.95, 3 ×0.90, 4 ×0.85, 5 ×0.80 (Infantry: 240 / 228 / 216 / 204 / 192).
- **Cost is paid upfront** when the order is accepted; cancelling refunds nothing.
- In **sandbox**, cost, tech and deposit checks are skipped and the time becomes `min(10, ticks)`, but the Barracks level is still required.
- A finished unit spawns on the first free tile in this order: the city tile, E, S, W, N, SE, NW, SW, NE (skipping water, mountain, and any tile with any unit on it). If none is free, the finished order waits and retries every tick. The new unit gets id `unit-city-{N}` (N from a persisted counter starting at 1001), the city as **home city**, and the next serial number.

---

## 5. Veterancy & experience

| Level | Rank | XP needed | Damage × |
|---|---|---|---|
| 0 | Recruit | 0 | 1.0 |
| 1 | Veteran | **5** | 1.1 |
| 2 | Elite | **15** | 1.2 |

XP awards:

| Event | XP |
|---|---|
| Win a unit battle where the loser died | +3 (`XP_KILL`) |
| Win a unit battle where the loser survived (withdraw/rout) | winner +2 (`XP_WIN`), loser +1 (`XP_LOSS`) |
| Deal >0 damage with the ranged attack in a battle round, siege round, or territory-battle round | +1 (`XP_RANGED_HIT`) |
| Standalone ranged fire, kills by ranged fire, spy kills | 0 |

The veteran multiplier applies in unit battles, sieges and territory battles — not in standalone ranged fire. Rank never drops.

---

## 6. Names

Each unit has a serial number per (nation, unit type), starting at **101**. Its full name is `"{ordinal} {Type} {Group}"`, e.g. **"101st Infantry Battalion"**. Elite units switch to the elite group name. A serial of 0 shows just the type name.

| Type | Group (Recruit/Veteran) | Group (Elite) |
|---|---|---|
| Infantry | Battalion | Legion |
| Scout | Regiment | Corp |
| Heavy Infantry | Battalion | Legion |
| Cavalry | Squadron | Wing |
| Longbowman | Regiment | Corp |
| Crossbowman | Regiment | Corp |
| Catapult | Battery | Train |
| Trebuchet | Battery | Train |

Ordinal suffix: 11–13 → "th"; else last digit 1 → "st", 2 → "nd", 3 → "rd", else "th".

---

## 7. The base `Unit` — what every unit tracks

```ts
interface UnitData {
  id; type: UnitType; ownerId; position: {row, col};
  currentHealth; stats: UnitStats;              // stats are saved per unit
  hasMovedThisTurn; hasAttackedThisTurn;         // vestigial
  battleOrder: 'WITHDRAW' | 'HOLD' | 'ADVANCE';  // default HOLD
  engagedInBattle: boolean;
  morale: number;                                // default 80, clamped 0..100
  battlesEngaged: number;
  homeCityId: string | null;
  preferredTargetId: string | null;              // ranged auto-target override (no UI sets it)
  xp; veteranLevel;                              // 0..2
  unitSerial;                                    // 0 = none
  retreatCooldownUntilTick;
  moraleRecoveryCooldownUntilTick;
  isSpy: boolean;
}
```
- `takeDamage`, `heal`, `setHealth` clamp HP to `[0, maxHealth]`; `isAlive()` = HP > 0.
- `addXP` promotes at 5 and 15 XP; `getXPToNextLevel()` = threshold − xp (0 when Elite).
- `setMorale` clamps to `[0, 100]`.
- The chosen `battleOrder` is filtered by morale into an *effective* order — see [Stances](Stances.md#how-morale-gates-stances).
- Losing a battle and surviving sets a 20-tick retreat cooldown (can't be pulled into a new unit battle) and a 30-tick halved-morale-recovery window.
- Saves restore the type-specific subclass via `createUnitFromData`, then overwrite stats and all mutable fields; the legacy order `FALL_BACK` is converted to `WITHDRAW`, unknown orders to `HOLD`.

→ Continue to **[Combat](Combat.md)**
