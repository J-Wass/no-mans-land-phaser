# Morale

[← Back to Home](README.md)

Morale is a second bar running **parallel to HP**, from **0 to 100**. New units start at **80**. High morale hits harder and blocks more; low morale can't charge and eventually **routs**.

**Passive rest can never raise morale above 80** — only events (wins, kills, conquests, witnessing kills) reach the Inspired band.

> Gains are **local** (radius around the event) but losing a city hits **every unit of the nation**.

All constants are in `config/moraleBalance.ts`; helpers in `systems/morale/moraleRules.ts`; event-driven changes in `systems/morale/MoraleSystem.ts`; recovery in `TickEngine`.

---

## 1. Bands & combat effects

| Band | Range | Damage × | Mitigation Δ | Bar colour |
|---|---|---|---|---|
| **INSPIRED** | 90–100 | 1.12 | +0.04 | gold `#f0c040` |
| **STEADY** | 60–89 | 1.00 | 0.00 | blue `#4488ff` |
| **WAVERING** | 40–59 | 0.92 | −0.03 | amber `#ffaa22` |
| **SHAKEN** | 15–39 | 0.80 | −0.06 | orange `#ff6622` |
| **BROKEN** | 0–14 | 0.60 | −0.10 | red `#ff4444` |

The damage multiplier and mitigation delta apply **only in unit-vs-unit battles**. Sieges, territory battles and ranged fire drain morale but ignore bands. The band also [gates stances](Stances.md#how-morale-gates-stances).

---

## 2. Morale lost in combat (inline, same tick as the damage)

```
on taking damage d > 0:  morale -= ceil(d / maxHP × 45)
```
Applies to battle damage, siege counter-attacks, territory counter-attacks, ranged fire (including city counterfire on a shooter). Example: a 100-HP unit taking 25 → −12.

Also:
- **ADVANCE:** −2 per resolved round (battles, sieges, territory battles).
- **Battle lost:** a surviving loser of a WITHDRAW or ROUT loses another **15**.

---

## 3. Event gains (MoraleSystem)

Radii are **Chebyshev**.

| Event | Amount | Who |
|---|---|---|
| `battle:ended` with reason ELIMINATION or WITHDRAW | **+20** | The winner (if alive). |
| `unit:destroyed` with a killer | **+8** | The killer (if alive). Killers: battle winners, ranged-fire shooters, spy detectors. |
| …same event | **+5** | Every other unit **of the killer's nation** within 3 of the death tile. |
| `city:conquered` | **+25** | The conquering unit. |
| …same event | **+10** | Every other unit of the conquering nation within 4 of the city. |
| `territory:claimed` **with** a `fromNationId` (a territory conquest, not an outpost or city capture) | **+6** | Every unit of the claiming nation within 3 of the tile (including the conqueror). |
| `city:siege-round` where the city took damage and the besieger took 0 | **+1** | The besieger. |

## 4. Event losses

| Event | Amount | Who |
|---|---|---|
| `unit:destroyed` (any cause, killer or not) | **−6** | Every living unit of the **dead unit's nation** within 3 of the death tile. |
| `city:conquered` | **−10** | **Every** living unit of the previous owner, anywhere. |
| Battle lost (withdraw/rout) | −15 | The surviving loser (see §2). |

Each grant/drain emits `morale:gained` / `morale:lost` with a source (`win`, `kill`, `witness`, `conquest`, `rally`, `territory`, `siege` / `allied-death`, `city-lost`, `battle-lost`). All changes clamp to [0, 100].

---

## 5. Recovery (passive rest)

Every **10 ticks**, each unit that is alive, **not engaged in combat**, and below 100 recovers based on the tile it stands on:

| Tile | Recovery |
|---|---|
| Owned by another nation (any relation) | **0** |
| Unowned | **+1** |
| Own territory | **+2** |
| Own city tile | **+4** |

- If `currentTick < moraleRecoveryCooldownUntilTick` (set to `tick + 30` when the unit loses a battle and survives), recovery is halved and floored (1→0, 2→1, 4→2).
- Recovery never pushes morale above **80**: `morale = max(morale, min(morale + recovery, 80))`.

City resting also heals **`ceil(5% × maxHP)` HP per second** (units on their own nation's city tile, not engaged).

---

## 6. Band-change notifications
Every tick MoraleSystem compares each living unit's band with the last band it saw and emits `morale:band-changed {oldBand, newBand, value}`. The HUD shows a toast for **your** units when the band gets worse, or when it recovers to STEADY or INSPIRED: `"{unit full name}: {BAND}."`

---

## 7. Radii

| Radius | Value | Used by |
|---|---|---|
| `WITNESS_RADIUS` | 3 | witness-victory gains and allied-death losses |
| `RALLY_RADIUS` | 4 | rally cry after a city conquest |
| `TERRITORY_RALLY_RADIUS` | 3 | territory-conquest gain |

---

## Tips
- Resting in a city recovers +4/s up to 80 and heals 5%/s.
- Two rounds of ADVANCE plus damage can drop a Steady unit into Wavering and cancel its charge.
- Conquering cities is the biggest morale engine; losing one demoralises your whole army.

→ Continue to **[Economy & Resources](Economy-and-Resources.md)**
