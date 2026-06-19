# Artificial Intelligence

[← Back to Home](README.md)

The AI opponents are built from a three-layer hierarchy: **Profile → (Strategy) → Goals**. Difficulty picks the profile; the profile produces a list of goals each cycle; the controller filters, sorts by priority, and executes the top few. The Advanced profile adds a **strategy state machine** that swaps its goal list as the situation changes.

> All numbers below are from the source. "Tick" = 1/10 second.

---

## 1. Architecture

- **AISystem** — coordinator. Maps difficulty → profile, staggers each AI nation's evaluation by `aiIndex × 7` ticks so they don't all think on the same tick, and ticks every controller (a thrown goal is caught and logged, never crashing other nations). **Sandbox creates no controllers — AI is fully passive.**
- **AIController** (one per AI nation) — every `profile.tickInterval` ticks it runs:
  ```
  candidates = profile.generateGoals(ctx)
      .filter(isFeasible)
      .sort(by priority, highest first)
  execute the top `profile.maxGoalsPerCycle` of them
  ```
- **AIGoal** — a stateless objective with `priority` (0–100), `isFeasible`, and `execute`. Regenerated fresh each cycle.
- **AIStrategy** — a swappable goal generator used **only by the Advanced profile**; it can decide to switch itself out.

---

## 2. Difficulty profiles

| | **Noob** (Easy) | **Basic** (Medium) | **Advanced** (Hard) |
|---|---|---|---|
| Re-evaluates every | 80 ticks | 30 ticks | 20 ticks |
| Goals per cycle | 1 | 3 | 4 |
| Strategy layer | none | none | yes |
| Attacks? | **never** | yes, after tick **1800** | yes, as early as tick **250** |
| Expands territory? | never | yes | yes |
| Builds mines? | no | no | yes |
| Researches? | no | yes (economy-first) | yes (default order) |

### Noob (Easy)
Builds up to **4 Infantry** and then does nothing else — never attacks, expands, or researches. A passive training-wheels opponent.

### Basic (Medium)
Runs five goals every cycle: produce Infantry/Scouts, claim territory, attack (priority 40, **not before tick 1800**), research, and build buildings. Its research order is economy-first: `masonry, hunting, writing, trade, education, animal_domestication, iron_working, scientific_method, mathematics`.

### Advanced (Hard)
Starts in the **Expansion** strategy and switches between strategies as the game develops (see below). Uses the full default research order and diversified unit production.

---

## 3. The goals

| Goal | Priority | What it does |
|---|---|---|
| **AttackTargetGoal** | base (30–70) | Sends up to **6** idle units toward the nearest enemy city/unit on **ADVANCE**. Skips if outmatched (own HP < 55% of enemy HP) or before its `minTickToAttack`. |
| **DefendPositionGoal** | 80 | (Defense strategy) Sends idle units to a threatened city on **HOLD**. |
| **ClaimTerritoryGoal** | 50 | Builds an Outpost on an unclaimed tile a unit is standing on, or routes a unit toward the best expansion tile. Scores tiles: deposit +30, good terrain +3–5, partial-region-completion bonus. |
| **BuildTerritoryGoal** | 45 | Builds mines on controlled deposit tiles. Priority among mines: Mana 40 > Fire Glass 35 > Iron 30 > Copper 20. (Skips Silver/Gold — no mine type.) |
| **ResearchTechGoal** | 40 | Starts the next researchable tech from its priority list (fallback: any researchable tech). |
| **BuildBuildingGoal** | 35 | Builds the first missing preferred city building (Barracks → Farms → Workshop → Walls → Market → School), else upgrades existing ones (Barracks first). |
| **ProduceUnitGoal** | dynamic `max(20, 75 − units×8)` | Queues the first affordable/unlocked unit from its preferred list at an idle city. More urgent when the AI has fewer units. |

The **AttackTargetGoal** is the key difficulty lever: its base priority and earliest-attack tick vary by profile/strategy (Basic 40/1800, Expansion 30/500, Military 70/250, Defense 50/0).

---

## 4. The Advanced strategy state machine

The Advanced profile swaps between three strategies, each producing its own goal list:

### Expansion (starting strategy)
- Goals: claim territory, build mines, produce Infantry/Scouts, low-priority attack (won't attack before tick 500).
- **Switches to Military** when threatened (enemy within 5 tiles of a city) **or** it owns **≥12 tiles**.

### Military
- Goals: high-priority attack (from tick 250), diversified production (Infantry/Cavalry/Heavy Infantry/Crossbowman/Longbowman), claim territory, build buildings & mines, research.
- **Switches to Defense** if outnumbered (own units < 60% of the largest enemy) **and** an enemy is within 4 tiles of a city.
- **Reverts to Expansion** only if at peace and under 12 tiles.

### Defense
- Goals: defensive production (Heavy Infantry/Infantry/Crossbowman), defend the threatened city (priority 80, HOLD), plus a moderate attack goal.
- **Switches back to Military** once no enemy is within 6 tiles of any city.

**Cycle:** Expansion → (threat or 12 tiles) → Military ↔ Defense (under pressure) → back toward Expansion only when safe and small.

---

## 5. Difficulty quick numbers

| Lever | Noob | Basic | Advanced |
|---|---|---|---|
| Think interval | 80t | 30t | 20t |
| Goals/cycle | 1 | 3 | 4 |
| Earliest attack | never | 1800t | 250t (Military) |
| Outmatch caution | — | skip attack if own HP < 55% of enemy | same |
| Max units dispatched per attack | — | 6 | 6 |
| AI refuses peace if | — | winning by >40% | winning by >40% |

→ Continue to **[Scenarios & Tutorial](Scenarios-and-Tutorial.md)**
