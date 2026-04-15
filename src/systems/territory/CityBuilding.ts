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
  COURTHOUSE   = 'COURTHOUSE',
  WATCHTOWER   = 'WATCHTOWER',
  SCHOOL       = 'SCHOOL',
  MARKET       = 'MARKET',
}

export interface CityBuildingDef {
  type:         CityBuildingType;
  label:        string;
  perks:        string;
  cost:         ResourceCost;
  /** Build time in ticks (0 = built-in, cannot be constructed). */
  ticks:        number;
  requiresTech: TechId | null;
}

export const CITY_BUILDING_CATALOG: CityBuildingDef[] = [
  {
    type: CityBuildingType.CITY_HALL,
    label: 'City Hall',
    perks: 'Built-in administration',
    cost: {},
    ticks: 0,
    requiresTech: null,
  },
  {
    type: CityBuildingType.BARRACKS,
    label: 'Barracks',
    perks: 'Enables unit training',
    cost: { [ResourceType.GOLD]: 15, [ResourceType.RAW_MATERIAL]: 30 },
    ticks: 100,
    requiresTech: 'masonry',
  },
  {
    type: CityBuildingType.WALLS,
    label: 'Walls',
    perks: 'Defense+',
    cost: { [ResourceType.GOLD]: 10, [ResourceType.RAW_MATERIAL]: 25 },
    ticks: 150,
    requiresTech: 'masonry',
  },
  {
    type: CityBuildingType.FARMS,
    label: 'Farms',
    perks: '🍎 +2/s',
    cost: { [ResourceType.GOLD]: 10, [ResourceType.RAW_MATERIAL]: 20 },
    ticks: 100,
    requiresTech: 'masonry',
  },
  {
    type: CityBuildingType.WORKSHOP,
    label: 'Workshop',
    perks: '🪨 +1/s',
    cost: { [ResourceType.GOLD]: 10, [ResourceType.RAW_MATERIAL]: 20 },
    ticks: 100,
    requiresTech: 'masonry',
  },
  {
    type: CityBuildingType.PUBLIC_GREEN,
    label: 'Public Green',
    perks: 'Happiness+',
    cost: { [ResourceType.GOLD]: 5, [ResourceType.RAW_MATERIAL]: 20 },
    ticks: 100,
    requiresTech: 'masonry',
  },
  {
    type: CityBuildingType.HOUSING,
    label: 'Housing',
    perks: 'Population+',
    cost: { [ResourceType.GOLD]: 10, [ResourceType.RAW_MATERIAL]: 25, [ResourceType.FOOD]: 10 },
    ticks: 120,
    requiresTech: 'masonry',
  },
  {
    type: CityBuildingType.COURTHOUSE,
    label: 'Courthouse',
    perks: 'Corruption-',
    cost: { [ResourceType.GOLD]: 20, [ResourceType.RAW_MATERIAL]: 30 },
    ticks: 150,
    requiresTech: 'law',
  },
  {
    type: CityBuildingType.WATCHTOWER,
    label: 'Watchtower',
    perks: 'Vision+',
    cost: { [ResourceType.GOLD]: 5, [ResourceType.RAW_MATERIAL]: 15 },
    ticks: 100,
    requiresTech: 'masonry',
  },
  {
    type: CityBuildingType.SCHOOL,
    label: 'School',
    perks: '🔍 +1/s',
    cost: { [ResourceType.GOLD]: 15, [ResourceType.RAW_MATERIAL]: 25, [ResourceType.FOOD]: 10 },
    ticks: 150,
    requiresTech: 'education',
  },
  {
    type: CityBuildingType.MARKET,
    label: 'Market',
    perks: '🪙 +1/s',
    cost: { [ResourceType.GOLD]: 20, [ResourceType.RAW_MATERIAL]: 35 },
    ticks: 150,
    requiresTech: 'trade',
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
  [CityBuildingType.COURTHOUSE]:   '⚖',
  [CityBuildingType.WATCHTOWER]:   '🗼',
  [CityBuildingType.SCHOOL]:       '📚',
  [CityBuildingType.MARKET]:       '🏪',
};
