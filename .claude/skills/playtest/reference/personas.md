# Personas & missions

Pick one persona per session and one primary mission. Missions are deliberately aimed at the areas most
likely to break: recently changed systems (`git log --oneline -15`), the **Open** items in `todo.md`,
and anything with saved/restored state.

---

## newcomer

**Who:** Has never played. Has not read the wiki and must not read it, or the source. Learns only from
what the game shows: menu, tooltips, HUD, modals, tutorial text, alerts.

**How:** Real clicks and keys only (no `issue`/`moveTo`). Starts from the menu (no `autostart`).
Narrate confusion honestly — "I don't know what X means" is data. Use `startTask`/`endTask` around
every goal.

**Missions:**
- Finish the tutorial (`mode=scenario scenario=tutorial`). Record every step where you were unsure what
  to do, and every step whose instructions didn't match what you saw.
- From the menu, start a 1v1 Easy game and figure out, without help: how to train a unit, build a
  Barracks, start research, and attack something.
- Win (or lose) a 1v1 Easy game. Note when you first understood how you win.

**Look for:** jargon without explanation, buttons that don't say why they're disabled, outcomes with
no feedback (did my unit die? why?), text that contradicts behaviour, controls you couldn't discover.

---

## strategist

**Who:** Knows the rules (has read `wiki/Overview.md`, `Units.md`, `Combat.md`, `Economy-and-Resources.md`).
Plays to win efficiently.

**How:** Mostly `moveTo`/`issue`; ~1 in 5 actions through the real UI. Set a `setProduction()` rotation
early and move armies with `orderWave()`. Budget `turns=250` for city-capture missions.

**What worked before (seed 3, medium):** territory Workshops first (RM is the early cap; ~8 by tick 1500),
Barracks in both cities, Hunting → The Wheel → Physics, Farms on every Outpost once RM is in surplus, a
Copper Mine for Catapults (Barracks 3). Stoneholt fell at tick ~8000 to Longbow chip damage + queued
Infantry. The capital held because the attack arrived piecemeal through a one-tile corridor — stage first.

**Missions:**
- Win 1v1 on Medium. Log the time to first contact, first war and first city capture, and where the game
  felt decided.
- Same seed twice: once an early rush, once economy-then-push. Which wins, and how fast? Is one
  strategy clearly dominant?
- 2–3 opponents on Hard: is there a point where the game is unwinnable/unlosable long before it ends
  (snowballing)? How long is the "mop-up" phase?

**Look for:** dominant strategies, useless units/buildings/techs (never worth it), AI that is
exploitable (e.g. ignores an undefended city), long stretches with no meaningful decision, game
ending abruptly or dragging on.

---

## rule-lawyer

**Who:** Reads the wiki page for a system, writes down exactly what it promises, then checks each claim
in play.

**How:** Pick one wiki page per session (`Combat.md`, `Morale.md`, `Stances.md`, `Diplomacy.md`,
`Economy-and-Resources.md`, `Production-and-Buildings.md`, `Research.md`, `Cities-Territory-Regions.md`).
Use `sandbox` mode where it helps set up a situation quickly. Verify via `state()`, `tile()`,
`eventLog()` and the in-game text.

**Missions:**
- For each numeric claim (cost, duration, damage, range, bonus) on the page, measure it in game.
- For each claim in the in-game tooltips/modals, check it matches both the wiki and behaviour.

**Look for:** rule ≠ wiki, rule ≠ tooltip, tooltip ≠ wiki. Say which one is probably wrong (or that it's
a design question). Check `wiki/Known-Quirks.md` first.

---

## chaos-monkey

**Who:** Tries to break things on purpose.

**How:** Mix of `issue` and real input. Small `advance` steps (10–30) around risky moments.
`saveAndReload()` often.

**Missions (pick 2–3):**
- Save/reload in the middle of: a unit battle, a city siege, a territory battle, a construction, a
  research, a production queue, a unit moving along a long path, and right after peace is signed.
- Make peace while your units are mid-battle/mid-siege; then try to attack again inside the cooldown.
- Ally/neutral interactions: walk units onto a neutral/allied unit's tile (`todo.md` lists an open
  allied-combat bug — try to reproduce it).
- Raze a city while it is producing; cancel production at queue index 0, last, and out of range.
- Issue commands that should fail (wrong owner's unit, insufficient resources, unresearched tech,
  queue full, non-adjacent path) and check the failure reasons are sensible and nothing changes.
- Spam the speed button, open/close every modal during combat, press ESC mid-click, resize the window
  below and back to 1280×720.
- Convert a scout to spy and walk it into enemy territory; get it detected.

**Look for:** invariant violations, runtime errors, stuck units, state differences after reload,
modals that leave the game in a bad state.

---

## annoyance-hunter

**Who:** An experienced player who hates friction.

**How:** Real clicks and keys only. Every goal wrapped in `startTask`/`endTask`. Starts from the menu.
Spend a few minutes with `holdTime(false)` at 1× to judge real-time pacing (then hold again).

**Missions:** Do each of these common tasks at least twice and record clicks/commands/failures:
1. Train a unit in a city. 2. Queue three units. 3. Build a city building. 4. Build a territory
building on a specific tile. 5. Start research and queue two more. 6. Move a unit across the map.
7. Paint a custom path. 8. Change a unit's stance mid-battle. 9. Declare war, then propose peace.
10. Save and load.

**Look for:** tasks that take more clicks than necessary, information you had to hunt for (e.g. costs
not shown where you choose), repeated confirmations, modals that close unexpectedly or can't be closed,
camera fights, alerts that vanish before you can read them, HUD elements that overlap at 1280×720.

---

## scenario-runner

**Who:** Checks that each authored scenario is completable and fair.

**How:** Mixed input. One scenario per session: `tutorial`, `evershadow-tribe`, `the-invaders`.

**Missions:**
- Play the scenario to its victory condition (or defeat). Check the stated goal matches the actual
  condition (e.g. survive N ticks vs eliminate all) and that victory triggers when it should.
- Check scripted cities/units/deposits are all on the map and on sensible terrain.

**Look for:** unwinnable states, victory not triggering (or triggering early), allies behaving as
enemies, scenario text that doesn't match the setup.
