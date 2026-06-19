# Scenarios & Tutorial

[← Back to Home](README.md)

## Included scenarios

Three scenarios ship with the game (chosen from the menu's scenario picker). Each defines its own map, nations, starting forces, resource deposits, diplomacy, and victory condition.

### 1. Evershadow Tribe
> *"The Evershadow Tribe lurks beyond the Shadow Mountains. Break through their fortified passes before they descend on your cities."*

- **You:** Thornwall Coalition (blue) — cities **Ashford** & **Irongate**, starts with Infantry + Scout, `masonry` tech.
- **Enemy:** Evershadow Tribe (purple) — cities **Darkpeak** & **Ashveil**, `hunting` tech.
- **Start:** at war. **Deposits:** two Shadow Mana + one Copper.
- **Victory:** eliminate all.

### 2. The Invaders
> *"A ruthless invasion force lands from the east with superior iron weapons. Unite the coalition and hold the line."*

- A 4-nation map. You (**Verdant Hold**, green) are **allied** with **Northern Reach** and **Southfen**, all three **at war** with **The Invaders** (red), who start with **Iron Working + Steel Working** tech and the most resources.
- **Deposits:** Fire Glass, Iron, Copper.
- **Victory:** eliminate all.

### 3. Tutorial
> *"Learn the ropes: mouse controls, upgrade your Barracks and train a Longbowman, then siege the neighbouring hold. The enemy stays passive so you can take your time."*

- **You:** Rivervale (blue) — one city (Rivervale, pre-built Barracks), Infantry + Scout, generous resources, `masonry`/`writing`/`hunting` techs.
- **Enemy:** Greyhold — one city, a single Infantry, passive.
- A small island map with one Copper deposit. **AI forced to Sandbox (passive); fog disabled.**

---

## The Tutorial

The tutorial runs the Tutorial scenario with a **passive opponent** and **no fog**. It's driven by a listen-only manager (it never issues commands for you) and rendered as a **draggable card** that highlights the relevant tile/element with a pulsing ring and an arrow. The map and HUD stay fully interactive.

### Required steps (in order)
1. **Select a unit** — left-click your glowing unit.
2. **Move it** — left-click an empty tile to march (tip: left-drag paints a path).
3. **Pan the camera** — hold **right mouse** and drag to find the enemy to the north.
4. **Open your city** — double-click Rivervale.
5. **Upgrade the Barracks to Lvl 2** — Buildings tab → ▲ UP (unlocks the Longbowman).
6. **Train a Longbowman** — Units tab → BUILD (it out-ranges Infantry).
7. **Defeat the enemy unit** — march your Longbowman onto the enemy Infantry.
8. **Train more units for the siege** — a single unit can't take a city; queue 2 more.
9. **Conquer Greyhold** — march your army onto the enemy city (conquering rallies nearby troops with a morale boost).
10. **Research a technology** — open Research and pick one.
11. **Review diplomacy** — open the Diplomacy panel.

After these, the overlay shows **"Tutorial Complete"** with "Keep playing" / "Back to menu".

### Bonus steps (optional checklist)
- **Build a mine on a deposit** — march a unit onto the copper deposit, build an Outpost then a Copper Mine (unlocks bronze weapons).
- **Raze or downsize a city** — in the captured city's menu, use RAZE or −1 LVL.

### New-player nudge
On the menu, first-time players (no `localStorage 'nml:hasPlayed'`) see a banner pointing them to the tutorial. Tutorial scenarios are marked with a ★. Launching any game sets the flag.

---

## Scenario file format

Scenarios are defined in `scenarios.json` with this shape (see `scenarios.ts`):

```ts
ScenarioDefinition {
  id, name, description,
  deposits:   { row, col, type }[],          // type = a TerritoryResourceType key
  nations:    { name, color, isPlayer, cities[], units[], resources{}, startingTechs[] }[],
  diplomacy?: { nation1, nation2, status: 'WAR' | 'ALLY' }[],
  victoryCondition?: { type: 'eliminate_all' } | { type: 'survive_ticks', ticks },
  isTutorial?: boolean
}
```

Maps are separate `.terrain` text files registered by id (see [the `.terrain` format](Map-Terrain-Movement.md#7-the-terrain-map-file-format)). To add a scenario: create `src/config/maps/<id>.terrain`, import it, register it, and add the scenario object to `scenarios.json`.

→ Continue to **[Constants & Glossary](Constants-and-Glossary.md)**
