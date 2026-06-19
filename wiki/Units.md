# Units

[← Back to Home](README.md)

There are **eight unit types**. Each is a thin subclass that supplies a stat block to the base `Unit` class; all combat behavior lives in the [combat systems](Combat.md). A unit counts as **ranged** when it has `attackRange > 1` **and** `rangedDamage > 0` (Longbowman, Crossbowman, Catapult, Trebuchet). There is no separate "siege" or "cavalry" flag — those behaviors key off the unit's type and armor.

---

## 1. Full stats table

| Unit | HP | Melee | Ranged | Armor | Speed | Range | Vision | Upkeep (Food/RawMat) |
|------|----|-------|--------|-------|-------|-------|--------|----------------------|
| **Infantry** | 100 | 10 | — | light | 2 | 1 | 1 | 1 / 1 |
| **Scout** | 100 | 2 | — | light | 3 | 1 | **2** | 1 / 1 |
| **Heavy Infantry** | 250 | 20 | — | heavy | 1 | 1 | 1 | 2 / 1 |
| **Cavalry** | 160 | 32 | — | heavy | 3 | 1 | 1 | 2 / 1 |
| **Longbowman** | 100 | 10 | 12 | light | 2 | **3** | 1 | 1 / 1 |
| **Crossbowman** | 150 | 10 | 15 | heavy | 1 | 2 | 1 | 1 / 1 |
| **Catapult** | 200 | 15 | 25 | heavy | 1 | 2 | 1 | 1 / 2 |
| **Trebuchet** | 250 | 25 | 50 | heavy | 1 | **3** | 1 | 2 / 3 |

- **HP** — health pool. Wounded units also hit softer (see [health factor](Combat.md#shared-damage-primitives)).
- **Melee / Ranged** — base damage. `Ranged = 0` means melee-only. Ranged units fire at range but fall back to melee when forced (e.g. on ADVANCE).
- **Armor** — `light` or `heavy`. Drives many [matchup bonuses](#2-unit-matchups) (heavy armor resists melee but is vulnerable to bolts and siege).
- **Speed** — used only by [movement cost](Map-Terrain-Movement.md#3-movement): higher speed = fewer ticks per tile. Also feeds the [WITHDRAW roll](Stances.md#the-withdraw-roll).
- **Range** — 1 = melee only; 2–3 = can fire from a distance.
- **Vision** — sight radius (Scout sees farthest).
- **Upkeep** — Food/RawMaterial drained from the treasury every 30 ticks per living unit.

---

## 2. Unit matchups — the rock-paper-scissors triangle

Counters are **not** stored on the units — they're applied in the [BattleSystem](Combat.md) as offense/defense modifiers. The combat roster is a triangle:

> 🛡 **HEAVY INFANTRY (spears) → 🐎 CAVALRY → 🏹 RANGED (Longbow / Crossbow / Catapult / Trebuchet) → 🛡 HEAVY INFANTRY**

- **Heavy Infantry beats Cavalry** — a planted spear-wall stops the charge.
- **Cavalry beats Ranged** — fast enough to close before pre-damage piles up, and a ranged/siege unit is near-helpless once a horse is in its face.
- **Ranged beats Heavy Infantry** — softens the slow shield wall with [pre-damage](Combat.md#4-ranged-fire-system) on the approach plus armor-piercing fire. This is an **army-level** edge — keep your ranged behind a screen — **not** a lone-archer-beats-a-knight 1v1.

**Infantry** is a cheap, no-tech generalist that loses 1v1 to all the specialists — its value is mass and economy, not a matchup. **Scout** is recon.

### Armor rules (universal)
- **Ranged hit vs heavy armor:** **+12%** offense (arrows punch plate).
- **Melee hit vs heavy armor:** **−6%** offense.

### Anti-cavalry (the spears → Cavalry leg)
- **Heavy Infantry vs Cavalry:** **+35%** offense, **and +20% mitigation** when *being hit by* cavalry (any stance). The premier — and only — cavalry-counter unit.

### Anti-armor (powers the Ranged → shields leg)
- **Heavy Infantry vs light armor:** **+15%** (crushes skirmishers).
- **Crossbowman vs heavy armor:** **+10%** (armor-piercing bolts; stacks with the +12% ranged-vs-heavy → **+22%** total vs heavy).
- **Crossbowman vs light armor:** **−30%** (heavy bolts wasted on cheap skirmishers; a crossbow still beats one Infantry but is left bloodied).

### Siege is helpless in melee (the Cavalry → Ranged leg)
- A **siege unit forced to melee** (on ADVANCE): **−30%** offense, **−8%** mitigation.
- A **siege unit pinned in a melee battle** (still trying to fire point-blank): **−80%** offense — caught up close it's near-useless. Its real power is **at-range** fire (it does **not** get an armor bonus there — see [ranged fire](Combat.md#4-ranged-fire-system)), so the way to beat siege is to *reach* it. That's Cavalry's job.
- **Anyone hitting a siege unit in melee:** **+8%** offense.

### Cavalry is the anti-ranged unit
- On **ADVANCE**, Cavalry's order bonus is **×1.5** (vs ×1.25 for everyone else) — the "Charge". On **PLAINS** +12% offense, −4% mitigation while charging. In **FOREST** it's crippled (**×0.82** offense, no forest cover).
- Cavalry takes only **50% of standalone [ranged-fire](Combat.md#4-ranged-fire-system) damage** (`CAVALRY_RANGED_RESIST`) — it shrugs off volleys as it charges, which is what lets it close on and kill ranged/siege units. A lone cavalry charging a waiting Trebuchet across fully open ground still trades hard (it eats volleys closing in); with a screen, in numbers, or with your own ranged focus-firing the pinned siege, it wins cleanly.

→ See [Combat → matchup factors](Combat.md#offense-chain) for the exact code and how these stack into the full formula.

---

## 3. Unit roles & notes

- **Infantry** — cheap, available from a level-1 Barracks with no tech. A no-tech filler/screen: it loses 1v1 to every specialist but trades on cost and gets you an early army.
- **Scout** — fast (speed 3), vision 2, almost no combat value (melee 2). Pure reconnaissance and land-grabbing. After researching **Ancient Rituals**, a Scout on your own or neutral territory can **go undercover as a Spy** (see Special behaviors).
- **Heavy Infantry** — a 250-HP wall and the **anti-cavalry anchor**: **+16% mitigation on HOLD** (shield wall), **+35% offense / +20% mitigation vs Cavalry**. Slow (speed 1) and softened by massed ranged before it can close — its predator is the ranged line.
- **Cavalry** — the anti-ranged unit: 32 melee + ×1.5 charge, fast, and takes only **half** of incoming ranged fire, so it runs down archers and siege. Hard-countered by Heavy Infantry; crippled in forest.
- **Longbowman** — range **3** skirmisher; out-ranges shields to soften them before contact. Light armor, fragile — flees from cavalry.
- **Crossbowman** — range 2, heavy armor, **anti-armor** ranged specialist (no longer anti-cavalry — Cavalry beats it like any ranged unit). **+12% mitigation on WITHDRAW** (kiting tax).
- **Catapult** — siege ranged (25), strong vs cities and armor at range, weak vs light troops and **helpless once a unit (especially Cavalry) reaches it**.
- **Trebuchet** — the heaviest hitter (ranged **50**, range 3) and pre-damage king (shreds approaching shields), best siege weapon, but expensive, slow, and **helpless up close — Cavalry is its bane**.

### Special behaviors
- **Ranged vs melee choice:** a ranged unit fires only if `range > 1 && ranged > 0 && order !== ADVANCE`. Choosing ADVANCE forces a shooter into melee. Ranged base damage = `max(rangedDamage, meleeDamage × 0.7)`.
- **Spies (undercover Scouts):** after **Ancient Rituals**, a Scout can go undercover (toggle on your own/neutral territory, not while in battle). A spy is **invisible to enemy nations** and **infiltrates enemy territory without triggering battles, sieges, or war** — it never starts a fight, and enemy units that move onto it pass through harmlessly (no war is declared either way), giving you vision deep in enemy land. A spy is only at risk **while standing on enemy-controlled territory**: there it is **caught and destroyed** if a non-allied enemy unit is within 2 tiles, with the catch chance higher the closer the enemy is and the more it out-XPs the spy. In **neutral no-man's-land** (and on your own or allied soil) a spy can't be caught, so it can slip through the wilds safely. If your spy is discovered you get an on-screen alert. Drop cover (on own/neutral land) to revert to a normal Scout.
- **Withdraw & retreat:** units that lose a fight may flee; details in [Stances](Stances.md).

---

## 4. Cost, build time & requirements

All units are trained from a city **Barracks** (built/upgraded in the [City Menu](Production-and-Buildings.md)). `Deposit req` means your nation must control at least one tile with **any** of the listed deposits ([mines built](Cities-Territory-Regions.md#mines)).

| Unit | Gold | Food | RawMat | Build ticks | Tech needed | Barracks lvl | Deposit needed |
|------|------|------|--------|-------------|-------------|--------------|----------------|
| **Infantry** | 30 | 400 | 300 | 120 | — | 1 | — |
| **Scout** | 20 | 300 | 0 | 100 | — | 1 | — |
| **Longbowman** | 40 | 500 | 350 | 150 | `hunting` | 2 | — |
| **Cavalry** | 80 | 700 | 500 | 200 | `animal_domestication` | 2 | Copper / Iron / Fire Glass |
| **Crossbowman** | 50 | 550 | 400 | 180 | `mechanization` | 3 | Copper / Iron / Fire Glass |
| **Heavy Infantry** | 80 | 700 | 450 | 200 | `iron_working` | 3 | Iron / Fire Glass |
| **Catapult** | 80 | 350 | 600 | 240 | `physics` + `the_wheel` | 3 | Copper / Iron / Fire Glass |
| **Trebuchet** | 100 | 400 | 800 | 280 | `mechanization` + `steel_working` | 5 | Iron / Fire Glass |

- **Cost is paid upfront** when production starts. **Build ticks** is the time to finish (reduced by higher Barracks levels — **−5% per level above 1**).
- A finished unit spawns on or next to the city (first passable, unoccupied tile of the 8 neighbors) and remembers its **home city**.

---

## 5. Veterancy & experience

Units earn **XP** from combat and rank up, gaining a permanent damage bonus:

| Level | Rank | XP needed | Damage multiplier |
|-------|------|-----------|-------------------|
| 0 | Recruit | 0 | ×1.0 |
| 1 | Veteran | **5** | ×1.1 |
| 2 | Elite | **15** | ×1.2 |

XP awards: **Kill = 3**, **Win (foe survives) = 2**, **Loss (you survive) = 1**, **Landing a ranged hit = 1** (per qualifying combat round). The standalone [ranged-fire system](Combat.md#5-ranged-fire-system) does **not** grant XP.

Elite units also get an upgraded group name (e.g. Infantry "Battalion" → "Legion").

---

## 6. The base `Unit` — what every unit tracks

State stored per unit: id, type, owner, position, current HP, stats, per-turn move/attack flags, **battle order (stance)**, engaged-in-battle flag, **morale**, battles-fought count, home city, preferred ranged target, **XP**, **veteran level**, unit serial number, **retreat cooldown** tick, and **morale-recovery cooldown** tick. New units start at full HP, **HOLD** stance, **80 morale**, 0 XP / Recruit.

Key behaviors:
- `takeDamage` / `heal` / `setHealth` clamp HP to `[0, max]`.
- `addXP` promotes to Veteran at 5 XP and Elite at 15.
- `setMorale` clamps to `[0, 100]`.
- Stance is set via the UI but its **effective** value is gated by morale — see **[Stances](Stances.md)** and **[Morale](Morale.md#6-how-morale-gates-stances)**.
- After losing a fight, a surviving unit gets a **20-tick retreat cooldown** (can't be re-engaged) and a **30-tick halved-morale-recovery cooldown**.

→ Continue to **[Combat](Combat.md)**
