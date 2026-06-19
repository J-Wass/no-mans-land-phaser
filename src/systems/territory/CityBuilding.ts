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
import { CONTENT_STRINGS } from '@/i18n/content';

export enum CityBuildingType {
  CITY_HALL    = 'CITY_HALL',
  BARRACKS     = 'BARRACKS',
  WALLS        = 'WALLS',
  FARMS        = 'FARMS',
  WORKSHOP     = 'WORKSHOP',
  WATCHTOWER   = 'WATCHTOWER',
  SCHOOL       = 'SCHOOL',
  MARKET       = 'MARKET',
}

export const MAX_CITY_WALLS_LEVEL = 5;
export const CITY_WALLS_HP_PER_LEVEL = 60;
export const CITY_WALLS_DMG_PER_LEVEL = 3;

/** Shared cap for the upgradeable economy/military buildings (Farms, Workshop, Market, Barracks, School). */
export const MAX_CITY_BUILDING_LEVEL = 5;

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
    label: CONTENT_STRINGS.cityBuildings[CityBuildingType.CITY_HALL].label,
    perks: CONTENT_STRINGS.cityBuildings[CityBuildingType.CITY_HALL].perks,
    cost: {},
    ticks: 0,
    requiresTech: null,
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: CityBuildingType.BARRACKS,
    label: CONTENT_STRINGS.cityBuildings[CityBuildingType.BARRACKS].label,
    perks: CONTENT_STRINGS.cityBuildings[CityBuildingType.BARRACKS].perks,
    cost: { [ResourceType.GOLD]: 40, [ResourceType.RAW_MATERIAL]: 90, [ResourceType.FOOD]: 40 },
    ticks: 400,
    requiresTech: 'masonry',
    maxLevel: MAX_CITY_BUILDING_LEVEL,
    upgradeCost: { [ResourceType.GOLD]: 40, [ResourceType.RAW_MATERIAL]: 90, [ResourceType.FOOD]: 40 },
  },
  {
    type: CityBuildingType.WALLS,
    label: CONTENT_STRINGS.cityBuildings[CityBuildingType.WALLS].label,
    perks: CONTENT_STRINGS.cityBuildings[CityBuildingType.WALLS].perks,
    cost: { [ResourceType.GOLD]: 30, [ResourceType.RAW_MATERIAL]: 90 },
    ticks: 450,
    requiresTech: 'masonry',
    maxLevel: MAX_CITY_WALLS_LEVEL,
    upgradeCost: { [ResourceType.GOLD]: 35, [ResourceType.RAW_MATERIAL]: 90 },
  },
  {
    type: CityBuildingType.FARMS,
    label: CONTENT_STRINGS.cityBuildings[CityBuildingType.FARMS].label,
    perks: CONTENT_STRINGS.cityBuildings[CityBuildingType.FARMS].perks,
    cost: { [ResourceType.GOLD]: 25, [ResourceType.RAW_MATERIAL]: 80 },
    ticks: 300,
    requiresTech: 'masonry',
    maxLevel: MAX_CITY_BUILDING_LEVEL,
    upgradeCost: { [ResourceType.GOLD]: 25, [ResourceType.RAW_MATERIAL]: 70 },
  },
  {
    type: CityBuildingType.WORKSHOP,
    label: CONTENT_STRINGS.cityBuildings[CityBuildingType.WORKSHOP].label,
    perks: CONTENT_STRINGS.cityBuildings[CityBuildingType.WORKSHOP].perks,
    cost: { [ResourceType.GOLD]: 25, [ResourceType.RAW_MATERIAL]: 80 },
    ticks: 300,
    requiresTech: 'masonry',
    maxLevel: MAX_CITY_BUILDING_LEVEL,
    upgradeCost: { [ResourceType.GOLD]: 25, [ResourceType.RAW_MATERIAL]: 70 },
  },
  {
    type: CityBuildingType.WATCHTOWER,
    label: CONTENT_STRINGS.cityBuildings[CityBuildingType.WATCHTOWER].label,
    perks: CONTENT_STRINGS.cityBuildings[CityBuildingType.WATCHTOWER].perks,
    cost: { [ResourceType.GOLD]: 20, [ResourceType.RAW_MATERIAL]: 70 },
    ticks: 300,
    requiresTech: 'masonry',
    maxLevel: 1,
    upgradeCost: {},
  },
  {
    type: CityBuildingType.SCHOOL,
    label: CONTENT_STRINGS.cityBuildings[CityBuildingType.SCHOOL].label,
    perks: CONTENT_STRINGS.cityBuildings[CityBuildingType.SCHOOL].perks,
    cost: { [ResourceType.GOLD]: 40, [ResourceType.RAW_MATERIAL]: 90, [ResourceType.FOOD]: 50 },
    ticks: 400,
    requiresTech: 'education',
    maxLevel: MAX_CITY_BUILDING_LEVEL,
    upgradeCost: { [ResourceType.GOLD]: 35, [ResourceType.RAW_MATERIAL]: 80, [ResourceType.FOOD]: 40 },
  },
  {
    type: CityBuildingType.MARKET,
    label: CONTENT_STRINGS.cityBuildings[CityBuildingType.MARKET].label,
    perks: CONTENT_STRINGS.cityBuildings[CityBuildingType.MARKET].perks,
    cost: { [ResourceType.GOLD]: 50, [ResourceType.RAW_MATERIAL]: 110 },
    ticks: 400,
    requiresTech: 'trade',
    maxLevel: MAX_CITY_BUILDING_LEVEL,
    upgradeCost: { [ResourceType.GOLD]: 45, [ResourceType.RAW_MATERIAL]: 100 },
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
  [CityBuildingType.WATCHTOWER]:   '🗼',
  [CityBuildingType.SCHOOL]:       '📚',
  [CityBuildingType.MARKET]:       '🏪',
};
