# Combat

[← Back to Home](README.md)

Combat is **automatic and continuous**. There is no attack command: a unit fights by moving into an enemy unit, an enemy city, or enemy territory, and ranged units fire on their own at anything hostile in range. There are four combat systems sharing a few helper formulas:

| System | Trigger | Round length |
|---|---|---|
| Unit-vs-unit **battle** | Moving onto another nation's unit | 20 ticks (2 s) |
| City **siege** | Moving onto (or standing on) another nation's city | 10 ticks (1 s) |
| **Territory battle** | Moving onto another nation's non-city tile while at war with it | 10 ticks (1 s) |
| **Ranged fire** | A free ranged unit with a hostile target in range | every 20 ticks per unit |

> Related: [Stances](Stances.md) · [Morale](Morale.md) · [Units & matchups](Units.md#2-unit-matchups--the-rock-paper-scissors-triangle) · [Terrain](Map-Terrain-Movement.md#2-terrain)

---

## Shared helpers (`config/combatBalance.ts`)

```ts
healthFactor(cur, max)   = 0.55 + 0.45 × (max > 0 ? cur/max : 0)     // [0.55, 1.0]
damageVariance(rand)     = 0.9 + rand × 0.2                           // [0.9, 1.1), rand from the game RNG
veteranDamageMultiplier  = [1.0, 1.1, 1.2][clamp(level, 0, 2)]
applyCombatMoraleHit(unit, dmg): if dmg > 0: morale -= ceil(dmg / maxHP × 45)
applyAdvancePenalty(unit):       morale -= 2
effectiveBattleOrder(unit):      see Stances
```

---

## 1. Unit-vs-unit battle

*System: `BattleSystem`.*

### Starting
`startBattle(attacker, defender, attackerOrigin, position)` returns `null` (no battle) if either unit is dead, they share an owner, either is already engaged, or either has `retreatCooldownUntilTick > currentTick`. Whether a battle may start at all is decided earlier, by the **engagement policy** (see [Diplomacy → Going to war](Diplomacy.md#2-going-to-war)): the mover only fights a unit of a nation it is at war with, or of a neutral nation when war could be declared (which then happens automatically). Allies, and neutrals inside a peace cooldown, just share the tile.

On success: id `battle-{N}`; record `attackerOrigin` (the tile the attacker stepped from) and `defenderOrigin` (the defender's tile = the battle tile); `ticksUntilRound = 20`; both units marked engaged; both units' movement orders cancelled; emit `battle:started`.

### Each tick, per battle
1. If either unit no longer exists → finish with no winner (`MUTUAL_DESTRUCTION`).
2. If either is dead → finish (`ELIMINATION` if one survives, else `MUTUAL_DESTRUCTION`).
3. `ticksUntilRound--`; when it hits 0, reset to 20, `roundsElapsed++` and resolve a round:

```
terrain  = terrain of the battle tile
orderA   = effectiveBattleOrder(A);  orderB = effectiveBattleOrder(B)
pace     = (orderA == ADVANCE || orderB == ADVANCE) ? 1.25 : 1
dmgToA   = calculateDamage(attacker=B, defender=A)      // computed first (consumes 1 RNG draw)
dmgToB   = calculateDamage(attacker=A, defender=B)      // consumes 1 RNG draw
A.takeDamage(dmgToA); B.takeDamage(dmgToB)
if dmgToB > 0 and A used its ranged attack: A +1 XP   (same for B)
moraleHit(A, dmgToA); moraleHit(B, dmgToB)
if orderA == ADVANCE: A −2 morale;  if orderB == ADVANCE: B −2 morale
emit battle:round-resolved
then check, in order: death → withdraw → rout
```

#### Damage
```
damage = max(1, round(offense × (1 − mitigation)))
```

#### Offense (multiplicative)
```
useRanged = range > 1 && rangedDamage > 0 && attackerOrder != ADVANCE
rawBase   = useRanged ? max(rangedDamage, meleeDamage × 0.7) : meleeDamage
base      = (rawBase + weaponTierBonus(attacker nation)) × veteranMultiplier
offense   = base × healthFactor(attacker)
               × orderFactor          // ADVANCE: Cavalry 1.5, others 1.25; else 1
               × matchupFactor        // Units → matchups table
               × terrainFactor        // Map → terrain offense table
               × fireManaFactor       // 1 + 0.10 × min(3, fire mines)
               × moraleDamageMult     // attacker's morale band
               × pace
               × damageVariance(rng())
```
`weaponTierBonus`: +6 with any active Fire Glass mine, else +4 with Iron, else +2 with Copper, else 0.

#### Mitigation (additive, clamped to [0, 0.65])
```
mitigation = clamp( stanceBase(defenderOrder)        // HOLD 0.22, WITHDRAW 0.16, ADVANCE 0.04
                  + terrainMitigation               // forest/snow/plains rules
                  + matchupMitigation               // HI shield wall, crossbow kiting, siege −0.08, HI vs cav
                  + 0.10 × min(3, earth mines)      // Earth Mana
                  + moraleMitigationDelta,          // defender's morale band
                  0, 0.65 )
```
The **attacker's own** effective order drives its offense; the **defender's own** effective order drives its mitigation. `MITIGATION_CAP = 0.65` guarantees at least 35% of offense lands, and the `max(1, …)` floor guarantees at least 1 HP per round.

#### Ending conditions (after damage)
1. **Death:** a unit at 0 HP → `ELIMINATION` (survivor wins) or `MUTUAL_DESTRUCTION` (both dead).
2. **Withdraw:** each unit whose effective order is WITHDRAW rolls (A first, then B); see [the WITHDRAW roll](Stances.md#the-withdraw-roll). The battle ends only if **exactly one** succeeds — that unit is the *loser* (reason `WITHDRAW`).
3. **Rout:** a unit with morale ≤ 14. Exactly one routed → it loses (`ROUT`). **Both routed → `MUTUAL_ROUT`:** no winner or loser, nobody dies, both units disengage where they stand.

#### Finishing (`finishBattle`)
1. Clear both engaged flags, `battlesEngaged++` on both, cancel both movement orders.
2. XP (only if the winner is alive): loser dead → winner +3; loser alive → winner +2, loser +1, and the loser gets `retreatCooldownUntilTick = tick + 20`.
3. A surviving loser of `WITHDRAW`/`ROUT` loses **15 morale** (`morale:lost`, source `battle-lost`).
4. Loser dead → removed, `unit:destroyed` (killer = winner). Loser alive → moved to a [retreat tile](#retreat-targeting) (`unit:step-complete` + `unit:withdrew`); **no retreat tile → the loser is destroyed in place**.
5. If the winner is somehow dead it is removed too.
6. Delete the battle and emit `battle:ended {winnerUnitId, loserUnitId, reason}`. ([MoraleSystem](Morale.md) reacts: +20 to the winner on ELIMINATION/WITHDRAW, post-battle recovery cooldown for the loser.)

After a battle the winner stays where it was. If that tile is an enemy city, the stranded-unit check that runs right after battles in the same tick starts a siege there.

### Retreat targeting
Candidates are tried in order; a tile is **valid** if it exists, is not water or mountain, holds no unit other than the two combatants, and is not the winner's tile. The first valid tile that is unowned or owned by the loser's nation is chosen; failing that, the first valid tile of any owner.

1. Directional: with `dr = sign(origin.row − battle.row)`, `dc = sign(origin.col − battle.col)` (origin = the loser's origin tile), if not both zero: `(+2dr, +2dc)`, `(+2dr, 0)`, `(0, +2dc)`, `(+2dr, +dc)`, `(+dr, +2dc)` relative to the battle tile.
2. Ring: `(±2, 0)`, `(0, ±2)`, `(±1, ±1)` — sorted by Manhattan distance from the winner, farthest first.
3. Every tile on the Chebyshev rings of radius 3, 4, 5, 6 around the battle, sorted by Manhattan distance to the loser's origin, nearest first.

Retreats teleport the unit (no walking).

### Peace
`endBattlesBetweenNations` deletes any battle between two nations that just signed peace: engaged flags cleared, no XP or morale changes, `battle:ended` with reason `PEACE`.

### RNG draw order
Per resolved round: offense variance for B→A, then A→B; then, only for units whose effective order is WITHDRAW, one withdraw roll each (A then B). Battles resolve in creation order.

---

## 2. City siege

*System: `CitySiegeSystem`.*

### Start
When a unit enters a tile holding a city owned by another nation that the engagement policy lets it attack (at war, or neutral with no peace cooldown — never an ally), or a non-spy unit is left standing on such a tile (same policy). `startSiege` fails if the unit or city is dead or the unit is already engaged. The unit's remaining path is **paused** (saved as `pendingPath`), the unit is marked engaged, id `siege-{N}`, `ticksUntilRound = 10`, emit `city:siege-started`.

Each siege is one unit vs one city. Because a nation's units can't share a tile, **a nation can have only one besieger on a city at a time**; its other units wait on the path (retrying each tick) or soften the city with ranged fire, which can't take it below 1 HP. Units of different nations can besiege the same city simultaneously.

### City stats
- `maxHP = 200 + 60 × wallLevel`, `melee = 12 + 3 × wallLevel` (walls max level 5 → 500 HP, 27 melee).
- **Regen:** on ticks divisible by 50, every city that is not under any siege and is below max heals **+5 HP**.

### Each round (every 10 ticks)
1. Effective order **WITHDRAW** → the siege ends and the unit always retreats (below).
2. **Unit → city:**
   ```
   useRanged = range > 1 && ranged > 0 && order != ADVANCE
   base      = (useRanged ? rangedDamage : meleeDamage) × veteranMultiplier      // no weapon-tier, mana, morale, matchup or terrain
   wallMit   = min(0.5, wallLevel × 0.06);  if order == ADVANCE: wallMit × 0.45
   siegeBonus = Catapult/Trebuchet ? 1.30 : 1.0
   dmgToCity = max(1, round(base × healthFactor(unit) × siegeBonus × (1 − wallMit) × variance))
   ranged attack → +1 XP
   ```
3. **City → unit:** `dmgToUnit = max(0, round(cityMelee × healthFactor(city) × variance))` (city health factor uses HP before this round's damage).
4. Apply both, morale hit on the unit, −2 morale if ADVANCE, emit `city:siege-round` (MoraleSystem gives +1 morale if the city took damage and the unit took none — only possible if the counter-attack rounds to 0).
5. City HP 0 → **conquered**. Else unit dead → removed (`unit:destroyed`, no killer) and the siege ends.

RNG: two draws per round (unit→city, then city→unit).

### Retreat (WITHDRAW)
Candidates: the attacker's origin tile, then every tile on Chebyshev rings 1–5 around the city, all sorted by Manhattan distance to the origin. Valid = exists, not water/mountain, no other unit. Prefer unowned or own territory, else any valid. No valid tile → the unit stays put (it is still released from the siege).

### Conquest
- Ownership of the city and its tile transfers to the attacker's nation.
- The city's production queue is cleared and its current order cancelled (no refund).
- **Every non-City-Hall building loses one level** (level-1 buildings are removed); razing and any pending level removal are cancelled.
- City HP is set to `ceil(maxHP × 0.35)` (maxHP after the wall downgrade).
- Events: `city:conquered {byUnitId, byNationId, fromNationId}`, `territory:claimed` (no `fromNationId`), `city:buildings-changed`.
- The conquering unit stays on the city tile and **resumes its paused path** (or emits `unit:move-complete` if it had none).
- Morale: conqueror +25, nearby friendlies +10, and **every unit of the previous owner −10** ([Morale](Morale.md)).

**One unit can take a city**; walls, the garrison's melee, and the unit's HP are the limits. Siege weapons (×1.30) and ADVANCE (wall cover × 0.45) speed it up. Ranged fire alone can never take a city.

---

## 3. Territory battle

*System: `TerritoryBattleSystem`.*

### Start
A unit enters a tile owned by another nation, without a city, **and its nation is at WAR with that owner**. Only **one territory battle per tile** at a time (another nation's unit arriving later just shares the tile and continues its path). The unit's path is paused into `pendingPath`; id `tbattle-{N}`; `ticksUntilRound = 10`; emit `territory:conquest-started {needed: maxHP}`.

### Territory stats
- `maxHP = 30 + 50 × wallLevel` (walls max 5 → 280).
- Counter-attack damage: **10** without walls; with walls `14 + 5 × (level − 1)` → 14 / 19 / 24 / 29 / 34.
- **Regen:** on ticks divisible by 50, every **owned** tile not under a territory battle and below max heals **+5**.

### Each round (every 10 ticks)
1. Effective order **WITHDRAW** → disengage: the tile heals **+10 HP**, the unit retreats (same candidate logic as sieges), emit `territory:conquest-cancelled`.
2. **Unit → territory:**
   ```
   base   = (useRanged ? rangedDamage : meleeDamage) × veteranMultiplier
   wallMit = (tile has Walls && order != ADVANCE) ? 0.20 : 0           // ADVANCE ignores walls
   dmg    = max(1, round(base × healthFactor(unit) × (1 − wallMit) × variance))
   ranged attack → +1 XP
   ```
3. **Territory → unit:** `max(0, round(attackDamage × (useRanged ? 0.85 : 1.0) × variance))`.
4. Apply, morale hit, −2 if ADVANCE, emit `territory:conquest-progress {progress: maxHP − HP, needed: maxHP}`.
5. HP ≤ 0 → **conquered**; unit dead → removed and `territory:conquest-cancelled`.

### Conquest
- The tile's owner becomes the attacker's nation and **all its buildings are replaced by a single free Outpost** (HP resets to 30).
- Emits `territory:claimed {fromNationId}` → nearby units of the conqueror gain +6 morale.
- Every **unowned** water/mountain tile orthogonally adjacent is claimed too.
- The unit resumes its paused path.

> The `Territory.getWallsRange()` helper (2 tiles at wall level ≥ 2, 3 at ≥ 4) exists but is **not used by any system** — territory walls only hit the unit standing on the tile.

---

## 4. Ranged fire system

*System: `RangedFireSystem`.*

Every tick, for every unit (in insertion order) that is ranged, alive, **not engaged** in a battle/siege/territory battle, and whose cooldown has expired (`currentTick ≥ nextFireTick`, default 0):

1. **Target** (Manhattan distance ≤ attackRange):
   - The unit's `preferredTargetId` if it is alive, not a spy, not allied, and in range (otherwise the preference is cleared). No current UI sets a preference.
   - Else the **closest** living, non-spy unit of a nation the shooter is **at war with** (first found wins ties). Units already fighting someone else can be targeted.
   - Else the closest **city** of a nation it is at war with.
   - Automatic fire therefore never starts a war. A preferred target may belong to a neutral nation if the engagement policy allows it (no peace cooldown); firing on it then auto-declares war.
2. **Damage:** `raw = max(1, round((rangedDamage + weaponTierBonus) × healthFactor(shooter) × fireManaFactor × variance))` — no veterancy, morale, matchup or terrain.
3. **vs unit:** Cavalry takes `max(1, round(raw × 0.5))`; others take `raw`. Apply the morale hit. If it dies → removed, `unit:destroyed` with the shooter as killer.
4. **vs city:** `city HP = max(1, HP − raw)` — ranged fire can never reduce a city below 1 HP. If the shooter is within Manhattan 3 (always true for ranged units) it takes counterfire `max(1, round(cityMelee × healthFactor(city)))` (no variance) plus the morale hit, and may die.
5. Emit `ranged:fired` (→ [DiplomacySystem](Diplomacy.md) auto-declares war if the target's nation was neutral — only possible for a preferred target). Set `nextFireTick = currentTick + 20`.

No XP is granted by standalone fire. Cooldowns aren't saved.

---

## 5. Experience recap

| Event | XP |
|---|---|
| Win a unit battle, loser died | 3 |
| Win a unit battle, loser survived | 2 (loser gets 1) |
| Land ranged damage in a battle/siege/territory round | 1 |

Veteran (5 XP) ×1.1 damage, Elite (15 XP) ×1.2. See [Units → Veterancy](Units.md#5-veterancy--experience).

---

## Edge cases
- Mitigation is additive then clamped to [0, 0.65]; offense is purely multiplicative.
- `pace` (×1.25) affects both sides once either effective order is ADVANCE, separately from the attacker's own ADVANCE bonus.
- Damage floors: battle/siege/territory hits floor at 1; counter-attacks from cities and territories can roll 0.
- A losing unit with nowhere to retreat dies.
- Sieges and territory battles ignore morale bands, matchups, terrain, weapon tier and mana; they only apply veterancy and the health factor.
- Allied units never fight or besiege each other; they share tiles peacefully.

→ Continue to **[Stances](Stances.md)**
