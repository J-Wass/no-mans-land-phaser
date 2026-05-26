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
import type { ProductionOrder, UnitOrder } from './ProductionOrder';

export interface CatalogEntry {
  id:               string;
  label:            string;
  detail:           string;
  cost:             ResourceCost;
  ticks:            number;
  requiresTechs:    TechId[];
  requiresBuilding: CityBuildingType | null;
  /** A single deposit type that must be active. */
  requiresDeposit:  TerritoryResourceType | null;
  /** Any one of these deposit types satisfies the requirement (OR semantics). */
  requiresAnyDeposit: TerritoryResourceType[] | null;
  makeOrder(): ProductionOrder;
}

const unit = (
  unitType:         UnitType,
  label:            string,
  detail:           string,
  cost:             ResourceCost,
  ticks:            number,
  requiresTechs:    TechId[],
  requiresBuilding: CityBuildingType | null,
  requiresDeposit:  TerritoryResourceType | null = null,
  requiresAnyDeposit: TerritoryResourceType[] | null = null,
): CatalogEntry => ({
  id: `unit:${unitType}`,
  label,
  detail,
  cost,
  ticks,
  requiresTechs,
  requiresBuilding,
  requiresDeposit,
  requiresAnyDeposit,
  makeOrder: (): UnitOrder => ({
    kind: 'unit', unitType, label, ticksTotal: ticks, ticksRemaining: ticks,
  }),
});

export const PRODUCTION_CATALOG: CatalogEntry[] = [
  unit(UnitType.INFANTRY,
    'Infantry',
    'HP 100  ATK 10  RNG 1  SPD 2  VIS 1  UPKEEP F1 M1',
    { [ResourceType.GOLD]: 30, [ResourceType.FOOD]: 400, [ResourceType.RAW_MATERIAL]: 300 },
    60, [], CityBuildingType.BARRACKS, null),

  unit(UnitType.SCOUT,
    'Scout',
    'HP 100  ATK 2  RNG 1  SPD 3  VIS 2  UPKEEP F1 M1',
    { [ResourceType.GOLD]: 20, [ResourceType.FOOD]: 300 },
    50, [], CityBuildingType.BARRACKS, null),

  unit(UnitType.LONGBOWMAN,
    'Longbowman',
    'HP 100  ATK 12  RNG 3  SPD 2  VIS 1  UPKEEP F1 M1',
    { [ResourceType.GOLD]: 40, [ResourceType.FOOD]: 500, [ResourceType.RAW_MATERIAL]: 350 },
    75, ['hunting'], CityBuildingType.BARRACKS, null),

  unit(UnitType.CAVALRY,
    'Cavalry',
    'HP 250  ATK 40  RNG 1  SPD 3  VIS 1  UPKEEP F2 M1  REQ COPPER',
    { [ResourceType.GOLD]: 80, [ResourceType.FOOD]: 700, [ResourceType.RAW_MATERIAL]: 500 },
    100, ['animal_domestication'], CityBuildingType.BARRACKS, TerritoryResourceType.COPPER),

  unit(UnitType.CROSSBOWMAN,
    'Crossbowman',
    'HP 150  ATK 15  RNG 2  SPD 1  VIS 1  UPKEEP F1 M1  REQ COPPER/IRON/FIRE GLASS',
    { [ResourceType.GOLD]: 50, [ResourceType.FOOD]: 550, [ResourceType.RAW_MATERIAL]: 400 },
    90, ['mechanization'], CityBuildingType.BARRACKS, null,
    [TerritoryResourceType.COPPER, TerritoryResourceType.IRON, TerritoryResourceType.FIRE_GLASS]),

  unit(UnitType.HEAVY_INFANTRY,
    'Heavy Infantry',
    'HP 250  ATK 20  RNG 1  SPD 1  VIS 1  UPKEEP F2 M1  REQ IRON',
    { [ResourceType.GOLD]: 80, [ResourceType.FOOD]: 700, [ResourceType.RAW_MATERIAL]: 450 },
    100, ['iron_working'], CityBuildingType.BARRACKS, TerritoryResourceType.IRON),

  unit(UnitType.CATAPULT,
    'Catapult',
    'HP 200  ATK 25  RNG 2  SPD 1  VIS 1  UPKEEP F1 M2  REQ IRON',
    { [ResourceType.GOLD]: 80, [ResourceType.FOOD]: 350, [ResourceType.RAW_MATERIAL]: 600 },
    120, ['iron_working', 'the_wheel'], CityBuildingType.BARRACKS, TerritoryResourceType.IRON),

  unit(UnitType.TREBUCHET,
    'Trebuchet',
    'HP 250  ATK 50  RNG 3  SPD 1  VIS 1  UPKEEP F2 M3  REQ FIRE GLASS',
    { [ResourceType.GOLD]: 100, [ResourceType.FOOD]: 400, [ResourceType.RAW_MATERIAL]: 800 },
    140, ['mechanization', 'steel_working'], CityBuildingType.BARRACKS, TerritoryResourceType.FIRE_GLASS),
];
