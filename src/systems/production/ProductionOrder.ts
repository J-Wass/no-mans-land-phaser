import type { ResourceType } from '@/systems/resources/ResourceType';
import type { UnitType } from '@/entities/units/Unit';
import type { CityBuildingType } from '@/systems/territory/CityBuilding';

export interface UnitOrder {
  kind: 'unit';
  unitType: UnitType;
  label: string;
  ticksTotal: number;
  ticksRemaining: number;
}

export interface ResourceOrder {
  kind: 'resource';
  resourceType: ResourceType;
  resourceAmount: number;
  label: string;
  ticksTotal: number;
  ticksRemaining: number;
}

export interface BuildingOrder {
  kind: 'building';
  buildingType: CityBuildingType;
  label: string;
  ticksTotal: number;
  ticksRemaining: number;
}

export type ProductionOrder = UnitOrder | ResourceOrder | BuildingOrder;
