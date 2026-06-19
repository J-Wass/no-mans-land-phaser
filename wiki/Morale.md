# Morale

[← Back to Home](README.md)

Morale is a second health bar that runs **parallel to HP**. High-morale troops hit harder and shrug off damage; low-morale troops fight worse, can't charge, and eventually **rout** (break and flee). Managing morale — by winning, conquering, and resting on friendly ground — is as important as managing HP.

Every unit has a morale value from **0 to 100**. New units start at **80** (top of the Steady band). The absolute cap is **100**, but **passive rest can never push morale above 80** — only positive *events* (winning, conquering, witnessing a kill) reach the Inspired band.

> **Design asymmetry to remember:** morale **gains are local** (limited to a radius around the event), but the biggest **loss — losing a city — hits every unit in the nation** regardless of distance. Bad news travels fast.

---

## 1. Morale bands & combat effects

| Band | Range | Damage multiplier | Mitigation delta |
|------|-------|-------------------|------------------|
| **INSPIRED** | 90–100 | **×1.12** (+12% offense) | **+0.04** |
| **STEADY** | 60–89 | ×1.00 | 0.00 |
| **WAVERING** | 40–59 | ×0.92 (−8%) | −0.03 |
| **SHAKEN** | 15–39 | ×0.80 (−20%) | −0.06 |
| **BROKEN** | 0–14 | ×0.60 (−40%) | −0.10 |

- The **damage multiplier** scales the unit's offense (the `moraleFactor` in the [combat formula](Combat.md#offense-chain)).
- The **mitigation delta** is added to the defender's mitigation *before* the 0.65 clamp.

So an Inspired unit hits 12% harder and blocks 4% more; a Broken unit hits 40% softer and blocks 10% less. Morale's combat multipliers apply in **unit-vs-unit battles only** (sieges, territory battles, and ranged fire drain morale but don't apply these multipliers).

When a unit crosses a band threshold, the game emits a UI toast (e.g. a "STEADY → WAVERING" warning).

---

## 2. Morale during combat

Every time a unit takes damage (melee, ranged, or siege), it loses morale proportional to the hit:
```
morale loss = ceil( (damageTaken / maxHP) × 45 )
```
A 100-HP unit taking 25 damage loses `ceil(25/100 × 45) = 12` morale.

On top of that:
- **ADVANCE** costs **2 morale per round**.
- The surviving **loser** of a WITHDRAW or ROUT loses an extra **15 morale**.

---

## 3. Sources of morale GAIN

All distances are **Chebyshev** (8-way: `max(|Δrow|, |Δcol|)`).

| Source | Value | Who / radius |
|---|---|---|
| **Battle win** | **+20** | The winning unit (on an Elimination or Withdraw victory). |
| **Kill** | **+8** | The unit that lands the killing blow. |
| **Witness victory** | **+5** | The killer's allies within **3 tiles** of the kill (killer excluded). |
| **City conquer** | **+25** | The conquering unit — the single biggest gain. |
| **Rally cry** | **+10** | Friendlies of the conquering nation within **4 tiles** of the conquered city (conqueror excluded). |
| **Territory conquer** | **+6** | Units of the claiming nation within **3 tiles** of a captured (conquered) territory. Fresh outposts grant nothing. |
| **Siege damage** | **+1** | The besieging unit, per siege round where it damaged the city **and** took no damage itself. |

---

## 4. Sources of morale LOSS

| Source | Value | Who |
|---|---|---|
| **Advance per round** | **−2** | Any unit spending a round on ADVANCE. |
| **Allied death nearby** | **−6** | Allies of a dead unit within **3 tiles** of the death. |
| **City lost (nation-wide)** | **−10** | **Every living unit** of the nation that just lost a city — no distance limit. |
| **Battle lost** | **−15** | The (surviving) loser of a WITHDRAW or ROUT, on top of the per-round damage drain. |
| **Damage taken** | proportional | `ceil(damage/maxHP × 45)` per hit (see §2). |

---

## 5. Morale recovery (passive rest)

Once per second (every 10 ticks), units that are **alive, not in battle, and below max morale** recover, based on the tile they stand on:

| Tile | Recovery / pulse |
|---|---|
| **Enemy territory** | **0** (no rest behind enemy lines) |
| **Neutral (unowned)** | **+1** |
| **Friendly territory** | **+2** |
| **Friendly city tile** | **+4** |

- Recovery is **capped at 80** — resting alone can never reach Inspired.
- After **losing** a battle, the loser's recovery is **halved** (floored) for **30 ticks** (so a +1 unit recovers 0, a +4 city-resting unit recovers 2).

Pull battered units back to your cities to rebuild their morale quickly.

---

## 6. How morale gates stances

Morale can override the stance you set (`effectiveBattleOrder`):

- **Morale ≤ 59:** **ADVANCE → HOLD** (too shaken to charge).
- **Morale ≤ 14 (rout):** **only WITHDRAW is honored**; HOLD stays HOLD, ADVANCE becomes HOLD.

Morale gates *whether* a unit will WITHDRAW (above), but it does **not** change the [WITHDRAW roll](Stances.md#the-withdraw-roll) odds — only unit speed and Shadow Mana do.

The UI greys out ADVANCE when it would be overridden. Full detail on stances: **[Stances](Stances.md)**.

---

## 7. Radii reference

| Radius | Distance | Used by |
|---|---|---|
| **Witness** | 3 (Chebyshev) | Witness-victory gains **and** allied-death losses |
| **Rally** | 4 (Chebyshev) | Rally-cry from a conquered city |
| **Territory rally** | 3 (Chebyshev) | Morale from a captured territory |

---

## Practical morale tips
- Keep a **Heavy Infantry** anchor alive; nearby kills feed witness-victory morale to your line.
- **Don't over-ADVANCE** — the 2/round drain plus damage drain can tip a winning unit into Wavering, costing it the charge.
- **Conquering cities is a morale engine** (+25 to the conqueror, +10 to nearby allies) — but **losing one** demoralizes your *entire* nation by 10.
- After a hard fight, **rest in a city** (+4/sec) to recover, mindful of the 30-tick post-loss penalty.

→ Continue to **[Map, Terrain & Movement](Map-Terrain-Movement.md)**
