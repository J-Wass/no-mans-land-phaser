# Research / Tech Tree

[← Back to Home](README.md)

Technology is researched per-nation by spending **Research points** down a three-branch tree: **Society**, **Science**, and **Arcane**. You can queue techs; the system auto-starts the next affordable one whose prerequisites are met. The Research point cost is paid **upfront** when research begins, then the tech takes time to complete.

> **Important — real durations are ×4 the base.** Every tech's listed time is multiplied by `RESEARCH_SPEED_MULTIPLIER = 4`. The tables below show **base ticks**; multiply by 4 for the actual research time, then divide by 10 for seconds. (E.g. a "300-tick" tech really takes 1200 ticks = 120 seconds.)

You research via the **Research modal** (top-bar RESEARCH button), a graph with prerequisite edges; each node has **START / QUEUE / QUEUE PATH / QUEUED / DONE / LOCKED** controls and a reorderable queue.

---

## Society branch

| Tech | Requires | Base ticks (×4) | RP cost | Unlocks / leads to |
|---|---|---|---|---|
| **Writing** | — | 300 | 5 | → Trade, Education |
| **Hunting** | — | 300 | 5 | **Longbowman**; → Ancient Rituals |
| **Masonry** | — | 300 | 5 | Most city/territory buildings + Copper Mine; → The Wheel, Ancient Rituals |
| **Trade** | Writing | 450 | 10 | **Market** |
| **Education** | Writing | 450 | 10 | **School** |
| **The Wheel** | Masonry | 450 | 10 | (req for Catapult) |

## Science branch

| Tech | Requires | Base ticks (×4) | RP cost | Unlocks / leads to |
|---|---|---|---|---|
| **Scientific Method** | — | 300 | 5 | → Chemistry, Biology, Physics |
| **Mathematics** | — | 300 | 5 | → Physics |
| **Chemistry** | Scientific Method | 450 | 10 | → Iron Working |
| **Biology** | Scientific Method | 450 | 10 | → Animal Domestication |
| **Physics** | Scientific Method + Mathematics | 600 | 15 | → Iron Working, Mana Studies; (req for Catapult) |
| **Animal Domestication** | Biology | 600 | 15 | **Cavalry** |
| **Iron Working** | Chemistry + Physics | 750 | 20 | **Heavy Infantry**, **Iron Mine**; → Mechanization, Steel Working |
| **Mechanization** | Iron Working | 750 | 20 | **Crossbowman**; (req for Trebuchet) |
| **Steel Working** | Iron Working | 900 | 25 | **Trebuchet**, **Fire Glass Mine** |

## Arcane branch

| Tech | Requires | Base ticks (×4) | RP cost | Unlocks / leads to |
|---|---|---|---|---|
| **Ancient Rituals** | Hunting + Masonry | 600 | 15 | → Mana Studies |
| **Mana Studies** | Ancient Rituals + Physics | 750 | 20 | **Mana Mine** |

---

## Tech → unlock quick reference

| You want… | Research… |
|---|---|
| Longbowman | Hunting |
| Cavalry | Animal Domestication |
| Heavy Infantry, Iron Mine | Iron Working |
| Crossbowman | Mechanization |
| Catapult | Physics **+** The Wheel |
| Trebuchet | Mechanization **+** Steel Working |
| Fire Glass Mine | Steel Working |
| Barracks, Walls, Farms, Workshop, Watchtower, Copper Mine | Masonry |
| Market | Trade |
| School | Education |
| Mana Mine | Mana Studies |

---

## Recommended openings

- **Economy-first** (the Basic AI's order): `masonry → hunting → writing → trade → education → animal_domestication → iron_working → scientific_method → mathematics`. Gets you buildings, Markets/Schools, and your first advanced units.
- **Tech-rush to military:** `masonry → scientific_method → mathematics → chemistry → physics → iron_working` for Heavy Infantry and Iron Mines, then branch to Mechanization/Steel Working for Crossbowmen and Trebuchets.
- **Early siege:** `masonry → the_wheel → scientific_method → mathematics → physics` puts **Catapults** in reach with only a Copper Mine and a level-3 Barracks — no Iron Working required — for a bronze-age siege/defense option well before Trebuchets.

→ Continue to **[Cities, Territory & Regions](Cities-Territory-Regions.md)**
