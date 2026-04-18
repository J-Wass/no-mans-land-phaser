/**
 * All items a city can produce (units), with costs, times, and requirements.
 * City buildings are in CityBuilding.ts and queued via BUILD_CITY_BUILDING command.
 * Production times in ticks (10 ticks = 1 second at TICK_RATE=10).
 *
 * cost       = upfront resources consumed when production starts
 * detail     = stats + upkeep shown in the production UI ("up:" = per UPKEEP_INTERVAL)
 */

import { UnitType } from '@/entities/units/Unit';
import { ResourceType } from '@/systems/resources/ResourceType';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { CityBuildingType } from '@/systems/territory/CityBuilding';
import type { TechId } from '@/systems/research/TechTree';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import type { ProductionOrder, UnitOrder } from './ProductionOrder';

export interface CatalogEntry {
  id:              string;
  label:           string;
  detail:          string;
  cost:            ResourceCost;
  ticks:           number;
  /** All must be researched by the owning nation. */
  requiresTechs:   TechId[];
  /** City must have this building to train this unit. */
  requiresBuilding: CityBuildingType | null;
  /** Active territory deposit the nation must control to build this unit. */
  requiresDeposit: TerritoryResourceType | null;
  makeOrder(): ProductionOrder;
}

const unit = (
  unitType:        UnitType,
  label:           string,
  detail:          string,
  cost:            ResourceCost,
  ticks:           number,
  requiresTechs:   TechId[],
  requiresBuilding: CityBuildingType | null,
  requiresDeposit: TerritoryResourceType | null = null,
): CatalogEntry => ({
  id: `unit:${unitType}`,
  label,
  detail,
  cost,
  ticks,
  requiresTechs,
  requiresBuilding,
  requiresDeposit,
  makeOrder: (): UnitOrder => ({
    kind: 'unit', unitType, label, ticksTotal: ticks, ticksRemaining: ticks,
  }),
});

export const PRODUCTION_CATALOG: CatalogEntry[] = [
  unit(UnitType.INFANTRY,
    'Infantry',
    '100HP melee  up:🍎1🪨1',
    { [ResourceType.GOLD]: 5, [ResourceType.FOOD]: 20, [ResourceType.RAW_MATERIAL]: 10 },
    10, [], CityBuildingType.BARRACKS, null),

  unit(UnitType.SCOUT,
    'Scout',
    '100HP fast   up:🍎1🪨1',
    { [ResourceType.GOLD]: 5, [ResourceType.FOOD]: 15 },
    10, [], CityBuildingType.BARRACKS, null),

  unit(UnitType.LONGBOWMAN,
    'Longbowman',
    '100HP rng3   up:🍎1🪨1',
    { [ResourceType.GOLD]: 10, [ResourceType.FOOD]: 25, [ResourceType.RAW_MATERIAL]: 15 },
    10, ['hunting'], CityBuildingType.BARRACKS, null),

  unit(UnitType.CAVALRY,
    'Cavalry',
    '250HP fast   up:🍎2🪨1  req:⊛copper',
    { [ResourceType.GOLD]: 20, [ResourceType.FOOD]: 50, [ResourceType.RAW_MATERIAL]: 30 },
    10, ['animal_domestication'], CityBuildingType.BARRACKS, TerritoryResourceType.COPPER),

  unit(UnitType.CROSSBOWMAN,
    'Crossbowman',
    '150HP rng2   up:🍎1🪨1  req:⊛copper',
    { [ResourceType.GOLD]: 10, [ResourceType.FOOD]: 30, [ResourceType.RAW_MATERIAL]: 20 },
    10, ['mechanization'], CityBuildingType.BARRACKS, TerritoryResourceType.COPPER),

  unit(UnitType.HEAVY_INFANTRY,
    'Heavy Infantry',
    '250HP melee  up:🍎2🪨1  req:⊗iron',
    { [ResourceType.GOLD]: 15, [ResourceType.FOOD]: 40, [ResourceType.RAW_MATERIAL]: 20 },
    10, ['iron_working'], CityBuildingType.BARRACKS, TerritoryResourceType.IRON),

  unit(UnitType.CATAPULT,
    'Catapult',
    '200HP rng2   up:🍎1🪨2  req:⊗iron',
    { [ResourceType.GOLD]: 15, [ResourceType.FOOD]: 20, [ResourceType.RAW_MATERIAL]: 50 },
    10, ['iron_working', 'the_wheel'], CityBuildingType.BARRACKS, TerritoryResourceType.IRON),

  unit(UnitType.TREBUCHET,
    'Trebuchet',
    '250HP rng3   up:🍎2🪨3  req:◈fire glass',
    { [ResourceType.GOLD]: 25, [ResourceType.FOOD]: 20, [ResourceType.RAW_MATERIAL]: 80 },
    10, ['mechanization', 'steel_working'], CityBuildingType.BARRACKS, TerritoryResourceType.FIRE_GLASS),
];
