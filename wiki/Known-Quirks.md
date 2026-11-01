# Known Quirks, Inconsistencies & Dead Code

[← Back to Home](README.md)

The rest of the wiki describes what the code **does**. This page collects the places where that behaviour is surprising, where in-game text disagrees with the rules, and code that exists but isn't wired up. A faithful re-implementation should reproduce the behaviour; a cleanup pass could fix these deliberately.

---

## 1. Rules quirks

| # | Quirk | Where |
|---|---|---|
| 1 | **Allied units fight each other** if one moves onto the other's tile: `BattleSystem.startBattle` only checks for different owners. Allied **cities can be besieged** the same way. No war is declared (auto-war skips allies). The AI never targets allies, so this only happens through player moves. | BattleSystem, CitySiegeSystem, MovementSystem |
| 2 | **Combat during a peace cooldown happens without war.** Auto-war respects the 2-minute cooldown, but battles/sieges/ranged fire don't check relations, so the fight proceeds while the nations stay NEUTRAL. | DiplomacySystem |
| 3 | **Ranged units automatically shoot neutral nations' units and cities** in range, which declares war with no confirmation. | RangedFireSystem |
| 4 | **Upkeep is only charged when affordable** — a nation that can't pay a unit's whole upkeep simply doesn't pay it. There is no starvation or desertion. | ProductionSystem |
| 5 | **Territory walls never fire at range.** `Territory.getWallsRange()` is unused; walls only counter-attack the unit standing on the tile. | Territory |
| 6 | **Only one besieger per nation per city**, because friendly units can't share a tile, despite the tutorial's "multiple attackers will pressure it down". | MovementSystem |
| 7 | **Both units routing ends the battle with reason `MUTUAL_DESTRUCTION` but nobody dies** — both just disengage on the shared tile. | BattleSystem |
| 8 | A unit that steps onto an enemy already fighting someone else **shares the tile without fighting** and carries on with its path. | MovementSystem |
| 9 | **Queuing the same city building twice** charges the full build cost both times; the second completion acts as an upgrade (or is wasted at max level). | CommandProcessor, City |
| 10 | The **pathfinder's +12 "enemy" penalty** applies to every foreign tile, including allies and neutrals. | Pathfinder |
| 11 | The **War Confirm** dialog appears whenever a path crosses a neutral nation's land, even though walking through neutral land is legal and peaceful in the simulation. Confirming declares war; cancelling blocks the move. Drag-paths and click-moves are both checked; there's no way to path through neutral land without declaring war (other than ordering around it). | GameScene |
| 12 | The **diplomacy widget offers WAR against allies**, and it works (ALLY is overwritten by WAR). | UIScene |
| 13 | The **MOVE_UNIT validator accepts diagonal steps** (Chebyshev 1); only the pathfinder restricts movement to 4 directions. | CommandProcessor |
| 14 | `START_RESEARCH` from the AI silently fails when Research points are short; it retries next evaluation. The research queue never skips a blocked first entry. | AI, ProductionSystem |
| 15 | The Noob AI's 4-unit cap counts every unit, including its starting Scout. | NoobProfile |
| 16 | In sandbox, **units still require a Barracks** of the right level even though tech, deposit and cost checks are skipped. | CommandProcessor |

## 2. Presentation quirks

| # | Quirk | Where |
|---|---|---|
| 17 | `updateUnitAnimations` uses `return` (not `continue`) after setting a fighting unit's attack animation, so units later in the list don't get their animation updated that frame while any earlier unit is in combat. | GameScene |
| 18 | **Resource Breakdown counts cities that have a building, not its level** (a level-5 Farm shows as +2/s). | UIScene |
| 19 | The unit panel's "Armor:" field actually shows the **weapon tier** (Leather/Bronze/Iron/Steel/Fire Glass); "Steel" (Iron mine + Steel Working) has no gameplay effect beyond the Iron mine's +4. | UIScene |
| 20 | The City Menu shows **base unit build times**, not the Barracks-reduced time. | CityMenuModal |
| 21 | **Export** always exports the **first non-empty slot**; the menu's **LOAD SAVED GAME** loads the first non-empty slot (not the most recent). | PauseModal, MenuPage |
| 22 | Phaser reuses scene instances, so **GameScene/UIScene fields persist between games** in one page session: game speed, HUD notifications/alert history, the open resource-breakdown/alert panels, and UIScene's selected unit/city reference. | GameScene, UIScene |
| 23 | Scenario games use whatever difficulty was last selected on the Standard Match card (there is no per-scenario difficulty control), and the HUD shows that difficulty. | MenuPage |
| 24 | The Diplomacy modal's "PEACE (Ns)" cooldown label can't appear (peace cooldowns only exist after peace, when the nations aren't at war). Peace proposals from the modal give no feedback when refused (it just closes); the widget shows the reason as a toast. | DiplomacyModal |
| 25 | Trade steppers cap at the amounts both nations had when the modal was opened. | DiplomacyModal |
| 26 | Browser tab title is "Phaser Game". | index.html |
| 27 | **The map click after using most HUD buttons is ignored.** `makeButton` buttons, diplomacy-widget rows and the minimap emit `ui:click-consumed`, but Phaser captures the click in UIScene so GameScene never sees it; the flag survives and swallows the *next* map left-click. (Stance/SPY and resource buttons don't set it.) | UIScene, Minimap, GameScene |
| 28 | **Clicks on non-interactive HUD areas fall through to the map** (panel backgrounds and text, top-bar background, toasts): with a unit selected, clicking the unit panel's text orders a move to the tile hidden underneath. | UIScene |
| 29 | **ESC both closes a DOM modal and opens Pause**, and **ESC can't close Pause** (it closes, the scenes resume, then the same queued ESC reopens it). | modals, GameScene |
| 30 | The **city and territory info panels don't live-update**: production progress, "(Ns left)", HP and construction % are drawn when the HUD rebuilds (selection, notifications, resize…), not every tick. The unit panel's bars and text do update every frame, but its greyed-out ADVANCE button is only re-evaluated on a rebuild. | UIScene |
| 31 | Moving the pointer over an interactive HUD element pauses a right-drag pan or left-drag path (GameScene gets no pointer-move events there). **Releasing** a right-drag pan over one leaves GameScene's pan state stuck: a new right-drag won't start, and the next mouse release on the map is treated as the end of the old pan and ignored. | Phaser input + GameScene |

## 3. Text that disagrees with the rules

| Text | Says | Actually |
|---|---|---|
| Cavalry detail | `REQ COPPER` | any active Copper, Iron or Fire Glass mine |
| Heavy Infantry detail | `REQ IRON` | Iron **or** Fire Glass |
| Trebuchet detail | `REQ FIRE GLASS` | Iron **or** Fire Glass |
| Copper tooltip | "Enables Cavalry & Crossbowman." | also Catapult |
| Iron tooltip | "Enables Heavy Infantry, Catapult & Crossbowman." | also Cavalry and Trebuchet |
| Fire Glass tooltip | "Enables Trebuchet & Crossbowman." | enables every metal-gated unit |
| Territory Watchtower perk | "2-tile radius" | radius 3 |
| Territory Walls perk | "higher levels also extend attack range" | range is unused |
| WITHDRAW tooltip | "moves away from enemies when threatened" | only acts inside combat |
| Sandbox card | "Adjust AI level and paint terrain mid-game using the left toolbar." | the toolbar was removed; sandbox AI is always off |
| Tutorial step 5 | "press ▲ UP" | the City Menu button reads UPGRADE (▲ UP is the Territory Menu's label) |
| Tutorial steps 10–11 | Research/Diplomacy "from the bottom bar" | RESEARCH is on the top bar; diplomacy is the bottom-right widget |
| Tutorial step 8 | "queue 2 more units" | completes after any one production order |
| Tutorial step 1 | "the glowing tile" | the highlight is a pulsing cyan outline |

## 4. Dead / vestigial code

- `src/utils/rexUiHelpers.ts` (rexUI widget helpers) and most of `config/uiTheme.ts` — unused; the rexUI plugin is still registered.
- `WATER_BORDER = 0` in GameScene (water border drawing is a no-op).
- `rest` animation, `Unit.canMove/canAttack/markAttacked/resetTurn`, `hasMovedThisTurn/hasAttackedThisTurn`, `GameState.currentTurn/activeNationId/nextTurn()` — remnants of a turn-based design.
- `preferredTargetId` — ranged fire honours it, but no UI sets it.
- `ResourceOrder` (city "resource projects") — supported by ProductionSystem, never created.
- `MovementSystem.tick` (non-battle variant) — unused; `tickWithBattles` is the real one.
- `Territory.getWallsRange`, `WALLS_HP_BONUS` / `WALLS_ATTACK_DAMAGE` aliases.
- `uiScale.ts` comment references rexUI modal helpers that no longer render anything.

→ Continue to **[Constants & Glossary](Constants-and-Glossary.md)**
