# Research / Tech Tree

[← Back to Home](README.md)

Each nation researches technologies from a 17-node tree in three branches: **Society**, **Science**, **Arcane**. One tech is researched at a time; others wait in a queue.

---

## 1. Rules

- **Cost:** a tech's Research-point cost is paid in full when it **starts**. Cancelling refunds nothing.
- **Prerequisites:** all of `requires` must be researched before it can start.
- **Duration:** `ticks = baseTicks × RESEARCH_SPEED_MULTIPLIER`, with **`RESEARCH_SPEED_MULTIPLIER = 4/3`**. Base 300 → 400 ticks (40 s).
- **Schools:** every tick the active research advances by `1 + min(0.50, 0.10 × totalSchoolLevelsAcrossTheNation)` ticks of progress (fractional progress is kept). Five School levels anywhere = 1.5× speed.
- **Completion:** `nation:research-complete` fires; the next queued tech is tried immediately.
- **Queue processing** (every tick, per nation, inside ProductionSystem): if nothing is active and the queue is non-empty, look at the **first** entry only: if its prerequisites are met **and** the nation has enough RP, pay and start it; otherwise wait (the queue does not skip ahead).
- **Sandbox:** `START_RESEARCH` skips prerequisite and cost checks and takes 10 ticks; queued research is free and takes `min(10, ticks)` but still waits for prerequisites.
- Starting techs (skirmish root tech, scenario `startingTechs`) are granted instantly.

### Commands
| Command | Effect |
|---|---|
| `START_RESEARCH {techId}` | Fails if something is already being researched, it's researched, prerequisites unmet (non-sandbox), unknown, or RP short. Otherwise pays and starts; removes it from the queue. |
| `QUEUE_RESEARCH {techId}` | Adds the tech **and every missing prerequisite** in dependency order (depth-first through `requires` in listed order, skipping researched, active and already-queued techs). Fails if nothing new would be added. |
| `REMOVE_QUEUED_RESEARCH {techId}` | Removes one queued entry (dependants stay queued and will wait). |
| `MOVE_QUEUED_RESEARCH {techId, direction}` | Swaps with the neighbour above/below. |
| `CANCEL_RESEARCH` | Drops the active research (no refund). |

---

## 2. The tree

Real ticks = base × 4/3. Seconds at 1× speed = ticks / 10.

### Society
| Tech | Id | Requires | Base ticks | **Real ticks (s)** | RP | Unlocks |
|---|---|---|---|---|---|---|
| Writing | `writing` | — | 300 | **400 (40 s)** | 25 | → Trade, Education |
| Hunting | `hunting` | — | 300 | 400 (40 s) | 25 | **Longbowman**; → Ancient Rituals |
| Masonry | `masonry` | — | 300 | 400 (40 s) | 25 | Barracks, Walls, Farms, Workshop, Watchtower (city); Walls, Farms, Workshop, Watchtower, Copper Mine, Silver Mine (territory); → The Wheel, Ancient Rituals |
| Trade | `trade` | Writing | 450 | 600 (60 s) | 50 | **Market**, **Gold Mine** |
| Education | `education` | Writing | 450 | 600 (60 s) | 50 | **School** |
| The Wheel | `the_wheel` | Masonry | 450 | 600 (60 s) | 50 | **+20% movement speed** (×1.2 effective speed) for all your units; required for Catapult |

### Science
| Tech | Id | Requires | Base ticks | **Real ticks (s)** | RP | Unlocks |
|---|---|---|---|---|---|---|
| Scientific Method | `scientific_method` | — | 300 | 400 (40 s) | 25 | → Chemistry, Biology, Physics |
| Mathematics | `mathematics` | — | 300 | 400 (40 s) | 25 | → Physics |
| Chemistry | `chemistry` | Scientific Method | 450 | 600 (60 s) | 50 | → Iron Working |
| Biology | `biology` | Scientific Method | 450 | 600 (60 s) | 50 | → Animal Domestication |
| Physics | `physics` | Scientific Method + Mathematics | 600 | 800 (80 s) | 75 | required for Catapult; → Iron Working, Mana Studies |
| Animal Domestication | `animal_domestication` | Biology | 600 | 800 (80 s) | 75 | **Cavalry** |
| Iron Working | `iron_working` | Chemistry + Physics | 750 | 1000 (100 s) | 100 | **Heavy Infantry**, **Iron Mine**; → Mechanization, Steel Working |
| Mechanization | `mechanization` | Iron Working | 750 | 1000 (100 s) | 100 | **Crossbowman**; required for Trebuchet |
| Steel Working | `steel_working` | Iron Working | 900 | 1200 (120 s) | 125 | **Fire Glass Mine**; required for Trebuchet; HUD weapon label "Steel" with an Iron mine |

### Arcane
| Tech | Id | Requires | Base ticks | **Real ticks (s)** | RP | Unlocks |
|---|---|---|---|---|---|---|
| Ancient Rituals | `ancient_rituals` | Hunting + Masonry | 600 | 800 (80 s) | 75 | **Scout → Spy** toggle; → Mana Studies |
| Mana Studies | `mana_studies` | Ancient Rituals + Physics | 750 | 1000 (100 s) | 100 | **Mana Mine** |

Catalog order (used for display and the AI's fallback pick): writing, hunting, masonry, trade, education, the_wheel, scientific_method, mathematics, chemistry, biology, physics, animal_domestication, iron_working, mechanization, steel_working, ancient_rituals, mana_studies.

---

## 3. Quick reference

| You want… | Research… |
|---|---|
| Barracks (any unit), Walls, Farms, Workshop, Watchtower, Copper/Silver Mine | Masonry |
| Longbowman | Hunting (+ Barracks 2) |
| Market, Gold Mine | Trade |
| School | Education |
| +20% movement | The Wheel |
| Cavalry | Animal Domestication (+ Barracks 2 + metal mine) |
| Heavy Infantry, Iron Mine | Iron Working |
| Crossbowman | Mechanization |
| Catapult | Physics + The Wheel (+ Barracks 3 + metal mine) |
| Trebuchet | Mechanization + Steel Working (+ Barracks 5 + Iron/Fire Glass mine) |
| Fire Glass Mine | Steel Working |
| Spies | Ancient Rituals |
| Mana Mine | Mana Studies |

Research income: 1 RP/s per city from tick 300, plus School levels. A 25-RP root tech is affordable 25 s after tick 300 with one city.

---

## 4. Research modal
Opened from the top-bar RESEARCH button (which shows the active tech's name, up to 10 characters, and a thin green progress bar). Layout:
- Header "Research" + CLOSE.
- Current-research panel: "`{tech name}  ({seconds}s)`" + progress bar + CANCEL; then the QUEUE list with UP / DOWN / X per entry ("No queued technologies" when empty).
- A scrollable **graph**: three horizontal bands (Science `#7eb7ff`, Society `#83e2b0`, Arcane `#d59cff`, in that order top to bottom) with a sticky vertical band label. Column = depth (longest prerequisite chain), nodes 156×104 px, column stride 196, row gap 12, band gap 28, left pad 84. Edges are SVG cubic curves from the prerequisite's right edge to the tech's left edge, coloured by the prerequisite's branch at 55% opacity.
- Each node shows its name, "Leads to: {units/buildings unlocked}" (or the description if it unlocks nothing), a status line, and a button. States:

| State | Status line | Button |
|---|---|---|
| researched | "Researched" (green) | DONE (disabled) |
| active | "In progress" (gold) | `...` (disabled) |
| queued | "Queued" | QUEUED (disabled) |
| prerequisites met, RP short | "`{RP} RP · {s}s  ({have}/{cost} RP)`" | QUEUE |
| can start now | "`{RP} RP · {s}s`" | START |
| prerequisites missing | cost line | QUEUE PATH |
| prerequisites met but another tech is active | cost line | QUEUE |

Clicking the node button sends `START_RESEARCH` when it can start right now, otherwise `QUEUE_RESEARCH`. Hovering a node shows a tooltip: flavor quote, description, "Leads to: …".

---

## 5. Recommended openings
- **Economy-first** (the Medium AI's order): masonry → hunting → writing → trade → education → animal_domestication → iron_working → scientific_method → mathematics.
- **Military tech rush:** masonry → scientific_method → mathematics → chemistry → physics → iron_working, then Mechanization / Steel Working.
- **Early siege:** masonry → the_wheel → scientific_method → mathematics → physics gives Catapults with only a Copper mine and a level-3 Barracks.

→ Continue to **[Cities, Territory & Regions](Cities-Territory-Regions.md)**
