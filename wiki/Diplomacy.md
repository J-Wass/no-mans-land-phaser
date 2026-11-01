# Diplomacy

[← Back to Home](README.md)

Nations relate through three statuses and can trade resources. `DiplomacySystem` owns auto-war, peace treaties, peace cooldowns and AI trade evaluation; each `Nation` stores its own relation map.

---

## 1. Relation statuses

| Status | Enum | Meaning |
|---|---|---|
| **Neutral** | `NEUTRAL` | Default for every pair. Units can walk through each other's land. Bumping into a unit or city, or ranged fire, triggers war. Shown as "At Peace" / "AT PEACE". |
| **War** | `WAR` | Territory battles become possible; the AI's attack-strength checks count you. |
| **Ally** | `ALLY` | Set only by scenarios. Allies are never targeted by ranged fire or the AI, never trigger auto-war, never detect each other's spies, and see each other's spies. There is no UI to form or break alliances. |

- Relations are always set symmetrically by the systems (`declareWar`, `makePeace`). `getRelation` defaults to NEUTRAL.
- Trade is a one-off transaction, not a relation.
- When a nation is defeated, every other nation drops its relation entry for it.

### Known nations
The diplomacy widget and modal only list **known** nations: those owning a tile or city the observer has discovered, plus any nation whose relation with the observer is not NEUTRAL (war/ally are always known). Defeated nations are listed separately as "RIP {name} — DEFEATED".

---

## 2. Going to war

- **Manual:** DECLARE WAR (modal) or WAR (widget) → command `DECLARE_WAR`. Fails if a peace cooldown is active or already at war. Sets WAR both ways and emits `diplomacy:war-declared`. (A WAR button is also offered against allies in the widget; it works and overwrites ALLY.)
- **Automatic** (`declareWarIfNeeded`), on:
  - `battle:started` — between the two units' nations,
  - `city:siege-started` — between the unit's and the city's nations,
  - `ranged:fired` — between the shooter's nation and the target unit's/city's nation.

  Auto-war is skipped if the nations are the same, already at war, **allied**, or within a **peace cooldown**. Note the combat itself still happens in those cases.
- **Move-into-neutral confirmation (UI only):** before dispatching a player move, the game scans the path. Any NEUTRAL nation that owns a tile on the path, owns a city on the path, or has a unit standing on a path tile is collected. If any are found, the **War Confirm** modal ("DECLARE WAR?" — "Moving this unit will pull the following nations into open conflict." — list "- {name}" — CANCEL / DECLARE WAR & MOVE) appears; confirming sends `DECLARE_WAR` for each, then the move.

---

## 3. Making peace

`PROPOSE_PEACE` (modal PROPOSE PEACE or widget PEACE):
1. Fails unless the two nations are at war.
2. If the target is AI-controlled, it compares total current HP of all living units: **refuses if `aiStrength > proposerStrength × 1.4`** with the reason "`{name} refuses — they are winning this war.`" (the widget shows this as a toast; the modal just closes). Human-controlled targets always accept.
3. On acceptance:
   - Both relations → NEUTRAL.
   - Peace cooldown: `PEACE_COOLDOWN_TICKS = 1200` (2 min) keyed by the sorted pair `"a:b"`. Neither manual nor automatic war is possible until it expires; the modal's war button shows "`WAR ({seconds}s)`".
   - Every unit of each nation standing on the **other** nation's territory is teleported to the nearest (Manhattan) tile its own nation owns that no other unit occupies (tiles are reserved as they are assigned); its movement order is cancelled. Units with nowhere to go stay put.
   - `diplomacy:peace-signed` fires → TickEngine force-ends every battle, siege and territory battle between the two nations (no XP/morale effects).

Peace cooldowns are saved with the game.

---

## 4. Trading

From the Diplomacy modal's TRADE section: for Gold, Materials and Food set "YOU GIVE" and "YOU RECEIVE" with −/+ steppers in steps of 10 (capped at your amount / their amount when the modal opened), then **⇄ EXECUTE TRADE** → `OFFER_TRADE {offer, request}`.

### AI evaluation (`evaluateTradeForAI`)
Keyed by `"{yourNation}:{aiNation}"`:
1. If ≥ 1200 ticks (2 min) have passed since your last offer to this AI, its rejection count and backoff reset. Record this offer's tick.
2. If a backoff is active → reject ("Trade rejected. Try again in {s}s.").
3. `offerTotal` = sum of offered amounts, `requestTotal` = sum of requested amounts (all resources count 1:1).
4. `requestTotal == 0` → **gift, always accepted**.
5. `needsBonus` = 0.5 × each offered amount of a resource the AI currently has **below 20**.
6. Accept if `(offerTotal + needsBonus) / requestTotal ≥ 0.70` (clears rejection state).
7. Otherwise reject: `count++`, backoff = `100 × 2^(count−1)` ticks (10 s, 20 s, 40 s, …).

Trades with **human-controlled** nations skip evaluation. After acceptance both treasuries are checked (you must have every offered amount, they every requested amount) and the transfer executes; otherwise "Insufficient {TYPE} to offer" / "Target nation lacks {TYPE}". Trade backoff state is not saved.

---

## 5. The Nation entity

A **Nation** is a faction; a **Player** (human or AI) controls it (`nation.controlledBy = playerId`, `player.controlledNationId = nationId`).

```ts
type NationJSON = {
  id; name; color; isAI: boolean; controlledBy: string | null;
  treasury: Record<ResourceType, number>;
  relations: Record<nationId, 'ALLY' | 'NEUTRAL' | 'WAR'>;
  researchedTechs: TechId[];
  currentResearch: { techId; ticksTotal; ticksRemaining } | null;
  researchQueue: TechId[];
};
```
Units, cities and territory are tracked globally and looked up by owner id.

### Defeat
At the end of every tick, a nation with **no cities and no living units** is defeated: a tombstone `{id, name, color, defeatedAtTick}` is stored, relations to it are removed, its units/cities (if any) are deleted, all its tiles are released (no owner, no buildings, full HP), constructions it started are cancelled, and the nation is removed. `nation:defeated` fires. A nation that has lost all cities but still has units keeps playing.

→ Continue to **[Artificial Intelligence](AI.md)**
