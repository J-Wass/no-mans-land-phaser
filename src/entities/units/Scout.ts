import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';

export class Scout extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.SCOUT, ownerId, position, {
      maxHealth: 100,
      meleeDamage: 2,
      rangedDamage: 0,
      armorType: 'light',
      speed: 3,
      attackRange: 1,
      vision: 2,
      upkeep: { [ResourceType.FOOD]: 1 },
    });
  }

  public getCost(): ResourceCost {
    return {
      [ResourceType.FOOD]: 15,
      [ResourceType.RAW_MATERIAL]: 5,
    };
  }
}
