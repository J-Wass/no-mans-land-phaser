import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';

export class Catapult extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.CATAPULT, ownerId, position, {
      maxHealth: 200,
      meleeDamage: 15,
      rangedDamage: 25,
      armorType: 'heavy',
      speed: 1,
      attackRange: 2,
      vision: 1,
      upkeep: { [ResourceType.FOOD]: 1, [ResourceType.RAW_MATERIAL]: 2 },
    });
  }

  public getCost(): ResourceCost {
    return {
      [ResourceType.FOOD]: 25,
      [ResourceType.RAW_MATERIAL]: 40,
      [ResourceType.GOLD]: 15,
    };
  }
}
