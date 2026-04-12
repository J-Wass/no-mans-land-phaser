import { Unit, UnitType } from './Unit';
import type { EntityId, GridCoordinates } from '@/types/common';
import type { ResourceCost } from '@/systems/resources/ResourceType';
import { ResourceType } from '@/systems/resources/ResourceType';

export class Crossbowman extends Unit {
  constructor(id: EntityId, ownerId: EntityId, position: GridCoordinates) {
    super(id, UnitType.CROSSBOWMAN, ownerId, position, {
      maxHealth: 150,
      meleeDamage: 10,
      rangedDamage: 15,
      armorType: 'heavy',
      speed: 1,
      attackRange: 2,
      vision: 1,
    });
  }

  public getCost(): ResourceCost {
    return {
      [ResourceType.FOOD]: 20,
      [ResourceType.RAW_MATERIAL]: 25,
      [ResourceType.GOLD]: 10,
    };
  }
}
