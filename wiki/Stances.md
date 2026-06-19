# Stances (Battle Orders)

[← Back to Home](README.md)

Every unit has a **stance** — also called its *battle order* — that you set from the unit panel. It controls how the unit fights: offense vs defense vs disengaging. The three stances are **HOLD**, **ADVANCE**, and **WITHDRAW**. New units start on **HOLD**.

Crucially, your chosen stance can be **overridden by morale**: a shaken unit can't charge, and a broken unit can't do anything but flee or hold. See [How morale gates stances](#how-morale-gates-stances).

> The legacy name "FALL_BACK" in old saves is automatically converted to WITHDRAW.

---

## The three stances

### 🛡 HOLD — stand ground
- **Best mitigation:** base **0.22** (the highest of any stance).
- No offense bonus (order factor ×1.0).
- Unlocks defensive specials: **Heavy Infantry shield wall +0.16 mitigation**, and **+0.08 in snow-forest**.
- The default brace stance — great for defenders, terrain, and walls.

### ⚔ ADVANCE — press the enemy
- **Offense bonus:** **×1.25** for most units, **×1.5 for Cavalry** (the "Charge").
- **Lowest mitigation:** base **0.04** (exposed).
- **Forces ranged units into melee** (they can't fire while advancing).
- Speeds up the whole exchange: triggers the **×1.25 battle pace factor** for *both* combatants.
- **Costs 2 morale per round.**
- vs cities: **halves wall mitigation** (×0.45). vs territory: **bypasses walls entirely**.
- On PLAINS, charging Cavalry gets **+12% offense** but **−4% mitigation**.
- **Requires morale ≥ 60** to actually execute (otherwise it silently becomes HOLD).

### 🏃 WITHDRAW — disengage
- Mitigation base **0.16** (between HOLD and ADVANCE). Crossbowman on WITHDRAW gets **+0.12** (kiting), and snow-forest adds **+0.08**.
- In **sieges and territory battles**, WITHDRAW is **automatic and always succeeds** — the unit disengages next round (the defender regains a little HP).
- In **unit-vs-unit battles**, WITHDRAW is a **roll** (see below), not guaranteed.
- Use it to save a wounded unit before it dies.

| | HOLD | ADVANCE | WITHDRAW |
|---|---|---|---|
| Mitigation base | **0.22** | 0.04 | 0.16 |
| Offense factor | ×1.0 | ×1.25 (cav ×1.5) | ×1.0 |
| Ranged unit fires? | yes | **no (melee)** | yes |
| Morale cost/round | 0 | **2** | 0 |
| Morale required | any | **≥ 60** | any |

---

## The WITHDRAW roll

In a **unit-vs-unit** battle, choosing WITHDRAW doesn't instantly disengage — each round both units roll for it, and the battle ends by withdrawal only if **exactly one** succeeds (that unit becomes the loser and flees). The chance:

```
chance = clamp(
    0.30                                       // WITHDRAW_BASE_CHANCE
  + (ownSpeed − opponentSpeed) × 0.07          // faster units escape more easily
  + shadowManaWithdrawBonus,                   // +0.15 per shadow mine (15/30/45% at 1/2/3 mines)
    0.15, 0.90 )                               // floor 0.15, ceiling 0.90
```

The roll also **requires a valid [retreat tile](Combat.md#retreat-targeting) to exist** — if the unit has nowhere to flee, the withdrawal fails that round (and if it loses the fight outright with no tile, it is killed in place).

So fast units (high speed) escape more reliably, and Shadow Mana deposits sharply improve the odds (+15% per mine). Morale does **not** change the chance — it only decides whether the unit is willing to WITHDRAW at all (see [below](#how-morale-gates-stances)).

---

## How morale gates stances

Your chosen stance is filtered through `effectiveBattleOrder` based on the unit's current morale:

| Morale | Effect on stance |
|---|---|
| **≥ 60** | Your chosen stance stands. |
| **≤ 59** (Wavering or worse) | **ADVANCE is downgraded to HOLD** — too shaken to charge. |
| **≤ 14** (Broken / rout) | **Only WITHDRAW is honored.** HOLD stays HOLD; ADVANCE becomes HOLD. The unit is also subject to the [rout](Combat.md#ending-a-battle-checked-in-this-order) end-condition. |

In the UI, the **ADVANCE button is greyed out** whenever morale would override it, and the unit panel's hint line tells you exactly what's happening (e.g. "Morale WAVERING: ADVANCE downgraded to HOLD").

Additionally, units in the **SHAKEN** band (morale 15–39) get **+0.10** to their WITHDRAW roll — frightened troops flee more readily.

---

## Retreat cooldown

After **losing** a unit-vs-unit battle (and surviving), a unit gets a **20-tick retreat cooldown** during which it **cannot be re-engaged** in another battle — a brief window to escape. It also gets a **30-tick window of halved morale recovery**. Both are tracked per unit and saved with the game.

→ Continue to **[Morale](Morale.md)**
