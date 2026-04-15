import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';

export class Cavalry extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.CAVALRY, ownerId, position, {
      maxHealth: 250,
      meleeDamage: 40,
      rangedDamage: 0,
      armorType: 'heavy',
      speed: 3,
      attackRange: 1,
      vision: 1,
      upkeep: { [ResourceType.FOOD]: 2, [ResourceType.RAW_MATERIAL]: 1 },
    });
  }

  public getCost(): ResourceCost {
    return {
      [ResourceType.FOOD]: 40,
      [ResourceType.RAW_MATERIAL]: 30,
      [ResourceType.GOLD]: 20,
    };
  }
}
