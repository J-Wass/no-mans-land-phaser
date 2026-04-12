/**
 * All items a city can produce (units), with costs, times, and requirements.
 * City buildings are in CityBuilding.ts and queued via BUILD_CITY_BUILDING command.
 * Production times in ticks (10 ticks = 1 second at TICK_RATE=10).
 */

import { UnitType } from '@/entities/units/Unit';
import { ResourceType } from '@/systems/resources/ResourceType';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { CityBuildingType } from '@/systems/territory/CityBuilding';
import type { TechId } from '@/systems/research/TechTree';
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
): CatalogEntry => ({
  id: `unit:${unitType}`,
  label,
  detail,
  cost,
  ticks,
  requiresTechs,
  requiresBuilding,
  makeOrder: (): UnitOrder => ({
    kind: 'unit', unitType, label, ticksTotal: ticks, ticksRemaining: ticks,
  }),
});

export const PRODUCTION_CATALOG: CatalogEntry[] = [
  unit(UnitType.INFANTRY,       'Infantry',       '100 HP  melee   light',
    { [ResourceType.FOOD]: 20, [ResourceType.RAW_MATERIAL]: 10 },  30,
    [], CityBuildingType.BARRACKS),

  unit(UnitType.SCOUT,          'Scout',           '100 HP  fast    light',
    { [ResourceType.FOOD]: 15 },                                   25,
    [], CityBuildingType.BARRACKS),

  unit(UnitType.LONGBOWMAN,     'Longbowman',      '100 HP  range3  light',
    { [ResourceType.FOOD]: 25, [ResourceType.RAW_MATERIAL]: 15 },  45,
    ['hunting'], CityBuildingType.BARRACKS),

  unit(UnitType.HEAVY_INFANTRY, 'Heavy Infantry',  '250 HP  melee   heavy',
    { [ResourceType.FOOD]: 40, [ResourceType.RAW_MATERIAL]: 20 },  60,
    ['iron_working'], CityBuildingType.BARRACKS),

  unit(UnitType.CAVALRY,        'Cavalry',         '250 HP  fast    heavy',
    { [ResourceType.FOOD]: 50, [ResourceType.RAW_MATERIAL]: 30 },  80,
    ['animal_domestication'], CityBuildingType.BARRACKS),

  unit(UnitType.CROSSBOWMAN,    'Crossbowman',     '150 HP  range2  heavy',
    { [ResourceType.FOOD]: 30, [ResourceType.RAW_MATERIAL]: 20 },  55,
    ['mechanization'], CityBuildingType.BARRACKS),

  unit(UnitType.CATAPULT,       'Catapult',        '200 HP  range2  heavy',
    { [ResourceType.FOOD]: 20, [ResourceType.RAW_MATERIAL]: 50 }, 120,
    ['iron_working', 'the_wheel'], CityBuildingType.BARRACKS),

  unit(UnitType.TREBUCHET,      'Trebuchet',       '250 HP  range3  heavy',
    { [ResourceType.FOOD]: 20, [ResourceType.RAW_MATERIAL]: 80, [ResourceType.GOLD]: 20 }, 180,
    ['mechanization', 'steel_working'], CityBuildingType.BARRACKS),
];
