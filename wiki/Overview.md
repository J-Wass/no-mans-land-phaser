# Overview & Core Loop

[← Back to Home](README.md)

## What kind of game is this?

No Man's Land is a **real-time grid strategy** game. Despite the codebase's RTS roots, there are **no per-turn action points** — everything runs continuously on a tick clock. You issue orders (move, build, research, set stance, declare war); the simulation carries them out tick by tick, and combat resolves automatically when armies meet.

You control one **nation** on a square-tile map. Victory typically means eliminating every rival nation, though scenarios can set other goals.

## The tick model

- The world advances at **`TICK_RATE = 10` ticks per second** (one tick = **100 ms**).
- The in-game clock displays **"Day N HH:00"**, where **100 ticks = 1 day**.
- You can change game speed from the top bar: **PAUSE (0×), 0.5×, 1×, 2×, 4×**. This scales how fast ticks fire; it does not change any balance number.

### What happens every tick

Each tick the [Tick Engine](Map-Terrain-Movement.md#6-the-tick-engine) runs systems in a fixed order:

1. Move units one step closer along their paths; trigger battles/sieges/territory fights on contact.
2. Resolve ongoing **unit battles**, **city sieges**, **territory battles**, and **ranged fire**.
3. Run **production** (resource income, build progress, unit spawns, upkeep).
4. Advance **territory construction** (outposts, mines, walls).
5. Remove dead units, check for defeated nations.
6. On periodic pulses: **heal units in cities**, **recover morale**, **water-mana healing**, **city/territory HP regen**, **region domination bonuses**.

Because all systems share one **deterministic seeded RNG**, the entire simulation is reproducible — the same seed and the same orders always produce the same game (which is what makes lockstep multiplayer possible later).

## The core gameplay loop

1. **Expand** — march units onto unclaimed land and build **Outposts** to claim territory (and grab resource deposits).
2. **Economy** — your cities and territories generate Gold, Food, Raw Material, and Research over time. Build Farms, Workshops, Markets, and Schools to boost each.
3. **Research** — spend Research points down a three-branch [tech tree](Research.md) (Society, Science, Arcane) to unlock better units, buildings, and mines.
4. **Army** — upgrade a city's **Barracks** and train units. Higher Barracks levels and certain techs/deposits unlock the stronger units.
5. **War** — move your army into enemy units, territory, or cities. Set the right **[stance](Stances.md)**, exploit **[unit matchups](Units.md#unit-matchups)** and **[terrain](Map-Terrain-Movement.md#2-terrain)**, and keep **[morale](Morale.md)** high. Conquer enemy cities until the victory condition is met.
6. **Diplomacy** — declare war, sue for peace, or trade resources with rival nations.

## Game modes

Chosen from the main menu (see [Controls & UI → Menu flow](Controls-and-UI.md#5-menu--game-setup)):

| Mode | Description |
|---|---|
| **Scenario** | A hand-authored map and matchup from the [scenario list](Scenarios-and-Tutorial.md). Forces 1 opponent (or the scenario's defined nations). |
| **Standard Match (skirmish)** | A procedurally generated map. You pick **1–4 opponents** and a **difficulty**. |
| **Sandbox** | Free play: you start with **9999 of every resource**, **everything (units, buildings, outposts, upgrades, tech) finishes in ~1s**, **no resource costs**, **no fog of war**, plus a live toolbar to change AI difficulty and paint terrain mid-game. |
| **Tutorial** | A guided scenario against a **passive opponent** with fog disabled. See [Tutorial](Scenarios-and-Tutorial.md#the-tutorial). |

## Difficulty levels

Difficulty selects which **[AI profile](AI.md)** runs the opponents:

| Difficulty | AI profile | Behavior summary |
|---|---|---|
| **Easy** | Noob | Builds up to 4 Infantry and **never attacks, expands, or researches**. |
| **Medium** | Basic | Expands, researches (economy-first), and attacks — but **not before tick 1800** (~3 min). |
| **Hard** | Advanced | Runs a strategy state machine (Expansion → Military ↔ Defense); can attack as early as **tick 250**. |
| **Sandbox** | (none) | Opponents are entirely passive. |

## Winning and losing

- A nation is **defeated** when it has **no cities and no living units**.
- Default victory condition is **`eliminate_all`** (last nation standing). Scenarios may instead use **`survive_ticks`** (hold out for N ticks).
- Victory/defeat is **not** evaluated in Sandbox.
- On game end, a [Game Over modal](Controls-and-UI.md#victory--defeat) shows **VICTORY** or **DEFEAT**, the game duration, and surviving/defeated nations.

## Where the world comes from

A new game is assembled in `BootScene`:

- Grid size scales with the number of nations (roughly **22×22 to 30×30**), surrounded by an impassable **water border**.
- Terrain is generated procedurally (skirmish/sandbox) or loaded from a fixed **`.terrain` map file** (scenarios).
- Resource deposits are placed (by scenario definition or procedurally, scaled to map area).
- Each skirmish nation starts on the coast with **2 cities, 2 units (Infantry + Scout)**, a starting territory blob, **50 Gold / 30 Food / 20 Raw Material**, and one random root technology. Nation #0 is the human player.

→ Continue to **[Controls & UI](Controls-and-UI.md)**
