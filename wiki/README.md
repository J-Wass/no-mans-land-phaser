# No Man's Land — Game Wiki

A grid-based, **real-time** (tick-driven) strategy game built in TypeScript + Phaser 3. You command a nation: grow an economy, research technology, raise an army, and conquer rival cities. Combat is resolved automatically over time using a deep stat model where **HP, morale, stance, terrain, unit matchups, veterancy, and magical deposits** all feed the same damage math.

This wiki documents every mechanic in the game, with the exact numbers pulled from the source.

> **Note on "ticks":** The simulation runs at `TICK_RATE = 10` ticks per second (`TICK_INTERVAL_MS = 100 ms`). Throughout this wiki, durations are given in ticks; divide by 10 for seconds. The in-game clock reads "Day N HH:00" where **100 ticks = 1 in-game day**.

---

## Contents

### Getting started
- **[Overview & Core Loop](Overview.md)** — what the game is, the turn/tick model, win conditions, game modes.
- **[Controls & UI](Controls-and-UI.md)** — mouse, camera, the HUD, panels, and how to do everything.
- **[Scenarios & Tutorial](Scenarios-and-Tutorial.md)** — the included scenarios and the step-by-step tutorial.

### The army
- **[Units](Units.md)** — full stat tables, costs, requirements, and unit roles.
- **[Combat](Combat.md)** — the complete damage formula, unit battles, sieges, territory battles, ranged fire, XP & veterancy.
- **[Stances](Stances.md)** — HOLD / ADVANCE / WITHDRAW explained, including the WITHDRAW roll and retreat.
- **[Morale](Morale.md)** — bands, combat effects, every gain/loss, recovery, and how morale gates stances.

### The empire
- **[Map, Terrain & Movement](Map-Terrain-Movement.md)** — the grid, terrain types, movement cost, pathfinding, and fog of war.
- **[Economy & Resources](Economy-and-Resources.md)** — the four treasury resources, deposits, and mana bonuses.
- **[Production & Buildings](Production-and-Buildings.md)** — city/territory build queues, every building, and resource yields.
- **[Research / Tech Tree](Research.md)** — every technology, cost, prerequisite, and unlock.
- **[Cities, Territory & Regions](Cities-Territory-Regions.md)** — city HP/walls, claiming land, mines, and region domination.

### The other players
- **[Diplomacy](Diplomacy.md)** — war, peace, alliances, and trading.
- **[Artificial Intelligence](AI.md)** — difficulty profiles, goals, and the strategy state machine.

### Reference
- **[Constants & Glossary](Constants-and-Glossary.md)** — every tunable number in one place.

---

## At a glance

| | |
|---|---|
| **Engine** | Phaser 3 + TypeScript, deterministic seeded RNG (lockstep-ready) |
| **Tick rate** | 10 ticks/sec (100 ms/tick) |
| **Players** | 1 human vs 1–4 AI nations |
| **Difficulties** | Easy (Noob AI), Medium (Basic AI), Hard (Advanced AI), Sandbox (passive) |
| **Win condition** | Usually eliminate all enemies (scenario-defined); some scenarios are "survive N ticks" |
| **Resources** | Gold, Food, Raw Material, Research — plus tile **deposits** (metals & mana) |
| **Unit types** | Infantry, Scout, Heavy Infantry, Cavalry, Longbowman, Crossbowman, Catapult, Trebuchet |
