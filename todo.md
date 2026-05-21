# No Man's Land — Todo

## [CRITICAL] Win / Loss Condition

- [x] Subscribe to `nation:defeated` event in GameScene or UIScene
- [x] Detect when the player's own nation is defeated → show defeat screen
- [x] Detect when only one nation remains (or all enemies defeated) → show victory screen
- [x] Build a victory/defeat modal (HTML overlay via UIManager)
  - [x] Display total game time (ticks → minutes:seconds)
  - [x] Show surviving nations and final territory counts
  - [x] "Return to Menu" button that tears down GameScene and returns to MenuScene
- [x] Wire `checkDefeatedNations()` result back to GameScene so the scenario can end mid-session

---

## [HIGH — BUG] `isOutmatched` counts neutral nations

`AttackTargetGoal.ts` sums enemy HP across all non-allied nations, including neutrals the AI has never fought.

- [x] In `isOutmatched()`, change the nation filter from `!nation.isAlly()` to `nation.isAtWar(aiNationId)` (or the equivalent diplomacy check)
- [x] Verify that the strength ratio is still computed correctly after the filter change

---

## [HIGH] AI never sets battle orders on dispatched units

When the AI sends a unit to attack or defend, no `SET_UNIT_BATTLE_ORDER` command is dispatched, so the unit defaults to HOLD in every battle.

- [x] In `AttackTargetGoal.execute()`, dispatch `SET_UNIT_BATTLE_ORDER` with `ADVANCE` immediately after the MOVE_UNIT command
- [x] In `DefendPositionGoal.execute()` (DefenseStrategy), dispatch `SET_UNIT_BATTLE_ORDER` with `HOLD` for defenders and `ADVANCE` for counter-attackers
- [x] Ensure the battle order command is sent even if the unit is already at the target tile (already in battle)

---

## [HIGH] AI army coordination — only first unit is dispatched

`AttackTargetGoal.execute()` finds a target and then sends **only the first unit** that can pathfind there. All other idle units sit still.

- [x] Refactor `execute()` to iterate over all idle units belonging to the AI nation
- [x] For each idle unit that has a valid path to the target, dispatch a MOVE_UNIT command
- [x] Add a rough army-size cap or priority queue so the AI doesn't strip every tile simultaneously
- [x] Similarly fix `DefendPositionGoal.execute()` to send all available defenders, not just the first

---

## [MEDIUM] BasicProfile (medium difficulty) is artificially capped

`BasicProfile.generateGoals()` returns only `ProduceUnitGoal` + `ClaimTerritoryGoal` + `AttackTargetGoal` with a comment "No research, no buildings." Medium AI never researches or builds.

- [x] Add `ResearchTechGoal` to BasicProfile's goal list
- [x] Add `BuildBuildingGoal` to BasicProfile's goal list
- [x] Bump `maxGoalsPerCycle` from 2 to 3 so research/building don't crowd out combat
- [x] Optionally give BasicProfile a simplified fixed research order (e.g. just masonry → education) instead of the full AdvancedProfile list

---

## [MEDIUM] ClaimTerritoryGoal picks expansion tiles at random

`findExpansionMove()` returns a random candidate from all unclaimed adjacent tiles with no scoring.

- [x] Score each candidate tile; prefer:
  - [x] Tiles with resource deposits (mine sites, food terrain)
  - [x] Tiles that would complete or extend a region the AI already partially controls (region bonus threshold)
  - [ ] Tiles adjacent to enemy or contested territory (deny expansion)
- [x] Return the highest-scoring candidate instead of a random one
- [x] Fall back to random only when all candidates score equally (no information)

---

## [MEDIUM] AI never builds territory mines

No AI goal covers `BUILD_TERRITORY_BUILDING` for deposit tiles. AI nations never exploit copper, iron, fire-glass, or mana deposits.

- [x] Create a new `BuildTerritoryGoal` class in `src/systems/ai/goals/`
  - [x] Find all controlled territory tiles owned by the AI nation that have a deposit but no mine
  - [x] Check affordability and tech prerequisites before returning feasible
  - [x] Dispatch `BUILD_TERRITORY_BUILDING` for the highest-value unclaimed deposit
- [x] Add `BuildTerritoryGoal` to `MilitaryStrategy` and `AdvancedProfile` goal lists
- [x] Optionally add a lower-priority version to `BasicProfile` once that profile is un-capped

---

## [MEDIUM] Watchtower buildings do nothing

Both `CityBuildingType.WATCHTOWER` and `TerritoryBuildingType.WATCHTOWER` claim to extend vision, but `VisionSystem.compute()` only reads unit vision radii and air-mana bonus — it never checks buildings.

- [ ] Define a vision radius constant for city watchtower (e.g. +2 tiles from the city tile)
- [ ] Define a vision radius constant for territory watchtower (e.g. +2 tiles from that territory)
- [ ] In `VisionSystem.compute()`, after the unit loop, iterate over all city buildings:
  - [ ] For each city with `WATCHTOWER`, add a vision circle centred on the city tile
- [ ] In `VisionSystem.compute()`, iterate over all territory buildings:
  - [ ] For each territory with `WATCHTOWER`, add a vision circle centred on that territory tile
- [ ] Scope the vision to the owning nation only (same as unit vision)
- [ ] Write a test confirming watchtower tiles become visible without a unit present

---

## [MEDIUM] Ghost tech effects (techs that describe features that don't exist)

### kinematics — "Improves siege weapon accuracy"
- [ ] Decide: implement a range or accuracy bonus for siege units, or change the description to something real
- [ ] If implementing: add an accuracy multiplier in `BattleSystem.calculateDamage()` when the attacker is a siege unit and the owning nation has `kinematics`

### physics — "Unlocks Castle"
- [ ] Decide: add `CASTLE = 'CASTLE'` to `CityBuildingType` with stats, or update the description
- [ ] If adding Castle: define catalog entry, add to production commands, add rendering in GameScene

### the_elements — "Unlocks Seer Tower"
- [ ] Decide: add `SEER_TOWER = 'SEER_TOWER'` to `TerritoryBuildingType` with vision effect, or update the description
- [ ] If adding Seer Tower: define catalog entry, wire into VisionSystem alongside Watchtower

### masonry description — references "Fort"
- [ ] Remove "Fort" from masonry's description string in `TechTree.ts` (no Fort building exists)

---

## [MEDIUM] Scenario system has no win conditions

Scenarios end only when all enemies are eliminated, same as skirmish. The `ScenarioDefinition` type has no `victoryCondition` field.

- [ ] Add a `victoryCondition` field to `ScenarioDefinition` in `src/config/scenarios.ts`:
  - [ ] Types: `'eliminate_all'` (default), `'hold_city'`, `'capture_city'`, `'survive_ticks'`
- [ ] In `TickEngine` or a new `VictorySystem`, evaluate the active scenario's condition each tick
- [ ] Emit a `game:victory` or `game:defeat` event when the condition is met
- [ ] Hook those events into the win/loss modal built under the [CRITICAL] item above
- [ ] Update the two existing scenarios (`scenarios.json`) with explicit `victoryCondition` values

---

## [LOW] `ScenarioUnitDef` only allows INFANTRY and SCOUT

The type annotation `'INFANTRY' | 'SCOUT'` prevents scenarios from placing cavalry, archers, or siege units.

- [ ] Widen `ScenarioUnitDef.unitType` to accept all values of `UnitType`
- [ ] Update existing scenario JSON if any new unit types are placed

---

## [LOW] DefenseStrategy transition is one-way

Once `AdvancedProfile` switches to `MilitaryStrategy` or `DefenseStrategy`, it never returns to `ExpansionStrategy`, even if the threat is gone and the AI has little territory.

- [ ] Add a re-evaluation step at the end of each strategy's `generateGoals()`:
  - [ ] If `DefenseStrategy` and no nearby enemies and army is not outnumbered → switch back to `MilitaryStrategy`
  - [ ] If `MilitaryStrategy` and territory is low and no active wars → switch back to `ExpansionStrategy`
