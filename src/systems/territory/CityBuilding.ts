/**
 * City building types and catalog.
 * Source: "no mans land" spreadsheet, Buildings sheet (City / Both columns).
 *
 * City Hall is always present. All other buildings must be constructed
 * via the city production queue (same queue as units).
 */

import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';
import type { TechId } from '@/systems/research/TechTree';

export enum CityBuildingType {
  CITY_HALL    = 'CITY_HALL',
  BARRACKS     = 'BARRACKS',
  WALLS        = 'WALLS',
  FARMS        = 'FARMS',
  WORKSHOP     = 'WORKSHOP',
  PUBLIC_GREEN = 'PUBLIC_GREEN',
  HOUSING      = 'HOUSING',
  WATCHTOWER   = 'WATCHTOWER',
  SCHOOL       = 'SCHOOL',
  MARKET       = 'MARKET',
}

export const MAX_CITY_WALLS_LEVEL = 5;
export const CITY_WALLS_HP_PER_LEVEL = 60;
export const CITY_WALLS_DMG_PER_LEVEL = 3;

export interface CityBuildingDef {
  type:         CityBuildingType;
  label:        string;
  perks:        string;
  cost:         ResourceCost;
  /** Build time in ticks (0 = built-in, cannot be constructed). */
  ticks:        number;
  requiresTech: TechId | null;
  /** Maximum level this city building can reach. */
  maxLevel:     number;
  /** Cost for one upgrade from level N to N+1. */
  upgradeCost:  ResourceCost;
}

export const CITY_BUILDING_CATALOG: CityBuildingDef[] = [
  {
    type: CityBuildingType.CITY_HALL,
    label: 'City Hall',
    perks: 'Built-in administration',
    cost: {},
    ticks: 0,
    requiresTech: null,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: CityBuildingType.BARRACKS,
    label: 'Barracks',
    perks: 'Enables unit training',
    cost: { [ResourceType.GOLD]: 15, [ResourceType.RAW_MATERIAL]: 30 },
    ticks: 10,
    requiresTech: 'masonry',
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: CityBuildingType.WALLS,
    label: 'Walls',
    perks: 'Lvl1: +60HP +3dmg. Upgrades improve city defense through Lvl5.',
    cost: { [ResourceType.GOLD]: 10, [ResourceType.RAW_MATERIAL]: 25 },
    ticks: 10,
    requiresTech: 'masonry',
    maxLevel: MAX_CITY_WALLS_LEVEL,
    upgradeCost: { [ResourceType.GOLD]: 15, [ResourceType.RAW_MATERIAL]: 35 },
  },
  {
    type: CityBuildingType.FARMS,
    label: 'Farms',
    perks: '🍎 +2/s',
    cost: { [ResourceType.GOLD]: 10, [ResourceType.RAW_MATERIAL]: 20 },
    ticks: 10,
    requiresTech: 'masonry',
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: CityBuildingType.WORKSHOP,
    label: 'Workshop',
    perks: '🧱 +1/s',
    cost: { [ResourceType.GOLD]: 10, [ResourceType.RAW_MATERIAL]: 20 },
    ticks: 10,
    requiresTech: 'masonry',
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: CityBuildingType.PUBLIC_GREEN,
    label: 'Public Green',
    perks: 'Growth+',
    cost: { [ResourceType.GOLD]: 5, [ResourceType.RAW_MATERIAL]: 20 },
    ticks: 10,
    requiresTech: 'masonry',
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: CityBuildingType.HOUSING,
    label: 'Housing',
    perks: 'Population+',
    cost: { [ResourceType.GOLD]: 10, [ResourceType.RAW_MATERIAL]: 25, [ResourceType.FOOD]: 10 },
    ticks: 10,
    requiresTech: 'masonry',
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: CityBuildingType.WATCHTOWER,
    label: 'Watchtower',
    perks: 'Vision+',
    cost: { [ResourceType.GOLD]: 5, [ResourceType.RAW_MATERIAL]: 15 },
    ticks: 10,
    requiresTech: 'masonry',
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: CityBuildingType.SCHOOL,
    label: 'School',
    perks: '🔬 +1/s',
    cost: { [ResourceType.GOLD]: 15, [ResourceType.RAW_MATERIAL]: 25, [ResourceType.FOOD]: 10 },
    ticks: 10,
    requiresTech: 'education',
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: CityBuildingType.MARKET,
    label: 'Market',
    perks: '🪙 +1/s',
    cost: { [ResourceType.GOLD]: 20, [ResourceType.RAW_MATERIAL]: 35 },
    ticks: 10,
    requiresTech: 'trade',
    maxLevel: 1,
    upgradeCost: {},
  },
];

export const CITY_BUILDING_MAP = new Map<CityBuildingType, CityBuildingDef>(
  CITY_BUILDING_CATALOG.map(b => [b.type, b]),
);

/** Icon rendered on the city tile for each building. */
export const CITY_BUILDING_ICON: Record<CityBuildingType, string> = {
  [CityBuildingType.CITY_HALL]:    '🏛',
  [CityBuildingType.BARRACKS]:     '⚔',
  [CityBuildingType.WALLS]:        '🧱',
  [CityBuildingType.FARMS]:        '🌾',
  [CityBuildingType.WORKSHOP]:     '⚒',
  [CityBuildingType.PUBLIC_GREEN]: '🌳',
  [CityBuildingType.HOUSING]:      '🏠',
  [CityBuildingType.WATCHTOWER]:   '🗼',
  [CityBuildingType.SCHOOL]:       '📚',
  [CityBuildingType.MARKET]:       '🏪',
};
