/**
 * All items a city can produce (units), with costs, times, and requirements.
 * City buildings are in CityBuilding.ts and queued via BUILD_CITY_BUILDING command.
 * Production times in ticks (10 ticks = 1 second at TICK_RATE=10).
 *
 * cost       = upfront resources consumed when production starts
 * detail     = standardized stats + upkeep shown in the production UI
 */

import { UnitType } from '@/entities/units/Unit';
import { ResourceType } from '@/systems/resources/ResourceType';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { CityBuildingType } from '@/systems/territory/CityBuilding';
import type { TechId } from '@/systems/research/TechTree';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { CONTENT_STRINGS } from '@/i18n/content';
import type { ProductionOrder, UnitOrder } from './ProductionOrder';

/** Each Barracks level above 1 reduces a unit's mobilization (production) time by this fraction. */
export const BARRACKS_MOBILIZATION_SPEEDUP_PER_LEVEL = 0.05;

/** Global production-time multiplier applied to every unit's base duration. */
export const UNIT_PRODUCTION_SPEED_MULTIPLIER = 2;

export interface CatalogEntry {
  id:               string;
  label:            string;
  detail:           string;
  cost:             ResourceCost;
  ticks:            number;
  requiresTechs:    TechId[];
  requiresBuilding: CityBuildingType | null;
  /** Minimum level of requiresBuilding needed to train this unit (1 if no upgrade required). */
  requiresBuildingLevel: number;
  /** A single deposit type that must be active. */
  requiresDeposit:  TerritoryResourceType | null;
  /** Any one of these deposit types satisfies the requirement (OR semantics). */
  requiresAnyDeposit: TerritoryResourceType[] | null;
  makeOrder(): ProductionOrder;
}

const unit = (
  unitType:         UnitType,
  cost:             ResourceCost,
  ticks:            number,
  requiresTechs:    TechId[],
  requiresBuilding: CityBuildingType | null,
  requiresBuildingLevel: number = 1,
  requiresDeposit:  TerritoryResourceType | null = null,
  requiresAnyDeposit: TerritoryResourceType[] | null = null,
): CatalogEntry => {
  const { label, detail } = CONTENT_STRINGS.units[unitType];
  ticks = ticks * UNIT_PRODUCTION_SPEED_MULTIPLIER;
  return {
    id: `unit:${unitType}`,
    label,
    detail,
    cost,
    ticks,
    requiresTechs,
    requiresBuilding,
    requiresBuildingLevel,
    requiresDeposit,
    requiresAnyDeposit,
    makeOrder: (): UnitOrder => ({
      kind: 'unit', unitType, label, ticksTotal: ticks, ticksRemaining: ticks,
    }),
  };
};

export const PRODUCTION_CATALOG: CatalogEntry[] = [
  unit(UnitType.INFANTRY,
    { [ResourceType.GOLD]: 30, [ResourceType.FOOD]: 400, [ResourceType.RAW_MATERIAL]: 300 },
    120, [], CityBuildingType.BARRACKS, 1, null),

  unit(UnitType.SCOUT,
    { [ResourceType.GOLD]: 20, [ResourceType.FOOD]: 300 },
    100, [], CityBuildingType.BARRACKS, 1, null),

  unit(UnitType.LONGBOWMAN,
    { [ResourceType.GOLD]: 40, [ResourceType.FOOD]: 500, [ResourceType.RAW_MATERIAL]: 350 },
    150, ['hunting'], CityBuildingType.BARRACKS, 2, null),

  unit(UnitType.CAVALRY,
    { [ResourceType.GOLD]: 80, [ResourceType.FOOD]: 700, [ResourceType.RAW_MATERIAL]: 500 },
    200, ['animal_domestication'], CityBuildingType.BARRACKS, 2, null, [TerritoryResourceType.COPPER, TerritoryResourceType.IRON, TerritoryResourceType.FIRE_GLASS]),

  unit(UnitType.CROSSBOWMAN,
    { [ResourceType.GOLD]: 50, [ResourceType.FOOD]: 550, [ResourceType.RAW_MATERIAL]: 400 },
    180, ['mechanization'], CityBuildingType.BARRACKS, 3, null,
    [TerritoryResourceType.COPPER, TerritoryResourceType.IRON, TerritoryResourceType.FIRE_GLASS]),

  unit(UnitType.HEAVY_INFANTRY,
    { [ResourceType.GOLD]: 80, [ResourceType.FOOD]: 700, [ResourceType.RAW_MATERIAL]: 450 },
    200, ['iron_working'], CityBuildingType.BARRACKS, 3, null, [TerritoryResourceType.IRON, TerritoryResourceType.FIRE_GLASS]),

  unit(UnitType.CATAPULT,
    { [ResourceType.GOLD]: 80, [ResourceType.FOOD]: 350, [ResourceType.RAW_MATERIAL]: 600 },
    240, ['physics', 'the_wheel'], CityBuildingType.BARRACKS, 3, null, [TerritoryResourceType.COPPER, TerritoryResourceType.IRON, TerritoryResourceType.FIRE_GLASS]),

  unit(UnitType.TREBUCHET,
    { [ResourceType.GOLD]: 100, [ResourceType.FOOD]: 400, [ResourceType.RAW_MATERIAL]: 800 },
    280, ['mechanization', 'steel_working'], CityBuildingType.BARRACKS, 5, null, [TerritoryResourceType.IRON, TerritoryResourceType.FIRE_GLASS]),
];
