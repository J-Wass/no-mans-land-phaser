# Scenarios & Tutorial

[← Back to Home](README.md)

Three scenarios ship in `src/config/scenarios.json`, in this order (the first is the menu default). All use 60×60 hand-made maps. Full JSON and maps: **[Scenario Data](Scenario-Data.md)**.

Scenario games use the difficulty selected on the menu's Standard Match card (default Medium) for the AI, except the tutorial, which forces Sandbox (passive AI). Scenario units have no home city. Victory is evaluated as described in [Overview → Winning and losing](Overview.md#winning-and-losing).

---

## 1. Evershadow Tribe (`evershadow-tribe`)
> *"The Evershadow Tribe lurks beyond the Shadow Mountains. Break through their fortified passes before they descend on your cities."*

| | Thornwall Coalition (you) | Evershadow Tribe (AI) |
|---|---|---|
| Colour | `#4a8fc2` | `#5c3d7a` |
| Cities | Ashford (40,19), Irongate (40,37) | Darkpeak (16,19), Ashveil (16,37) |
| Units | Infantry (41,19), Scout (41,20) | Infantry (17,19), Scout (17,20) |
| Resources | 60 Gold, 30 Food, 25 Raw Material | 35 Gold, 55 Food, 30 Raw Material |
| Techs | masonry | hunting |

- Deposits: Shadow Mana (25,19), Shadow Mana (25,37), Copper (33,28).
- Starts **at war**. Victory: eliminate all.
- Map: the south (you) is plains dotted with snow-forest; a band of mountains (rows ~20–31) separates you from the forested north, crossed by a single winding plains pass around columns 24–32.

## 2. The Invaders (`the-invaders`)
> *"A ruthless invasion force lands from the east with superior iron weapons. Unite the coalition and hold the line."*

| Nation | Colour | Player | Cities | Units | Resources | Techs |
|---|---|---|---|---|---|---|
| **Verdant Hold** | `#3a7d44` | you | Mossgate (29,17), Fernwall (29,23) | Infantry (30,17), Scout (30,18) | 55 G, 35 F, 25 RM | masonry |
| Northern Reach | `#6b8cba` | AI | Frostholm (17,17), Galewatch (17,23) | Infantry (18,17), Scout (18,18) | 50 G, 40 F, 20 RM | hunting |
| Southfen | `#c4a040` | AI | Bogmere (41,17), Reedwatch (41,23) | Infantry (42,17), Scout (42,18) | 50 G, 40 F, 20 RM | writing |
| **The Invaders** | `#cc3333` | AI | Beachhead (17,41), Ironshore (41,41) | Infantry (18,41), Scout (18,40) | 80 G, 30 F, 50 RM | iron_working, steel_working |

- Deposits: Fire Glass (15,43), Iron (29,29), Copper (29,15).
- Diplomacy: Verdant Hold, Northern Reach and Southfen are mutual **allies**; all three are **at war** with The Invaders.
- Victory (eliminate all): when no non-allied nation remains — i.e. The Invaders are destroyed (your allies don't need to survive).
- Map: a checkerboard of forest and plains in the west, a north–south mountain spine in the middle, and a long desert strip on the eastern side.

## 3. Tutorial (`tutorial`, `isTutorial: true`)
> *"Learn the ropes: mouse controls, upgrade your Barracks and train a Longbowman, then siege the neighbouring hold. The enemy stays passive so you can take your time."*

| | Rivervale (you) | Greyhold (AI) |
|---|---|---|
| Colour | `#4a8fc2` | `#5c3d7a` |
| City | Rivervale (15,8) with a pre-built **Barracks** (level 1) | Greyhold (8,14) |
| Units | Infantry (16,8), Scout (15,9) | Infantry (10,14) |
| Resources | 300 Gold, 1200 Food, 800 Raw Material, 300 Research | 10 Gold |
| Techs | masonry, writing, hunting | — |

- Deposit: Copper (13,10). At war from the start. A small island in the map's top-left.
- Launched with `difficulty: 'sandbox'` → no AI controllers (the enemy never acts). The scenario mode is still `scenario`, so normal costs and timings apply.
- **Fog of war is disabled.** Automatic victory/defeat is disabled (the scripted steps continue after Greyhold falls).

---

## The tutorial system

`TutorialManager` is **listen-only**: it subscribes to `GameEventBus` events, never issues commands or touches game state, and renders through a `TutorialUI` (the `TutorialOverlay` card) plus a tile-highlight callback (GameScene's pulsing ring). It is created only when a *new* tutorial game starts (not when loading a save).

- Required steps run **one at a time**; a step completes when one of its events fires and its `match` predicate (if any) passes. One completion per event.
- When the active step activates, its `highlight.tile` resolver runs once and GameScene rings that tile; `highlight.dom` rings a DOM element.
- After the last required step, **bonus** steps are armed together (any order); the card shows a checklist titled "Tutorial Complete — Optional Extras" with ✓/○ marks, the first incomplete bonus step's body (or "You can also keep playing freely."), and **Keep playing** (dismiss the overlay) / **Back to menu**.
- With no bonus steps left the view is "TUTORIAL COMPLETE — Well done! You've covered the essentials. Keep playing this map, or head back to the menu for a real match."

### Required steps

| # | Id | Title | Body | Completes on | Highlight |
|---|---|---|---|---|---|
| 1 | `select-unit` | Select a unit | Left-click on your unit (the highlighted tile) to select it. Selected units show stats and stance buttons in the panel at the bottom left. | `unit:selected` with one of your units | your first unit's tile |
| 2 | `move-unit` | Move it with a left-click | With your unit selected, left-click an empty tile to march there. Tip: left-click and DRAG to paint a custom multi-step path. | `unit:move-ordered` | your first unit's tile |
| 3 | `pan-camera` | Pan the camera | Hold the RIGHT mouse button and drag to pan around the map. Try it — find the enemy unit to the north. | `ui:camera-panned` | — |
| 4 | `open-city` | Open your city | Double-click your city (Rivervale) to open its management menu — that's where you train units and construct buildings. | `ui:modal-opened` = `cityMenu` | your first city |
| 5 | `upgrade-barracks` | Upgrade the Barracks to Lvl 2 | On the Buildings tab, find the Barracks (already built at Lvl 1) and press UPGRADE. Lvl 2 unlocks the Longbowman. | `city:building-built` BARRACKS in your city with level ≥ 2 | — |
| 6 | `train-longbowman` | Train a Longbowman | Back on the Units tab, press BUILD next to the Longbowman. They out-range Infantry, so they're your edge against the enemy on the road. | `city:production-started` with LONGBOWMAN | DOM `produce-unit` (unit list) |
| 7 | `defeat-enemy` | Defeat the enemy unit | Once your Longbowman musters, march it onto the enemy Infantry. Longbowmen out-range Infantry, so they win on open ground. | `unit:destroyed` of a non-local unit whose killer is yours | first living enemy unit |
| 8 | `train-more` | Train more units for the siege | Re-open Rivervale and queue 2 more units. A city is too tough for one unit alone — you'll want a small force to take Greyhold. | the **second** `city:production-started` after this step activates (counted in the tutorial's scratch state) | — |
| 9 | `conquer-city` | Conquer Greyhold | March your units onto the enemy city. Only one of your units can stand on it at a time, so bring a few: if your besieger falls, the next one steps in. Conquering a city rallies nearby troops with a morale boost. | `city:conquered` by you (records the tick) | first non-local city |
| 10 | `research-tech` | Research a technology | Press RESEARCH on the top bar and pick a tech. Better tech unlocks stronger units, mines, and buildings. | `nation:research-started` by your nation | — |
| 11 | `open-diplomacy` | Review diplomacy | Press OPEN FULL on the Diplomacy panel (bottom right) to see relations, declare war, or sue for peace. | `ui:modal-opened` = `diplomacy` | — |

### Bonus steps

| Id | Title | Body | Completes on | Highlight |
|---|---|---|---|---|
| `build-mine` | Bonus: build a mine on a deposit | A copper deposit sits north of your city. March a unit onto it, build an Outpost, then a Copper Mine to unlock bronze weapons. | `territory:building-built` of any mine type | first deposit tile (row-major) |
| `raze-city` | Bonus: raze or downsize a city | In the captured city's menu, use RAZE or −1 LVL to tear down its buildings. Useful if you can't hold it. | `city:buildings-changed` with a tick later than the conquest tick | — |

(The checklist labels drop the "Bonus: " prefix.)

### New-player nudge
If `localStorage['nml:hasPlayed']` is unset and a tutorial scenario exists, the menu shows a banner with START TUTORIAL. Launching anything or dismissing the banner sets the flag. Tutorial scenarios are prefixed with ★ in the scenario list.

---

## Scenario file format

```ts
interface ScenarioDefinition {
  id: string; name: string; description: string;
  deposits: { row: number; col: number; type: string /* TerritoryResourceType key */ }[];
  nations: {
    name: string; color: string; isPlayer: boolean;
    cities: { name: string; row: number; col: number; buildings?: string[] /* CityBuildingType keys, built at level 1 */ }[];
    units:  { type: UnitType; row: number; col: number }[];
    resources: Partial<Record<'GOLD' | 'FOOD' | 'RAW_MATERIAL' | 'RESEARCH', number>>;
    startingTechs: TechId[];
  }[];
  diplomacy?: { nation1: number; nation2: number; status: 'WAR' | 'ALLY' }[];   // indices into nations
  victoryCondition?: { type: 'eliminate_all' } | { type: 'survive_ticks'; ticks: number };
  isTutorial?: boolean;
}
```

To add a scenario: create `src/config/maps/<name>.terrain`, import it with `?raw` in `scenarios.ts`, register it in `MAP_REGISTRY` under the scenario id, and append the definition to `scenarios.json`. Exactly one nation should have `isPlayer: true`. Without a registered map the grid falls back to skirmish sizing with all-plains terrain.

→ Continue to **[Scenario Data](Scenario-Data.md)**
