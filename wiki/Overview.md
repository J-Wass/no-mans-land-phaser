# Overview & Core Loop

[← Back to Home](README.md)

## What kind of game is this?

**No Man's Land** is a single-player, real-time, grid-based strategy game for the browser. You control one **nation** on a square-tile island map against 1–4 AI nations (or a scripted scenario). There are no turns or action points: a simulation clock advances 10 times per second, you give orders (move, build, research, set stance, declare war, trade), and the simulation carries them out. Combat resolves automatically, round by round, whenever units meet enemies.

## The tick model

- **10 ticks per second** (`TICK_RATE = 10`, 100 ms per tick). Every duration in the game is a tick count.
- The HUD clock reads **"Day N HH:00"**: one day = **100 ticks** (10 s); `day = floor(tick/100) + 1`, `hour = floor((tick % 100) × 24 / 100)`.
- Game speed (top-bar SPEED button) cycles **PAUSE → 0.5× → 1× → 2× → 4×**; it changes only how often ticks fire. While paused no time accumulates. At most 5 ticks of backlog run in one frame.
- All randomness comes from one seeded RNG, so the simulation is deterministic for a given seed and command stream.

What happens each tick, in order: movement (and combat starts) → spy detection → unit battles → stranded-unit sieges → city sieges → territory battles → ranged fire → production (income, building, research, upkeep) → territory construction → dead-unit sweep → defeat check → every 10 ticks: city healing, morale recovery, water-mana healing → morale band polling. Then the AI thinks. Details: [The Tick Engine](Map-Terrain-Movement.md#6-the-tick-engine).

## The core loop

1. **Expand** — build **Outposts** on unclaimed tiles next to your land to claim them (and their deposits).
2. **Economy** — cities and owned tiles produce Food, Raw Material, Gold and Research. Build Farms, Workshops, Markets and Schools; mine Silver/Gold.
3. **Research** — spend Research points on a 17-tech, three-branch [tech tree](Research.md) to unlock units, buildings, mines, spies and The Wheel.
4. **Army** — build and upgrade a **Barracks**, then train units. Higher Barracks levels, techs and mined metal deposits unlock the stronger units.
5. **War** — move units into enemy units, territory and cities. Choose **[stances](Stances.md)**, exploit **[matchups](Units.md#2-unit-matchups--the-rock-paper-scissors-triangle)** and **[terrain](Map-Terrain-Movement.md#2-terrain)**, and keep **[morale](Morale.md)** high.
6. **Diplomacy** — declare war, make peace, trade with AI nations.

## Game modes

| Mode | `gameMode` | Map | Opponents | AI | Fog | Notes |
|---|---|---|---|---|---|---|
| **Scenario** | `scenario` | hand-made 60×60 | scenario-defined | menu difficulty | on | Victory per scenario. |
| **Standard Match** (skirmish) | `skirmish` | procedural, 23–26 tiles square | 1–4 | Easy/Medium/Hard | on | |
| **Sandbox** | `sandbox` | procedural | 1 | none (passive) | **off** | You start with 9999 of every resource; costs, tech and deposit checks skipped; every build/research/construction finishes in ≤ 10 ticks; outposts needn't be adjacent; no victory/defeat. |
| **Tutorial** | `scenario` (`isTutorial`) | small island | 1 passive | none | **off** | Guided steps; no automatic victory/defeat. |

## Difficulty

| Difficulty | AI profile | Behaviour |
|---|---|---|
| **Easy** | Noob | Researches Masonry, builds/upgrades a Barracks, keeps up to 4 units. Never attacks or expands. |
| **Medium** | Basic | Produces Infantry/Scouts, expands, researches (economy-first), builds, attacks from tick 1800 (3 min). |
| **Hard** | Advanced | Expansion → Military ↔ Defense strategy machine; mines deposits; can attack from tick 500 (250 once in Military). |
| **Sandbox** | — | No AI at all. |

See [AI](AI.md).

## Starting position (skirmish)
Each nation starts on the coast with **2 cities** (City Hall only), an **Infantry** and a **Scout**, an elliptical starting territory with free Outposts, **50 Gold / 30 Food / 20 Raw Material / 0 Research**, and **one random root tech** (Writing, Hunting, Masonry, Scientific Method or Mathematics). Nation #1 is the human. See [World Generation](World-Generation.md).

## Winning and losing
- A nation is **defeated** at the end of any tick in which it has **no cities and no living units**.
- When **your** nation is defeated → DEFEAT.
- When any other nation is defeated, the scenario's victory condition is checked (default `eliminate_all`): if no remaining nation is non-allied to you → VICTORY (music switches to *glory*).
- `survive_ticks` scenarios (none ship) award VICTORY when the tick reaches the target.
- Victory/defeat is never evaluated in Sandbox or the Tutorial.
- The Game Over modal pauses the game and shows VICTORY/DEFEAT, the duration, surviving and defeated nations, and RETURN TO MENU (the only way out).

→ Continue to **[Architecture](Architecture.md)**
