# No Man's Land — Game Wiki

A grid-based, **real-time** (tick-driven) strategy game built in TypeScript + Phaser 3. You command a nation: claim land, grow an economy, research technology, raise an army, and conquer rival cities. Combat resolves automatically using a stat model where **HP, morale, stance, terrain, unit matchups, veterancy and mined deposits** all feed the same damage math.

This wiki is a complete specification: every rule, number, algorithm, screen, string, asset and data file needed to rebuild the game, taken from the source. Open design gaps and unused code are listed in [Known Quirks](Known-Quirks.md).

> **Ticks:** the simulation runs at `TICK_RATE = 10` ticks per second (100 ms per tick). Durations are given in ticks; divide by 10 for seconds at 1× speed. The clock reads "Day N HH:00", where **100 ticks = 1 day**.

---

## Contents

### Getting started
- **[Overview & Core Loop](Overview.md)** — game modes, difficulties, starting position, win/lose rules.
- **[Controls & UI](Controls-and-UI.md)** — mouse, camera, HUD, every modal, the main menu.
- **[Scenarios & Tutorial](Scenarios-and-Tutorial.md)** — the three scenarios and the tutorial step chain.

### How it's built
- **[Architecture](Architecture.md)** — tech stack, folder layout, scenes, frame/tick loop, determinism, RNG, build/test/deploy.
- **[World Generation](World-Generation.md)** — grid sizing, procedural terrain, deposits, spawn and city placement, starting territory.
- **[Events & Commands](Events-and-Commands.md)** — every `GameCommand` with its validation, every `GameEventBus` event.
- **[Save Format](Save-Format.md)** — localStorage slots, the full save schema, restore order, id conventions.
- **[Presentation](Presentation.md)** — rendering layers, sprites and animation, overlays, fog drawing, minimap, CSS theme, audio.

### The army
- **[Units](Units.md)** — stats, matchups, spies, costs, veterancy, names.
- **[Combat](Combat.md)** — battles, sieges, territory battles, ranged fire, retreats, RNG order.
- **[Stances](Stances.md)** — HOLD / ADVANCE / WITHDRAW, the withdraw roll, morale gating.
- **[Morale](Morale.md)** — bands, every gain and loss, recovery.

### The empire
- **[Map, Terrain & Movement](Map-Terrain-Movement.md)** — grid, terrain, step costs, pathfinding, vision, the tick order.
- **[Economy & Resources](Economy-and-Resources.md)** — treasury, income, upkeep, deposits and mine bonuses.
- **[Production & Buildings](Production-and-Buildings.md)** — city queue, city buildings, territory buildings.
- **[Research / Tech Tree](Research.md)** — all 17 techs, queueing, the research screen.
- **[Cities, Territory & Regions](Cities-Territory-Regions.md)** — city/territory stats, claiming land, regions and their names.

### The other players
- **[Diplomacy](Diplomacy.md)** — war, peace, alliances, trade, defeat.
- **[Artificial Intelligence](AI.md)** — profiles, goals, the Advanced strategy machine.

### Reference
- **[Text & Content](Text-and-Content.md)** — catalog text, flavor quotes, tooltips, menu text.
- **[Scenario Data](Scenario-Data.md)** — `scenarios.json`, all three `.terrain` maps and `names.json`, verbatim.
- **[Known Quirks](Known-Quirks.md)** — open design gaps and dead code.
- **[Constants & Glossary](Constants-and-Glossary.md)** — every tunable number in one place.

---

## At a glance

| | |
|---|---|
| **Engine** | Phaser 3 (^3.80.1) + TypeScript (strict), Vite, Jest; DOM overlay for menus and modals |
| **Tick rate** | 10 ticks/s; speeds Pause / 0.5× / 1× / 2× / 4× |
| **Players** | 1 human vs 1–4 AI nations (skirmish) or scenario-defined |
| **Modes** | Scenario, Standard Match (skirmish), Sandbox, Tutorial |
| **Difficulties** | Easy (Noob AI), Medium (Basic AI), Hard (Advanced AI), Sandbox (no AI) |
| **Map** | Square tile grid (40 px tiles): 23–26 per side procedural, 60×60 scenarios; 6 terrains |
| **Resources** | Food, Raw Material, Gold, Research + 11 deposit types (5 metals, 6 mana) |
| **Units** | Infantry, Scout, Heavy Infantry, Cavalry, Longbowman, Crossbowman, Catapult, Trebuchet |
| **Buildings** | 8 city buildings (levels up to 5), 11 territory buildings |
| **Tech tree** | 17 techs in Society / Science / Arcane |
| **Win condition** | Eliminate every non-allied nation (scenario-defined; `survive_ticks` supported) |
| **Saves** | 10 localStorage slots, JSON export/import |
| **Determinism** | One seeded mulberry32 RNG drives map generation and all simulation randomness |
