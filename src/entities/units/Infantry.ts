import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';

export class Infantry extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.INFANTRY, ownerId, position, {
      maxHealth: 100,
      meleeDamage: 10,
      rangedDamage: 0,
      armorType: 'light',
      speed: 2,
      attackRange: 1,
      vision: 1,
      upkeep: { [ResourceType.FOOD]: 1 },
    });
  }

  public getCost(): ResourceCost {
    return {
      [ResourceType.FOOD]: 20,
      [ResourceType.RAW_MATERIAL]: 10,
    };
  }
}
