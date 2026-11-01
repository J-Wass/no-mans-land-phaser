# Text & Content

[← Back to Home](README.md)

All user-facing text lives in `src/i18n/` (`content.ts`, `hud.ts`, `modals.ts`, `menu.ts`, aggregated by `strings.ts` as `STRINGS`) plus flavor quotes in `src/config/flavorText.ts`. Static strings are constants; templated strings are arrow functions. This page reproduces the game content text verbatim. UI chrome strings (button labels, notifications, tooltips) appear on [Controls & UI](Controls-and-UI.md), [Stances](Stances.md#in-the-ui), [Diplomacy](Diplomacy.md) and [Scenarios & Tutorial](Scenarios-and-Tutorial.md) where they're used.

Title: **NO MAN'S LAND** (browser tab title is "Phaser Game"; menu version label "v0.1").

---

## 1. Unit catalog text (City Menu → UNITS)

| Unit | Label | Detail line |
|---|---|---|
| Infantry | Infantry | `HP 100  ATK 10  RNG 1  SPD 2  VIS 1  UPKEEP F1 M1  \|  CHEAP LINE (loses to specialists)` |
| Scout | Scout | `HP 100  ATK 2  RNG 1  SPD 3  VIS 2  UPKEEP F1 M1  \|  RECON (avoid combat)` |
| Longbowman | Longbowman | `HP 100  ATK 12  RNG 3  SPD 2  VIS 1  UPKEEP F1 M1  \|  RANGED: pelts spears, weak vs CAVALRY` |
| Cavalry | Cavalry | `HP 160  ATK 32  RNG 1  SPD 3  VIS 1  UPKEEP F2 M1  REQ COPPER  \|  beats RANGED, weak vs SPEARS` |
| Crossbowman | Crossbowman | `HP 150  ATK 15  RNG 2  SPD 1  VIS 1  UPKEEP F1 M1  REQ COPPER/IRON/FIRE GLASS  \|  anti-ARMOR, weak vs CAVALRY` |
| Heavy Infantry | Heavy Infantry | `HP 250  ATK 20  RNG 1  SPD 1  VIS 1  UPKEEP F2 M1  REQ IRON  \|  SPEARS: beats CAVALRY, weak vs RANGED` |
| Catapult | Catapult | `HP 200  ATK 25  RNG 2  SPD 1  VIS 1  UPKEEP F1 M2  REQ COPPER/IRON/FIRE GLASS  \|  SIEGE: anti-armor/building, helpless vs CAVALRY` |
| Trebuchet | Trebuchet | `HP 250  ATK 50  RNG 3  SPD 1  VIS 1  UPKEEP F2 M3  REQ FIRE GLASS  \|  SIEGE: anti-armor/building, helpless vs CAVALRY` |

Catalog order (City Menu rows): Infantry, Scout, Longbowman, Cavalry, Crossbowman, Heavy Infantry, Catapult, Trebuchet.

Cost lines use `formatCost`: Food, Raw Material, Gold in that order as `{emoji}{n}` joined by two spaces (🍎, 🧱, 🪙), or `free`.

## 2. Tech names & descriptions

| Id | Name | Description |
|---|---|---|
| writing | Writing | Leads to Trade and Education. |
| hunting | Hunting | Leads to Ancient Rituals. |
| masonry | Masonry | Leads to The Wheel and Ancient Rituals. |
| trade | Trade | Improves your commerce income. |
| education | Education | Boosts your research output. |
| the_wheel | The Wheel | +20% movement speed for all your units; required for the Catapult. |
| scientific_method | Scientific Method | Leads to Chemistry, Biology, and Physics. |
| mathematics | Mathematics | Leads to Physics. |
| chemistry | Chemistry | Leads to Iron Working. |
| biology | Biology | Leads to Animal Domestication. |
| physics | Physics | Leads to Iron Working and Mana Studies. |
| animal_domestication | Animal Domestication | Leads to mounted units. |
| iron_working | Iron Working | Leads to Mechanization and Steel Working. |
| mechanization | Mechanization | Leads to advanced ranged units. |
| steel_working | Steel Working | Leads to the finest weapons. |
| ancient_rituals | Ancient Rituals | Leads to Mana Studies. |
| mana_studies | Mana Studies | Unlocks the Mana Mine. |

## 3. City building labels & perks

| Building | Label | Perks |
|---|---|---|
| CITY_HALL | City Hall | Built-in administration |
| BARRACKS | Barracks | Trains units. Higher levels unlock advanced units and speed up mobilization (−5%/level). |
| WALLS | Walls | Lvl1: +60HP +3dmg. Upgrades improve city defense through Lvl5. |
| FARMS | Farms | 🍎 +2/s per level |
| WORKSHOP | Workshop | 🧱 +1/s per level |
| WATCHTOWER | Watchtower | Vision+ |
| SCHOOL | School | 🔬 +1/s per level |
| MARKET | Market | 🪙 +1/s per level |

Building list order in the City Menu: Barracks, Walls, Farms, Workshop, Watchtower, School, Market (City Hall is not listed).

## 4. Territory building labels & perks

| Building | Label | Perks |
|---|---|---|
| OUTPOST | Outpost | Claims this tile for your nation. Prerequisite for all other territory buildings. |
| WALLS | Walls | Fortifies this territory. Each level adds HP and attack damage; higher levels also extend attack range. Up to 5 levels. |
| FARMS | Farms | Generates +2 Food per second from this territory. Food is used for unit upkeep and city growth. |
| WORKSHOP | Workshop | Generates +1 Raw Material per second from this territory. Raw materials are used to build units and structures. |
| WATCHTOWER | Watchtower | Removes fog of war in a 2-tile radius around this territory, even when no units are nearby. |
| COPPER_MINE | Copper Mine | Mines the copper deposit here. Gives all your units Bronze weapons, adding +2 melee and ranged damage. |
| IRON_MINE | Iron Mine | Mines the iron deposit here. Gives all your units Iron weapons, adding +4 melee and ranged damage. |
| FIRE_GLASS_MINE | Fire Glass Mine | Mines the fire glass deposit here. Gives all your units Fire Glass weapons, adding +6 melee and ranged damage. |
| SILVER_MINE | Silver Mine | Mines the silver deposit here, granting a nation-wide economic bonus. |
| GOLD_MINE | Gold Mine | Mines the gold deposit here, granting a larger nation-wide economic bonus. |
| MANA_MINE | Mana Mine | Activates the mana deposit on this tile, granting a nation-wide magical bonus (varies by mana type). |

Territory Menu deposit badges: ⊛ Copper, ⊗ Iron, ◈ Fire Glass, ◇ Silver, ◆ Gold, ~ Water Mana, ▲ Fire Mana, ⚡ Lightning, ◉ Earth Mana, ≋ Air Mana, ◐ Shadow.

HUD terrain names: Plains, Snowy Forest, Forest, Mountain, Desert, Water. (The Territory Menu shows the raw enum, e.g. `SNOW_FOREST`.)

## 5. Flavor quotes (hover tooltips)

**Units** (City Menu rows; Crossbowman has none):
| Unit | Quote |
|---|---|
| Scout | "One must talk little and listen much." — West African Proverb |
| Infantry | "You are about to embark upon the Great Crusade! I have full confidence in your courage, and Good Luck!" — Dwight D. Eisenhower (American Military General) |
| Longbowman | "Even the straightest arrow cannot reach the target if the bow is weak." — Joseph M. Marshall III (Lakota Storyteller) |
| Heavy Infantry | "What stands in the way becomes the way." — Marcus Aurelius (Roman Emperor) |
| Cavalry | "Speed is the essence of war." — Sun Tzu (Chinese Military General) |
| Catapult | "It is from their foes, not their friends, that cities learn the lesson of building high walls." — Aristophanes (Greek Playwright) |
| Trebuchet | "Give me a place to stand, and I shall move the earth." — Archimedes (Greek Mathematician) |

**Techs** (Research nodes):
| Tech | Quote |
|---|---|
| scientific_method | "The authority of a thousand is not worth the humble reasoning of a single individual." — Galileo Galilei (Italian Physicist) |
| mathematics | "God made the integers; all else is the work of man." — Leopold Kronecker (German Mathematician) |
| physics | "If I have seen further, it is by standing on the shoulders of giants." — Isaac Newton (English Physicist) |
| chemistry | "Nothing is lost, nothing is created, everything is transformed." — Antoine Lavoisier (French Chemist) |
| biology | "If you don't take care of this land today, tomorrow you will have rocks, not soil." — Wangari Maathai (Kenyan Environmentalist) |
| animal_domestication | "Trust in God, but tie your camel." — Prophet Muhammad (Hadith, Sunan al-Tirmidhī) |
| iron_working | "As iron sharpens iron, so one man sharpens another." — Hebrew Bible, Proverbs 27:17 |
| steel_working | "Thus he formed the steel from iron." — Kalevala |
| mechanization | "The machine does not isolate man from the great problems of nature, but plunges him more deeply into them." — Antoine de Saint-Exupéry (French Author) |
| writing | "The written word remains." — Latin Proverb |
| hunting | "Chase two rabbits — lose them both." — Unknown |
| masonry | "We shape our buildings; thereafter they shape us." — Winston Churchill (British Prime Minister) |
| trade | "The real price of everything is the toil and trouble of acquiring it." — Adam Smith (Scottish Economist) |
| education | "Study the old, and discover the new." — Confucius (Chinese Scholar) |
| the_wheel | "Give me enough chewing tobacco and TNT, and I'll build a railroad to hell!" — Michael James Heney (American Railroad Builder) |
| ancient_rituals | "When the roots are deep, there is no reason to fear the wind." — Swahili Proverb |
| mana_studies | "Ask the right questions, and nature will open the doors to her secrets." — C. V. Raman (Indian Physicist) |

(Each quote is shown wrapped in straight double quotes followed by ` — attribution`.)

## 6. HUD tooltips

| Control | Tooltip |
|---|---|
| WITHDRAW | Disengage from combat — moves away from enemies when threatened. Use to save a wounded unit. |
| HOLD | Stand ground — best mitigation, no advance. Great for defenders, terrain, and walls. |
| ADVANCE | Press the enemy — higher offense, weaker mitigation, costs morale per round. Use to push. |
| SPY (available) | Go undercover: invisible to enemies, infiltrates enemy land for recon. Caught and killed if an enemy gets close. |
| SPY (in battle) | Cannot go undercover while in battle. |
| SPY (foreign tile) | Go undercover only on your own or neutral territory. |
| DROP | Drop cover — revert to a normal Scout (own or neutral territory only). |

## 7. Other in-world text
- City capture flash: **CAPTURED!**
- Unidentified contacts: **Heavily Armored Contact** / **Lightly Armored Contact**
- Deposit tooltips: see [Economy → Deposit tooltips](Economy-and-Resources.md#deposit-tooltips-hover-a-discovered-deposit-on-the-map).
- Region names: see [Regions](Cities-Territory-Regions.md#3-regions).
- Nation and city names: see [World Generation](World-Generation.md#5a-names) and [Scenario Data](Scenario-Data.md).

## 8. Menu text
| Key | Text |
|---|---|
| title | NO MAN'S LAND |
| subtitle | Pick a preset scenario, set up a standard match, or explore freely in sandbox mode. |
| new-player banner | 👋 New here? The Tutorial walks you through the basics against a passive opponent. |
| scenario card label / hint | SCENARIO PICKER / Choose a preset scenario. |
| scenario description | `{description}\nPlayer: {player name} vs {AI names joined by ", "}` |
| no scenario | No scenario configured / Add a scenario preset in src/config/scenarios.json to enable scenario mode. / SCENARIO UNAVAILABLE |
| standard card | STANDARD MATCH / Custom Setup / Tune the opponent count and difficulty, then launch a normal match. / OPPONENTS / DIFFICULTY / START STANDARD MATCH |
| summary | `{n} Opponent{s}  \|  {DIFFICULTY}` |
| sandbox card | SANDBOX / Free Play / No resource costs. No fog of war. Adjust AI level and paint terrain mid-game using the left toolbar. / START SANDBOX |
| load row | Or continue from your last local save. / LOAD SAVED GAME |

(The sandbox description still mentions a left toolbar that was removed — see [Known Quirks](Known-Quirks.md).)

→ Continue to **[Known Quirks](Known-Quirks.md)**
