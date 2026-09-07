# Reliability review — fixed vs. outstanding

Source: a full-codebase reliability review (Sept 2026). Items below marked
**Fixed** were addressed and covered by a new/updated test where the code path
is testable under Jest's `node` environment; items marked **Open** were not
touched in this pass.

## Fixed

- **Scenario maps booted at the wrong grid size.** `BootScene` sized the grid
  from `opponentCount` even in scenario mode, so authored 60×60 maps got
  crammed into a ~23×23 grid and most scripted cities/units landed outside it.
  Grid size is now taken from the scenario's own map when one is loaded.
  (`src/scenes/BootScene.ts`, `src/config/scenarios.test.ts`)
- **HUD pause fast-forwarded on resume.** Elapsed real time kept accumulating
  while paused; resuming drained the backlog as a burst of ticks. Simulation
  time no longer accumulates while `gameSpeed === 0`, and a cap bounds any
  future catch-up burst. (`src/scenes/GameScene.ts`, `src/config/constants.ts`)
- **Saving during a territory battle permanently locked the unit.** Battles
  and sieges were saved/restored; territory battles weren't, so the unit's
  `engagedInBattle` flag survived a reload with no battle object to release
  it. Added save/restore for territory battles, mirroring the siege system's
  pattern. (`src/systems/combat/TerritoryBattleSystem.ts`,
  `src/systems/tick/TickEngine.ts`, `src/ui/PhaserUIBridge.ts`,
  `src/scenes/GameScene.ts`, `src/types/gameSetup.ts`)
- **Freshly trained units could overwrite saved units.** The production
  unit-id counter was a module-level `let` that reset to 1000 on every page
  load instead of living in (and persisting with) `GameState`.
  `GameState.addUnit` also now defends the ownership index against an id
  collision instead of corrupting it. (`src/managers/GameState.ts`,
  `src/systems/production/ProductionSystem.ts`)
- **Peace didn't stop active combat, and auto-war could bypass the cooldown.**
  Signing peace changed relations and teleported units home but left
  battle/siege/territory-battle records running. `TickEngine` now force-ends
  all three on `diplomacy:peace-signed`. Combat-triggered auto-war also now
  respects the same cooldown as a manual declaration.
  (`src/systems/combat/BattleSystem.ts`, `CitySiegeSystem.ts`,
  `TerritoryBattleSystem.ts`, `src/systems/diplomacy/DiplomacySystem.ts`,
  `src/systems/tick/TickEngine.ts`)
- **Healing/loading damaged walled cities.** `City.heal()`/`setHealth()`
  clamped against the base 200 HP instead of the walls-adjusted max, so a
  walled city above 200 HP got knocked down on any heal pulse.
  (`src/entities/cities/City.ts`)
- **Production could silently lose a finished unit, or stall the queue.**
  A completed unit order with no free spawn tile was discarded outright
  instead of retried; cancelling the active order didn't promote the next
  queued one. `City.tickProduction()`/`completeCurrentOrder()` now separate
  "ready" from "actually applied", and `cancelOrder()` promotes the queue.
  (`src/entities/cities/City.ts`, `src/systems/production/ProductionSystem.ts`,
  `src/systems/combat/CitySiegeSystem.ts`)
- **Tutorial and allied-victory logic conflicted with victory detection.**
  `eliminate_all` required literally one nation left, which is never true in
  a scenario with allies (The Invaders); the tutorial's post-conquest steps
  were also being cut off by an unwanted victory modal. Victory now checks
  for no remaining *hostile* nation, and the tutorial's own scripted flow is
  exempted from auto win/loss. (`src/scenes/GameScene.ts`)
- **Stealth rules were inconsistently enforced.** A stranded spy on an enemy
  city could still trigger a siege; ranged fire could target/reveal an
  undercover spy; live overlays (path lines, health bars) used raw tile
  visibility instead of the spy-aware classification.
  (`src/systems/tick/TickEngine.ts`, `src/systems/combat/RangedFireSystem.ts`,
  `src/scenes/GameScene.ts`)
- **Mine bonuses overcounted.** One active mine of a type made every deposit
  of that type count toward "further advantage" scaling, mined or not.
  (`src/managers/GameState.ts`)
- **Silver/Gold mining was unreachable.** The build command's deposit check
  required an exact type match, so Copper/Iron Mine could never actually be
  built on a Silver/Gold tile even though the income logic already supported
  it. (`src/commands/CommandProcessor.ts`, `src/ui/modals/TerritoryMenuModal.ts`)
- **Sandbox UI disagreed with sandbox commands.** Build buttons kept enforcing
  normal tech/deposit/cost gates that `CommandProcessor` already bypasses in
  sandbox mode. (`src/ui/modals/CityMenuModal.ts`, `TerritoryMenuModal.ts`)
- **Easy AI could never produce its promised infantry.** Its only goal needed
  a Barracks, which needs Masonry, and it neither researched nor built
  either. (`src/systems/ai/profiles/NoobProfile.ts`,
  `src/systems/ai/goals/BuildBuildingGoal.ts`)
- **Global resize listeners leaked across scene restarts.** `GameScene` and
  `UIScene` both registered `this.scale.on('resize', ...)` with no matching
  `.off()` on shutdown — every return-to-menu-and-relaunch left another stale
  listener on the shared `ScaleManager`. (`src/scenes/GameScene.ts`,
  `src/scenes/UIScene.ts`)
- **Failed saves reported success; imports had no validation and could
  silently clobber the last slot.** `SaveSystem.save()` now returns whether
  the write actually succeeded; callers show a failure message instead of a
  false "saved". Save JSON (from a slot or an import) is now structurally
  validated and size-capped before use. Importing with every slot full now
  asks for confirmation before overwriting slot 10.
  (`src/systems/save/SaveSystem.ts`, `src/ui/modals/PauseModal.ts`,
  `src/ui/PhaserUIBridge.ts`, `src/scenes/UIScene.ts`)
- **Accessibility settings could throw on blocked storage.** `getFont`/
  `setFont`/etc. now fall back to defaults instead of throwing when
  `localStorage` is blocked. (`src/config/accessibility.ts`)
- **A move command with a non-adjacent waypoint teleported the unit.**
  `MovementSystem` bills each path entry as a single-tile step regardless of
  actual distance; `CommandProcessor` now rejects a path unless every step is
  adjacent to the previous one. Currently a self-cheat vector only (no
  multiplayer transport exists yet), but closing it now avoids relying on
  every future command producer to stay well-behaved.
  (`src/commands/CommandProcessor.ts`)
- **Preview server bound all interfaces despite the printed `localhost` URL.**
  (`runlocal.py`)
- **Deploy workflow published without running tests or lint.**
  (`.github/workflows/deploy.yml`)
- **`TESTING.md` described a long-resolved Vitest issue** and claimed tests
  weren't running, when the project has run on Jest (284 passing tests) for a
  while. Rewritten to describe the current setup and its real coverage gap
  (no browser/DOM tests).

## Open (not touched in this pass)

These were named in the review but are either larger design questions, need
infrastructure this repo doesn't have yet, or had no concrete repro to fix
against:

- **No browser/DOM test coverage at all** for `src/scenes/*` and `src/ui/**`
  (camera, selection, minimap, HUD, modals). Jest's `testEnvironment: 'node'`
  can't import `phaser`; closing this needs `jest-environment-jsdom` (not
  currently a dependency) or a real browser-driven smoke suite.
- **Whole-match determinism isn't verified end-to-end** — only isolated RNG
  and combat determinism are tested.
- **Allied units can still fight each other.** `BattleSystem.startBattle`
  only checks different-owner, not ally status, when a unit walks onto
  another unit's tile (unlike ranged fire and territory battles, which do
  check `isAlly`).
- **Resource-trading input validation** (arbitrary offer/request shapes from
  the UI) wasn't hardened.
- **Large main bundle** (~2.75 MB / ~657 KB gzip) — no code-splitting or
  profiling done.
- **CommandProcessor still trusts caller-supplied unit/city/tick ids** beyond
  the path-adjacency fix — a real concern only once a non-local network
  adapter exists.
