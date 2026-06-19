# Combat

[← Back to Home](README.md)

Combat is **automatic and continuous**. You don't click "attack" — you move a unit into an enemy and the simulation resolves the fight round by round over ticks. There are **four** combat systems: unit-vs-unit battles, city sieges, territory battles, and a standalone ranged-fire system. They share a common damage math.

> **Related pages:** [Stances](Stances.md) · [Morale](Morale.md) · [Units & matchups](Units.md) · [Terrain](Map-Terrain-Movement.md#2-terrain)

---

## Shared damage primitives

Every combat system reuses these helpers (`combatBalance.ts`):

**Health factor** — wounded units hit softer:
```
healthFactor(cur, max) = 0.55 + 0.45 × (cur / max)     → range [0.55, 1.0]
```
Full HP = 1.0; near-death = 0.55.

**Damage variance** — per-round random spread:
```
damageVariance(rand) = 0.9 + rand × 0.2                → range [0.9, 1.1)
```
`rand` comes from the deterministic seeded RNG, so battles replay identically.

**Veteran multiplier** — `[1.0, 1.1, 1.2]` for Recruit / Veteran / Elite.

---

## 1. Unit-vs-unit battle

### Cadence & start
- A round resolves every **`UNIT_BATTLE_ROUND_TICKS = 20` ticks (2 seconds)** — melee is a deliberately drawn-out exchange.
- `startBattle` fails (returns no battle) if either unit is dead, they share an owner, either is already in a battle, or either is on **retreat cooldown**. On success both are flagged engaged and their movement orders are cancelled.

### Each round — damage is **simultaneous**
Each side's damage to the other is:
```
damage = max(1, round( offense × (1 − mitigation) ))
```
The `max(1, …)` floor means **every hit chips at least 1 HP**, so battles can't stall. The **attacker's** stance drives its offense; the **defender's** stance drives its mitigation.

#### Offense chain (multiplicative)
```
offense = baseDamage × hpFactor × orderFactor × matchupFactor
                     × terrainFactor × fireFactor × moraleFactor
                     × battlePaceFactor × randomness
```

- **useRanged** = `range > 1 && ranged > 0 && order ≠ ADVANCE`. ADVANCE forces shooters into melee.
- **rawBase** = `useRanged ? max(ranged, melee × 0.7) : melee`.
- **baseDamage** = `(rawBase + weaponTierBonus) × veteranMultiplier`.
  - *weaponTierBonus* — best active weapon deposit: Copper +2, Iron +4, Fire Glass +6 (only the best applies). See [Economy](Economy-and-Resources.md#deposit-bonuses).
- **hpFactor** — `healthFactor` of the attacker, [0.55, 1.0].
- **orderFactor** — on ADVANCE: Cavalry **×1.5**, everyone else **×1.25**; HOLD/WITHDRAW **×1.0**.
- **matchupFactor** — the [unit/armor counters](Units.md#2-unit-matchups) (the rock-paper-scissors triangle), summed additively into one factor (e.g. Heavy Infantry vs Cavalry +0.35; a siege unit pinned in melee −0.80).
- **terrainFactor** — [terrain × unit-type offense modifiers](Map-Terrain-Movement.md#2-terrain).
- **fireFactor** — Fire Mana deposit bonus (+10% per mine, max +30%).
- **moraleFactor** — the attacker's [morale-band damage multiplier](Morale.md#1-morale-bands--combat-effects).
- **battlePaceFactor** — **×1.25 if *either* side is on ADVANCE**, applied to *both* combatants (speeds up the whole exchange). This is separate from the per-unit ADVANCE `orderFactor`.
- **randomness** — `damageVariance`, ±10%.

#### Mitigation chain (additive, then clamped)
```
mitigation = clamp( base + terrainBonus + matchupBonus + earthBonus + moraleBonus, 0, 0.65 )
```
- **base** (defender's effective stance): **HOLD 0.22, WITHDRAW 0.16, ADVANCE 0.04**.
- **terrainBonus** — e.g. FOREST +0.06 (not cavalry), SNOW_FOREST +0.08 on HOLD/WITHDRAW.
- **matchupBonus** — e.g. Heavy Infantry on HOLD +0.16, Crossbow on WITHDRAW +0.12, Heavy Infantry vs cavalry +0.20.
- **earthBonus** — Earth Mana HP/defense bonus (+10%/mine, max +30%).
- **moraleBonus** — the defender's [morale-band mitigation delta](Morale.md#1-morale-bands--combat-effects).
- **`MITIGATION_CAP = 0.65`** — a defender can never block more than **65%**; attacks always land.

### After damage each round (in order)
1. Both units `takeDamage`.
2. **Ranged XP:** a unit that dealt >0 damage *and* used ranged gets **+1 XP**.
3. **Morale drain:** each unit loses `ceil((damageTaken / maxHP) × 45)` morale.
4. **Advance penalty:** a unit on ADVANCE loses **2 morale**.

### Ending a battle (checked in this order)
1. **Elimination** — a unit died → the survivor wins (or mutual destruction).
2. **Withdraw** — both roll the [WITHDRAW chance](Stances.md#the-withdraw-roll); the battle ends only if **exactly one** succeeds (that unit is the loser).
3. **Rout** — morale **≤ 14**; if exactly one routed it's the loser; both routed = mutual destruction.

### Cleanup (`finishBattle`)
- Clear engaged flags; increment battles-fought.
- **XP:** winner +3 if the loser died, else winner +2 / loser +1 and the loser gets a **20-tick retreat cooldown**.
- **Extra morale hit:** a surviving WITHDRAW/ROUT loser loses **15** more morale.
- **Loser disposition:** if dead → removed. If alive → it tries to flee to a [retreat tile](#retreat-targeting); **if no valid tile exists, it is killed in place.**

### Retreat targeting
A fleeing unit looks for a tile, in priority order:
1. Two tiles back along its incoming direction (and diagonal variants).
2. A radius-2 ring around the battle, chosen to **maximize distance from the winner**.
3. Expanding rings (radius 3–6) sorted **toward home**.

A valid tile must exist, not be water/mountain, not be occupied, and not be the winner's tile. Friendly/neutral tiles are preferred; if none, any valid tile is taken. No tile ⇒ death.

---

## 2. City siege

Triggered when a unit steps onto an **enemy city** tile. Rounds resolve every **10 ticks (1s)**.

### City HP & walls
A city has **base 200 HP** and **base melee 12**. **Walls** add **+60 HP and +3 melee per level** (max level 5). The city heals **+5 HP every 50 ticks** while *not* besieged.

### Each round
1. **WITHDRAW** ends the siege immediately (the unit retreats; always succeeds).
2. **Unit → city damage:**
   ```
   wallMitigation = min(0.5, wallLevel × 0.06)          // capped at 0.5
   if ADVANCE: wallMitigation ×= 0.45                   // pressing the assault cuts wall cover
   siegeBonus = (Catapult/Trebuchet) ? 1.30 : 1.0
   damage = max(1, round( base × healthFactor × siegeBonus × (1 − wallMitigation) × variance ))
   ```
   (`base` = ranged or melee × veteran multiplier; ranged hit grants +1 XP.)
3. **City → unit counterattack:** `max(0, round( cityMelee × cityHealthFactor × variance ))`, plus the usual morale drain (and ADVANCE penalty).
4. **Outcome:** city HP ≤ 0 → **conquered**; unit dies → siege ends.

> City sieges apply the **veteran** multiplier but **not** the morale/matchup/terrain/mana offense factors (those are unit-vs-unit only).

### Conquest
- Ownership of the city (and its tile) transfers to the victor.
- **Every building drops one level** (level-1 buildings are destroyed); **City Hall is exempt**.
- The conqueror keeps **35% of max HP**.

### How many attackers do I need?
Mechanically, **one** unit can solo a city — it just has to grind the city's HP down while surviving the garrison's counterfire. Walls (up to 0.5 mitigation) and the garrison's melee are the limiters. **Siege units (×1.30)** and **ADVANCE (×0.45 wall cover)** speed it up. In practice a single unit often dies first, which is why the tutorial teaches bringing **several** units. **Ranged fire alone cannot conquer** — a unit must occupy the tile.

---

## 3. Territory battle

Triggered when a unit enters an **enemy-owned, non-city** tile while at war. Rounds every **10 ticks (1s)**. A territory has **base 30 HP** (more with [walls](Cities-Territory-Regions.md#territory-walls)).

### Each round
1. **WITHDRAW** disengages immediately; the territory regains **10 HP**.
2. **Unit → territory damage:**
   ```
   wallMit = (has Walls && order ≠ ADVANCE) ? 0.20 : 0     // ADVANCE bypasses territory walls
   damage = max(1, round( base × healthFactor × (1 − wallMit) × variance ))
   ```
3. **Territory → unit damage:** `max(0, round( territoryAttack × counterFactor × variance ))`, where ranged attackers take **15% less** counterfire (`counterFactor = 0.85`). Territory attack is 10 unwalled, or 14–29 with walls.
4. **Outcome:** territory HP ≤ 0 → **conquered**.

The territory heals **+5 HP every 50 ticks** while not under attack.

### Conquest
- The tile's controller becomes the victor; existing buildings are replaced by a **free Outpost**.
- Adjacent **unowned** water/mountain tiles are also claimed.
- Nearby friendly units gain morale (a [territory rally](Morale.md#3-sources-of-morale-gain)).

---

## 4. Ranged fire system

Stationary **ranged** units fire automatically at nearby enemies, independent of melee/siege rounds.

- **Cadence:** every **20 ticks (2s)** per unit.
- **Eligible:** a ranged unit (`range > 1 && ranged > 0`) that is alive and **not** already engaged in a melee/siege.
- **Targeting** (Manhattan distance ≤ range): a player-assigned **preferred target** if valid, otherwise the **closest enemy unit** (preferred over cities).
- **Damage:** `max(1, round( (ranged + weaponTierBonus) × healthFactor × fireFactor × variance ))`. Note this applies weapon-tier and Fire-Mana bonuses but **not** veteran, morale, matchup, or terrain.
- **vs Cavalry:** Cavalry takes only **50%** of this damage (`CAVALRY_RANGED_RESIST`) — it shrugs off fire as it charges, the basis of the Cavalry → Ranged matchup. Applies here only, never in melee battles.
- **vs a city:** chips HP but **never below 1** (can't conquer). If the firer is within 3 tiles, it takes counterfire and can die.
- **Side effect:** firing on a neutral nation auto-declares war.
- This system grants **no XP**.

---

## 5. Experience & veterancy recap

| Event | XP |
|---|---|
| Kill (foe dies) | 3 |
| Win (foe survives) | 2 |
| Loss (you survive) | 1 |
| Land a ranged hit (per round, in melee/siege/territory) | 1 |

Thresholds: **5 XP → Veteran (×1.1 damage)**, **15 XP → Elite (×1.2 damage)**. See [Units → Veterancy](Units.md#5-veterancy--experience).

---

## Edge cases worth remembering
- **Mitigation is additive then clamped to [0, 0.65]; offense is purely multiplicative.**
- **`battlePaceFactor` (×1.25)** applies to *both* sides the moment *either* picks ADVANCE in a unit battle — separate from the per-unit ADVANCE bonus.
- **Damage floors:** melee/siege/territory damage floors at **1 HP/round**; ranged-fire-vs-city floors at **1 HP remaining** (can't kill a city).
- **No retreat tile = death** for a unit-vs-unit loser.
- Unit battles use the **2-second** round; sieges/territory use the **1-second** round.

→ Continue to **[Stances](Stances.md)**
