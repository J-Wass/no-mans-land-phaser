# Diplomacy

[← Back to Home](README.md)

Nations relate to each other through three statuses, and can trade resources. You manage all of this through the [Diplomacy modal and widget](Controls-and-UI.md#diplomacy-widget-bottom-right).

---

## 1. Relation statuses

| Status | Meaning |
|---|---|
| **Neutral** | Default. No combat by default, but moving into each other's land/units triggers a war. |
| **War** | Hostile. Units fight on contact; you can siege cities and conquer territory. |
| **Ally** | Friendly. The AI never targets allies. *(Alliances are a partial placeholder — the UI supports them but full team-game logic isn't implemented yet.)* |

> There is no separate "trade agreement" status — **trade is a one-off transaction**, not a standing relation.

All nation pairs start **Neutral** (unless a scenario sets otherwise).

---

## 2. Going to war

- **Declare manually** from the Diplomacy modal/widget. This fails if a **peace cooldown** is active or you're already at war. War is set symmetrically for both nations.
- **Auto-war** triggers whenever you actually attack a non-allied nation:
  - Starting a melee battle (moving a unit into theirs),
  - Starting a city siege,
  - **Firing on** their unit or city with ranged fire.
- **Move-into-neutral warning:** if you order a move whose path crosses a neutral nation's land, or that ends on their unit/city, a **War Confirm modal** pops up first — the move only proceeds if you confirm **"DECLARE WAR & MOVE"**, which declares war on each affected neutral nation.

---

## 3. Making peace

- **Propose Peace** is only valid while at war.
- If the target is **AI**, it evaluates the offer by comparing army strength (summed unit HP): it **refuses if it's winning by more than 40%** (`aiStrength > yourStrength × 1.4`) — "they are winning this war." Otherwise it accepts.
- On peace:
  - Both nations return to **Neutral**.
  - A **peace cooldown of 1200 ticks (~2 minutes)** begins — neither can re-declare war until it expires.
  - Any units sitting on the other nation's territory are **teleported back** to their nearest own tile (orders cancelled).

---

## 4. Trading

From the Diplomacy modal's **TRADE** section you offer Gold/Materials/Food ("YOU GIVE") in exchange for the same ("YOU RECEIVE"), in steps of 10, capped by each treasury, then **⇄ EXECUTE TRADE**.

How the **AI evaluates** a trade from you:

1. **Pure gifts** (you ask for nothing) are **always accepted**.
2. **Needs bonus:** for each resource you offer that the AI currently holds below **20**, that resource is worth **+50% more** to it.
3. It **accepts if `effectiveOfferValue / requestValue ≥ 0.70`** — i.e. your offer is worth at least 70% of what you're asking.
4. On rejection, a **backoff window** starts (10 sec, **doubling** with each consecutive rejection) during which further offers are auto-rejected. The rejection streak resets if you don't offer anything for 2 minutes.

So: lowball offers get rejected and lock you out for a while; offering an AI a resource it's starved for makes deals far easier.

---

## 5. The Nation entity

A **Nation** is a faction in the world (distinct from the **Player** — human or AI — controlling it). It owns:

- A **treasury** ([resources](Economy-and-Resources.md)).
- **Diplomatic relations** with every other nation (default Neutral).
- **Research** state: completed techs, the current research, and a research queue.

Units, cities, and territory are **not** stored on the Nation — they're tracked globally and looked up by owner ID. The Nation just holds treasury, relations, and research.

→ Continue to **[Artificial Intelligence](AI.md)**
