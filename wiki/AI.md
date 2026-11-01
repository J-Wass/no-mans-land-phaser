# Artificial Intelligence

[← Back to Home](README.md)

AI nations use a three-layer hierarchy: **Profile → (Strategy) → Goals**. Difficulty picks the profile; the profile (or its current strategy) produces candidate goals each evaluation; the controller keeps the feasible ones, sorts them by priority and executes the top few. The AI uses exactly the same `GameCommand`s and validation as the player.

---

## 1. Architecture

- **AISystem** (created by GameScene, ticked after every simulation tick):
  - Difficulty → profile: `easy` → Noob, `medium` → Basic, `hard` → Advanced; any other value → Basic. **`sandbox` creates no controllers** (AI fully passive — also used by the Tutorial).
  - One controller per AI nation existing at game start, with `phaseOffset = aiIndex × 7` (aiIndex = 0, 1, … in nation order).
  - Each tick, for each controller whose nation still exists, is AI-controlled and has a player id, builds an `AIContext {nationId, playerId, gameState, commandProcessor, movementSystem, pathfinder, currentTick}` and calls `controller.tick(ctx)` inside try/catch (errors are logged, not fatal).
- **AIController:**
  ```ts
  lastEvalTick = -(phaseOffset % max(1, interval))
  tick(ctx):
    if ctx.currentTick - lastEvalTick < interval: return
    lastEvalTick = ctx.currentTick
    goals = profile.generateGoals(ctx).filter(g => g.isFeasible(ctx))
                                      .sort((a, b) => b.priority(ctx) - a.priority(ctx))   // stable sort
    execute the first min(goals.length, maxGoalsPerCycle)
  ```
- **AIGoal** — stateless object with `id`, `priority(ctx)` (0–100), `isFeasible(ctx)`, `execute(ctx)`; regenerated every evaluation.
- **AIStrategy** — swappable goal generator (Advanced only) with `shouldSwitch` / `nextStrategy`.

AI controllers and strategies are not saved; a loaded game restarts them (Advanced starts again in Expansion).

---

## 2. Profiles

| | **Noob** (Easy) | **Basic** (Medium) | **Advanced** (Hard) |
|---|---|---|---|
| Evaluates every | 80 ticks | 30 ticks | 20 ticks |
| Goals executed per evaluation | 1 | 3 | 4 |
| Strategy layer | — | — | Expansion / Military / Defense |
| Attacks | never | from tick 1800, once 4 combat units are mustered | from tick 500 (Expansion) / 250 (Military) |
| Claims territory | never | yes | yes |
| Builds mines | never | never | yes |
| Researches | Masonry only | economy-first list | default list |

### Noob (Easy)
Goals each evaluation:
1. `BuildBuildingGoal([BARRACKS])` — only ever builds/upgrades the Barracks.
2. `ResearchTechGoal(['masonry'])` — only while Masonry isn't researched. (Its fallback can pick any researchable tech, but the goal disappears once Masonry is done.)
3. `ProduceUnitGoal([INFANTRY])` — only while it has fewer than **4 units** (all units, including the starting Scout).

With 1 goal per evaluation, it executes whichever is highest priority (production 20–75, research 40, building 35).

### Basic (Medium)
Builds up an Infantry/Longbowman army, then **swarms it at the nearest enemy as one wave** — never before tick 1800 (`BASIC_MIN_TICK_TO_ATTACK`; earlier attacks felt too aggressive in playtesting). "Combat units" below means every unit except Scouts.

Goals each evaluation:
1. `ProduceUnitGoal(types, floor)`:
   - `types` = `[LONGBOWMAN]` when Longbowmen are available (Hunting researched and some city at Barracks 2) and it has fewer Longbowmen than Infantry — it saves up for the Longbowman rather than falling back to Infantry; otherwise `[INFANTRY]`. `SCOUT` is appended only while it has fewer than **2 Scouts** (`BASIC_MAX_SCOUTS`; Scouts in training count). Scouts need no Raw Material, so uncapped they crowded out the real army.
   - `floor` = **45** while it has fewer than **6** combat units (production outranks city buildings at 35), else 0.
2. `ClaimTerritoryGoal(unitFilter, reserve)` — from tick 1800, only **Scouts** are sent out to claim (the army stays home to muster; any unit if it has no Scout). Outposts keep the reserve below in hand; until its first Barracks stands, they keep a Barracks' cost in hand instead (nothing trains without one).
3. `AttackTargetGoal(40, 1800, { unitFilter: combat units, minStrikeForce: 4 })` — waits for **4 idle combat units** (`BASIC_STRIKE_FORCE`), then sends them (up to 6) together. Scouts never join attacks.
4. `ResearchTechGoal(BASIC_ORDER)`.
5. `BuildBuildingGoal(PREFERRED, reserve)` — from tick **1200** ("war footing"), while it has fewer than 4 combat units, buildings may only spend Raw Material above **350** (one Longbowman's worth; reserve = `{RM: 350}`), otherwise none.
6. `BuildBuildingGoal([BARRACKS])` — only while Hunting is researched, it has a Barracks, and no city has Barracks 2 yet or is upgrading it: gets one city to Barracks 2 for Longbowmen ahead of the general build order.

`BASIC_ORDER = masonry, hunting, writing, trade, education, animal_domestication, iron_working, scientific_method, mathematics` (the goal falls back to any researchable tech when none of these is available).

In throwaway full-game simulations (1v1, seeds 3/7/11/21) the first wave of 4 (mixed Infantry/Longbowmen) launched between roughly tick 3300 and 6500 depending on the map's Raw Material income.

### Advanced (Hard)
Before generating goals, asks the current strategy `shouldSwitch(ctx)`; if true, replaces it with `nextStrategy(ctx)`. Starts in **Expansion**.

---

## 3. Goals

### ProduceUnitGoal(preferredTypes, priorityFloor = 0)
- **Priority:** `max(priorityFloor, 20, 75 − unitCount × 8)` (unitCount = all the nation's units).
- **Feasible / execute:** for each city of the nation (in order) that has **no current order**, for each preferred type in order: tech researched, required building level met, deposit requirements met, affordable → `START_CITY_PRODUCTION` there. One unit per execution.

### ClaimTerritoryGoal(unitFilter = any unit, reserve = {}) — priority 50
- **Phase 1:** if any of its units stands on an **unclaimed** non-water/non-mountain tile and the treasury covers an Outpost **plus `reserve`**, try `BUILD_TERRITORY OUTPOST` on each such tile (stops at the first success; the command requires adjacency to its land).
- **Phase 2:** otherwise collect unclaimed non-water/non-mountain tiles orthogonally adjacent to its land, score each:
  - +30 if it has a deposit,
  - terrain: Plains +5, Forest +4, Snow-Forest +4, Desert +3,
  - region bonus: if the tile is in a region the AI controls a fraction `0 < f < 0.66` of → `+round(f × 20)`,
  
  pick the best (first wins ties), and send the **first idle unit** (alive, not engaged, not moving, passing `unitFilter` — in unit order) that has a path to it there.
- Feasible if phase 1 applies (including affordability) or phase 2 finds a move.

### AttackTargetGoal(basePriority = 60, minTickToAttack = 0, { unitFilter = any unit, minStrikeForce = 1 })
- **Priority:** `basePriority`.
- **Attackers** = its idle units (alive, not engaged, not moving) passing `unitFilter`.
- **Feasible:** `currentTick ≥ minTickToAttack`; at least `minStrikeForce` attackers; a target exists; **not outmatched**: with `my` = total HP of its living units and `enemy` = total HP of all living units of nations it is **at war with**, it is outmatched when `enemy > 0 && my < enemy × 0.55`.
- **Target:** every non-allied city and unit (including neutral nations'), sorted by Manhattan distance from the AI's **first city** (or first unit if it has no city); take the closest.
- **Execute:** attackers sorted by distance to the target; for up to **6** of them, pathfind to the target tile, `MOVE_UNIT`, then `SET_UNIT_BATTLE_ORDER ADVANCE`.
  Because the target can belong to a neutral nation, attacking also starts wars via auto-war.

### ResearchTechGoal(priorityList = DEFAULT_ORDER) — priority 40
- Feasible when nothing is being researched and some tech can be picked.
- Pick the first tech in the list that can start **now** — prerequisites met **and** the treasury holds its RP cost; fallback: the first such tech in catalog order. If none qualifies the goal is infeasible (the evaluation slot goes to another goal). Execute `START_RESEARCH`.
- `DEFAULT_ORDER = masonry, hunting, writing, scientific_method, mathematics, chemistry, biology, physics, animal_domestication, iron_working, mechanization, trade, education, steel_working, ancient_rituals, mana_studies` (The Wheel is reached only via fallback).

### BuildBuildingGoal(allowedTypes = PREFERRED, reserve = {}) — priority 35
`PREFERRED = BARRACKS, FARMS, WORKSHOP, WALLS, MARKET, SCHOOL` (Watchtower never). "Affordable" means the treasury covers the cost **plus `reserve`**.
- **Pass 1 (new buildings):** for each city with no current order, the first allowed type it lacks whose tech is researched and cost affordable.
- **Pass 2 (upgrades):** for each city with no current order, the first allowed type it has below max level with an affordable upgrade cost.
- Execute `BUILD_CITY_BUILDING`.

### BuildTerritoryGoal — priority 45
Scans every tile the AI owns that has a deposit; picks the mine with the **highest priority** whose building isn't present or under construction there, whose tech is researched and cost affordable (row-major, first wins ties): Mana Mine 40 > Fire Glass 35 > Gold 32 > Iron 30 > Silver 25 > Copper 20. Executes `BUILD_TERRITORY`. (The scan is memoised per tick.)

### DefendPositionGoal(target, priority) — Defense strategy only
- Feasible if any idle unit exists. Execute: send **every** idle unit (sorted by distance) toward the threatened city tile and set it to **HOLD**.

---

## 4. Advanced strategies

### Expansion (start)
- Goals: `ClaimTerritoryGoal`, `BuildTerritoryGoal`, `ProduceUnitGoal([INFANTRY, SCOUT])`, `AttackTargetGoal(30, 500)`.
- Switch to **Military** when *under threat* (any non-allied unit within Manhattan 5 of any of its cities) **or** it owns ≥ 12 tiles.

### Military
- Goals: `AttackTargetGoal(70, 250)`, `ProduceUnitGoal([INFANTRY, CAVALRY, HEAVY_INFANTRY, CROSSBOWMAN, LONGBOWMAN])`, `ClaimTerritoryGoal`, `BuildBuildingGoal()`, `BuildTerritoryGoal`, `ResearchTechGoal()`.
- Switch to **Defense** if *outnumbered* (`ownUnits < 0.6 × max units of any single non-allied nation`) **and** a non-allied unit is within Manhattan 4 of one of its cities.
- Else revert to **Expansion** if it is at war with nobody **and** owns fewer than 12 tiles.

### Defense
- Goals: `ProduceUnitGoal([HEAVY_INFANTRY, INFANTRY, CROSSBOWMAN])`, `DefendPositionGoal(nearestThreatenedCity, 80)` (the own city with the closest non-allied unit, if any), `AttackTargetGoal(50)` (no time gate).
- Switch back to **Military** once no non-allied unit is within Manhattan 6 of any of its cities.

```
Expansion ──(threat ≤5 or ≥12 tiles)──► Military ──(outnumbered & threat ≤4)──► Defense
    ▲                                      │  ▲                                    │
    └──────(no wars & <12 tiles)───────────┘  └──────────(no threat ≤6)────────────┘
```

---

## 5. Other AI decisions
- **Peace:** an AI accepts a peace proposal unless its total unit HP exceeds the proposer's by more than 40%. It never proposes peace itself.
- **Trade:** see [Diplomacy → Trading](Diplomacy.md#ai-evaluation-evaluatetradeforai). The AI never offers trades.
- **War:** the AI never declares war explicitly; its wars come from auto-war when its units attack or shoot.
- **Allies:** never targeted.

---

## 6. Quick numbers

| Lever | Noob | Basic | Advanced |
|---|---|---|---|
| Think interval | 80 t | 30 t | 20 t |
| Goals / evaluation | 1 | 3 | 4 |
| Earliest attack | never | tick 1800 (3 min), with ≥ 4 idle combat units | tick 500 (Expansion), 250 (Military), any (Defense) |
| Unit mix | Infantry | Infantry + Longbowmen (1:1 once available), ≤ 2 Scouts | strategy lists |
| Attack priority | — | 40 | 30 / 70 / 50 |
| Outmatch threshold | — | own HP < 55% of at-war enemies' HP | same |
| Max units per attack order | — | 6 | 6 |
| Refuses peace if | its HP > 1.4 × yours | same | same |

→ Continue to **[Controls & UI](Controls-and-UI.md)**
