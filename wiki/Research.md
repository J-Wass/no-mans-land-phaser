# Research / Tech Tree

[← Back to Home](README.md)

Technology is researched per-nation by spending **Research points** down a three-branch tree: **Society**, **Science**, and **Arcane**. You can queue techs; the system auto-starts the next affordable one whose prerequisites are met. The Research point cost is paid **upfront** when research begins, then the tech takes time to complete.

> **Important — real durations are ×4 the base.** Every tech's listed time is multiplied by `RESEARCH_SPEED_MULTIPLIER = 4`. The tables below show **base ticks**; multiply by 4 for the actual research time, then divide by 10 for seconds. (E.g. a "300-tick" tech really takes 1200 ticks = 120 seconds.)
>
> **Schools shorten this.** Each [School](Production-and-Buildings.md#2-city-buildings) building level speeds your active research by **+10%** (capped at **+50%**, i.e. up to 1.5× faster). This is the real payoff of Education/Schools — research is time-gated, not point-gated.

You research via the **Research modal** (top-bar RESEARCH button), a graph with prerequisite edges; each node has **START / QUEUE / QUEUE PATH / QUEUED / DONE / LOCKED** controls and a reorderable queue.

---

## Society branch

| Tech | Requires | Base ticks (×4) | RP cost | Unlocks / leads to |
|---|---|---|---|---|
| **Writing** | — | 300 | 25 | → Trade, Education |
| **Hunting** | — | 300 | 25 | **Longbowman**; → Ancient Rituals |
| **Masonry** | — | 300 | 25 | Most city/territory buildings + Copper Mine; → The Wheel, Ancient Rituals |
| **Trade** | Writing | 450 | 50 | **Market** |
| **Education** | Writing | 450 | 50 | **School** |
| **The Wheel** | Masonry | 450 | 50 | **+20% unit movement speed**; (req for Catapult) |

## Science branch

| Tech | Requires | Base ticks (×4) | RP cost | Unlocks / leads to |
|---|---|---|---|---|
| **Scientific Method** | — | 300 | 25 | → Chemistry, Biology, Physics |
| **Mathematics** | — | 300 | 25 | → Physics |
| **Chemistry** | Scientific Method | 450 | 50 | → Iron Working |
| **Biology** | Scientific Method | 450 | 50 | → Animal Domestication |
| **Physics** | Scientific Method + Mathematics | 600 | 75 | → Iron Working, Mana Studies; (req for Catapult) |
| **Animal Domestication** | Biology | 600 | 75 | **Cavalry** |
| **Iron Working** | Chemistry + Physics | 750 | 100 | **Heavy Infantry**, **Iron Mine**; → Mechanization, Steel Working |
| **Mechanization** | Iron Working | 750 | 100 | **Crossbowman**; (req for Trebuchet) |
| **Steel Working** | Iron Working | 900 | 125 | **Trebuchet**, **Fire Glass Mine** |

## Arcane branch

| Tech | Requires | Base ticks (×4) | RP cost | Unlocks / leads to |
|---|---|---|---|---|
| **Ancient Rituals** | Hunting + Masonry | 600 | 75 | **Scout → Spy** upgrade; → Mana Studies |
| **Mana Studies** | Ancient Rituals + Physics | 750 | 100 | **Mana Mine** |

---

## Tech → unlock quick reference

| You want… | Research… |
|---|---|
| Longbowman | Hunting |
| Cavalry | Animal Domestication |
| Heavy Infantry, Iron Mine | Iron Working |
| Crossbowman | Mechanization |
| Catapult | Physics **+** The Wheel |
| +20% army movement speed | The Wheel |
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
- **Early siege:** `masonry → the_wheel → scientific_method → mathematics → physics` puts **Catapults** in reach with only a Copper Mine and a level-3 Barracks — no Iron Working required — for a bronze-age siege/defense option well before Trebuchets. The Wheel also gives your whole army **+20% movement speed**.

→ Continue to **[Cities, Territory & Regions](Cities-Territory-Regions.md)**
