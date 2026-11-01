# Stances (Battle Orders)

[← Back to Home](README.md)

Every unit has a **stance** (`battleOrder`): **HOLD**, **ADVANCE**, or **WITHDRAW**. New units start on HOLD. Set it from the unit panel's three STANCE buttons (command `SET_UNIT_BATTLE_ORDER`); it can be changed at any time, including mid-battle, and takes effect at the next round. The AI sets ADVANCE when attacking and HOLD when defending.

Your chosen stance is filtered by morale into an **effective** stance — see [below](#how-morale-gates-stances). Every combat system uses the effective stance.

> Old saves using `FALL_BACK` load as WITHDRAW.

---

## The three stances

### 🛡 HOLD — stand ground
- Highest base mitigation: **0.22**.
- Order factor ×1.0.
- Enables Heavy Infantry's shield wall (+0.16 mitigation) and the snow-forest dig-in (+0.08); on snow-forest a melee HOLDer also gets ×1.05 offense.
- Ranged units fire normally.

### ⚔ ADVANCE — press the attack
- Order factor **×1.25** (Cavalry **×1.5**).
- Lowest base mitigation: **0.04**.
- **Ranged units fight in melee** (no ranged attack while advancing).
- Sets the battle's pace factor to ×1.25 for **both** combatants.
- Costs **2 morale per round** (battles, sieges and territory battles).
- vs cities: wall mitigation × 0.45. vs territory: ignores the 0.20 wall mitigation.
- Cavalry on Plains: ×1.12 offense, −0.04 mitigation.
- Only honoured at **morale ≥ 60**.

### 🏃 WITHDRAW — disengage
- Base mitigation **0.16**; Crossbowman +0.12; snow-forest +0.08.
- **Sieges and territory battles:** the unit always disengages at the next round (retreating toward where it came from; a territory regains 10 HP).
- **Unit battles:** a roll each round (below).
- Ranged units fire normally.
- Outside of combat WITHDRAW does nothing on its own (the unit doesn't move away from enemies).

| | HOLD | ADVANCE | WITHDRAW |
|---|---|---|---|
| Base mitigation | **0.22** | 0.04 | 0.16 |
| Order factor | ×1.0 | ×1.25 (Cavalry ×1.5) | ×1.0 |
| Ranged unit uses ranged attack | yes | **no** | yes |
| Morale per round | 0 | −2 | 0 |
| Needs morale | any | ≥ 60 | any |

---

## The WITHDRAW roll

In a unit battle, after damage and the death check, each unit whose **effective** stance is WITHDRAW rolls once:

```
chance = clamp( 0.30
              + (ownSpeed − opponentSpeed) × 0.07
              + 0.15 × min(3, ownShadowManaMines),
              0.15, 0.90 )
success = rng() < chance  &&  a retreat tile exists
```

- If **exactly one** unit succeeds, it becomes the battle's loser and retreats (+1 XP, −15 morale, 20-tick retreat cooldown; the winner gets +2 XP and +20 morale).
- If both or neither succeed, the fight continues.
- Morale does **not** change the odds — it only decides whether WITHDRAW is honoured at all.
- The roll is drawn from the game RNG before checking for a retreat tile, so a failed tile check still consumes the draw.

Examples: Scout (speed 3) withdrawing from Heavy Infantry (speed 1): 0.30 + 0.14 = 44%. Heavy Infantry withdrawing from Cavalry: 0.30 − 0.14 = 16%.

---

## How morale gates stances

```ts
effectiveBattleOrder(unit):
  if morale <= 14: return chosen == WITHDRAW ? WITHDRAW : HOLD      // broken
  if morale <= 59 && chosen == ADVANCE: return HOLD                  // too shaken to charge
  return chosen
```

| Morale | Effect |
|---|---|
| ≥ 60 (Steady/Inspired) | Chosen stance stands. |
| 15–59 (Wavering/Shaken) | ADVANCE becomes HOLD. |
| ≤ 14 (Broken) | Only WITHDRAW is honoured; anything else is HOLD. A unit at ≤ 14 also triggers the [rout](Combat.md#ending-conditions-after-damage) check. |

### In the UI
- The ADVANCE button is greyed and unclickable when the unit's morale is ≤ 59 (unless ADVANCE is already the chosen stance).
- The hint line under the unit stats explains what's happening:
  - Broken: "BROKEN: only WITHDRAW honored — unit will HOLD otherwise." (red `#ff8888`)
  - ADVANCE chosen but overridden: "Morale {BAND}: ADVANCE downgraded to HOLD until morale recovers." (orange `#ffaa44`)
  - Morale too low for ADVANCE: "Morale {BAND}: ADVANCE locked."
  - Otherwise: Cavalry "Advance acts as Charge: +50% damage."; others "Advance quickens the clash: +25% damage on both sides."
- A unit of yours that is in combat shows a floating badge with its **effective** stance (WITHDRAW `#ffaa44`, HOLD `#aaaacc`, ADVANCE `#44ddff`).

---

## Retreat cooldown
Surviving the loss of a unit battle sets `retreatCooldownUntilTick = tick + 20`: for 2 seconds the unit cannot be pulled into another unit battle (sieges and territory battles are unaffected). It also halves the unit's passive morale recovery for 30 ticks. Both are saved with the unit.

→ Continue to **[Morale](Morale.md)**
