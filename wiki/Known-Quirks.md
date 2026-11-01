# Known Quirks, Design Gaps & Dead Code

[← Back to Home](README.md)

The rest of the wiki describes what the code **does**. This page collects behaviour that is surprising or looks unfinished, plus code that exists but isn't wired up. These are open design questions rather than bugs: a faithful re-implementation should reproduce them, and changing them is a design decision.

---

## 1. Rules

| # | Behaviour | Where |
|---|---|---|
| 1 | **Upkeep is only charged when affordable.** A nation that can't pay a unit's whole upkeep simply doesn't pay it; there is no starvation, desertion or debt. | ProductionSystem |
| 2 | **Territory walls never fire at range.** `Territory.getWallsRange()` (2 tiles at level ≥ 2, 3 at ≥ 4) is unused; walls only counter-attack the unit standing on the tile. | Territory |
| 3 | **Only one besieger per nation per city**, because a nation's units can't share a tile. Extra units wait on the path and step in if the besieger falls (the tutorial text explains this). | MovementSystem |
| 4 | A unit that steps onto an enemy **already fighting someone else** shares the tile without fighting and carries on along its path. | MovementSystem |
| 5 | The **research queue never skips a blocked first entry**: if the first queued tech can't start (prerequisite or RP missing), later entries wait too. | ProductionSystem |
| 6 | The Easy AI's 4-unit cap counts every unit, including its starting Scout. | NoobProfile |
| 7 | In sandbox, **units still require a Barracks** of the right level even though tech, deposit and cost checks are skipped (the UI mirrors this). | CommandProcessor |

## 2. Presentation

| # | Behaviour | Where |
|---|---|---|
| 8 | Scenario games use whatever difficulty was last selected on the Standard Match card (there's no per-scenario difficulty control), and the HUD shows that difficulty. | MenuPage |
| 9 | The Diplomacy modal's "PEACE (Ns)" cooldown label can't appear (peace cooldowns only exist after peace, when the nations aren't at war). | DiplomacyModal |
| 10 | The weapon tier "Steel" (Iron mine + Steel Working) is a name only; its bonus is Iron's +4. | UIScene |

## 3. Dead / vestigial code

- `src/utils/rexUiHelpers.ts` (rexUI widget helpers) and most of `config/uiTheme.ts` — unused; the rexUI plugin is still registered.
- `WATER_BORDER = 0` in GameScene (water border drawing is a no-op).
- `rest` animation, `Unit.canMove/canAttack/markAttacked/resetTurn`, `hasMovedThisTurn/hasAttackedThisTurn`, `GameState.currentTurn/activeNationId/nextTurn()` — remnants of a turn-based design.
- `preferredTargetId` — ranged fire honours it (including firing on a neutral nation), but no UI sets it.
- `ResourceOrder` (city "resource projects") — supported by ProductionSystem, never created.
- `MovementSystem.tick` (non-battle variant) — used only by tests; `tickWithBattles` is the real one.
- `Territory.getWallsRange`, and the `WALLS_HP_BONUS` / `WALLS_ATTACK_DAMAGE` aliases.
- `uiScale.ts` comment references rexUI modal helpers that no longer render anything.

→ Continue to **[Constants & Glossary](Constants-and-Glossary.md)**
