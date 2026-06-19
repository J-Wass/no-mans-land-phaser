/**
 * Central catalog of user-facing content strings (labels, descriptions, perks,
 * unit stat details). Extracted from the data catalogs so they can be
 * translated in one place.
 *
 * Keying notes (to avoid import cycles):
 *  - `units` is keyed by UnitType, whose enum lives in a DIFFERENT file
 *    (entities/units/Unit.ts), so a value import of UnitType here is safe.
 *  - `tech` is keyed by TechId (a string-literal union type, not a runtime enum).
 *  - `cityBuildings` / `territoryBuildings` are keyed by CityBuildingType /
 *    TerritoryBuildingType. Those enums are defined in the catalog files that
 *    import THIS module, so importing their enum values here would create a
 *    cycle. They are imported with `import type` only and the Records are typed
 *    against the enum but written with plain string-literal keys; the catalogs
 *    index them with the enum value at the call site.
 */

import { UnitType } from '@/entities/units/Unit';
import type { TechId } from '@/systems/research/TechTree';
import type { CityBuildingType } from '@/systems/territory/CityBuilding';
import type { TerritoryBuildingType } from '@/systems/territory/TerritoryBuilding';

export const CONTENT_STRINGS = {
  units: {
    [UnitType.INFANTRY]: {
      label: 'Infantry',
      detail: 'HP 100  ATK 10  RNG 1  SPD 2  VIS 1  UPKEEP F1 M1  |  CHEAP LINE (loses to specialists)',
    },
    [UnitType.SCOUT]: {
      label: 'Scout',
      detail: 'HP 100  ATK 2  RNG 1  SPD 3  VIS 2  UPKEEP F1 M1  |  RECON (avoid combat)',
    },
    [UnitType.LONGBOWMAN]: {
      label: 'Longbowman',
      detail: 'HP 100  ATK 12  RNG 3  SPD 2  VIS 1  UPKEEP F1 M1  |  RANGED: pelts spears, weak vs CAVALRY',
    },
    [UnitType.CAVALRY]: {
      label: 'Cavalry',
      detail: 'HP 160  ATK 32  RNG 1  SPD 3  VIS 1  UPKEEP F2 M1  REQ COPPER  |  beats RANGED, weak vs SPEARS',
    },
    [UnitType.CROSSBOWMAN]: {
      label: 'Crossbowman',
      detail: 'HP 150  ATK 15  RNG 2  SPD 1  VIS 1  UPKEEP F1 M1  REQ COPPER/IRON/FIRE GLASS  |  anti-ARMOR, weak vs CAVALRY',
    },
    [UnitType.HEAVY_INFANTRY]: {
      label: 'Heavy Infantry',
      detail: 'HP 250  ATK 20  RNG 1  SPD 1  VIS 1  UPKEEP F2 M1  REQ IRON  |  SPEARS: beats CAVALRY, weak vs RANGED',
    },
    [UnitType.CATAPULT]: {
      label: 'Catapult',
      detail: 'HP 200  ATK 25  RNG 2  SPD 1  VIS 1  UPKEEP F1 M2  REQ COPPER/IRON/FIRE GLASS  |  SIEGE: anti-armor/building, helpless vs CAVALRY',
    },
    [UnitType.TREBUCHET]: {
      label: 'Trebuchet',
      detail: 'HP 250  ATK 50  RNG 3  SPD 1  VIS 1  UPKEEP F2 M3  REQ FIRE GLASS  |  SIEGE: anti-armor/building, helpless vs CAVALRY',
    },
  } satisfies Record<UnitType, { label: string; detail: string }>,

  tech: {
    writing:              { name: 'Writing',              description: 'Leads to Trade and Education.' },
    hunting:              { name: 'Hunting',              description: 'Leads to Ancient Rituals.' },
    masonry:              { name: 'Masonry',              description: 'Leads to The Wheel and Ancient Rituals.' },
    trade:                { name: 'Trade',                description: 'Improves your commerce income.' },
    education:            { name: 'Education',            description: 'Boosts your research output.' },
    the_wheel:            { name: 'The Wheel',            description: '+20% movement speed for all your units; required for the Catapult.' },
    scientific_method:    { name: 'Scientific Method',    description: 'Leads to Chemistry, Biology, and Physics.' },
    mathematics:          { name: 'Mathematics',          description: 'Leads to Physics.' },
    chemistry:            { name: 'Chemistry',            description: 'Leads to Iron Working.' },
    biology:              { name: 'Biology',              description: 'Leads to Animal Domestication.' },
    physics:              { name: 'Physics',              description: 'Leads to Iron Working and Mana Studies.' },
    animal_domestication: { name: 'Animal Domestication', description: 'Leads to mounted units.' },
    iron_working:         { name: 'Iron Working',         description: 'Leads to Mechanization and Steel Working.' },
    mechanization:        { name: 'Mechanization',        description: 'Leads to advanced ranged units.' },
    steel_working:        { name: 'Steel Working',        description: 'Leads to the finest weapons.' },
    ancient_rituals:      { name: 'Ancient Rituals',      description: 'Leads to Mana Studies.' },
    mana_studies:         { name: 'Mana Studies',         description: 'Unlocks the Mana Mine.' },
  } satisfies Record<TechId, { name: string; description: string }>,

  cityBuildings: {
    CITY_HALL: {
      label: 'City Hall',
      perks: 'Built-in administration',
    },
    BARRACKS: {
      label: 'Barracks',
      perks: 'Trains units. Higher levels unlock advanced units and speed up mobilization (−5%/level).',
    },
    WALLS: {
      label: 'Walls',
      perks: 'Lvl1: +60HP +3dmg. Upgrades improve city defense through Lvl5.',
    },
    FARMS: {
      label: 'Farms',
      perks: '🍎 +2/s per level',
    },
    WORKSHOP: {
      label: 'Workshop',
      perks: '🧱 +1/s per level',
    },
    WATCHTOWER: {
      label: 'Watchtower',
      perks: 'Vision+',
    },
    SCHOOL: {
      label: 'School',
      perks: '🔬 +1/s per level',
    },
    MARKET: {
      label: 'Market',
      perks: '🪙 +1/s per level',
    },
  } as Record<CityBuildingType, { label: string; perks: string }>,

  territoryBuildings: {
    OUTPOST: {
      label: 'Outpost',
      perks: 'Claims this tile for your nation. Prerequisite for all other territory buildings.',
    },
    WALLS: {
      label: 'Walls',
      perks: 'Fortifies this territory. Each level adds HP and attack damage; higher levels also extend attack range. Up to 5 levels.',
    },
    FARMS: {
      label: 'Farms',
      perks: 'Generates +2 Food per second from this territory. Food is used for unit upkeep and city growth.',
    },
    WORKSHOP: {
      label: 'Workshop',
      perks: 'Generates +1 Raw Material per second from this territory. Raw materials are used to build units and structures.',
    },
    WATCHTOWER: {
      label: 'Watchtower',
      perks: 'Removes fog of war in a 2-tile radius around this territory, even when no units are nearby.',
    },
    COPPER_MINE: {
      label: 'Copper Mine',
      perks: 'Mines the copper deposit here. Gives all your units Bronze weapons, adding +2 melee and ranged damage.',
    },
    IRON_MINE: {
      label: 'Iron Mine',
      perks: 'Mines the iron deposit here. Gives all your units Iron weapons, adding +4 melee and ranged damage.',
    },
    FIRE_GLASS_MINE: {
      label: 'Fire Glass Mine',
      perks: 'Mines the fire glass deposit here. Gives all your units Fire Glass weapons, adding +6 melee and ranged damage.',
    },
    MANA_MINE: {
      label: 'Mana Mine',
      perks: 'Activates the mana deposit on this tile, granting a nation-wide magical bonus (varies by mana type).',
    },
  } as Record<TerritoryBuildingType, { label: string; perks: string }>,
} as const;
